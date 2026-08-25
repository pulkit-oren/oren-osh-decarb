import type { FinanceAssumptions } from "./assumptions";
import { windowFor } from "./lifetimes";
import type { LeverInput, OpexPart, SeriesRow } from "./types";

/** Deployed share by the end of `year`. Identical shape to the ramp the
 *  trajectory uses, so money and tonnes phase together by construction. */
const rampAt = (l: Pick<LeverInput, "startYear" | "rampYears">, year: number): number => {
  if (year < l.startYear) return 0;
  return Math.min(1, (year - l.startYear + 1) / Math.max(1, l.rampYears));
};

const escalationFor = (kind: OpexPart["kind"], a: FinanceAssumptions): number =>
  kind === "fuel" ? a.fuelEscalationPct / 100
  : kind === "elec" ? a.elecEscalationPct / 100
  : a.otherEscalationPct / 100;

/** The single year-by-year series. ₹/t, payback, NPV and peak funding are all
 *  read off this one array, which is what stops them disagreeing (F5, F6).
 *  Sign convention: positive = cash OUT. */
export function buildLeverSeries(l: LeverInput, baseYear: number, a: FinanceAssumptions): SeriesRow[] {
  const { firstYear, lastYear } = windowFor(l.startYear, l.startYear + Math.max(1, l.rampYears) - 1, l.assetLifeYears);
  const r = a.discountRatePct / 100;
  const rows: SeriesRow[] = [];

  for (let year = firstYear; year <= lastYear; year++) {
    const ramp = rampAt(l, year);
    const capex = l.capex * Math.max(0, ramp - rampAt(l, year - 1));

    let opexDelta = 0;
    for (const p of l.opexParts) {
      opexDelta += p.amount * ramp * Math.pow(1 + escalationFor(p.kind, a), year - baseYear);
    }

    rows.push({
      year,
      capex,
      opexDelta,
      net: capex + opexDelta,
      tonnes: l.fullAbatementT * ramp,
      // Always discounted to the model's base year, never to the lever's own
      // start — this is what makes summing across levers with different window
      // lengths valid in programmeMetrics.
      discount: 1 / Math.pow(1 + r, year - baseYear),
    });
  }
  return rows;
}
