/* ============================================================
   Combined balance engine — one target across Scope 1 + 2.
   Measures the combined (market-based) 2030 reduction for any pair
   of dial vectors, and suggests mixes on three bases: cheapest ₹/t
   (the balanced default), lowest CAPEX (least upfront capital), and
   best OPEX saving (savings-first, shortest payback). Each family is
   priced standalone with the real model, ranked by the chosen
   objective, then raised greedily until the target is met. Every
   suggested mix also switches leak fixes on — near-zero cost, pure
   savings. Pure: no React.
   ============================================================ */

import { compute } from "@/lib/model";
import { applyDials, deriveDials, withLeakFixes, type BalanceDials } from "@/lib/model/energy-balance";
import { combineTrajectories } from "@/lib/model/combined";
import { programmeMetrics } from "@/lib/finance";
import type { LeverMetrics } from "@/lib/finance";
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
  /** Year the reduction is measured at (defaults to 2030). */
  targetYear?: number;
}

export type MixObjective = "costPerTonne" | "capex" | "opexSaving" | "budget";

export interface MixKpis {
  totalCapex: number;
  annualOpexDelta: number; // positive = cost, negative = saving
  costPerTonne: number;
  paybackYears: number | null;
  /** Why `paybackYears` is what it is. Without it, "no capital at risk" and
   *  "never recovered" both render as an em dash — opposite facts, one glyph. */
  paybackKind: LeverMetrics["paybackKind"];
}

export interface MixOption {
  objective: MixObjective;
  label: string;
  blurb: string;
  dials: CombinedDials;
  achieved: number; // combined market-based reduction at 2030 (fraction)
  met: boolean;
  /** True when the CAPEX budget stopped the mix before the target. */
  budgetLimited?: boolean;
  kpis: MixKpis;
}

export function currentCombinedDials(inp: CombinedInputs): CombinedDials {
  return {
    s1: deriveDials(inp.assets, inp.systems, inp.s1Base),
    s2: deriveDials2(inp.facilities, inp.s2Base),
  };
}

/* ---------- measurement ---------- */

function results(inp: CombinedInputs, d: CombinedDials, leakFixes: boolean) {
  let s1Settings = applyDials(inp.assets, inp.systems, inp.s1Base, d.s1);
  if (leakFixes) s1Settings = withLeakFixes(s1Settings, inp.systems);
  const r1 = compute(inp.assets, inp.systems, s1Settings, inp.baseYear);
  // Same assumptions the Scope 1 call above just used. Before computeScope2
  // took this argument the two scopes priced capital differently — Scope 1 on
  // the user's discount rate, Scope 2 on a hardcoded 10% (F8) — and this
  // combined view is exactly where that discrepancy was on display.
  const r2 = computeScope2(
    inp.facilities, applyDials2(inp.facilities, inp.s2Base, d.s2), inp.baseYear,
    s1Settings.assumptions,
  );
  return { r1, r2 };
}

function reductionOf(r1: ReturnType<typeof compute>, r2: ReturnType<typeof computeScope2>, targetYear = 2030): number {
  const rows = combineTrajectories(r1.trajectory, r2.trajectoryMarket);
  if (rows.length === 0) return 0;
  const base = rows[0].bau;
  const atTarget = rows.find((r) => r.year === targetYear) ?? rows[rows.length - 1];
  return base > 0 ? (atTarget.bau - atTarget.net) / base : 0;
}

/** Combined market-based reduction at the target year for a pair of dial vectors (no leak-fix add-on). */
export function combinedReduction2030(inp: CombinedInputs, d: CombinedDials): number {
  const { r1, r2 } = results(inp, d, false);
  return reductionOf(r1, r2, inp.targetYear);
}

/** Combined Scope 1 + Scope 2 money view. This function carried THREE of the
 *  defects the finance engine exists to fix, and was named in no task: it
 *  filtered on `abatementT > 0` so capex on a zero-tonne lever vanished (F4),
 *  divided summed `annualCost` by summed tonnes — the annuity ratio, and a mean
 *  weighted by whatever levers happened to be active (F5) — and reported an
 *  UNDISCOUNTED simple payback beside it (F6).
 *
 *  Both scopes now expose `series`, and both are built from the same base year
 *  and the same assumptions, so one `programmeMetrics` call over the union is
 *  the whole answer. If that precondition ever breaks, its discount-factor
 *  guard throws rather than quietly returning an order-dependent number. */
function kpisOf(r1: ReturnType<typeof compute>, r2: ReturnType<typeof computeScope2>): MixKpis {
  // Every lever with money attached, not just those with tonnes (F4).
  const costed = [...r1.levers, ...r2.levers]
    .filter((l) => l.capex > 0 || l.opexParts.some((p) => p.amount !== 0));
  const programme = programmeMetrics(costed.map((l) => l.series));
  return {
    totalCapex: programme.totalCapex,
    annualOpexDelta: costed.reduce((s, l) => s + l.annualOpexDelta, 0),
    costPerTonne: programme.levelisedCostPerTonne,
    paybackYears: programme.paybackYears,
    paybackKind: programme.paybackKind,
  };
}

/* ---------- families & pricing ---------- */

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

interface FamilyPrice { costPerTonne: number; capexPerTonne: number; opexPerTonne: number; tonnes: number; }

/** Price one family alone at 100% with the real model (leak fixes excluded so
 *  the family's own economics aren't polluted).
 *
 *  `costPerTonne` is the SAME programme-levelised figure kpisOf reports and the
 *  card displays. It used to be `Σ annualCost / Σ tonnes` — the CRF annuity
 *  that lib/model marks DISPLAY ONLY, over a filtered tonne count — so the
 *  ranking that CHOSE the mix and the number shown for it were two different
 *  quantities on two different bases, and could order the families differently.
 *  Two lines treating one thing differently, as in Rulings P, R and T.
 *
 *  The `abatementT > 0` filter went with it: it dropped a family's capex from
 *  its own price whenever the spend produced no tonnes, which is F4 rebuilt
 *  inside the suggester. Tonnes are still counted over every lever, so a family
 *  that spends without abating prices as Infinity rather than vanishing. */
function priceFamily(inp: CombinedInputs, f: FamilyKey): FamilyPrice {
  const { r1, r2 } = results(inp, withDial(ZERO, f, 100), false);
  const levers = f.scope === 1 ? r1.levers : r2.levers;
  const costed = levers.filter((l) => l.capex > 0 || l.opexParts.some((p) => p.amount !== 0));
  const tonnes = levers.reduce((s, l) => s + l.abatementT, 0);
  if (tonnes <= 0) return { costPerTonne: Infinity, capexPerTonne: Infinity, opexPerTonne: Infinity, tonnes: 0 };
  const programme = programmeMetrics(costed.map((l) => l.series));
  return {
    costPerTonne: programme.levelisedCostPerTonne,
    capexPerTonne: programme.totalCapex / tonnes,
    opexPerTonne: costed.reduce((s, l) => s + l.annualOpexDelta, 0) / tonnes,
    tonnes,
  };
}

function rankKey(p: FamilyPrice, objective: MixObjective): [number, number] {
  switch (objective) {
    case "capex": return [p.capexPerTonne, p.costPerTonne];
    case "opexSaving": return [p.opexPerTonne, p.costPerTonne]; // most-saving (most negative) first
    case "costPerTonne":
    case "budget": return [p.costPerTonne, p.capexPerTonne]; // budget = cheapest-first within the cap
  }
}

/* ---------- suggesters ---------- */

function greedyMix(
  inp: CombinedInputs, target: number, objective: MixObjective, capexBudget?: number,
): { dials: CombinedDials; achieved: number; order: string[]; budgetLimited: boolean } {
  const ranked = FAMILIES
    .map((f) => ({ f, p: priceFamily(inp, f) }))
    .filter((x) => x.p.tonnes > 0)
    .sort((a, b) => {
      const ka = rankKey(a.p, objective), kb = rankKey(b.p, objective);
      return ka[0] - kb[0] || ka[1] - kb[1];
    });

  let dials: CombinedDials = {
    ...ZERO,
    s1: { ...ZERO.s1, renewablePct: inp.s1Base.assumptions.renewableSourcingPct ?? 0 },
  };
  const measure = (d: CombinedDials) => {
    const { r1, r2 } = results(inp, d, true); // suggested mixes always include leak fixes
    const active = [...r1.levers, ...r2.levers].filter((l) => l.abatementT > 0);
    return { reduction: reductionOf(r1, r2, inp.targetYear), capex: active.reduce((s, l) => s + l.capex, 0) };
  };
  let m = measure(dials);
  let budgetLimited = false;

  const greenElectrify = (d: CombinedDials, f: FamilyKey): CombinedDials =>
    f.scope === 1 && f.key === "electrifyPct"
      ? { ...d, s1: { ...d.s1, renewablePct: Math.max(d.s1.renewablePct, d.s2.procurementPct) } }
      : d;

  for (const { f } of ranked) {
    if (m.reduction >= target) break;
    for (let v = 10; v <= 100; v += 10) {
      const prev = dials;
      // Green the electricity that electrification adds, in step with procurement.
      dials = greenElectrify(withDial(dials, f, v), f);
      const next = measure(dials);
      // Budget mode: a step that busts the CAPEX cap is reverted; cheaper
      // families further down the ranking may still fit.
      if (objective === "budget" && capexBudget != null && next.capex > capexBudget) {
        dials = prev;
        budgetLimited = true;
        break;
      }
      m = next;
      if (m.reduction >= target) break;
    }
  }

  // "Best OPEX saving" means MAXIMIZE savings subject to the target, not just
  // reach it: raise every self-funding lever (negative OPEX per tonne) fully —
  // more reduction, more savings; the payback column shows the capital price.
  if (objective === "opexSaving") {
    let changed = false;
    for (const { f, p } of ranked) {
      if (p.opexPerTonne < 0) { dials = greenElectrify(withDial(dials, f, 100), f); changed = true; }
    }
    if (changed) m = measure(dials);
  }

  return { dials, achieved: m.reduction, order: ranked.map((x) => `${x.f.scope === 1 ? "S1" : "S2"}:${x.f.key}`), budgetLimited };
}

/** Single-objective suggest (cheapest ₹/t by default). */
export function suggestCombinedMix(inp: CombinedInputs, target: number, objective: MixObjective = "costPerTonne") {
  return greedyMix(inp, target, objective);
}

const OPTION_META: Record<MixObjective, { label: string; blurb: string }> = {
  costPerTonne: { label: "Cheapest overall", blurb: "Lowest ₹ per tonne — the balanced default." },
  capex: { label: "Lowest CAPEX", blurb: "Least upfront capital — leans procurement and blends before new kit." },
  opexSaving: { label: "Best OPEX saving", blurb: "Savings-maximizing — every self-funding lever at full, plus leak fixes; the payback column shows the capital price." },
  budget: { label: "Within CAPEX budget", blurb: "Cheapest tonnes first, never exceeding your capital envelope — the question boards actually ask." },
};

/** The three bases (plus a budget-capped fourth when a CAPEX budget is given),
 *  each scored with the real model. */
export function suggestMixOptions(inp: CombinedInputs, target: number, opts?: { capexBudget?: number }): MixOption[] {
  const objectives: MixObjective[] = ["costPerTonne", "capex", "opexSaving"];
  if (opts?.capexBudget != null && opts.capexBudget > 0) objectives.push("budget");
  return objectives.map((objective) => {
    const { dials, achieved, budgetLimited } = greedyMix(inp, target, objective, opts?.capexBudget);
    const { r1, r2 } = results(inp, dials, true);
    return {
      objective,
      ...OPTION_META[objective],
      dials,
      achieved,
      met: achieved >= target - 1e-9,
      budgetLimited: objective === "budget" ? budgetLimited : undefined,
      kpis: kpisOf(r1, r2),
    };
  });
}
