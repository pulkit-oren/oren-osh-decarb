import { describe, it, expect } from "vitest";
import { compute } from "../index";
import { DEFAULT_ASSETS, DEFAULT_SETTINGS, DEFAULT_SYSTEMS } from "../../defaults";
import type { CombustionAsset, LeverSettings } from "../types";

/** Single diesel asset, fuel switch to free biodiesel at 50% blend: known saving. */
const asset: CombustionAsset = {
  id: "a1", name: "Test genset", category: "stationary", fuelType: "diesel",
  unit: "L", annualVolume: 10_000, opex: 1_000_000, remainingLife: 10, unitCount: 1,
};
const settings: LeverSettings = {
  assumptions: { gridEf: 0.71, renewableSourcingPct: 100, recCostPerTonne: 0, carbonPricePerTonne: 0, infraCapex: 0 },
  bySystem: {},
  byAsset: {
    a1: {
      electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 0, startYear: 2026, targetYear: 2032 },
      fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 50, efficiencyPenaltyPct: 0, altFuelPricePerUnit: 0, retrofitCapex: 1_000_000, startYear: 2026, targetYear: 2030 },
    },
  },
};

describe("compute — opex parts and payback", () => {
  it("each lever's opexParts sum to its annualOpexDelta (default scenario)", () => {
    const r = compute(DEFAULT_ASSETS, DEFAULT_SYSTEMS, DEFAULT_SETTINGS, 2025);
    for (const l of r.levers) {
      const sum = l.opexParts.reduce((s, p) => s + p.amount, 0);
      expect(sum).toBeCloseTo(l.annualOpexDelta, 4);
    }
  });

  it("fuel switch to a free fuel pays back: 1M capex ÷ 500k/yr saving = 2 yrs", () => {
    // Displaced fossil spend = 10,000 L × 50% × (1,000,000 ÷ 10,000)/L = 500,000/yr.
    const r = compute([asset], [], settings, 2025);
    const fuel = r.levers.find((l) => l.id === "fuelSwitch");
    expect(fuel).toBeDefined();
    expect(fuel!.annualOpexDelta).toBeCloseTo(-500_000, 0);
    expect(fuel!.paybackYears).toBeCloseTo(2, 3);
    expect(r.kpis.paybackYears).toBeCloseTo(2, 3); // only active lever
  });

  it("payback is null when opex increases", () => {
    const expensive: LeverSettings = {
      ...settings,
      byAsset: {
        a1: {
          ...settings.byAsset.a1,
          fuelSwitch: {
            ...settings.byAsset.a1.fuelSwitch,
            altFuelPricePerUnit: 200, // > fossil 100/L → net opex increase
            retrofitCapex: 0,
          },
        },
      },
    };
    const r = compute([asset], [], expensive, 2025);
    const fuel = r.levers.find((l) => l.id === "fuelSwitch");
    expect(fuel).toBeDefined();
    expect(fuel!.annualOpexDelta).toBeGreaterThan(0);
    expect(fuel!.paybackYears).toBeNull();
  });
});
