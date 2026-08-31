/* ============================================================
   The BAU premise.

   Both scopes hold a year-wise inventory (FY2021→FY2027 on the
   shipped defaults) and the engines read exactly one of them, the
   base year. This module reads all of them: it turns each year into
   an actual-emissions point and turns those points into one growth
   rate, so business-as-usual is derived from the company's own
   history instead of a constant.

   Cross-scope, hence `lib/` root rather than `lib/model/` — the same
   reason `lib/cross-scope.ts` lives here. Pure: no React, no I/O.
   ============================================================ */

import { baselineScope1 } from "./model/baseline";
import { baselineScope2 } from "./scope2/model/baseline";
import { resolveCombustion, resolveRefrigeration } from "./yearly";
import { resolveFacilities } from "./scope2/store-helpers";
import type { CombustionAsset, CombustionByYear, RefrigerationByYear, RefrigerationSystem } from "./model/types";
import type { Facility, FacilitiesByYear } from "./scope2/model/types";

/** One year's actual emissions, in tonnes CO2e. */
export type YearPoint = { year: number; totalT: number };

export interface DerivedGrowth {
  /** Percent per year — 2.5 means 2.5%/yr. NOT a fraction. */
  pct: number;
  fromYear: number;
  toYear: number;
  /** Compounding years between the endpoints. */
  years: number;
  /** Which basis the rate was measured on. Absent on the raw `deriveBauGrowth`
   *  primitive, which has no notion of named sources — only `deriveScope1Bau`
   *  / `deriveScope2Bau` set it. */
  basis?: "like-for-like" | "total";
  /** How many sources the rate is measured on (present in both endpoint years). */
  keptCount?: number;
  /** Names of sources that appeared after the first endpoint year — excluded from the rate. */
  joined?: string[];
  /** Names of sources that disappeared before the base year — excluded from the rate. */
  left?: string[];
}

const yearsOf = (byYear: Record<number, unknown>): number[] =>
  Object.keys(byYear).map(Number).filter(Number.isFinite).sort((a, b) => a - b);

/** Scope 1 actuals per year: fuel + refrigerant, on the BASELINE engine only.
 *  Never the lever engine — these are actuals, not a plan, and running the
 *  planner over a historical year would silently produce one. */
export function scope1ActualSeries(
  combustion: CombustionByYear,
  refrigeration: RefrigerationByYear,
): YearPoint[] {
  const years = [...new Set([...yearsOf(combustion), ...yearsOf(refrigeration)])].sort((a, b) => a - b);
  return years.map((year) => {
    // resolveEquipment is deliberately NOT applied: its rows sum to the
    // source's annualVolume by construction and combustionCO2e is linear in
    // that volume, so the total is identical and the dependency is not earned.
    const assets = resolveCombustion(combustion, year).filter((a) => !a.excluded);
    const systems = resolveRefrigeration(refrigeration, year).filter((s) => !s.excluded);
    return { year, totalT: baselineScope1(assets, systems).totalT };
  });
}

/** Scope 2 actuals per year, LOCATION basis — the same basis
 *  `computeScope2` uses for `baseTotalT`, so the derived rate and the
 *  trajectory it feeds are measured on one basis. */
export function scope2ActualSeries(facilities: FacilitiesByYear): YearPoint[] {
  return yearsOf(facilities).map((year) => ({
    year,
    totalT: baselineScope2(resolveFacilities(facilities, year).filter((f) => !f.excluded)).totalLocationT,
  }));
}

/** Compound annual growth from the first year with data to the base year.
 *
 *  Endpoints, not a fit: this is the figure a board can follow in one sentence,
 *  and every point is plotted beside it so an odd endpoint is visible rather
 *  than hidden inside a regression.
 *
 *  `null` — not a number — for every state a part-filled inventory can be in:
 *  fewer than two usable years, a non-positive first total, or no data in the
 *  base year itself. A caller that gets null falls back to 1%/yr. */
export function deriveBauGrowth(points: YearPoint[], baseYear: number): DerivedGrowth | null {
  const usable = points
    .filter((p) => p.year <= baseYear && p.totalT > 0)
    .sort((a, b) => a.year - b.year);
  if (usable.length < 2) return null;

  const first = usable[0];
  const last = usable[usable.length - 1];
  if (last.year !== baseYear) return null;

  const years = last.year - first.year;
  if (years <= 0) return null;

  const pct = (Math.pow(last.totalT / first.totalT, 1 / years) - 1) * 100;
  if (!Number.isFinite(pct)) return null;

  return { pct, fromYear: first.year, toYear: last.year, years };
}

/* ---------- boundary-aware (like-for-like) derivation ---------- */

/** Which ids are present at both endpoints, and the NAMES of what is not —
 *  a source that joined after `from` (present in `to`, absent in `from`) or
 *  left before `to` (present in `from`, absent in `to`). Removals are treated
 *  exactly like additions: both are just "not in the intersection". */
function boundary<T extends { id: string; name: string }>(
  from: T[],
  to: T[],
): { kept: Set<string>; joined: string[]; left: string[] } {
  const fromIds = new Set(from.map((x) => x.id));
  const toIds = new Set(to.map((x) => x.id));
  return {
    kept: new Set([...fromIds].filter((id) => toIds.has(id))),
    joined: to.filter((x) => !fromIds.has(x.id)).map((x) => x.name),
    left: from.filter((x) => !toIds.has(x.id)).map((x) => x.name),
  };
}

/** Scope 1's rate, measured like-for-like: `deriveBauGrowth` picks the
 *  endpoints (never reimplemented here), and this recomputes the two totals
 *  restricted to the source ids present at BOTH of them — so a source that
 *  joined or left mid-span cannot read as growth. Combustion assets and
 *  refrigeration systems are two separate id spaces; each is intersected
 *  against itself and the two reports are combined. Falls back to the
 *  total-basis result (never to the 1% floor) when the restricted basis
 *  cannot carry a rate. */
export function deriveScope1Bau(
  combustion: CombustionByYear,
  refrigeration: RefrigerationByYear,
  baseYear: number,
): DerivedGrowth | null {
  const total = deriveBauGrowth(scope1ActualSeries(combustion, refrigeration), baseYear);
  if (!total) return null;
  const { fromYear, toYear, years } = total;

  const fromAssets = resolveCombustion(combustion, fromYear).filter((a) => !a.excluded);
  const toAssets = resolveCombustion(combustion, toYear).filter((a) => !a.excluded);
  const fromSystems = resolveRefrigeration(refrigeration, fromYear).filter((s) => !s.excluded);
  const toSystems = resolveRefrigeration(refrigeration, toYear).filter((s) => !s.excluded);

  const assetB = boundary(fromAssets, toAssets);
  const systemB = boundary(fromSystems, toSystems);
  const keptCount = assetB.kept.size + systemB.kept.size;
  const joined = [...assetB.joined, ...systemB.joined];
  const left = [...assetB.left, ...systemB.left];

  const keepAssets = (rows: CombustionAsset[]) => rows.filter((r) => assetB.kept.has(r.id));
  const keepSystems = (rows: RefrigerationSystem[]) => rows.filter((r) => systemB.kept.has(r.id));
  const fromT = baselineScope1(keepAssets(fromAssets), keepSystems(fromSystems)).totalT;
  const toT = baselineScope1(keepAssets(toAssets), keepSystems(toSystems)).totalT;

  if (keptCount === 0 || !(fromT > 0)) return { ...total, basis: "total", keptCount, joined, left };
  const pct = (Math.pow(toT / fromT, 1 / years) - 1) * 100;
  if (!Number.isFinite(pct)) return { ...total, basis: "total", keptCount, joined, left };

  return { pct, fromYear, toYear, years, basis: "like-for-like", keptCount, joined, left };
}

/** Scope 2's rate, measured like-for-like — same contract as `deriveScope1Bau`,
 *  over the single facility id space. */
export function deriveScope2Bau(
  facilities: FacilitiesByYear,
  baseYear: number,
): DerivedGrowth | null {
  const total = deriveBauGrowth(scope2ActualSeries(facilities), baseYear);
  if (!total) return null;
  const { fromYear, toYear, years } = total;

  const fromF = resolveFacilities(facilities, fromYear).filter((f) => !f.excluded);
  const toF = resolveFacilities(facilities, toYear).filter((f) => !f.excluded);
  const b = boundary(fromF, toF);

  const keep = (rows: Facility[]) => rows.filter((f) => b.kept.has(f.id));
  const fromT = baselineScope2(keep(fromF)).totalLocationT;
  const toT = baselineScope2(keep(toF)).totalLocationT;

  if (b.kept.size === 0 || !(fromT > 0)) {
    return { ...total, basis: "total", keptCount: b.kept.size, joined: b.joined, left: b.left };
  }
  const pct = (Math.pow(toT / fromT, 1 / years) - 1) * 100;
  if (!Number.isFinite(pct)) {
    return { ...total, basis: "total", keptCount: b.kept.size, joined: b.joined, left: b.left };
  }

  return {
    pct, fromYear, toYear, years,
    basis: "like-for-like", keptCount: b.kept.size, joined: b.joined, left: b.left,
  };
}

/* ---------- bounds ---------- */

/** Widest growth premise the arithmetic stays meaningful over, in percent/yr.
 *
 *  Every rate enters the engines as `(1 + pct/100)^years`, so -100 collapses the
 *  base to zero and anything below it alternates SIGN with the exponent. Above
 *  +100 the premise is a company that doubles every year, which compounds past
 *  any readable figure long before the trajectory's end year — a typed
 *  `1000000` made every downstream number meaningless instantly.
 *
 *  Following the precedent in `lib/finance/assumptions.ts`: `min`/`max` on a
 *  number input block the SPINNER, not typing, so the bound has to live where
 *  the value is READ. The input carries the attributes too, for the spinner and
 *  for the browser's own validity hint. */
export const BAU_GROWTH_MIN_PCT = -99.99;
export const BAU_GROWTH_MAX_PCT = 100;

/** Clamp to the bounds, and drop a non-finite value entirely so the `??` chain
 *  below falls through to the next premise rather than propagating NaN into
 *  every trajectory. `null`/`undefined` in, `undefined` out — an ABSENT premise
 *  and an unusable one are the same thing to the caller. */
const sane = (v: number | undefined): number | undefined =>
  v == null || !Number.isFinite(v)
    ? undefined
    : Math.min(BAU_GROWTH_MAX_PCT, Math.max(BAU_GROWTH_MIN_PCT, v));

/** The ONE resolution order, shared by both engines so they cannot drift.
 *  `??` not `||`: an explicit 0 is a flat BAU, which is a real premise. */
export function resolveBauGrowthPct(
  override: number | undefined,
  fallback: number | undefined,
): number {
  return sane(override) ?? sane(fallback) ?? 1;
}

/* ---------- what to SAY about the premise ---------- */

/** The premise as the screen must state it.
 *
 *  The rail and the Compare-mixes premise strip both used to print Scope 1's
 *  chain — `override ?? s1.derivedBau?.pct ?? 1` — beside a COMBINED
 *  business-as-usual figure that is the sum of a Scope 1 curve and a Scope 2
 *  curve growing at two different derived rates. The arithmetic closed in
 *  neither direction. One rate is honest only when an explicit override is set,
 *  because that override is what drives both engines.
 *
 *  Built on `resolveBauGrowthPct`, so the rates a screen states are the rates
 *  the engines will use, by construction rather than by matching chains. */
export interface BauPremise {
  /** True when one typed rate drives BOTH engines — the only case in which a
   *  single number honestly annotates a combined figure. */
  overridden: boolean;
  /** Percent/yr each engine will actually apply. */
  s1Pct: number;
  s2Pct: number;
  /** True when both scopes are on the same rate to the precision the screens
   *  print (1 dp), so naming it once says everything. */
  single: boolean;
}

export function describeBauPremise(
  override: number | undefined,
  s1: DerivedGrowth | null,
  s2: DerivedGrowth | null,
): BauPremise {
  const s1Pct = resolveBauGrowthPct(override, s1?.pct);
  const s2Pct = resolveBauGrowthPct(override, s2?.pct);
  return {
    overridden: sane(override) != null,
    s1Pct,
    s2Pct,
    // 0.05, not 0: both are printed to one decimal, and two rates that render
    // as the same string must not be introduced to the reader as two premises.
    single: Math.abs(s1Pct - s2Pct) < 0.05,
  };
}
