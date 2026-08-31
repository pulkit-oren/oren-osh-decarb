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

   A CAPEX budget is a CONSTRAINT, not a fourth basis. It used to be
   modelled as one — a `budget` objective whose rankKey was byte-identical
   to `costPerTonne`'s — so it was never a distinct way of choosing levers,
   only the cheapest basis with a ceiling. The cost of that framing was that
   the other three bases ignored the ceiling entirely: enter ₹50 L and
   "Cheapest overall" still came back at ₹27 Cr, 55x over, sitting beside a
   fourth card that honoured it. Now the cap is orthogonal — every basis is
   built inside it — and there are three bases whether or not one is set.
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
  /** Each scope's business-as-usual growth fallback, in PERCENT — 2.84 means
   *  2.84 %/yr, NOT a fraction; the engines divide by 100 themselves. This is
   *  the rate each store derives from its own year-wise inventory
   *  (`deriveBauGrowth`), and `assumptions.bauGrowthPct` still beats it inside
   *  the engines.
   *
   *  REQUIRED, not optional, and deliberately so. `results()` below used to call
   *  both engines with four arguments, so no derived rate ever reached the
   *  suggester: every mix was built on the engines' 1 %/yr floor while the rail
   *  above the cards annotated the same curve with the derived rate. Because
   *  `reductionOf` is BOTH the greedy walk's stop rule and `MixOption.achieved`,
   *  all three cards badged "meets target" for plans that finished far above the
   *  level the rail was showing — Apply, and the gap reappeared immediately.
   *
   *  `number | undefined` as a required property is the point: `undefined` stays
   *  meaningful ("no derived rate available — fall through to the floor"), but
   *  the compiler demands the key at every construction site, so the omission
   *  cannot be made silently a second time. */
  s1BauFallbackPct: number | undefined;
  s2BauFallbackPct: number | undefined;
}

export type MixObjective = "costPerTonne" | "capex" | "opexSaving";

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
  /** True when the CAPEX budget stopped the mix before the target — so exactly
   *  when the badge should read "budget-capped" rather than "best reachable".
   *  A cap that bound mid-walk but was still overtaken by a cheaper family
   *  further down the ranking did not limit the mix, and does not set this.
   *
   *  Also true when the cap sits below the mix's unavoidable floor (leak fixes
   *  plus whatever the base settings already commit), which no mix can come in
   *  under — so `kpis.totalCapex` may exceed the cap in that one case, and only
   *  that one. */
  budgetLimited: boolean;
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
  // Fifth argument on both calls: the growth premise each store derived. Its
  // absence here was the defect described on `CombinedInputs.s1BauFallbackPct`.
  const r1 = compute(inp.assets, inp.systems, s1Settings, inp.baseYear, inp.s1BauFallbackPct);
  // Same assumptions the Scope 1 call above just used. Before computeScope2
  // took this argument the two scopes priced capital differently — Scope 1 on
  // the user's discount rate, Scope 2 on a hardcoded 10% (F8) — and this
  // combined view is exactly where that discrepancy was on display.
  const r2 = computeScope2(
    inp.facilities, applyDials2(inp.facilities, inp.s2Base, d.s2), inp.baseYear,
    s1Settings.assumptions, inp.s2BauFallbackPct,
  );
  return { r1, r2 };
}

/** Fraction BELOW THE BASE YEAR at `targetYear` — the level basis.
 *
 *  This returned `(bau(y) - net(y)) / base` — tonnes AVOIDED over base-year
 *  emissions. That is a different quantity from "emissions ended X% below the
 *  base year" whenever BAU has moved off the base year, and it is the latter
 *  that Goals (`targetValueAt`), the trajectory target line, and every external
 *  framework mean. The two differed by `(bau(y) - base) / base`, which changes
 *  SIGN depending on whether activity growth or the grid-EF decline wins — so on
 *  the shipped assumptions the old basis was too harsh, and on a frozen grid it
 *  was too generous, badging a mix "meets target" some five points short of the
 *  level it had committed to.
 *
 *  Because `greedyMix` stops on this number, fixing it here fixes the stop rule
 *  and `MixOption.achieved` at the same time. */
function reductionOf(r1: ReturnType<typeof compute>, r2: ReturnType<typeof computeScope2>, targetYear = 2030): number {
  const rows = combineTrajectories(r1.trajectory, r2.trajectoryMarket);
  if (rows.length === 0) return 0;
  const base = rows[0].bau;
  const atTarget = rows.find((r) => r.year === targetYear) ?? rows[rows.length - 1];
  return base > 0 ? (base - atTarget.net) / base : 0;
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
/** Every lever with money attached, not just those with tonnes (F4). */
function costedLevers(r1: ReturnType<typeof compute>, r2: ReturnType<typeof computeScope2>) {
  return [...r1.levers, ...r2.levers]
    .filter((l) => l.capex > 0 || l.opexParts.some((p) => p.amount !== 0));
}

/** The programme's total capital, on exactly the basis the option card shows.
 *
 *  The budget gate used to compute its own: `Σ capex over levers with
 *  abatementT > 0`. That is F4 rebuilt inside the suggester — the same filter
 *  priceFamily's comment says was removed for dropping capex that buys no
 *  tonnes. So capital on a zero-abatement lever (solar added after procurement
 *  has already zeroed the market-based factor; a gas swap with no GWP gain) was
 *  invisible to the cap and visible on the card, and a capped mix could display
 *  a CAPEX figure above its own cap. One function, one basis, no divergence. */
function totalCapexOf(r1: ReturnType<typeof compute>, r2: ReturnType<typeof computeScope2>): number {
  return programmeMetrics(costedLevers(r1, r2).map((l) => l.series)).totalCapex;
}

function kpisOf(r1: ReturnType<typeof compute>, r2: ReturnType<typeof computeScope2>): MixKpis {
  const costed = costedLevers(r1, r2);
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
    case "costPerTonne": return [p.costPerTonne, p.capexPerTonne];
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
    // The SAME capital the card will show, so the gate and the KPI cannot
    // disagree about whether a mix fits its budget.
    return { reduction: reductionOf(r1, r2, inp.targetYear), capex: totalCapexOf(r1, r2) };
  };
  /* The FLOOR: what a mix costs before any family is raised. Leak fixes ride
     along unconditionally (near-zero cost, pure savings) and the base settings
     may already carry spend, so this is capital no cap can decline — the walk
     below can only ever add to it. A cap below the floor is therefore not
     satisfiable by any mix, and is reported as budget-capped rather than
     silently honoured; every cap at or above it is enforced exactly. */
  let m = measure(dials);
  const floorCapex = m.capex;
  // Infinity, not a null check at each use site: an absent budget is an
  // unbounded one, and `> Infinity` is false for every finite spend.
  const cap = capexBudget != null && capexBudget > 0 ? capexBudget : Infinity;
  let capBound = cap < floorCapex;

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
      // A step that busts the CAPEX cap is reverted; cheaper families further
      // down the ranking may still fit. Applies to EVERY basis — a ceiling on
      // capital is a fact about the plan, not a way of ranking levers.
      if (next.capex > cap) {
        dials = prev;
        capBound = true;
        break;
      }
      m = next;
      if (m.reduction >= target) break;
    }
  }

  // "Best OPEX saving" means MAXIMIZE savings subject to the target, not just
  // reach it: raise every self-funding lever (negative OPEX per tonne) fully —
  // more reduction, more savings; the payback column shows the capital price.
  // Checked lever-by-lever against the cap: raising them all and measuring once
  // would throw away every affordable raise the moment one of them busts.
  if (objective === "opexSaving") {
    for (const { f, p } of ranked) {
      if (p.opexPerTonne >= 0) continue;
      const raised = greenElectrify(withDial(dials, f, 100), f);
      const next = measure(raised);
      if (next.capex > cap) continue; // the target is already met; this was extra
      dials = raised;
      m = next;
    }
  }

  return {
    dials,
    achieved: m.reduction,
    order: ranked.map((x) => `${x.f.scope === 1 ? "S1" : "S2"}:${x.f.key}`),
    // Only a cap that actually held the mix SHORT limited it. Reporting a cap
    // that bound mid-walk and was then overtaken by a cheaper family would
    // badge a target-meeting mix as budget-capped.
    budgetLimited: capBound && m.reduction < target,
  };
}

/** Single-objective suggest (cheapest ₹/t by default), optionally inside a
 *  CAPEX ceiling. */
export function suggestCombinedMix(
  inp: CombinedInputs, target: number, objective: MixObjective = "costPerTonne", capexBudget?: number,
) {
  return greedyMix(inp, target, objective, capexBudget);
}

const OPTION_META: Record<MixObjective, { label: string; blurb: string }> = {
  costPerTonne: { label: "Cheapest overall", blurb: "Lowest ₹ per tonne — the balanced default." },
  capex: { label: "Lowest CAPEX", blurb: "Least upfront capital — leans procurement and blends before new kit." },
  opexSaving: { label: "Best OPEX saving", blurb: "Savings-maximizing — every self-funding lever at full, plus leak fixes; the payback column shows the capital price." },
};

/** The three bases, each scored with the real model, each built inside the
 *  CAPEX ceiling when one is given. Always three: the cap constrains every
 *  basis rather than adding one of its own. */
export function suggestMixOptions(inp: CombinedInputs, target: number, opts?: { capexBudget?: number }): MixOption[] {
  const objectives: MixObjective[] = ["costPerTonne", "capex", "opexSaving"];
  return objectives.map((objective) => {
    const { dials, achieved, budgetLimited } = greedyMix(inp, target, objective, opts?.capexBudget);
    const { r1, r2 } = results(inp, dials, true);
    return {
      objective,
      ...OPTION_META[objective],
      dials,
      achieved,
      met: achieved >= target - 1e-9,
      budgetLimited,
      kpis: kpisOf(r1, r2),
    };
  });
}
