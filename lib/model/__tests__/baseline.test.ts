import { describe, it, expect } from "vitest";
import {
  combustionCO2e,
  combustionEnergyKJ,
  refrigerantCO2e,
  baselineScope1,
} from "../baseline";
import type { CombustionAsset, RefrigerationSystem } from "../types";

const genset: CombustionAsset = {
  id: "g", name: "Gensets", category: "stationary",
  fuelType: "diesel", annualVolume: 250000, unit: "L",
  opex: 20_000_000, remainingLife: 10, unitCount: 1,
};

const chiller: RefrigerationSystem = {
  id: "c", name: "Cold store", systemType: "industrialColdStorage",
  refrigerant: "R404A", toppedUpKg: 120, gasCostPerKg: 1200, // 800 kg × 15% leak
};

describe("baseline", () => {
  it("combustion CO2e = volume × factor (tonnes)", () => {
    // 250,000 L × 2.57082 kg/L ÷ 1000 = 642.7 t
    expect(combustionCO2e(genset)).toBeCloseTo((250000 * 2.57082) / 1000, 1);
  });

  it("combustion energy kJ = volume × density × CV", () => {
    expect(combustionEnergyKJ(genset)).toBeCloseTo(250000 * 0.83057 * 42839, -3);
  });

  it("refrigerant CO2e = topped-up kg × gwp (tonnes)", () => {
    // 120 kg topped up × 3922 ÷ 1000 = 470.64 t
    expect(refrigerantCO2e(chiller)).toBeCloseTo((120 * 3922) / 1000, 1);
  });

  it("baseline sums both pools", () => {
    const b = baselineScope1([genset], [chiller]);
    expect(b.totalT).toBeCloseTo(642.7 + 470.6, 0);
    expect(b.combustionT).toBeGreaterThan(0);
    expect(b.refrigerantT).toBeGreaterThan(0);
    expect(b.perCombustion[0].co2eT).toBeCloseTo(642.7, 0);
    expect(b.perRefrigeration[0].co2eT).toBeCloseTo(470.6, 0);
  });

  it("empty baseline is zero", () => {
    const b = baselineScope1([], []);
    expect(b.totalT).toBe(0);
  });
});
