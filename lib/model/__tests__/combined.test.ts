/* Combined S1+S2 pathway — sums by year, attributes electrification spill to
   the Scope 2 band, and judges on-track against the summed target. */

import { describe, expect, it } from "vitest";
import { combineTrajectories, targetPosition, type CombinedRow } from "../combined";
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

/* ── targetPosition ─────────────────────────────────────────────────────────
   The one place the rail's four numbers are derived. Extracted from BalanceTab
   so the arithmetic is testable without mounting a component, and so the mix
   suggester's stop rule can read the SAME committed level the rail displays.

   These tests pin the level basis: "cut 50%" means emissions END UP at half the
   base year, which is what Goals (targetValueAt) and the trajectory target line
   already mean. Balance-to-target used to mean "tonnes AVOIDED equal half the
   base year" — a different quantity whenever BAU has moved off the base year. */

describe("targetPosition", () => {
  /* Two rows is all the function reads: the base year and the target year. */
  const at = (base: number, bauAtYear: number, netAtYear: number): CombinedRow[] => [
    { year: 2025, bau: base, target: base, s1Net: base, s2Net: 0, net: base, onTrack: true },
    { year: 2030, bau: bauAtYear, target: base * 0.5, s1Net: netAtYear, s2Net: 0, net: netAtYear, onTrack: false },
  ];

  it("requires the distance from BAU down to the committed level", () => {
    // Committed level is half of 1,000 = 500. BAU arrives at 1,050.
    // So 550 t must come out of the BAU path, not 500.
    const p = targetPosition(at(1_000, 1_050, 1_050), 2030, 50);
    expect(p.committedLevel).toBeCloseTo(500, 9);
    expect(p.requiredT).toBeCloseTo(550, 9);
  });

  it("closes the gap exactly when net lands on the committed level", () => {
    const onIt = targetPosition(at(1_000, 1_050, 500), 2030, 50);
    expect(onIt.gapT).toBeCloseTo(0, 9);
    expect(onIt.met).toBe(true);

    const oneShort = targetPosition(at(1_000, 1_050, 501), 2030, 50);
    expect(oneShort.gapT).toBeCloseTo(1, 9);
    expect(oneShort.met).toBe(false);
  });

  /* The identity that says exactly how much this differs from the old basis.
     Not decoration: it is the whole size of the defect, and it changes sign. */
  it("differs from the avoided-tonnes basis by exactly BAU minus base", () => {
    for (const bauAtYear of [1_050, 1_000, 900]) {
      const p = targetPosition(at(1_000, bauAtYear, 700), 2030, 50);
      const avoidedBasisRequired = 1_000 * 0.5;
      expect(p.requiredT - avoidedBasisRequired).toBeCloseTo(bauAtYear - 1_000, 9);
    }
  });

  it("needs LESS removed when BAU has fallen below the base year", () => {
    // The current default case: the grid factor declines faster than activity
    // grows, so BAU 2030 sits below the base year and the committed level is
    // nearer than the old basis implied.
    const p = targetPosition(at(1_000, 900, 900), 2030, 50);
    expect(p.requiredT).toBeCloseTo(400, 9);
    expect(p.requiredT).toBeLessThan(1_000 * 0.5);
  });

  it("reports allocated tonnes as the distance the plan pulls BAU down", () => {
    const p = targetPosition(at(1_000, 1_050, 620), 2030, 50);
    expect(p.allocatedT).toBeCloseTo(430, 9);
    expect(p.base).toBeCloseTo(1_000, 9);
    expect(p.bauAtYear).toBeCloseTo(1_050, 9);
    expect(p.netAtYear).toBeCloseTo(620, 9);
  });

  it("falls back to the last row when the target year is past the horizon", () => {
    const p = targetPosition(at(1_000, 1_050, 500), 2099, 50);
    expect(p.netAtYear).toBeCloseTo(500, 9);
  });
});
