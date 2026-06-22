/* ============================================================
   Finance helpers — cost-per-tonne weighting, capex annualization
   and time-to-target. Kept tiny and pure; the compute aggregator
   feeds them. Spec §5.
   ============================================================ */

import type { TrajectoryRow } from "./types";

/** Σ annual cost ÷ Σ tonnes abated. Returns 0 when no tonnes abated. */
export function weightedCostPerTonne(items: { annualCost: number; tonnes: number }[]): number {
  const cost = items.reduce((s, x) => s + x.annualCost, 0);
  const tonnes = items.reduce((s, x) => s + x.tonnes, 0);
  return tonnes > 0 ? cost / tonnes : 0;
}

/** Spread a one-off CAPEX over `years` (0 → not annualized). */
export function annualizedCapex(capex: number, years: number): number {
  return years > 0 ? capex / years : capex;
}

/** First year the net line meets or beats the target, else null. */
export function yearsToTarget(rows: TrajectoryRow[]): number | null {
  for (const r of rows) {
    if (r.net <= r.target + 1e-6) return r.year;
  }
  return null;
}

/** Years to recover a CAPEX from a positive annual saving; null when it never pays back. */
export function simplePayback(capex: number, annualSaving: number): number | null {
  if (annualSaving <= 0) return null; // costs money regardless of capex
  if (capex <= 0) return 0; // saving with no investment → instant payback
  return capex / annualSaving;
}
