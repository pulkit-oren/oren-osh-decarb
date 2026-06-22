import { describe, it, expect } from "vitest";
import { outlivesAsset, retirementYear } from "../validate";
import type { CombustionAsset } from "../types";

const asset = (remainingLife: number): CombustionAsset => ({
  id: "a", name: "Genset", category: "stationary", fuelType: "diesel",
  unit: "L", annualVolume: 1000, opex: 100, remainingLife, unitCount: 1,
});

describe("lifespan validation", () => {
  it("retirementYear = base year + remaining life", () => {
    expect(retirementYear(asset(6), 2025)).toBe(2031);
  });

  it("action completing at or before retirement is fine", () => {
    expect(outlivesAsset(asset(6), 2025, 2031)).toBe(false);
    expect(outlivesAsset(asset(6), 2025, 2028)).toBe(false);
  });

  it("action completing after retirement is flagged", () => {
    expect(outlivesAsset(asset(6), 2025, 2032)).toBe(true);
  });
});
