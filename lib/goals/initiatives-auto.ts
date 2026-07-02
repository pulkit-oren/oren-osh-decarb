/* ============================================================
   Auto-initiatives — derive suggested initiatives from the user's
   entered data, expressed in the goal's metric. Scope 1 uses the real
   per-asset physics (applyAssetActions / applyRefrigerant); Scope 2
   sizes solar to roof+load, a standard efficiency saving, and a
   procurement top-up. Pure: same data + goal → same initiatives.
   Generated ids are deterministic so user edits merge across refreshes.
   ============================================================ */

import { combustionCO2e, combustionEnergyKJ } from "@/lib/model/baseline";
import { applyAssetActions, defaultActions, defaultSystemActions } from "@/lib/model/segments";
import { applyRefrigerant } from "@/lib/model/levers";
import { suggestForAsset, suggestForSystem, capexForAsset, capexForSystem } from "@/lib/model/suggestions";
import { M2_PER_KW } from "@/lib/scope2/model/constants";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import { resolveCombustion, resolveRefrigeration } from "@/lib/yearly";
import { resolveFacilities } from "@/lib/scope2/store-helpers";
import type { AssetActions, ElectrifyAction, FuelSwitchAction, FlexFuelAction, SystemActions, GasSwitchAction, LeakFixAction } from "@/lib/model/types";
import type { Goal, Initiative } from "./types";
import type { Inventories } from "./select";

const KJ_PER_KWH = 3600;
const SOLAR_CAPEX_PER_KW = 45_000;
const EFFICIENCY_SAVING_SHARE = 0.15; // standard LED+motor+BMS portfolio saving
const EFFICIENCY_CAPEX_PER_KWH = 12;
const ASSUMPTIONS = DEFAULT_SETTINGS.assumptions;

function mergeAssetSuggestion(asset: Parameters<typeof suggestForAsset>[0]): AssetActions {
  const acts = defaultActions(asset);
  for (const a of suggestForAsset(asset).actions) {
    if (a.lever === "electrify") acts.electrify = { ...acts.electrify, ...(a.patch as Partial<ElectrifyAction>), enabled: true };
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

/** Suggested initiatives for a goal, from base-year data, in the goal's metric. */
export function autoInitiatives(goal: Goal, inv: Inventories): Initiative[] {
  const out: Initiative[] = [];
  const push = (ref: string, name: string, metricImpact: number, budget: number) => {
    if (metricImpact <= 0) return;
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
      progressPct: 0,
      auto: true,
      sourceRef: ref,
    });
  };

  const assets = resolveCombustion(inv.combustion, goal.baseYear).filter((a) => !a.excluded);
  const systems = resolveRefrigeration(inv.refrigeration, goal.baseYear).filter((s) => !s.excluded);
  const facilities = resolveFacilities(inv.facilities, goal.baseYear).filter((f) => !f.excluded);
  const totalLoad = facilities.reduce((s, f) => s + f.annualLoadKwh, 0);

  // ---------- Emissions (tonnes) ----------
  if (goal.metric === "emissions_t") {
    if (scopeIncludesS1(goal)) {
      for (const asset of assets) {
        const acts = mergeAssetSuggestion(asset);
        const r = applyAssetActions(asset, acts, ASSUMPTIONS);
        const tonnes = r.scope1AbatementT + r.fuelAbatementT;
        push(asset.id, suggestForAsset(asset).headline, tonnes, capexForAsset(asset, acts));
      }
      for (const sys of systems) {
        const acts = mergeSystemSuggestion(sys);
        const r = applyRefrigerant(sys, {
          transitionPct: acts.gasSwitch.enabled ? acts.gasSwitch.transitionPct : 0,
          altRefrigerant: acts.gasSwitch.altRefrigerant,
          leakImprovementPct: acts.leakFix.enabled ? acts.leakFix.leakImprovementPct : 0,
        });
        push(sys.id, suggestForSystem(sys).headline, r.abatementT, capexForSystem(acts));
      }
    }
    if (scopeIncludesS2(goal)) {
      for (const f of facilities) {
        const solar = sizeSolar(f);
        push(`${f.id}:solar`, `Install ${Math.round(solar.kWp)} kWp solar at ${f.name}`, solar.selfConsumed * f.gridEf / 1000, solar.budget);
        const savedKwh = EFFICIENCY_SAVING_SHARE * f.annualLoadKwh;
        push(`${f.id}:eff`, `Energy-efficiency retrofit at ${f.name}`, savedKwh * f.gridEf / 1000, savedKwh * EFFICIENCY_CAPEX_PER_KWH);
      }
    }
    return out;
  }

  // ---------- Total energy (kWh) ----------
  if (goal.metric === "energy_kwh") {
    if (scopeIncludesS1(goal)) {
      for (const asset of assets) {
        const acts = mergeAssetSuggestion(asset);
        const r = applyAssetActions(asset, acts, ASSUMPTIONS);
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
