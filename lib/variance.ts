/* ============================================================
   Plan against outcome.

   Each company holds several financial years of inventory, and the
   plan projects a trajectory forward from a base year. Nothing joined
   them. When a year closed there was no answer to the only question a
   sustainability team is asked in January: the plan said this much —
   what did we actually get?

   That absence is the difference between a tool opened once at budget
   time and a system opened every month, and the data structure to
   support it has been there all along.

   Three states, and keeping them apart is most of the value:

     - HISTORY. A year before the base year. No plan existed for it,
       so reporting a variance would be inventing one.
     - ANCHOR. The base year itself. Plan and actual are the same
       measurement by construction; a non-zero variance here is a bug
       in the model, not news about the company, and is flagged as
       such rather than shown as performance.
     - TRACKED. A year after the base year with entered data. This is
       the only row where a variance means anything.

   A year after the base with NO data is not "zero emissions". It is
   omitted, because a missing measurement and a measurement of zero
   are opposite claims.
   ============================================================ */

import { FY_YEARS } from "./model/types";

export type VarianceStatus = "history" | "anchor" | "ahead" | "behind" | "on-track";

export interface VarianceRow {
  year: number;
  status: VarianceStatus;
  /** What the plan projected for this year, tCO2e. Undefined for history. */
  plannedT?: number;
  /** What the inventory actually reported, tCO2e. */
  actualT: number;
  /** actual − planned. Negative is good: below the line. */
  varianceT?: number;
  variancePct?: number;
}

export interface VarianceInput {
  baseYear: number;
  /** The plan's net line, year by year. Deliberately the narrowest shape that
   *  answers the question — a full TrajectoryRow would exclude the combined
   *  Scope 1 + 2 row, which carries no wedges, for no benefit. */
  trajectory: { year: number; net: number }[];
  /** Measured total for each FY that has data, tCO2e. Years absent from this
   *  map are omitted from the result rather than treated as zero. */
  actualByYear: Record<number, number>;
}

/** Within this band, a year is on track rather than ahead or behind — a
 *  quarter of a percent of movement is measurement noise, not performance. */
export const ON_TRACK_BAND_PCT = 2;

export function planVsActual(inp: VarianceInput): VarianceRow[] {
  const planned = new Map(inp.trajectory.map((r) => [r.year, r.net]));

  const rows: VarianceRow[] = [];
  for (const year of FY_YEARS) {
    const actualT = inp.actualByYear[year];
    if (actualT === undefined) continue; // no measurement is not a measurement of zero

    if (year < inp.baseYear) {
      rows.push({ year, status: "history", actualT });
      continue;
    }
    if (year === inp.baseYear) {
      rows.push({ year, status: "anchor", plannedT: planned.get(year), actualT, varianceT: 0, variancePct: 0 });
      continue;
    }

    const plannedT = planned.get(year);
    if (plannedT === undefined) continue; // the plan does not reach this year

    const varianceT = actualT - plannedT;
    const variancePct = plannedT > 0 ? (varianceT / plannedT) * 100 : 0;
    const status: VarianceStatus =
      Math.abs(variancePct) <= ON_TRACK_BAND_PCT ? "on-track" : varianceT < 0 ? "ahead" : "behind";
    rows.push({ year, status, plannedT, actualT, varianceT, variancePct });
  }
  return rows;
}

/** True when the base-year anchor disagrees with the plan's own base — which
 *  can only mean the trajectory was built from different data than the
 *  inventory being compared against it. A model problem, not a company one. */
export function anchorDisagrees(rows: VarianceRow[], tolerancePct = 0.5): boolean {
  const anchor = rows.find((r) => r.status === "anchor");
  if (!anchor || anchor.plannedT === undefined || anchor.plannedT <= 0) return false;
  return Math.abs((anchor.actualT - anchor.plannedT) / anchor.plannedT) * 100 > tolerancePct;
}

/** The most recent tracked year, or null when nothing is trackable yet — the
 *  normal state until the first full year after the base closes. */
export function latestTracked(rows: VarianceRow[]): VarianceRow | null {
  const tracked = rows.filter((r) => r.status !== "history" && r.status !== "anchor");
  return tracked.length > 0 ? tracked[tracked.length - 1] : null;
}
