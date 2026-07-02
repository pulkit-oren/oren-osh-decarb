/* Combined S1+S2 pathway — sums by year, attributes electrification spill to
   the Scope 2 band, and judges on-track against the summed target. */

import { describe, expect, it } from "vitest";
import { combineTrajectories } from "../combined";
import type { TrajectoryRow } from "../types";

const row = (year: number, over: Partial<TrajectoryRow>): TrajectoryRow => ({
  year, bau: 0, target: 0, net: 0, scope2Spill: 0, wedges: {}, onTrack: true,
  ...over,
});

describe("combineTrajectories", () => {
  const s1 = [
    row(2025, { bau: 100, net: 100, target: 100 }),
    row(2030, { bau: 105, net: 60, target: 50, scope2Spill: 8 }),
  ];
  const s2 = [
    row(2025, { bau: 50, net: 50, target: 50 }),
    row(2030, { bau: 52, net: 20, target: 25 }),
  ];

  it("sums BAU / target and stacks nets with the spill on Scope 2", () => {
    const rows = combineTrajectories(s1, s2);
    expect(rows).toHaveLength(2);
    const r30 = rows[1];
    expect(r30.bau).toBe(157);
    expect(r30.target).toBe(75);
    expect(r30.s1Net).toBe(60);
    expect(r30.s2Net).toBe(28); // 20 + 8 spill
    expect(r30.net).toBe(88);
    expect(r30.onTrack).toBe(false); // 88 > 75
  });

  it("marks on-track when the combined net sits on the summed target", () => {
    const rows = combineTrajectories(
      [row(2030, { bau: 100, net: 40, target: 50 })],
      [row(2030, { bau: 50, net: 10, target: 25 })],
    );
    expect(rows[0].onTrack).toBe(true); // 50 ≤ 75
  });

  it("only combines years both trajectories cover", () => {
    const rows = combineTrajectories(s1, [row(2030, { bau: 52, net: 20, target: 25 })]);
    expect(rows.map((r) => r.year)).toEqual([2030]);
  });
});
