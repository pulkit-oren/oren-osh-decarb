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

  it("fuel switch to a free fuel: 400k/yr displaced, discounted payback in 2029", () => {
    // BOTH numbers moved in the finance-engine rework, each for a stated reason.
    //
    // 1. Displaced spend 500,000 -> 400,000. The ₹100/L this fixture implies
    //    (1,000,000 ÷ 10,000 L) is a BLENDED rate: `opex` is documented as fuel
    //    plus related maintenance. A blend switch changes what goes in the tank
    //    and leaves the engine's maintenance alone, so only the fuel half is
    //    displaced. At the default 20% maintenance share the fuel-only rate is
    //    ₹80/L, and 10,000 L × 50% blend × ₹80 = 400,000/yr.
    //
    // 2. Payback 2 -> 3, because it is now discounted and read off the same
    //    phased series as the cost, not capex ÷ saving. Capex spreads over the
    //    2026-2030 ramp at 200,000/yr while the saving builds with it and
    //    escalates 5%/yr, so the cumulative position is:
    //      2026  +200,000 - 400,000×(1/5)×1.05  = +116,000   cum  +116,000
    //      2027  +200,000 - 400,000×(2/5)×1.05² = + 23,600   cum  +139,600
    //      2028  +200,000 - 400,000×(3/5)×1.05³ = - 77,830   cum  + 61,770
    //      2029  +200,000 - 400,000×(4/5)×1.05⁴ = -188,962   cum  -127,192  <- crosses
    //    Paid back during 2029, i.e. 3 years after the series opens in 2026.
    const r = compute([asset], [], settings, 2025);
    const fuel = r.levers.find((l) => l.id === "fuelSwitch");
    expect(fuel).toBeDefined();
    expect(fuel!.annualOpexDelta).toBeCloseTo(-400_000, 0);
    expect(fuel!.paybackYears).toBe(3);
    expect(fuel!.paybackKind).toBe("discounted");
    expect(r.kpis.paybackYears).toBe(3); // only active lever
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
