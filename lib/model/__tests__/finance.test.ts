import { describe, it, expect } from "vitest";
import { yearsToTarget } from "../finance";
import type { TrajectoryRow } from "../types";

const row = (year: number, net: number, target: number): TrajectoryRow => ({
  year, net, target, bau: 1000, scope2Spill: 0, wedges: {}, onTrack: net <= target + 1e-6,
});

describe("finance", () => {
  it("yearsToTarget = first on-track year, else null", () => {
    expect(yearsToTarget([row(2025, 100, 100), row(2026, 90, 80)])).toBe(2025);
    expect(yearsToTarget([row(2026, 90, 80)])).toBeNull();
  });

});
