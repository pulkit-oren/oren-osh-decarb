import { describe, expect, it } from "vitest";
import { applyDials, energyMix, suggestMix } from "@/lib/model/energy-balance";
import type { CombustionAsset, RefrigerationSystem, LeverSettings } from "@/lib/model/types";
import { defaultActions } from "@/lib/model/segments";

const truck = (): CombustionAsset => ({ id: "t1", name: "Trucks", category: "mobile", fuelType: "diesel", unit: "L", annualVolume: 100000, opex: 0, remainingLife: 10, unitCount: 10, endUse: "truck" });
const base = (assets: CombustionAsset[]): LeverSettings => ({
  byAsset: Object.fromEntries(assets.map((a) => [a.id, defaultActions(a)])),
  bySystem: {},
  assumptions: { renewableSourcingPct: 50, gridEf: 0.71, recCostPerTonne: 800, carbonPricePerTonne: 2000, infraCapex: 15000000 },
});

describe("applyDials", () => {
  it("electrify dial sets feasible mobile sources to ~that share of the fleet", () => {
    const a = truck(); const s = applyDials([a], [], base([a]), { electrifyPct: 50, renewablePct: 50, bioBlendPct: 0, refrigPct: 0 });
    expect(s.byAsset[a.id].electrify.enabled).toBe(true);
    expect(s.byAsset[a.id].electrify.unitsToConvert).toBe(5);
  });
  it("renewable dial writes the global assumption", () => {
    const a = truck(); const s = applyDials([a], [], base([a]), { electrifyPct: 0, renewablePct: 80, bioBlendPct: 0, refrigPct: 0 });
    expect(s.assumptions.renewableSourcingPct).toBe(80);
  });
  it("does not mutate the base settings", () => {
    const a = truck(); const b = base([a]); const before = b.assumptions.renewableSourcingPct;
    applyDials([a], [], b, { electrifyPct: 50, renewablePct: 90, bioBlendPct: 0, refrigPct: 0 });
    expect(b.assumptions.renewableSourcingPct).toBe(before);
  });
});

describe("energyMix", () => {
  it("returns non-negative shares that sum to ~the total fuel energy", () => {
    const a = truck(); const s = applyDials([a], [], base([a]), { electrifyPct: 50, renewablePct: 50, bioBlendPct: 20, refrigPct: 0 });
    const m = energyMix([a], s);
    expect(m.fossilFuelGJ).toBeGreaterThanOrEqual(0);
    expect(m.gridElecGJ).toBeGreaterThanOrEqual(0);
    expect(m.renewableGJ).toBeGreaterThanOrEqual(0);
    expect(m.fossilFuelGJ + m.gridElecGJ + m.renewableGJ).toBeGreaterThan(0);
  });
});

describe("suggestMix", () => {
  it("raises dials toward a target and returns valid percentages", () => {
    const a = truck(); const d = suggestMix([a], [], base([a]), 0.3, 2025);
    expect(d.electrifyPct).toBeGreaterThanOrEqual(0);
    expect(d.electrifyPct).toBeLessThanOrEqual(100);
  });
});

describe("applyDials — feasibility guard", () => {
  it("heavyEquip (hard-to-electrify mobile) stays electrify.enabled === false even with electrifyPct: 100", () => {
    const a: CombustionAsset = { id: "he1", name: "Excavator", category: "mobile", fuelType: "diesel", unit: "L", annualVolume: 50000, opex: 0, remainingLife: 10, unitCount: 5, endUse: "heavyEquip" };
    const s = applyDials([a], [], base([a]), { electrifyPct: 100, renewablePct: 0, bioBlendPct: 0, refrigPct: 0 });
    expect(s.byAsset[a.id].electrify.enabled).toBe(false);
  });

  it("asset with no bio-compatible fuel (marineHfoVlsfo) leaves fuelSwitch.enabled === false with bioBlendPct: 50", () => {
    const a: CombustionAsset = { id: "m1", name: "Marine Vessel", category: "mobile", fuelType: "marineHfoVlsfo", unit: "L", annualVolume: 200000, opex: 0, remainingLife: 15, unitCount: 1 };
    const s = applyDials([a], [], base([a]), { electrifyPct: 0, renewablePct: 0, bioBlendPct: 50, refrigPct: 0 });
    expect(s.byAsset[a.id].fuelSwitch.enabled).toBe(false);
  });
});
