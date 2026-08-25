import type { LeverMetrics, SeriesRow } from "./types";

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

  const byYear = new Map<number, number>();
  for (const r of all) byYear.set(r.year, (byYear.get(r.year) ?? 0) + r.net);
  const merged: SeriesRow[] = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, net]) => {
      const anyRow = all.find((r) => r.year === year)!;
      return { year, capex: 0, opexDelta: 0, net, tonnes: 0, discount: anyRow.discount };
    });

  const m = leverMetrics(all, capex);
  const pbSource = leverMetrics(merged, capex);
  return { ...m, totalCapex: capex, paybackYears: pbSource.paybackYears, paybackKind: pbSource.paybackKind, peakFunding: pbSource.peakFunding };
}
