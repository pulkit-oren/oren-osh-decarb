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
import type { CombustionByYear, RefrigerationByYear } from "./model/types";
import type { FacilitiesByYear } from "./scope2/model/types";

/** One year's actual emissions, in tonnes CO2e. */
export type YearPoint = { year: number; totalT: number };

export interface DerivedGrowth {
  /** Percent per year — 2.5 means 2.5%/yr. NOT a fraction. */
  pct: number;
  fromYear: number;
  toYear: number;
  /** Compounding years between the endpoints. */
  years: number;
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

/** The ONE resolution order, shared by both engines so they cannot drift.
 *  `??` not `||`: an explicit 0 is a flat BAU, which is a real premise. */
export function resolveBauGrowthPct(
  override: number | undefined,
  fallback: number | undefined,
): number {
  return override ?? fallback ?? 1;
}
