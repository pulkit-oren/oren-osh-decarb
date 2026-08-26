/* ============================================================
   Time-to-target. Kept tiny and pure; the compute aggregator
   feeds it.

   `crf` and `annuity` lived here and are gone. Money is levelised
   over a discounted series in lib/finance, and the per-lever
   `annualCost` those two produced was the last surviving consumer
   of the annuity basis. Two mutation survivors (annualise over a
   flat 10 years, on each scope) were only reachable through it.
   Do not reintroduce a capital-recovery factor here: an annual
   capital charge and a levelised cost are different quantities,
   and the whole finance rework exists because the app reported
   both and called them one thing.
   ============================================================ */

import type { TrajectoryRow } from "./types";

/** First year the net line meets or beats the target, else null. */
export function yearsToTarget(rows: TrajectoryRow[]): number | null {
  for (const r of rows) {
    if (r.net <= r.target + 1e-6) return r.year;
  }
  return null;
}

