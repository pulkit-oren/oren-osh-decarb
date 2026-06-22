import { describe, it, expect } from "vitest";
import { compute } from "../index";
import type { LeverSettings, RefrigerationSystem, SystemActions } from "../types";

/** R-404A (GWP 3,943) system: base fugitive = 100 kg topped up × 3943 / 1000 = 394.3 t/yr. */
const system: RefrigerationSystem = {
  id: "s1", name: "Test cold store", systemType: "industrialColdStorage",
  refrigerant: "R404A", toppedUpKg: 100, gasCostPerKg: 1000,
};

const mkSettings = (actions: SystemActions, carbonPrice = 0): LeverSettings => ({
  assumptions: { gridEf: 0.71, renewableSourcingPct: 50, recCostPerTonne: 0, carbonPricePerTonne: carbonPrice, infraCapex: 0 },
  byAsset: {},
  bySystem: { s1: actions },
});

const off = { enabled: false, transitionPct: 0, altRefrigerant: "R717" as const, retrofitCapex: 0, startYear: 2026, targetYear: 2030 };
const leakOff = { enabled: false, leakImprovementPct: 0, startYear: 2026, targetYear: 2028 };

describe("compute — per-system refrigerant", () => {
  it("leak fix alone abates leak share and saves gas top-ups", () => {
    const r = compute([], [system], mkSettings({
      gasSwitch: off,
      leakFix: { enabled: true, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 },
    }), 2025);
    const lever = r.levers.find((l) => l.id === "refrigerant")!;
    expect(lever.abatementT).toBeCloseTo(197.15, 1); // 394.3 × 50%
    expect(lever.capex).toBe(0);
    // gas saving: 100 kg leaked × 50% × ₹1000 = ₹50,000/yr saving
    expect(lever.annualOpexDelta).toBeCloseTo(-50_000, 0);
    expect(r.segments.find((s) => s.key === "ref-leak")?.abatementT).toBeCloseTo(197.15, 1);
    expect(r.segments.find((s) => s.key === "ref-gas")).toBeUndefined();
  });

  it("gas switch alone to ammonia removes the transitioned share entirely", () => {
    const r = compute([], [system], mkSettings({
      gasSwitch: { enabled: true, transitionPct: 100, altRefrigerant: "R717", retrofitCapex: 5_000_000, startYear: 2027, targetYear: 2031 },
      leakFix: leakOff,
    }), 2025);
    const lever = r.levers.find((l) => l.id === "refrigerant")!;
    expect(lever.abatementT).toBeCloseTo(394.3, 1); // R-717 GWP = 0
    expect(lever.capex).toBe(5_000_000);
    expect(r.segments.find((s) => s.key === "ref-gas")?.abatementT).toBeCloseTo(394.3, 1);
    expect(r.segments.find((s) => s.key === "ref-leak")).toBeUndefined();
  });

  it("both actions: increments are attributed leak-first and sum to the total", () => {
    const r = compute([], [system], mkSettings({
      gasSwitch: { enabled: true, transitionPct: 100, altRefrigerant: "R717", retrofitCapex: 0, startYear: 2027, targetYear: 2031 },
      leakFix: { enabled: true, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 },
    }), 2025);
    const leak = r.segments.find((s) => s.key === "ref-leak")!.abatementT;
    const gas = r.segments.find((s) => s.key === "ref-gas")!.abatementT;
    expect(leak).toBeCloseTo(197.15, 1); // leak fix on the CURRENT gas first
    expect(gas).toBeCloseTo(197.15, 1); // gas switch removes what leak fix left
    const lever = r.levers.find((l) => l.id === "refrigerant")!;
    expect(leak + gas).toBeCloseTo(lever.abatementT, 4);
  });

  it("the refrigerant wedge ramps from min start to max target across actions", () => {
    const r = compute([], [system], mkSettings({
      gasSwitch: { enabled: true, transitionPct: 50, altRefrigerant: "R717", retrofitCapex: 0, startYear: 2027, targetYear: 2031 },
      leakFix: { enabled: true, leakImprovementPct: 30, startYear: 2026, targetYear: 2028 },
    }), 2025);
    const wedge = r.wedges.find((w) => w.id === "refrigerant")!;
    expect(wedge.startYear).toBe(2026);
    expect(wedge.rampYears).toBe(6); // 2026..2031
  });

  it("carbon price flows into the opex parts", () => {
    const r = compute([], [system], mkSettings({
      gasSwitch: off,
      leakFix: { enabled: true, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 },
    }, 2000), 2025);
    const lever = r.levers.find((l) => l.id === "refrigerant")!;
    const carbon = lever.opexParts.find((p) => p.label === "Carbon-price value of abatement")!;
    expect(carbon.amount).toBeCloseTo(-197.15 * 2000, 0);
  });
});
