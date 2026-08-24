/* ============================================================
   Per-asset action layer — turns an asset's electrify + fuel-switch
   plan into tonnes moved, reusing the existing physics. The 0..1
   fraction comes from vehicle counts (mobile) or % capacity
   (stationary). Spec: per-asset segmented modeller.
   ============================================================ */

import { applyElectrification, applyFuelSwitch } from "./levers";
import { combustionCO2e } from "./baseline";
import { ALT_FUELS, ALT_FUELS_BY_FUEL, maxBlendPctFor, RECOMMENDED_ALT_BY_SYSTEM, refrigerantPricePerKg } from "./factors";
import { refrigClassProfile } from "./refrigerant-class";
import type { AltFuelId, AssetActions, CombustionAsset, EfficiencyAction, ElectrifyAction, FlexFuelAction, GlobalAssumptions, RefrigerationSystem, SystemActions } from "./types";
import { efficiencyHintFor, endUseProfile } from "./end-use";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** The drop-in bio fuel that matches a base fuel's engine/burner (or null). */
export function defaultAltFuelFor(fuelId: CombustionAsset["fuelType"]): AltFuelId | null {
  return ALT_FUELS_BY_FUEL[fuelId]?.[0] ?? null;
}

/** Flex-fuel conversion only makes sense for MOBILE assets whose drop-in fuel
 *  is blend-capped (ethanol / biodiesel) — i.e. petrol & diesel fleets, where
 *  going beyond E20/B20 needs flex-fuel vehicles. */
export function flexFuelCapable(asset: CombustionAsset): boolean {
  if (asset.category !== "mobile") return false;
  const alt = defaultAltFuelFor(asset.fuelType);
  return alt != null && ALT_FUELS[alt].maxBlendPct < 100;
}

/** Default (off) flex-fuel plan for an asset. */
export function defaultFlexFuel(asset: CombustionAsset): FlexFuelAction {
  return {
    enabled: false,
    unitsToConvert: 0,
    altFuel: defaultAltFuelFor(asset.fuelType) ?? "ethanol",
    highBlendPct: 85,
    vehicleCapex: 600_000,
    startYear: 2028,
    targetYear: 2035,
  };
}

/** Decision-grade electrification capex for one asset.
 *  Mobile at natural replacement pays only the EV PREMIUM over the ICE the
 *  company would buy anyway; early retirement pays the full EV price. This is
 *  frequently the difference between the CFO saying no and yes. */
export function electrifyCapexFor(asset: CombustionAsset, e: ElectrifyAction): number {
  if (!e.enabled) return 0;
  if (asset.category !== "mobile") return e.assetCapex;
  const timing = e.purchaseTiming ?? "replacement";
  const perUnit = timing === "replacement"
    ? e.assetCapex * ((e.replacementPremiumPct ?? 40) / 100)
    : e.assetCapex;
  return perUnit * e.unitsToConvert;
}

/** 0..1 share of the asset affected by an electrify action. */
export function fractionFor(a: ElectrifyAction, asset: CombustionAsset): number {
  const units = asset.unitCount ?? 1;
  const raw =
    asset.category === "mobile"
      ? units > 0
        ? a.unitsToConvert / units
        : 0
      : a.capacityPct / 100;
  return Math.max(0, Math.min(1, raw));
}

/** Default (off) efficiency package — step 0 of the pipeline. Saving hint from
 *  the end-use profile; capex a "low band" default per category. */
export function defaultEfficiency(asset: CombustionAsset): EfficiencyAction {
  return {
    enabled: false,
    savingPct: efficiencyHintFor(asset.endUse),
    capex: asset.category === "mobile" ? 25_000 * Math.max(1, asset.unitCount ?? 1) : 500_000,
    startYear: 2026,
    targetYear: 2028,
  };
}

/** Sensible default (off) action plan for a freshly-added asset. */
export function defaultActions(asset: CombustionAsset): AssetActions {
  const base: AssetActions = {
    efficiency: defaultEfficiency(asset),
    electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 0, purchaseTiming: "replacement", replacementPremiumPct: 40, startYear: 2026, targetYear: 2032 },
    fuelSwitch: { enabled: false, altFuel: defaultAltFuelFor(asset.fuelType) ?? "biodiesel", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 78, retrofitCapex: 0, startYear: 2027, targetYear: 2033 },
    flexFuel: defaultFlexFuel(asset),
  };
  const p = endUseProfile(asset);
  if (!p) return base;
  return {
    ...base,
    electrify: {
      ...base.electrify,
      cop: p.electrify.cop,
      assetCapex: p.electrify.capexPerUnit ?? base.electrify.assetCapex,
      capacityPct: asset.category === "mobile" ? base.electrify.capacityPct : (p.electrify.capacityHint ?? base.electrify.capacityPct),
    },
    fuelSwitch: { ...base.fuelSwitch, altFuel: p.fuelSwitch.preferred ?? base.fuelSwitch.altFuel },
  };
}

/** Sensible default (off) plan for a freshly-added cooling system. */
export function defaultSystemActions(sys: RefrigerationSystem): SystemActions {
  const cls = refrigClassProfile(sys);
  const alt = cls?.recommendedAlt ?? RECOMMENDED_ALT_BY_SYSTEM[sys.systemType];
  return {
    gasSwitch: { enabled: false, transitionPct: 60, altRefrigerant: alt, retrofitCapex: 0, altGasPricePerKg: refrigerantPricePerKg(alt), startYear: 2026, targetYear: 2030 },
    // LDAR program sized to the charge (installed charge ≈ 4× annual top-up at ~25% leak).
    leakFix: { enabled: false, leakImprovementPct: 50, capex: Math.round(4_000 * sys.toppedUpKg), startYear: 2026, targetYear: 2028 },
  };
}

export interface AssetActionResult {
  /** Step 0: tonnes removed by demand-side efficiency (acts on the full base). */
  efficiencyAbatementT: number;
  scope1AbatementT: number; // electrification share of Scope 1 removed (post-efficiency base)
  fuelAbatementT: number; // ALL fuel-switching (drop-in blend + flex-fuel) Scope 1 removed
  flexAbatementT: number; // flex-fuel portion of fuelAbatementT (for attribution)
  scope2AddedT: number;
  biogenicT: number;
  kWh: number;
  /** Fraction of fuel saved by efficiency (0..1) — downstream fractions apply to the remainder. */
  effFraction: number;
  elecFraction: number;
  fuelFraction: number; // combined bio share of the post-efficiency energy (drop-in + flex)
  flexFraction: number; // share of the fleet converted to flex-fuel vehicles
}

export function applyAssetActions(
  asset: CombustionAsset,
  acts: AssetActions,
  g: GlobalAssumptions,
): AssetActionResult {
  // Step 0 — efficiency shrinks the base every downstream lever acts on
  // (reduce demand → improve efficiency → switch source, on the remainder).
  const effFrac = acts.efficiency?.enabled ? clamp01(acts.efficiency.savingPct / 100) : 0;
  const efficiencyAbatementT = effFrac * combustionCO2e(asset);
  const working: CombustionAsset = effFrac > 0
    ? { ...asset, annualVolume: asset.annualVolume * (1 - effFrac) }
    : asset;

  // Electrification next — those vehicles/duty leave combustion entirely.
  const elecFrac = acts.electrify.enabled ? fractionFor(acts.electrify, asset) : 0;
  const elec = applyElectrification(working, {
    transitionPct: elecFrac * 100,
    cop: acts.electrify.cop,
    renewableSourcingPct: g.renewableSourcingPct,
    gridEf: g.gridEf,
  });

  // Flex-fuel: specific vehicles converted to a high blend (E85/E100). Mobile only,
  // and never more of the fleet than is left after electrification.
  const flex = acts.flexFuel;
  const flexUnits = asset.unitCount ?? 1;
  const flexOn = !!flex?.enabled && asset.category === "mobile" && flexUnits > 0 && flex.unitsToConvert > 0;
  const flexFrac = flexOn ? Math.min(clamp01(flex!.unitsToConvert / flexUnits), 1 - elecFrac) : 0;
  const flexBioShare = flexOn ? flexFrac * clamp01(flex!.highBlendPct / 100) : 0;

  // Drop-in blend on the STANDARD fleet — what's neither electrified nor flex.
  // Capped by the context-aware limit (B20 for vehicles, up to B100 for boilers).
  const standardFrac = Math.max(0, 1 - elecFrac - flexFrac);
  const dropInCap = maxBlendPctFor(asset.category, acts.fuelSwitch.altFuel) / 100;
  const dropInBioShare = acts.fuelSwitch.enabled ? Math.min(acts.fuelSwitch.blendPct / 100, dropInCap, standardFrac) : 0;

  // Both blends use the same matched alt fuel; combine for the total, and compute
  // the flex-only slice separately for clean attribution.
  const altFuel = flexOn ? flex!.altFuel : acts.fuelSwitch.altFuel;
  const penalty = acts.fuelSwitch.efficiencyPenaltyPct;
  const combinedBio = flexBioShare + dropInBioShare;
  const fuel = applyFuelSwitch(working, { altFuel, blendPct: combinedBio * 100, efficiencyPenaltyPct: penalty });
  const flexOnly = flexBioShare > 0
    ? applyFuelSwitch(working, { altFuel, blendPct: flexBioShare * 100, efficiencyPenaltyPct: penalty })
    : null;

  return {
    efficiencyAbatementT,
    scope1AbatementT: elec.scope1AbatementT,
    fuelAbatementT: fuel.abatementT,
    flexAbatementT: flexOnly?.abatementT ?? 0,
    scope2AddedT: elec.scope2AddedT,
    biogenicT: fuel.biogenicT,
    kWh: elec.kWh,
    effFraction: effFrac,
    elecFraction: elecFrac,
    fuelFraction: combinedBio,
    flexFraction: flexFrac,
  };
}
