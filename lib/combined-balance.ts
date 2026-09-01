/* ============================================================
   Combined balance engine — one target across Scope 1 + 2.
   Measures the combined (market-based) 2030 reduction for any pair
   of dial vectors, and suggests mixes on three bases: cheapest ₹/t
   (the balanced default), lowest CAPEX (least upfront capital), and
   best OPEX saving (savings-first, shortest payback). Every suggested
   mix also switches leak fixes on — near-zero cost, pure savings.
   Pure: no React.

   It SEARCHES; it does not rank. Each family used to be priced once,
   standalone from zero, and the sorted list walked with each dial raised
   to 100% in turn. A fixed ranking cannot see that levers consume each
   other: solar alone was worth +23.03pp for capital that buys +4.70pp
   once procurement is at 100%, and "Best OPEX saving" recommended
   bio-blend at 100% whose measured contribution was 0.0000pp, because
   electrification had already converted the fuel it would have blended.
   An exhaustive pass over a coarse grid, refined locally, prices every
   mix as a whole and has neither failure. See GRID for why it is
   affordable.

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

export type MixObjective = "costPerTonne" | "netCost" | "capex" | "opexSaving";

export interface MixKpis {
  /** Discounted whole-life cost of the programme: capital plus running cost,
   *  every year of it, brought back to the base year. Positive = the plan costs
   *  money overall; negative = it pays for itself and more.
   *
   *  This is the figure "cheapest" reads as, and it is NOT costPerTonne. The
   *  two share a numerator and differ by the tonne denominator, so a ratio can
   *  be best while the total is far from it - which is exactly how the card
   *  labelled "Cheapest overall" came to recommend 90.55 Cr of capital beside
   *  a 4.01 Cr mix that met the same target. */
  netPresentCost: number;
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

function kpisOf(r1: ReturnType<typeof compute>, r2: ReturnType<typeof computeScope2>): MixKpis {
  const costed = costedLevers(r1, r2);
  const programme = programmeMetrics(costed.map((l) => l.series));
  return {
    // `npv` is the net BENEFIT (metrics.ts returns -discCost), so the cost is
    // its negation. Getting this sign backwards would rank the basis exactly
    // inside out, and every figure on the card would still look plausible.
    netPresentCost: -programme.npv,
    totalCapex: programme.totalCapex,
    annualOpexDelta: costed.reduce((s, l) => s + l.annualOpexDelta, 0),
    costPerTonne: programme.levelisedCostPerTonne,
    paybackYears: programme.paybackYears,
    paybackKind: programme.paybackKind,
  };
}

/* ---------- the search space ---------- */

/** The six dials a mix is made of. `renewablePct` is NOT among them: it is
 *  derived (see `mixOf`), because it is not a choice the plan makes
 *  independently — it is the greenness of the electricity electrification
 *  adds, and it moves with procurement. */
const DIAL_KEYS = [
  "s1EfficiencyPct", "electrifyPct", "bioBlendPct", "refrigPct",
  "s2EfficiencyPct", "solarPct", "procurementPct",
] as const;
type DialKey = (typeof DIAL_KEYS)[number];
type DialVector = Record<DialKey, number>;

/** The coarse grid the exhaustive pass walks: 3^7 = 2,187 mixes.
 *
 *  Chosen by measurement. One model evaluation costs ~0.065 ms warm, so this
 *  pass is ~150 ms; the 10% grid the dials themselves offer would be 11^7 and
 *  some five hours. A 5-level grid was tried and
 *  REJECTED — not for speed but for answers: on the shipped fixture at a 60%
 *  target it returned -24,824 Rs/t for 18.89 Cr where this one returns -25,041
 *  for 17.69 Cr. Coarse-and-well-refined beat fine-and-bluntly-refined, because
 *  what the search needs from the grid is the right BASIN, and what it needs
 *  from the refinement is the right point inside it. Below 50% the two agreed
 *  exactly, so the finer grid was buying 15x the time for nothing. */
const GRID = [0, 50, 100] as const;

/** Steps the local refinement tries on each dial, around a grid winner.
 *
 *  Both signs of three sizes. +-20 hops the gap between two grid points so the
 *  climb is not trapped by one bad step; +-10 reaches the resolution the dials
 *  are drawn at; +-5 is what lets a 0/50/100 grid land on a genuinely odd
 *  optimum. Dropping +-5 measurably cost answer quality — see GRID. */
const REFINE_DELTAS = [-20, -10, -5, 5, 10, 20] as const;

/** How many grid points each basis refines from.
 *
 *  Refinement is a single-dial hill climb, so it cannot leave the basin it
 *  starts in, and the grid is coarse enough that the best grid point is not
 *  always in the best basin. Climbing from more than one start and keeping the
 *  best result stops one fixture's luck from being load-bearing.
 *
 *  Two, not three: three was tried and returned byte-identical answers at every
 *  target on the shipped fixture while roughly doubling the time (about 200 ms
 *  against 400). Four bases climbing from three starts each is twelve climbs,
 *  and that is what the suggest button pays for. */
const REFINE_STARTS = 2;

/** A dial vector as the engines want it, with `renewablePct` derived.
 *
 *  Electrification moves energy onto the grid, so the plan has to say how green
 *  that grid is. The rule — match procurement, never go below the assumption
 *  the user already set — is the one the greedy walk applied through its
 *  `greenElectrify` helper. It applied it only when it happened to raise
 *  electrification, so a mix that raised procurement AFTERWARDS kept the old,
 *  dirtier figure and the same pair of dials scored differently depending on
 *  the order the walk reached them. Derived here instead, it cannot. */
function mixOf(inp: CombinedInputs, v: DialVector): CombinedDials {
  const baseRe = inp.s1Base.assumptions.renewableSourcingPct ?? 0;
  return {
    s1: {
      efficiencyPct: v.s1EfficiencyPct,
      electrifyPct: v.electrifyPct,
      bioBlendPct: v.bioBlendPct,
      refrigPct: v.refrigPct,
      renewablePct: v.electrifyPct > 0 ? Math.max(baseRe, v.procurementPct) : baseRe,
    },
    s2: {
      efficiencyPct: v.s2EfficiencyPct,
      solarPct: v.solarPct,
      procurementPct: v.procurementPct,
    },
  };
}

const vectorOf = (d: CombinedDials): DialVector => ({
  s1EfficiencyPct: d.s1.efficiencyPct, electrifyPct: d.s1.electrifyPct,
  bioBlendPct: d.s1.bioBlendPct, refrigPct: d.s1.refrigPct,
  s2EfficiencyPct: d.s2.efficiencyPct, solarPct: d.s2.solarPct, procurementPct: d.s2.procurementPct,
});

/** All dials off. Named rather than repeated: two places need it, and one of
 *  them is the floor a cap below the unavoidable minimum falls back to. */
const ZERO_VECTOR: DialVector = {
  s1EfficiencyPct: 0, electrifyPct: 0, bioBlendPct: 0, refrigPct: 0,
  s2EfficiencyPct: 0, solarPct: 0, procurementPct: 0,
};

/* ---------- scoring ---------- */

/** Everything a mix is judged on, from one model run.
 *
 *  Exported because the search and the tests must agree on what a mix is worth:
 *  a property like "no recommended lever could be switched off for free" is
 *  only meaningful if the test measures the mix the same way the search did. */
export interface MixScore {
  /** Fraction below the base year at the target year — the level basis. */
  reduction: number;
  /** Discounted capital plus running cost over the programme's life. */
  netPresentCost: number;
  totalCapex: number;
  /** Positive = cost, negative = saving. */
  annualOpexDelta: number;
  costPerTonne: number;
  paybackYears: number | null;
  paybackKind: LeverMetrics["paybackKind"];
  /** Sum of the six dials. Not a cost — the last tie-break, so that between two
   *  mixes that are identical on every figure that matters, the one that asks
   *  the business to do LESS wins. This is what keeps a lever whose substrate
   *  another lever already consumed out of the recommendation: bio-blend at
   *  100% behind electrification at 100% scored exactly the same as bio-blend
   *  at 0 — same tonnes, same rupees — so under the old walk it was raised, and
   *  the plan told the reader to run a biofuel programme that changed nothing. */
  dialSum: number;
}

/** One model run, one set of figures.
 *
 *  The CAPEX cap is enforced against `totalCapex` from THIS function, which is
 *  the same number the option card prints, because both read one `kpisOf`. The
 *  budget gate used to compute its own — the sum of capex over levers with
 *  `abatementT > 0` — so capital on a lever that bought no tonnes was invisible
 *  to the cap and visible on the card, and a capped mix could display a CAPEX
 *  above its own cap. Two lines answering one question is how that happens; the
 *  fix is one line answering it. */
export function scoreMix(inp: CombinedInputs, d: CombinedDials): MixScore {
  const { r1, r2 } = results(inp, d, true); // suggested mixes always include leak fixes
  const k = kpisOf(r1, r2);
  const v = vectorOf(d);
  return {
    reduction: reductionOf(r1, r2, inp.targetYear),
    netPresentCost: k.netPresentCost,
    totalCapex: k.totalCapex,
    annualOpexDelta: k.annualOpexDelta,
    costPerTonne: k.costPerTonne,
    paybackYears: k.paybackYears,
    paybackKind: k.paybackKind,
    dialSum: DIAL_KEYS.reduce((s, key) => s + v[key], 0),
  };
}

/** Each basis as a lexicographic key, lower being better on every element.
 *
 *  Lexicographic rather than a single figure because every basis has a
 *  tie-break that matters and no basis should be decided by iteration order.
 *  The last element is always `dialSum` — see the note on it above. */
function objectiveKey(s: MixScore, objective: MixObjective): [number, number, number] {
  switch (objective) {
    // Least upfront capital; then cheapest per tonne of the mixes that tie.
    case "capex": return [s.totalCapex, s.costPerTonne, s.dialSum];
    // Least whole-life cost. A genuinely different question from costPerTonne
    // - total against ratio - which is why this earns a card where the CAPEX
    // budget did not: an earlier "budget" objective was removed because its
    // key was byte-identical to costPerTonne's, and a basis that cannot rank
    // differently is not a basis.
    case "netCost": return [s.netPresentCost, s.totalCapex, s.dialSum];
    // Most saving per year — the most NEGATIVE annual delta, so plain `<` on a
    // signed number is already "best saving first".
    case "opexSaving": return [s.annualOpexDelta, s.totalCapex, s.dialSum];
    // Lowest levelised cost of abatement; then the one that ties it for less
    // capital.
    case "costPerTonne": return [s.costPerTonne, s.totalCapex, s.dialSum];
  }
}

const keyLess = (a: [number, number, number], b: [number, number, number]) =>
  a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2];

/* ---------- the search ---------- */

interface Candidate { v: DialVector; s: MixScore }

/** Scores already computed for one inputs object: the whole grid, plus every
 *  point any refinement has visited.
 *
 *  A mix's score depends on the inputs and the dials — never on the target or
 *  the CAPEX cap, which are applied to the scores afterwards. Two things follow.
 *  Moving the target slider, or trying three budgets in a row, re-filters a
 *  grid already scored rather than re-scoring it. And the twelve hill climbs
 *  (four bases from three starts each) overlap heavily — they explore the same
 *  neighbourhood from different directions — so sharing one memo across them
 *  is most of the refinement's cost removed.
 *
 *  Keyed on object IDENTITY, which is sound only because CombinedInputs is
 *  built fresh and never mutated. A caller that mutated one in place would get
 *  a stale grid; none does, and the type is all-readonly in spirit. Weak, so an
 *  inputs object the caller has dropped takes its scores with it. */
interface Scores { points: Candidate[]; byKey: Map<string, MixScore> }
const SCORE_CACHE = new WeakMap<CombinedInputs, Scores>();

const vectorKey = (v: DialVector) => DIAL_KEYS.map((k) => v[k]).join(",");

/** `scoreMix` through the memo. Every search path must go through this rather
 *  than calling `scoreMix` directly, or the climbs stop sharing work. */
function scoreVector(inp: CombinedInputs, v: DialVector): MixScore {
  const cache = scoresFor(inp);
  const key = vectorKey(v);
  const hit = cache.byKey.get(key);
  if (hit) return hit;
  const s = scoreMix(inp, mixOf(inp, v));
  cache.byKey.set(key, s);
  return s;
}

function scoresFor(inp: CombinedInputs): Scores {
  const hit = SCORE_CACHE.get(inp);
  if (hit) return hit;

  const cache: Scores = { points: [], byKey: new Map() };
  // Set before filling: scoreVector below re-enters through scoresFor, and a
  // second empty cache would make the memo silently useless.
  SCORE_CACHE.set(inp, cache);

  const v: DialVector = { ...ZERO_VECTOR };
  const walk = (i: number) => {
    if (i === DIAL_KEYS.length) {
      const key = vectorKey(v);
      const s = scoreMix(inp, mixOf(inp, v));
      cache.byKey.set(key, s);
      cache.points.push({ v: { ...v }, s });
      return;
    }
    for (const level of GRID) { v[DIAL_KEYS[i]] = level; walk(i + 1); }
    v[DIAL_KEYS[i]] = 0;
  };
  walk(0);

  return cache;
}

const scoredGrid = (inp: CombinedInputs): Candidate[] => scoresFor(inp).points;

/** Best of the mixes that meet the target inside the cap, per basis; plus what
 *  to fall back on when nothing does.
 *
 *  One pass over the grid answers all three bases at once — the scores do not
 *  depend on which basis is asking — so three cards cost one search, not three.
 */
function searchGrid(inp: CombinedInputs, target: number, cap: number) {
  /** The best REFINE_STARTS feasible points per basis, best first. */
  const feasible: Partial<Record<MixObjective, Candidate[]>> = {};
  /** The most reduction reachable inside the cap, for when the target is not. */
  let bestReachable: Candidate | null = null;
  /** Whether the target is reachable at all when the cap is ignored — the only
   *  thing that distinguishes "your budget stopped this" from "your target is
   *  out of reach whatever you spend". */
  let targetReachableUncapped = false;

  const keep = (o: MixObjective, point: Candidate) => {
    const list = (feasible[o] ??= []);
    const key = objectiveKey(point.s, o);
    let at = list.length;
    while (at > 0 && keyLess(key, objectiveKey(list[at - 1].s, o))) at--;
    if (at < REFINE_STARTS) {
      list.splice(at, 0, point);
      if (list.length > REFINE_STARTS) list.length = REFINE_STARTS;
    }
  };

  for (const point of scoredGrid(inp)) {
    const { s: sc } = point;
    const meetsTarget = sc.reduction >= target - 1e-9;
    if (meetsTarget) targetReachableUncapped = true;
    if (sc.totalCapex > cap) continue;
    if (meetsTarget) {
      for (const o of OBJECTIVES) keep(o, point);
    } else if (!bestReachable
      || sc.reduction > bestReachable.s.reduction + 1e-12
      || (Math.abs(sc.reduction - bestReachable.s.reduction) <= 1e-12 && sc.dialSum < bestReachable.s.dialSum)) {
      bestReachable = point;
    }
  }

  return { feasible, bestReachable: bestReachable as Candidate | null, targetReachableUncapped };
}

/** Hill-climb from one grid point, at finer resolution than the grid.
 *
 *  The grid is coarse on purpose (see GRID); this recovers the detail between
 *  its points without paying for a 10% search of the whole space. Single-dial
 *  moves only, so it is a local improvement and not a second search — it
 *  cannot escape a basin, and does not need to: the exhaustive pass already
 *  chose which basin. */
function refine(
  inp: CombinedInputs, start: Candidate, target: number, cap: number, objective: MixObjective,
): Candidate {
  let best = start;
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (const key of DIAL_KEYS) {
      for (const delta of REFINE_DELTAS) {
        const level = best.v[key] + delta;
        if (level < 0 || level > 100) continue;
        const v = { ...best.v, [key]: level };
        const s = scoreVector(inp, v);
        if (s.reduction < target - 1e-9 || s.totalCapex > cap) continue;
        if (keyLess(objectiveKey(s, objective), objectiveKey(best.s, objective))) {
          best = { v, s };
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return best;
}

/* Order is display order. `netCost` sits directly beside `costPerTonne`
   because those two are the pair a reader confuses: one is the best deal per
   tonne, the other the smallest bill. Seeing them adjacent is most of the
   explanation. */
const OBJECTIVES: MixObjective[] = ["costPerTonne", "netCost", "capex", "opexSaving"];

interface Suggestion { dials: CombinedDials; achieved: number; budgetLimited: boolean }

/** Every basis's answer, from one grid pass and one refinement each. */
function searchAll(inp: CombinedInputs, target: number, capexBudget?: number): Record<MixObjective, Suggestion> {
  // Infinity, not a null check at each use site: an absent budget is an
  // unbounded one, and `> Infinity` is false for every finite spend.
  const cap = capexBudget != null && capexBudget > 0 ? capexBudget : Infinity;
  const { feasible, bestReachable, targetReachableUncapped } = searchGrid(inp, target, cap);

  const out = {} as Record<MixObjective, Suggestion>;
  for (const objective of OBJECTIVES) {
    const starts = feasible[objective];
    if (starts && starts.length > 0) {
      let best = refine(inp, starts[0], target, cap, objective);
      for (const start of starts.slice(1)) {
        const climbed = refine(inp, start, target, cap, objective);
        if (keyLess(objectiveKey(climbed.s, objective), objectiveKey(best.s, objective))) best = climbed;
      }
      out[objective] = { dials: mixOf(inp, best.v), achieved: best.s.reduction, budgetLimited: false };
      continue;
    }
    if (bestReachable) {
      // Short of the target. That is the cap's doing only if the target WAS
      // reachable with the cap lifted; otherwise the target is simply out of
      // reach and saying "budget-capped" would blame the wrong constraint.
      out[objective] = {
        dials: mixOf(inp, bestReachable.v),
        achieved: bestReachable.s.reduction,
        budgetLimited: cap < Infinity && targetReachableUncapped,
      };
      continue;
    }
    // Not one mix on the grid comes in under the cap — including the empty one,
    // whose capital is the floor: leak fixes ride along unconditionally and the
    // base settings may already carry spend. No mix can come in under a cap
    // below that floor, so the floor is reported rather than silently honoured,
    // and this is the one case where a card's CAPEX may exceed its own cap.
    const floorV = ZERO_VECTOR;
    const floor = scoreVector(inp, floorV);
    out[objective] = { dials: mixOf(inp, floorV), achieved: floor.reduction, budgetLimited: true };
  }
  return out;
}

/* ---------- suggesters ---------- */

/** Single-basis suggest (cheapest ₹/t by default), optionally inside a CAPEX
 *  ceiling. */
export function suggestCombinedMix(
  inp: CombinedInputs, target: number, objective: MixObjective = "costPerTonne", capexBudget?: number,
): Suggestion {
  return searchAll(inp, target, capexBudget)[objective];
}

const OPTION_META: Record<MixObjective, { label: string; blurb: string }> = {
  /* NOT "Cheapest overall". It ranks on levelised cost per tonne, which on a
     plan that saves money is NEGATIVE - so "lowest" selects the biggest saving
     per tonne, and the biggest saving per tonne is the most capital-hungry
     plan. On a client inventory that card read 90.55 Cr beside a 4.01 Cr mix
     meeting the same target, under the word "cheapest". The metric is a
     legitimate axis; only the name was wrong. */
  costPerTonne: { label: "Best value per tonne", blurb: "Biggest saving for every tonne removed — may commit significant capital." },
  netCost: { label: "Lowest total cost", blurb: "Smallest whole-life bill — capital plus running cost, discounted." },
  capex: { label: "Lowest CAPEX", blurb: "Least upfront capital — leans procurement and blends before new kit." },
  opexSaving: { label: "Best OPEX saving", blurb: "Savings-maximizing — every self-funding lever at full, plus leak fixes; the payback column shows the capital price." },
};

/** The three bases, each scored with the real model, each built inside the
 *  CAPEX ceiling when one is given. Always three: the cap constrains every
 *  basis rather than adding one of its own. */
export function suggestMixOptions(inp: CombinedInputs, target: number, opts?: { capexBudget?: number }): MixOption[] {
  // ONE grid pass answers all three: a mix's score does not depend on which
  // basis is asking, so three cards cost one search rather than three.
  const found = searchAll(inp, target, opts?.capexBudget);
  return OBJECTIVES.map((objective) => {
    const { dials, achieved, budgetLimited } = found[objective];
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
