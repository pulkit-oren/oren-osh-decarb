import { describe, it, expect } from "vitest";
import { weightedCostPerTonne, yearsToTarget, annualizedCapex, simplePayback } from "../finance";
import type { TrajectoryRow } from "../types";

const row = (year: number, net: number, target: number): TrajectoryRow => ({
  year, net, target, bau: 1000, scope2Spill: 0, wedges: {}, onTrack: net <= target + 1e-6,
});

describe("finance", () => {
  it("weighted cost per tonne = total cost ÷ total tonnes", () => {
    expect(
      weightedCostPerTonne([
        { annualCost: 1000, tonnes: 100 },
        { annualCost: 500, tonnes: 50 },
      ]),
    ).toBeCloseTo(10, 5);
  });

  it("empty or zero-tonne input → 0", () => {
    expect(weightedCostPerTonne([])).toBe(0);
    expect(weightedCostPerTonne([{ annualCost: 100, tonnes: 0 }])).toBe(0);
  });

  it("annualizedCapex spreads cost over the lifetime", () => {
    expect(annualizedCapex(1000, 10)).toBeCloseTo(100, 5);
    expect(annualizedCapex(1000, 0)).toBe(1000);
  });

  it("yearsToTarget = first on-track year, else null", () => {
    expect(yearsToTarget([row(2025, 100, 100), row(2026, 90, 80)])).toBe(2025);
    expect(yearsToTarget([row(2026, 90, 80)])).toBeNull();
  });

  it("simplePayback = capex ÷ annual saving", () => {
    expect(simplePayback(1000, 250)).toBeCloseTo(4, 5);
  });

  it("simplePayback is null when there is no saving", () => {
    expect(simplePayback(1000, 0)).toBeNull();
    expect(simplePayback(1000, -50)).toBeNull();
  });

  it("simplePayback is 0 when there is nothing to pay back", () => {
    expect(simplePayback(0, 100)).toBe(0);
    expect(simplePayback(-500, 100)).toBe(0); // grant / subsidy also has no payback
  });

  it("simplePayback is null for zero capex when running costs increase", () => {
    expect(simplePayback(0, -100)).toBeNull();
  });
});
