import { computeScope2 } from "./index";
import { applyEfficiency } from "./efficiency";
import { applyGeneration } from "./generation";
import { defaultFacilityActions } from "../defaults";
import { roofCapKwp } from "./suggestions";
import type { Facility, Scope2Levers } from "./types";

export interface BalanceDials2 { efficiencyPct: number; solarPct: number; procurementPct: number; }
const TARGET_YEAR = 2030;

export function applyDials2(facilities: Facility[], base: Scope2Levers, d: BalanceDials2): Scope2Levers {
  const byFacility = { ...base.byFacility };
  for (const f of facilities) {
    const cur = byFacility[f.id] ?? defaultFacilityActions(f);
    const efficiency = d.efficiencyPct > 0
      ? { ...cur.efficiency, enabled: true, ledPct: d.efficiencyPct, motorPct: d.efficiencyPct, bmsPct: d.efficiencyPct, targetYear: TARGET_YEAR }
      : { ...cur.efficiency, enabled: false };
    const cap = roofCapKwp(f);
    const solarKwp = Math.round(cap * (d.solarPct / 100));
    const generation = d.solarPct > 0 && cap > 0
      ? { ...cur.generation, enabled: true, solarKwp, targetYear: TARGET_YEAR }
      : { ...cur.generation, enabled: false };
    byFacility[f.id] = { ...cur, efficiency, generation };
  }
  const clean = Math.max(0, Math.min(100, d.procurementPct));
  const procurement = d.procurementPct > 0
    ? { ...base.procurement, enabled: true, ppaPct: clean, greenTariffPct: 0, recPct: 0, targetYear: TARGET_YEAR }
    : { ...base.procurement, enabled: false };
  return { byFacility, procurement };
}

/** Indicative remaining-electricity mix (post-efficiency): grid vs renewable. */
export function energyMix2(facilities: Facility[], levers: Scope2Levers): { gridKwh: number; renewableKwh: number } {
  let grid = 0, renew = 0;
  const procClean = levers.procurement.enabled ? Math.min(100, levers.procurement.ppaPct + levers.procurement.greenTariffPct + levers.procurement.recPct) / 100 : 0;
  for (const f of facilities) {
    if (f.excluded) continue;
    const acts = levers.byFacility[f.id] ?? defaultFacilityActions(f);
    const eff = acts.efficiency.enabled ? applyEfficiency(f, acts.efficiency) : null;
    const residual = eff ? eff.residualLoadKwh : f.annualLoadKwh;
    const gen = acts.generation.enabled ? applyGeneration(f, acts.generation, residual) : null;
    const onSite = gen?.usedOnSiteKwh ?? 0;
    const gridDraw = Math.max(0, residual - onSite);
    renew += onSite + gridDraw * procClean;
    grid += gridDraw * (1 - procClean);
  }
  return { gridKwh: grid, renewableKwh: renew };
}

/** Stepwise heuristic: efficiency → solar → procurement until 2030 reduction ≥ target, via pure compute. */
export function suggestMix2(facilities: Facility[], base: Scope2Levers, target: number, baseYear: number): BalanceDials2 {
  const dials: BalanceDials2 = { efficiencyPct: 0, solarPct: 0, procurementPct: 0 };
  const reductionFor = (d: BalanceDials2) => computeScope2(facilities, applyDials2(facilities, base, d), baseYear).kpis.reduction2030;
  if (reductionFor(dials) >= target) return dials;
  const order: (keyof BalanceDials2)[] = ["efficiencyPct", "solarPct", "procurementPct"];
  for (const key of order) {
    for (let v = 10; v <= 100; v += 10) { dials[key] = v; if (reductionFor(dials) >= target) return dials; }
  }
  return dials;
}
