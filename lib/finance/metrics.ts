import { buildLeverSeries } from "./series";
import type { FinanceAssumptions } from "./assumptions";
import type { LeverInput, LeverMetrics, SeriesRow } from "./types";

const sum = (rows: SeriesRow[], f: (r: SeriesRow) => number) => rows.reduce((s, r) => s + f(r), 0);

/** Discounted payback in years from the first row, or null. Reads the SAME
 *  series as the levelised cost, so the two can never disagree (F6). */
function discountedPayback(rows: SeriesRow[], capex: number): { years: number | null; kind: LeverMetrics["paybackKind"] } {
  // No capital at risk is not a zero-year payback. Rendering it as "0.0 yr"
  // reads as a computed result and is not one (F9).
  if (capex <= 0) return { years: null, kind: "no-capital" };
  let cumulative = 0;
  for (const r of rows) {
    cumulative += r.net * r.discount;
    if (cumulative <= 0) return { years: r.year - rows[0].year, kind: "discounted" };
  }
  return { years: null, kind: "never" };
}

export function leverMetrics(rows: SeriesRow[], capex: number): LeverMetrics {
  const discCost = sum(rows, (r) => r.net * r.discount);
  const discTonnes = sum(rows, (r) => r.tonnes * r.discount);

  let cumulative = 0;
  let peakFunding = 0;
  for (const r of rows) {
    cumulative += r.net;                                  // undiscounted: this is real cash
    peakFunding = Math.max(peakFunding, cumulative);
  }

  const pb = discountedPayback(rows, capex);
  return {
    levelisedCostPerTonne: discTonnes > 0 ? discCost / discTonnes : Infinity,
    paybackYears: pb.years,
    paybackKind: pb.kind,
    npv: -discCost,
    peakFunding,
    totalCapex: sum(rows, (r) => r.capex),
  };
}

/** Programme roll-up. Σ discounted cost ÷ Σ discounted tonnes across every
 *  lever — NOT the mean of per-lever ₹/t, which would weight a 1-tonne measure
 *  the same as a 1000-tonne one. Valid because every series discounts to the
 *  same base year. Iterates ALL levers, so capex on a zero-abatement lever is
 *  reported rather than silently dropped (F4). */
export function programmeMetrics(series: SeriesRow[][]): LeverMetrics {
  const all = series.flat();
  const capex = all.reduce((s, r) => s + r.capex, 0);

  const byYear = new Map<number, { net: number; discount: number }>();
  for (const r of all) {
    const existing = byYear.get(r.year);
    if (existing === undefined) {
      byYear.set(r.year, { net: r.net, discount: r.discount });
    } else {
      // The merged row can only carry ONE discount factor per year. That is
      // only valid while every lever shares a baseYear and discountRatePct —
      // if it isn't, silently picking one row's factor makes peakFunding and
      // payback order-dependent, which is exactly the bug the two-call design
      // exists to prevent. No current caller can trigger this; keep it that way.
      if (Math.abs(existing.discount - r.discount) > 1e-12) {
        throw new Error(
          `programmeMetrics: rows for year ${r.year} carry different discount factors; every lever must be built with the same baseYear and discountRatePct`
        );
      }
      existing.net += r.net;
    }
  }
  const merged: SeriesRow[] = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, { net, discount }]) => ({ year, capex: 0, opexDelta: 0, net, tonnes: 0, discount }));

  const m = leverMetrics(all, capex);
  const pbSource = leverMetrics(merged, capex);
  return { ...m, totalCapex: capex, paybackYears: pbSource.paybackYears, paybackKind: pbSource.paybackKind, peakFunding: pbSource.peakFunding };
}

/** Assemble one lever's money summary: build the series, then read the metrics
 *  off it. Shared by both scopes — they differ only in their lifetime table and
 *  their `scope` literal, so the assembly itself has exactly ONE
 *  implementation. Two hand-synchronised copies of this is the drift the whole
 *  finance module exists to end. */
export function summariseLever(
  input: LeverInput,
  baseYear: number,
  a: FinanceAssumptions,
): { series: SeriesRow[]; metrics: LeverMetrics } {
  const series = buildLeverSeries(input, baseYear, a);
  return { series, metrics: leverMetrics(series, input.capex) };
}
