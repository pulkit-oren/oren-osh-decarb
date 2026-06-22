import { describe, expect, it } from "vitest";
import { applyEfficiency } from "../efficiency";
import type { EfficiencyAction, Facility } from "../types";

const facility: Facility = {
  id: "f1", name: "Test plant", annualLoadKwh: 1_000_000, tariffPerKwh: 10,
  loadSplit: { lightingPct: 20, motorPct: 50, hvacPct: 20 }, // other = 10
  roofSpaceM2: 5000, peakLoadKw: 500, gridEf: 0.7, irradiance: 1400, isolated: false,
};

const action = (patch: Partial<EfficiencyAction> = {}): EfficiencyAction => ({
  enabled: true, ledPct: 0, motorPct: 0, bmsPct: 0,
  ledCapex: 1_000_000, motorCapex: 2_000_000, bmsCapex: 1_500_000,
  startYear: 2026, targetYear: 2030, ...patch,
});

describe("applyEfficiency", () => {
  it("disabled action changes nothing", () => {
    const r = applyEfficiency(facility, action({ enabled: false, ledPct: 100 }));
    expect(r.savedKwh).toBe(0);
    expect(r.residualLoadKwh).toBe(1_000_000);
    expect(r.capex).toBe(0);
    expect(r.opexSaving).toBe(0);
  });

  it("LED at 100% cuts 55% of the lighting load", () => {
    const r = applyEfficiency(facility, action({ ledPct: 100 }));
    expect(r.ledKwh).toBeCloseTo(1_000_000 * 0.2 * 0.55, 6); // 110,000
  });

  it("motors at 100% cut 12.5% of the motor load", () => {
    const r = applyEfficiency(facility, action({ motorPct: 100 }));
    expect(r.motorKwh).toBeCloseTo(62_500, 6);
  });

  it("BMS at 100% cuts 17.5% of HVAC + other load", () => {
    const r = applyEfficiency(facility, action({ bmsPct: 100 }));
    expect(r.bmsKwh).toBeCloseTo(1_000_000 * 0.3 * 0.175, 6); // 52,500
  });

  it("levers at 50% halve their savings, compound into residual, scale capex", () => {
    const r = applyEfficiency(facility, action({ ledPct: 50, motorPct: 50, bmsPct: 50 }));
    const expected = (110_000 + 62_500 + 52_500) / 2;
    expect(r.savedKwh).toBeCloseTo(expected, 6);
    expect(r.residualLoadKwh).toBeCloseTo(1_000_000 - expected, 6);
    expect(r.capex).toBeCloseTo((1_000_000 + 2_000_000 + 1_500_000) / 2, 6);
    expect(r.opexSaving).toBeCloseTo(expected * 10, 6);
  });
});
