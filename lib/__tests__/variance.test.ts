/* Plan against outcome. Two years of inventory and a forward trajectory sat
   in the same store with nothing joining them, so a closed year produced no
   answer to "the plan said this much — what did we get?" */

import { describe, it, expect } from "vitest";
import { anchorDisagrees, latestTracked, planVsActual, ON_TRACK_BAND_PCT } from "../variance";
import type { TrajectoryRow } from "@/lib/model/types";

const traj = (net: Record<number, number>): TrajectoryRow[] =>
  Object.entries(net).map(([year, n]) => ({
    year: Number(year), bau: n, target: n, net: n, scope2Spill: 0, wedges: {}, onTrack: true,
  }));

const trajectory = traj({ 2025: 10_000, 2026: 9_200, 2027: 8_400, 2028: 7_600 });

describe("planVsActual", () => {
  it("calls a year before the base year history, with no variance invented", () => {
    const rows = planVsActual({ baseYear: 2025, trajectory, actualByYear: { 2024: 10_800, 2025: 10_000 } });
    const y2024 = rows.find((r) => r.year === 2024)!;
    expect(y2024.status).toBe("history");
    expect(y2024.plannedT).toBeUndefined();
    expect(y2024.varianceT).toBeUndefined();
    expect(y2024.actualT).toBe(10_800);
  });

  it("treats the base year as an anchor, not as performance", () => {
    const rows = planVsActual({ baseYear: 2025, trajectory, actualByYear: { 2025: 10_000 } });
    const anchor = rows.find((r) => r.year === 2025)!;
    expect(anchor.status).toBe("anchor");
    expect(anchor.varianceT).toBe(0);
  });

  it("omits a year with no measurement rather than calling it zero", () => {
    // A missing measurement and a measurement of zero are opposite claims.
    const rows = planVsActual({ baseYear: 2025, trajectory, actualByYear: { 2025: 10_000, 2027: 8_000 } });
    expect(rows.map((r) => r.year)).toEqual([2025, 2027]);
  });

  it("reports ahead when the outcome beat the plan", () => {
    const rows = planVsActual({ baseYear: 2025, trajectory, actualByYear: { 2025: 10_000, 2026: 8_500 } });
    const y = rows.find((r) => r.year === 2026)!;
    expect(y.status).toBe("ahead");
    expect(y.varianceT).toBe(-700);
    expect(y.variancePct).toBeCloseTo(-7.6087, 3);
  });

  it("reports behind when it did not", () => {
    const rows = planVsActual({ baseYear: 2025, trajectory, actualByYear: { 2025: 10_000, 2026: 9_900 } });
    expect(rows.find((r) => r.year === 2026)!.status).toBe("behind");
  });

  it("calls small movement on-track — noise is not performance", () => {
    const withinBand = 9_200 * (1 + (ON_TRACK_BAND_PCT - 0.5) / 100);
    const rows = planVsActual({ baseYear: 2025, trajectory, actualByYear: { 2025: 10_000, 2026: withinBand } });
    expect(rows.find((r) => r.year === 2026)!.status).toBe("on-track");
  });

  it("ignores a year the plan does not reach", () => {
    const rows = planVsActual({ baseYear: 2025, trajectory, actualByYear: { 2025: 10_000, 2099: 1 } });
    expect(rows.some((r) => r.year === 2099)).toBe(false);
  });
});

describe("anchorDisagrees", () => {
  it("is quiet when the anchor matches", () => {
    const rows = planVsActual({ baseYear: 2025, trajectory, actualByYear: { 2025: 10_000 } });
    expect(anchorDisagrees(rows)).toBe(false);
  });

  it("fires when the trajectory was built from different data than it is compared against", () => {
    // Not news about the company — a bug in the model. Worth separating,
    // because presenting it as performance would be actively misleading.
    const rows = planVsActual({ baseYear: 2025, trajectory, actualByYear: { 2025: 12_000 } });
    expect(anchorDisagrees(rows)).toBe(true);
  });
});

describe("latestTracked", () => {
  it("is null before the first year after the base closes — the normal state", () => {
    const rows = planVsActual({ baseYear: 2025, trajectory, actualByYear: { 2024: 10_800, 2025: 10_000 } });
    expect(latestTracked(rows)).toBeNull();
  });

  it("is the most recent genuinely comparable year", () => {
    const rows = planVsActual({
      baseYear: 2025, trajectory,
      actualByYear: { 2025: 10_000, 2026: 9_000, 2027: 8_100 },
    });
    expect(latestTracked(rows)!.year).toBe(2027);
  });
});
