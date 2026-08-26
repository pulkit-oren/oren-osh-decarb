/* ============================================================
   Finance helpers — cost-per-tonne weighting, capex annualization
   and time-to-target. Kept tiny and pure; the compute aggregator
   feeds them. Spec §5.
   ============================================================ */

import type { TrajectoryRow } from "./types";



/** Capital recovery factor: r(1+r)ⁿ / ((1+r)ⁿ − 1). Straight-line when r = 0. */
export function crf(ratePct: number, years: number): number {
  if (years <= 0) return 1;
  const r = ratePct / 100;
  if (r <= 0) return 1 / years;
  const f = Math.pow(1 + r, years);
  return (r * f) / (f - 1);
}

/** Decision-grade annualization: CAPEX × CRF over the lever's own lifetime.
 *  An EV (8-yr life) and a boiler replacement (20-yr) stop looking the same. */
export function annuity(capex: number, years: number, ratePct: number): number {
  return capex * crf(ratePct, years);
}

/** First year the net line meets or beats the target, else null. */
export function yearsToTarget(rows: TrajectoryRow[]): number | null {
  for (const r of rows) {
    if (r.net <= r.target + 1e-6) return r.year;
  }
  return null;
}

