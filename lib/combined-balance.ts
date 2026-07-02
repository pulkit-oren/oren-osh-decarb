/* ============================================================
   Combined balance engine — one target across Scope 1 + 2.
   Measures the combined (market-based) 2030 reduction for any pair
   of dial vectors, and suggests a mix CHEAPEST-FIRST: each lever
   family is priced alone (cost per tonne from the real model), then
   raised in cost order until the target is met. Pure: no React.
   ============================================================ */

import { compute } from "@/lib/model";
import { applyDials, deriveDials, type BalanceDials } from "@/lib/model/energy-balance";
import { combineTrajectories } from "@/lib/model/combined";
import type { CombustionAsset, LeverSettings, RefrigerationSystem } from "@/lib/model/types";
import { computeScope2 } from "@/lib/scope2/model";
import { applyDials2, deriveDials2, type BalanceDials2 } from "@/lib/scope2/model/energy-balance";
import type { Facility, Scope2Levers } from "@/lib/scope2/model/types";

export interface CombinedDials { s1: BalanceDials; s2: BalanceDials2; }

export interface CombinedInputs {
  assets: CombustionAsset[];        // pre-filtered: excluded removed
  systems: RefrigerationSystem[];   // pre-filtered
  s1Base: LeverSettings;
  facilities: Facility[];           // pre-filtered
  s2Base: Scope2Levers;
  baseYear: number;
}

export function currentCombinedDials(inp: CombinedInputs): CombinedDials {
  return {
    s1: deriveDials(inp.assets, inp.systems, inp.s1Base),
    s2: deriveDials2(inp.facilities, inp.s2Base),
  };
}

/** Combined market-based reduction at 2030 (fraction of the base-year total). */
export function combinedReduction2030(inp: CombinedInputs, d: CombinedDials): number {
  const r1 = compute(inp.assets, inp.systems, applyDials(inp.assets, inp.systems, inp.s1Base, d.s1), inp.baseYear);
  const r2 = computeScope2(inp.facilities, applyDials2(inp.facilities, inp.s2Base, d.s2), inp.baseYear);
  const rows = combineTrajectories(r1.trajectory, r2.trajectoryMarket);
  if (rows.length === 0) return 0;
  const base = rows[0].bau;
  const at2030 = rows.find((r) => r.year === 2030) ?? rows[rows.length - 1];
  return base > 0 ? (at2030.bau - at2030.net) / base : 0;
}

type FamilyKey =
  | { scope: 1; key: keyof BalanceDials }
  | { scope: 2; key: keyof BalanceDials2 };

const FAMILIES: FamilyKey[] = [
  { scope: 2, key: "efficiencyPct" },
  { scope: 2, key: "solarPct" },
  { scope: 2, key: "procurementPct" },
  { scope: 1, key: "bioBlendPct" },
  { scope: 1, key: "refrigPct" },
  { scope: 1, key: "electrifyPct" },
];

const ZERO: CombinedDials = {
  s1: { electrifyPct: 0, renewablePct: 0, bioBlendPct: 0, refrigPct: 0 },
  s2: { efficiencyPct: 0, solarPct: 0, procurementPct: 0 },
};

const withDial = (d: CombinedDials, f: FamilyKey, v: number): CombinedDials =>
  f.scope === 1 ? { ...d, s1: { ...d.s1, [f.key]: v } } : { ...d, s2: { ...d.s2, [f.key]: v } };

/** Price one family alone at 100%: ₹/t from the real model, Infinity if inert. */
function familyCostPerTonne(inp: CombinedInputs, f: FamilyKey): number {
  const d = withDial(ZERO, f, 100);
  if (f.scope === 1) {
    const r = compute(inp.assets, inp.systems, applyDials(inp.assets, inp.systems, inp.s1Base, d.s1), inp.baseYear);
    const active = r.levers.filter((l) => l.abatementT > 0);
    const t = active.reduce((s, l) => s + l.abatementT, 0);
    return t > 0 ? active.reduce((s, l) => s + l.annualCost, 0) / t : Infinity;
  }
  const r = computeScope2(inp.facilities, applyDials2(inp.facilities, inp.s2Base, d.s2), inp.baseYear);
  const active = r.levers.filter((l) => l.abatementT > 0);
  const t = active.reduce((s, l) => s + l.abatementT, 0);
  return t > 0 ? active.reduce((s, l) => s + l.annualCost, 0) / t : Infinity;
}

/**
 * Cheapest-first mix for a combined 2030 target (0..1). Families are ranked by
 * their standalone ₹/t, then raised in 10-point steps in that order until the
 * target is met (electrification's renewable sourcing follows the S2
 * procurement dial so new load is greened consistently). Starts from ZERO
 * dials — the caller decides whether to apply the result.
 */
export function suggestCombinedMix(inp: CombinedInputs, target: number): { dials: CombinedDials; achieved: number; order: string[] } {
  const ranked = FAMILIES
    .map((f) => ({ f, cost: familyCostPerTonne(inp, f) }))
    .filter((x) => x.cost !== Infinity)
    .sort((a, b) => a.cost - b.cost);

  let dials: CombinedDials = {
    ...ZERO,
    s1: { ...ZERO.s1, renewablePct: inp.s1Base.assumptions.renewableSourcingPct ?? 0 },
  };
  let achieved = combinedReduction2030(inp, dials);

  for (const { f } of ranked) {
    if (achieved >= target) break;
    for (let v = 10; v <= 100; v += 10) {
      dials = withDial(dials, f, v);
      // Green the electricity that electrification adds, in step with procurement.
      if (f.scope === 1 && f.key === "electrifyPct") {
        dials = { ...dials, s1: { ...dials.s1, renewablePct: Math.max(dials.s1.renewablePct, dials.s2.procurementPct) } };
      }
      achieved = combinedReduction2030(inp, dials);
      if (achieved >= target) break;
    }
  }

  return { dials, achieved, order: ranked.map((x) => `${x.f.scope === 1 ? "S1" : "S2"}:${x.f.key}` ) };
}
