import { describe, it, expect } from "vitest";
import { yearsToTarget, crf, annuity } from "../finance";
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

describe("capital recovery factor", () => {
  it("CRF at 10% over 10 years ≈ 0.1627, straight-line at 0%", () => {
    expect(crf(10, 10)).toBeCloseTo(0.16275, 4);
    expect(crf(0, 10)).toBeCloseTo(0.1, 9);
  });
  it("shorter-lived assets carry a higher annual capital charge", () => {
    expect(annuity(1_000_000, 8, 10)).toBeGreaterThan(annuity(1_000_000, 20, 10));
  });
});
