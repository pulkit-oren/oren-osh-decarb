import { describe, it, expect } from "vitest";
import { applyFuelSwitch, applyElectrification, applyRefrigerant } from "../levers";
import type { CombustionAsset, RefrigerationSystem } from "../types";

const diesel: CombustionAsset = {
  id: "g", name: "G", category: "stationary",
  fuelType: "diesel", annualVolume: 250000, unit: "L",
  opex: 20_000_000, remainingLife: 10, unitCount: 1,
};
const chiller: RefrigerationSystem = {
  id: "c", name: "C", systemType: "industrialColdStorage",
  refrigerant: "R404A", toppedUpKg: 120, gasCostPerKg: 1200, // 800 kg × 15% leak
};
const combustionShare = (a: CombustionAsset) => (a.annualVolume * 2.57082) / 1000;

describe("fuel switch", () => {
  it("zero blend → zero abatement", () => {
    const r = applyFuelSwitch(diesel, { altFuel: "biodiesel", blendPct: 0, efficiencyPenaltyPct: 0 });
    expect(r.abatementT).toBeCloseTo(0, 5);
  });
  it("B20 abates a positive amount, never more than the displaced fossil share", () => {
    const r = applyFuelSwitch(diesel, { altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2 });
    expect(r.abatementT).toBeGreaterThan(0);
    expect(r.abatementT).toBeLessThan(combustionShare(diesel) * 0.2 + 1);
    expect(r.biogenicT).toBeGreaterThan(0);
  });
});

describe("electrification", () => {
  it("shifts tonnes off Scope 1 and adds a Scope 2 load", () => {
    const r = applyElectrification(diesel, { transitionPct: 50, cop: 3, renewableSourcingPct: 0, gridEf: 0.71 });
    expect(r.scope1AbatementT).toBeGreaterThan(0);
    expect(r.scope2AddedT).toBeGreaterThan(0);
  });
  it("100% renewable sourcing → no Scope 2 load", () => {
    const r = applyElectrification(diesel, { transitionPct: 50, cop: 3, renewableSourcingPct: 100, gridEf: 0.71 });
    expect(r.scope2AddedT).toBeCloseTo(0, 5);
  });
});

describe("refrigerant", () => {
  it("full transition to R-290 + leak fix cuts fugitive sharply", () => {
    const base = (120 * 3943) / 1000;
    const r = applyRefrigerant(chiller, { transitionPct: 100, altRefrigerant: "R290", leakImprovementPct: 50 });
    expect(r.newFugitiveT).toBeLessThan(base * 0.01);
    expect(r.abatementT).toBeCloseTo(base - r.newFugitiveT, 3);
  });
});
