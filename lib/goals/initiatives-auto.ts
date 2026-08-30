/* ============================================================
   Auto-initiatives — derive suggested initiatives from the user's
   entered data, expressed in the goal's metric. Scope 1 uses the real
   per-asset physics (applyAssetActions / applyRefrigerant); Scope 2
   sizes solar to roof+load, a standard efficiency saving, and a
   procurement top-up. Pure: same data + goal → same initiatives.
   Generated ids are deterministic so user edits merge across refreshes.
   ============================================================ */

import { combustionCO2e, combustionEnergyKJ } from "@/lib/model/baseline";
import { applyAssetActions, defaultActions, defaultSystemActions, type AssetActionResult } from "@/lib/model/segments";
import { applyRefrigerant } from "@/lib/model/levers";
import { effectiveLeakImprovementPct } from "@/lib/model/refrigerant-charge";
import { getRefrigerant, refrigerantPricePerKg } from "@/lib/model/factors";
import {
  financeAssumptionsFrom,
  resolveFuelSpend,
  S1_LIFETIME_YEARS,
  S2_LIFETIME_YEARS,
  summariseLever,
  type FinanceAssumptions,
  type OpexPart,
} from "@/lib/finance";
import { suggestForAsset, suggestForSystem, capexForAsset, capexForSystem } from "@/lib/model/suggestions";
import { M2_PER_KW } from "@/lib/scope2/model/constants";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import { resolveCombustion, resolveRefrigeration } from "@/lib/yearly";
import { isUnallocatedId, resolveEquipment } from "@/lib/equipment/resolve";
import { resolveFacilities } from "@/lib/scope2/store-helpers";
import type { AssetActions, EfficiencyAction, ElectrifyAction, FuelSwitchAction, FlexFuelAction, SystemActions, GasSwitchAction, LeakFixAction, RefrigerationSystem } from "@/lib/model/types";
import type { GlobalAssumptions } from "@/lib/model/types";
import type { Goal, Initiative } from "./types";
import type { Inventories } from "./select";

const KJ_PER_KWH = 3600;
const SOLAR_CAPEX_PER_KW = 45_000;
const EFFICIENCY_SAVING_SHARE = 0.15; // standard LED+motor+BMS portfolio saving
const EFFICIENCY_CAPEX_PER_KWH = 12;
/** Non-finance defaults. The FINANCE fields now arrive through the
 *  `assumptions` parameter; this stays only as the base the caller's overrides
 *  are merged onto, so the user's gridEf and sourcing mix reach the PHYSICS too.
 *  Passing this constant straight to `applyAssetActions` meant a user's grid
 *  factor silently did not reach the goals layer — the finance half of the same
 *  problem was fixed and the physics half was not. */
const ASSUMPTIONS = DEFAULT_SETTINGS.assumptions;

function mergeAssetSuggestion(asset: Parameters<typeof suggestForAsset>[0]): AssetActions {
  const acts = defaultActions(asset);
  for (const a of suggestForAsset(asset).actions) {
    if (a.lever === "efficiency" && acts.efficiency) acts.efficiency = { ...acts.efficiency, ...(a.patch as Partial<EfficiencyAction>), enabled: true };
    else if (a.lever === "electrify") acts.electrify = { ...acts.electrify, ...(a.patch as Partial<ElectrifyAction>), enabled: true };
    else if (a.lever === "fuelSwitch") acts.fuelSwitch = { ...acts.fuelSwitch, ...(a.patch as Partial<FuelSwitchAction>), enabled: true };
    else if (a.lever === "flexFuel" && acts.flexFuel) acts.flexFuel = { ...acts.flexFuel, ...(a.patch as Partial<FlexFuelAction>), enabled: true };
  }
  return acts;
}

function mergeSystemSuggestion(sys: Parameters<typeof suggestForSystem>[0]): SystemActions {
  const acts = defaultSystemActions(sys);
  for (const a of suggestForSystem(sys).actions) {
    if (a.lever === "gasSwitch") acts.gasSwitch = { ...acts.gasSwitch, ...(a.patch as Partial<GasSwitchAction>), enabled: true };
    else if (a.lever === "leakFix") acts.leakFix = { ...acts.leakFix, ...(a.patch as Partial<LeakFixAction>), enabled: true };
  }
  return acts;
}

const scopeIncludesS1 = (g: Goal) => g.scope === "s1" || g.scope === "s1s2";
const scopeIncludesS2 = (g: Goal) => g.scope === "s2" || g.scope === "s1s2";

/** Per-asset running-cost delta for a suggested plan — mirrors the compute()
 *  opex logic so the goal's P&L view matches the modeller. Every money decision
 *  now comes from `@/lib/finance`, so "mirrors" is structural rather than a
 *  promise: this was the THIRD copy of `asset.opex / asset.annualVolume` (F11),
 *  and it read zero on any source with no typed spend just like the other two.
 *  `fa` is threaded in rather than read from a module constant, because the
 *  whole point of Ruling E is that this layer could not see the user's
 *  assumptions at all. */
function assetOpexDelta(
  asset: Parameters<typeof suggestForAsset>[0], acts: AssetActions, r: AssetActionResult,
  fa: FinanceAssumptions,
): number {
  let d = 0;
  const spend = resolveFuelSpend(asset, fa);

  // Efficiency cuts VOLUME, so it saves the fuel half only (F2).
  if (acts.efficiency?.enabled) d -= spend.fuel * r.effFraction;

  if (acts.electrify.enabled && r.elecFraction > 0) {
    d += r.kWh * acts.electrify.tariffPerKwh;
    // The whole bill goes away when the plant is replaced...
    d -= (spend.fuel + spend.maintenance) * (1 - r.effFraction) * r.elecFraction;
    // ...and the replacement still needs maintaining. Was `0.2 * 0.65` inline —
    // maintenanceShareOfSpendPct and evMaintenanceRatioPct as literals, so a
    // user editing either had no effect here (F11). Stationary was omitted
    // entirely, the same F3 gap lib/model had.
    const retain = asset.category === "mobile"
      ? fa.evMaintenanceRatioPct / 100
      : fa.heatPumpMaintenanceRatioPct / 100;
    d += spend.maintenance * (1 - r.effFraction) * r.elecFraction * retain;
  }

  if ((acts.fuelSwitch.enabled || acts.flexFuel?.enabled) && r.fuelFraction > 0) {
    const vol = asset.annualVolume * (1 - r.effFraction) * r.fuelFraction;
    d += vol * acts.fuelSwitch.altFuelPricePerUnit;
    // The FUEL half only — see Ruling T. The plan prescribed
    // `vol * resolvePrice(asset).pricePerUnit` here, which on a measured source
    // is the blended fuel-and-maintenance rate compared against a pure pump
    // price: the same defect Ruling P fixed in lib/model, prescribed a third
    // time. A blend switch leaves the engine's maintenance alone.
    d -= spend.fuel * (1 - r.effFraction) * r.fuelFraction;
  }
  return d;
}

/** Per-system running-cost delta: leak savings, alt-gas top-ups, displaced base gas. */
function systemOpexDelta(sys: Parameters<typeof suggestForSystem>[0], acts: SystemActions): number {
  let d = 0;
  const leakPct = effectiveLeakImprovementPct(sys as RefrigerationSystem, acts.leakFix);
  d -= sys.toppedUpKg * (leakPct / 100) * sys.gasCostPerKg;
  if (acts.gasSwitch.enabled && acts.gasSwitch.transitionPct > 0) {
    const gShare = acts.gasSwitch.transitionPct / 100;
    const topUp = sys.toppedUpKg * (1 - leakPct / 100);
    const alt = getRefrigerant(acts.gasSwitch.altRefrigerant);
    const altPrice = acts.gasSwitch.altGasPricePerKg ?? refrigerantPricePerKg(acts.gasSwitch.altRefrigerant);
    d += gShare * topUp * alt.volAdj * altPrice - gShare * topUp * sys.gasCostPerKg;
  }
  return d;
}

/** Suggested initiatives for a goal, from base-year data, in the goal's metric. */
export function autoInitiatives(
  goal: Goal, inv: Inventories,
  // OPTIONAL so every existing 2-arg caller keeps compiling. Before this
  // parameter existed, ASSUMPTIONS was a module constant and the user's
  // assumptions were structurally unreachable here — which is WHY line 62 could
  // hardcode `0.2 * 0.65` without anyone noticing (Ruling E, extended).
  assumptions?: Partial<GlobalAssumptions>,
): Initiative[] {
  const fa = financeAssumptionsFrom(assumptions);
  // Merged, so the physics below sees the user's gridEf / renewable mix as well.
  const phys = { ...ASSUMPTIONS, ...assumptions };
  const out: Initiative[] = [];
  /** How an initiative's running-cost delta behaves over time. Hardcoding one
   *  tag for all of them made a Scope 2 solar saving escalate at the FUEL rate,
   *  which flipped both its NPV sign and whether it had a payback at all. */
  type Econ = { kind: OpexPart["kind"]; assetLifeYears: number };
  const FUEL_ECON: Econ = { kind: "fuel", assetLifeYears: S1_LIFETIME_YEARS.fuelSwitch };

  const push = (
    ref: string, name: string, metricImpact: number, budget: number, annualOpexDelta?: number,
    econ: Econ = FUEL_ECON,
  ) => {
    if (metricImpact <= 0) return;
    // ONE summariseLever call, read twice. It used to be called inline inside
    // the paybackYears expression, which meant the kind could not be reached
    // without calling the engine a second time — so it was dropped instead.
    // No `budget > 0` condition. discountedPayback already answers capex <= 0
    // with {years: null, kind: "no-capital"} — the same answer a guard here
    // would hand-write, which is one rule in two places and a mutation that
    // cannot fail.
    const financed = annualOpexDelta != null
      ? summariseLever(
          {
            id: ref ?? "initiative", capex: Math.round(budget),
            opexParts: [{ label: "net", amount: annualOpexDelta, kind: econ.kind }],
            fullAbatementT: 1,
            // The initiative's OWN ramp and life. This used to hardcode
            // startYear + 1 / rampYears 1 / assetLifeYears 10, ignoring the
            // startYear and targetYear set a few lines below in this same
            // object — so the payback was computed over a window and a phasing
            // the initiative does not have.
            startYear: Math.min(goal.baseYear + 1, goal.targetYear),
            rampYears: Math.max(1, goal.targetYear - Math.min(goal.baseYear + 1, goal.targetYear) + 1),
            assetLifeYears: econ.assetLifeYears,
          },
          goal.baseYear, fa,
        ).metrics
      : null;
    out.push({
      id: `a:${goal.id}:${ref}`,
      goalId: goal.id,
      name,
      scope: goal.scope,
      status: "planned",
      startYear: Math.min(goal.baseYear + 1, goal.targetYear),
      targetYear: goal.targetYear,
      metricImpact,
      budget: Math.round(budget),
      annualOpexDelta: annualOpexDelta != null ? Math.round(annualOpexDelta) : undefined,
      // Discounted, off the same series the modeller reads (F6) — and
      // undefined rather than 0 when there is no capital at risk (F9).
      paybackYears: financed?.paybackYears ?? undefined,
      // A budget of 0 gives kind "no-capital" from the engine — a RESULT, not
      // missing data. Only a genuinely unfinanced initiative (no
      // annualOpexDelta at all) leaves the kind undefined.
      paybackKind: financed?.paybackKind,
      progressPct: 0,
      auto: true,
      sourceRef: ref,
    });
  };

  // RESOLVED rows, not raw entries. suggestForAsset / defaultActions /
  // capexForAsset all read unitCount and endUse FLAT off the row, and a raw
  // entry carries neither — the flat fields live on equipment[] and only
  // resolveEquipment stamps them back (Ruling A). Feeding raw entries here
  // rendered auto-initiatives as "electrify 1 of undefined vehicles" and priced
  // a five-van fleet's efficiency capex at one van. Levers are keyed by
  // equipment id (spec 3.3), so the per-row ids these push are the right
  // sourceRef. The remainder row is dropped: it is a bookkeeping row for volume
  // no machine owns, and no lever can act on it.
  const assets = resolveEquipment(
    resolveCombustion(inv.combustion, goal.baseYear).filter((a) => !a.excluded),
  ).filter((a) => !isUnallocatedId(a.id));
  const systems = resolveRefrigeration(inv.refrigeration, goal.baseYear).filter((s) => !s.excluded);
  const facilities = resolveFacilities(inv.facilities, goal.baseYear).filter((f) => !f.excluded);
  const totalLoad = facilities.reduce((s, f) => s + f.annualLoadKwh, 0);

  // ---------- Emissions (tonnes) ----------
  if (goal.metric === "emissions_t") {
    if (scopeIncludesS1(goal)) {
      for (const asset of assets) {
        const acts = mergeAssetSuggestion(asset);
        const r = applyAssetActions(asset, acts, phys);
        const tonnes = r.efficiencyAbatementT + r.scope1AbatementT + r.fuelAbatementT;
        push(asset.id, suggestForAsset(asset).headline, tonnes, capexForAsset(asset, acts), assetOpexDelta(asset, acts, r, fa));
      }
      for (const sys of systems) {
        const acts = mergeSystemSuggestion(sys);
        const r = applyRefrigerant(sys, {
          transitionPct: acts.gasSwitch.enabled ? acts.gasSwitch.transitionPct : 0,
          altRefrigerant: acts.gasSwitch.altRefrigerant,
          leakImprovementPct: effectiveLeakImprovementPct(sys, acts.leakFix),
          chargeReductionPct: acts.chargeReduction?.enabled ? acts.chargeReduction.reductionPct : 0,
        });
        push(sys.id, suggestForSystem(sys).headline, r.abatementT, capexForSystem(acts), systemOpexDelta(sys, acts),
          { kind: "other", assetLifeYears: S1_LIFETIME_YEARS.refrigerant });
      }
    }
    if (scopeIncludesS2(goal)) {
      for (const f of facilities) {
        const solar = sizeSolar(f);
        push(`${f.id}:solar`, `Install ${Math.round(solar.kWp)} kWp solar at ${f.name}`, solar.selfConsumed * f.gridEf / 1000, solar.budget, -solar.selfConsumed * f.tariffPerKwh,
          { kind: "elec", assetLifeYears: S2_LIFETIME_YEARS.generation });
        const savedKwh = EFFICIENCY_SAVING_SHARE * f.annualLoadKwh;
        push(`${f.id}:eff`, `Energy-efficiency retrofit at ${f.name}`, savedKwh * f.gridEf / 1000, savedKwh * EFFICIENCY_CAPEX_PER_KWH, -savedKwh * f.tariffPerKwh,
          { kind: "elec", assetLifeYears: S2_LIFETIME_YEARS.efficiency });
      }
    }
    return out;
  }

  // ---------- Total energy (kWh) ----------
  if (goal.metric === "energy_kwh") {
    if (scopeIncludesS1(goal)) {
      for (const asset of assets) {
        const acts = mergeAssetSuggestion(asset);
        const r = applyAssetActions(asset, acts, phys);
        const displacedFuelKwh = (combustionEnergyKJ(asset) / KJ_PER_KWH) * r.elecFraction;
        const energySaved = Math.max(0, displacedFuelKwh - r.kWh); // efficiency gain from electrification (COP)
        push(asset.id, suggestForAsset(asset).headline, energySaved, capexForAsset(asset, acts));
      }
    }
    if (scopeIncludesS2(goal)) {
      for (const f of facilities) {
        const savedKwh = EFFICIENCY_SAVING_SHARE * f.annualLoadKwh;
        push(`${f.id}:eff`, `Energy-efficiency retrofit at ${f.name}`, savedKwh, savedKwh * EFFICIENCY_CAPEX_PER_KWH);
        const solar = sizeSolar(f);
        push(`${f.id}:solar`, `Install ${Math.round(solar.kWp)} kWp solar at ${f.name}`, solar.selfConsumed, solar.budget);
      }
    }
    return out;
  }

  // ---------- Renewable electricity % (percentage points) ----------
  if (goal.metric === "renewable_pct") {
    for (const f of facilities) {
      const solar = sizeSolar(f);
      const pp = totalLoad > 0 ? (solar.selfConsumed / totalLoad) * 100 : 0;
      push(`${f.id}:solar`, `Install ${Math.round(solar.kWp)} kWp solar at ${f.name}`, pp, solar.budget);
    }
    // A portfolio procurement top-up to close the remaining gap to target.
    const fromSolar = out.reduce((s, i) => s + i.metricImpact, 0);
    const gap = Math.max(0, (goal.targetPct ?? 100) - fromSolar);
    if (gap > 0 && totalLoad > 0) {
      const addressableKwh = totalLoad * (gap / 100);
      push("procurement", `Contract PPAs / green tariff for ${Math.round(gap)}% of load`, gap, addressableKwh * 1.5);
    }
    return out;
  }

  // ---------- On-site solar capacity (kWp) ----------
  if (goal.metric === "solar_kwp") {
    for (const f of facilities) {
      const solar = sizeSolar(f);
      push(`${f.id}:solar`, `Install solar at ${f.name}`, solar.kWp, solar.budget);
    }
    return out;
  }

  // ---------- Water (kL) ----------
  // No per-source data yet — seed the standard stewardship playbook, sized
  // as shares of the base-year total so the forecast has something to ramp.
  const water = inv.water?.[goal.baseYear];
  if (goal.metric === "water_withdrawal_kl" || goal.metric === "water_consumption_kl") {
    const base = goal.metric === "water_withdrawal_kl" ? (water?.withdrawalKl ?? 0) : (water?.consumptionKl ?? 0);
    push("water:leaks", "Fix distribution leaks + smart water metering", base * 0.08, base * 0.08 * 20);
    push("water:fixtures", "Low-flow fixtures & domestic-use efficiency", base * 0.05, base * 0.05 * 40);
    push("water:recycle", "Treat & recycle process / cooling water", base * 0.15, base * 0.15 * 120);
    push("water:rain", "Rainwater harvesting & storage", base * 0.10, base * 0.10 * 60);
    return out;
  }
  if (goal.metric === "water_discharge_kl") {
    const base = water?.dischargeKl ?? 0;
    push("water:etp", "Effluent treatment & reuse (RO / evaporation)", base * 0.6, base * 0.6 * 250);
    push("water:blowdown", "Recover cooling-tower blowdown & condensate", base * 0.15, base * 0.15 * 90);
    return out;
  }

  // ---------- Waste (t / diversion %) ----------
  const waste = inv.waste?.[goal.baseYear];
  if (goal.metric === "waste_generated_t") {
    const base = waste?.generatedT ?? 0;
    push("waste:audit", "Waste audits + source segregation at every unit", base * 0.10, base * 0.10 * 2000);
    push("waste:packaging", "Reduce & reuse packaging materials", base * 0.08, base * 0.08 * 1500);
    push("waste:process", "Cut process scrap & rework losses", base * 0.07, base * 0.07 * 2500);
    return out;
  }
  if (goal.metric === "waste_diversion_pct") {
    const generated = waste?.generatedT ?? 0;
    const current = generated > 0 ? Math.min(100, ((waste?.recoveredT ?? 0) / generated) * 100) : 0;
    const gap = Math.max(0, (goal.targetPct ?? 100) - current);
    const tonnesPerPp = generated / 100;
    push("waste:segregation", "Source-segregation program (dry / wet / hazardous)", gap * 0.5, gap * 0.5 * tonnesPerPp * 2000);
    push("waste:partners", "Recycler & co-processing partnerships", gap * 0.3, gap * 0.3 * tonnesPerPp * 1200);
    push("waste:organic", "Compost / biogas for organic waste", gap * 0.2, gap * 0.2 * tonnesPerPp * 3000);
    return out;
  }

  return out;
}

function sizeSolar(f: { roofSpaceM2: number; existingSolarKwp?: number; irradiance: number; annualLoadKwh: number }) {
  const roofCap = Math.max(0, f.roofSpaceM2 / M2_PER_KW - (f.existingSolarKwp ?? 0));
  const kWpForLoad = f.irradiance > 0 ? f.annualLoadKwh / f.irradiance : roofCap;
  const kWp = Math.min(roofCap, kWpForLoad);
  const gen = kWp * f.irradiance;
  const selfConsumed = Math.min(gen, f.annualLoadKwh);
  return { kWp, gen, selfConsumed, budget: kWp * SOLAR_CAPEX_PER_KW };
}
