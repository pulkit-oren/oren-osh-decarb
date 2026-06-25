/* ============================================================
   Per-asset action layer — turns an asset's electrify + fuel-switch
   plan into tonnes moved, reusing the existing physics. The 0..1
   fraction comes from vehicle counts (mobile) or % capacity
   (stationary). Spec: per-asset segmented modeller.
   ============================================================ */

import { applyElectrification, applyFuelSwitch } from "./levers";
import { ALT_FUELS, ALT_FUELS_BY_FUEL, maxBlendPctFor, RECOMMENDED_ALT_BY_SYSTEM } from "./factors";
import { refrigClassProfile } from "./refrigerant-class";
import type { AltFuelId, AssetActions, CombustionAsset, ElectrifyAction, FlexFuelAction, GlobalAssumptions, RefrigerationSystem, SystemActions } from "./types";
import { endUseProfile } from "./end-use";

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

/** 0..1 share of the asset affected by an electrify action. */
export function fractionFor(a: ElectrifyAction, asset: CombustionAsset): number {
  const raw =
    asset.category === "mobile"
      ? asset.unitCount > 0
        ? a.unitsToConvert / asset.unitCount
        : 0
      : a.capacityPct / 100;
  return Math.max(0, Math.min(1, raw));
}

/** Sensible default (off) action plan for a freshly-added asset. */
export function defaultActions(asset: CombustionAsset): AssetActions {
  const base: AssetActions = {
    electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 0, startYear: 2026, targetYear: 2032 },
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
  return {
    gasSwitch: { enabled: false, transitionPct: 60, altRefrigerant: cls?.recommendedAlt ?? RECOMMENDED_ALT_BY_SYSTEM[sys.systemType], retrofitCapex: 0, startYear: 2026, targetYear: 2030 },
    leakFix: { enabled: false, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 },
  };
}

export interface AssetActionResult {
  scope1AbatementT: number; // electrification share of Scope 1 removed
  fuelAbatementT: number; // ALL fuel-switching (drop-in blend + flex-fuel) Scope 1 removed
  flexAbatementT: number; // flex-fuel portion of fuelAbatementT (for attribution)
  scope2AddedT: number;
  biogenicT: number;
  kWh: number;
  elecFraction: number;
  fuelFraction: number; // combined bio share of total energy (drop-in + flex)
  flexFraction: number; // share of the fleet converted to flex-fuel vehicles
}

export function applyAssetActions(
  asset: CombustionAsset,
  acts: AssetActions,
  g: GlobalAssumptions,
): AssetActionResult {
  // Electrification first — those vehicles leave combustion entirely.
  const elecFrac = acts.electrify.enabled ? fractionFor(acts.electrify, asset) : 0;
  const elec = applyElectrification(asset, {
    transitionPct: elecFrac * 100,
    cop: acts.electrify.cop,
    renewableSourcingPct: g.renewableSourcingPct,
    gridEf: g.gridEf,
  });

  // Flex-fuel: specific vehicles converted to a high blend (E85/E100). Mobile only,
  // and never more of the fleet than is left after electrification.
  const flex = acts.flexFuel;
  const flexOn = !!flex?.enabled && asset.category === "mobile" && asset.unitCount > 0 && flex.unitsToConvert > 0;
  const flexFrac = flexOn ? Math.min(clamp01(flex!.unitsToConvert / asset.unitCount), 1 - elecFrac) : 0;
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
  const fuel = applyFuelSwitch(asset, { altFuel, blendPct: combinedBio * 100, efficiencyPenaltyPct: penalty });
  const flexOnly = flexBioShare > 0
    ? applyFuelSwitch(asset, { altFuel, blendPct: flexBioShare * 100, efficiencyPenaltyPct: penalty })
    : null;

  return {
    scope1AbatementT: elec.scope1AbatementT,
    fuelAbatementT: fuel.abatementT,
    flexAbatementT: flexOnly?.abatementT ?? 0,
    scope2AddedT: elec.scope2AddedT,
    biogenicT: fuel.biogenicT,
    kWh: elec.kWh,
    elecFraction: elecFrac,
    fuelFraction: combinedBio,
    flexFraction: flexFrac,
  };
}
