import { describe, expect, it } from "vitest";
import { applyGeneration } from "../generation";
import type { Facility, GenerationAction } from "../types";

const facility: Facility = {
  id: "f1", name: "Test plant", annualLoadKwh: 2_000_000, tariffPerKwh: 10,
  loadSplit: { lightingPct: 20, motorPct: 50, hvacPct: 20 },
  roofSpaceM2: 5500, peakLoadKw: 500, gridEf: 0.7, irradiance: 1500, isolated: false,
};

const action = (patch: Partial<GenerationAction> = {}): GenerationAction => ({
  enabled: true, solarKwp: 0, batteryKwh: 0, exportMode: "netMetering",
  solarCapexPerKw: 45_000, batteryCapexPerKwh: 28_000, subsidyPct: 0,
  startYear: 2026, targetYear: 2030, ...patch,
});

const RESIDUAL = 1_500_000;

describe("applyGeneration", () => {
  it("disabled → grid draw equals residual load", () => {
    const r = applyGeneration(facility, action({ enabled: false, solarKwp: 500 }), RESIDUAL);
    expect(r.gridDrawKwh).toBe(RESIDUAL);
    expect(r.solarGenKwh).toBe(0);
    expect(r.capex).toBe(0);
  });

  it("roof space caps the array at 5.5 m²/kW", () => {
    const r = applyGeneration(facility, action({ solarKwp: 2000 }), RESIDUAL);
    expect(r.effectiveKwp).toBe(1000); // 5500 / 5.5
  });

  it("solar-only array sized to the load self-consumes 50%", () => {
    const r = applyGeneration(facility, action({ solarKwp: 1000 }), RESIDUAL);
    // solarGen = 1000 × 1500 = residual → loadRatio 1 → spill 0.5
    expect(r.selfConsumption).toBeCloseTo(0.5, 6);
    expect(r.usedOnSiteKwh).toBeCloseTo(750_000, 3);
    expect(r.exportedKwh).toBeCloseTo(750_000, 3);
    expect(r.gridDrawKwh).toBeCloseTo(750_000, 3);
  });

  it("battery at half a day's generation captures all spill", () => {
    const halfDay = 0.5 * (1000 * 1500) / 365;
    const r = applyGeneration(facility, action({ solarKwp: 1000, batteryKwh: halfDay }), RESIDUAL);
    expect(r.selfConsumption).toBeCloseTo(1, 6);
    expect(r.usedOnSiteKwh).toBeCloseTo(1_500_000, 3);
    expect(r.gridDrawKwh).toBeCloseTo(0, 3);
  });

  it("zero-export curtails: spill earns nothing", () => {
    const net = applyGeneration(facility, action({ solarKwp: 1000 }), RESIDUAL);
    const zero = applyGeneration(facility, action({ solarKwp: 1000, exportMode: "zeroExport" }), RESIDUAL);
    expect(net.opexSaving).toBeCloseTo((750_000 + 750_000) * 10, 3);
    expect(zero.opexSaving).toBeCloseTo(750_000 * 10, 3);
  });

  it("subsidy reduces capex", () => {
    const r = applyGeneration(facility, action({ solarKwp: 100, subsidyPct: 30 }), RESIDUAL);
    expect(r.capex).toBeCloseTo(100 * 45_000 * 0.7, 3);
  });

  it("zero residual load → everything exports, grid draw 0", () => {
    const r = applyGeneration(facility, action({ solarKwp: 100 }), 0);
    expect(r.usedOnSiteKwh).toBe(0);
    expect(r.gridDrawKwh).toBe(0);
    expect(r.exportedKwh).toBeCloseTo(100 * 1500, 3);
  });
});
