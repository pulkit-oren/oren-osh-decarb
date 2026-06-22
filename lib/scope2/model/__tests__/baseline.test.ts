import { describe, expect, it } from "vitest";
import { baselineScope2 } from "../baseline";
import type { Facility } from "../types";

const facilities: Facility[] = [
  {
    id: "a", name: "Plant", annualLoadKwh: 1_000_000, tariffPerKwh: 8,
    loadSplit: { lightingPct: 15, motorPct: 55, hvacPct: 20 },
    roofSpaceM2: 5000, peakLoadKw: 800, gridEf: 0.7, irradiance: 1500, isolated: false,
  },
  {
    id: "b", name: "Resort", annualLoadKwh: 500_000, tariffPerKwh: 20,
    loadSplit: { lightingPct: 20, motorPct: 15, hvacPct: 45 },
    roofSpaceM2: 2000, peakLoadKw: 400, gridEf: 0.65, irradiance: 1700, isolated: true,
  },
];

describe("baselineScope2", () => {
  it("computes per-facility load, cost, and location-based tonnes", () => {
    const b = baselineScope2(facilities);
    expect(b.perFacility[0].costPerYear).toBe(8_000_000);
    expect(b.perFacility[0].locationT).toBeCloseTo(700, 6); // 1M kWh × 0.7 kg / 1000
    expect(b.perFacility[1].locationT).toBeCloseTo(325, 6);
  });

  it("totals across the portfolio and reports isolated load separately", () => {
    const b = baselineScope2(facilities);
    expect(b.totalLoadKwh).toBe(1_500_000);
    expect(b.totalCost).toBe(18_000_000);
    expect(b.totalLocationT).toBeCloseTo(1025, 6);
    expect(b.isolatedLoadKwh).toBe(500_000);
  });

  it("empty portfolio → zeros", () => {
    const b = baselineScope2([]);
    expect(b.totalLoadKwh).toBe(0);
    expect(b.totalLocationT).toBe(0);
  });
});
