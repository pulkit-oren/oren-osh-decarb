import { describe, it, expect } from "vitest";
import { migrateRefrigeration, migrateSettings } from "../store-helpers";
import type { RefrigerationSystem } from "../model/types";

const systems: RefrigerationSystem[] = [
  { id: "cold", name: "Cold storage plant", systemType: "industrialColdStorage", refrigerant: "R404A", toppedUpKg: 120, gasCostPerKg: 1200 },
  { id: "hvac", name: "Office HVAC", systemType: "commercialHVAC", refrigerant: "R410A", toppedUpKg: 42, gasCostPerKg: 950 },
];

const legacy = {
  byAsset: {},
  assumptions: { gridEf: 0.71, renewableSourcingPct: 50, recCostPerTonne: 800, carbonPricePerTonne: 2000, infraCapex: 0 },
  refrigerant: { enabled: true, transitionPct: 60, altRefrigerant: "R290", leakImprovementPct: 50, retrofitCapex: 12_000_000, startYear: 2026, rampYears: 4 },
};

describe("migrateSettings", () => {
  it("fans a legacy global config out per system", () => {
    const m = migrateSettings(legacy, systems);
    expect(Object.keys(m.bySystem).sort()).toEqual(["cold", "hvac"]);
    const cold = m.bySystem.cold;
    expect(cold.gasSwitch.enabled).toBe(true);
    expect(cold.gasSwitch.transitionPct).toBe(60);
    expect(cold.gasSwitch.altRefrigerant).toBe("R290");
    expect(cold.leakFix.leakImprovementPct).toBe(50);
    // startYear 2026 + rampYears 4 → target 2029
    expect(cold.gasSwitch.targetYear).toBe(2029);
    expect(cold.leakFix.targetYear).toBe(2029);
  });

  it("splits legacy capex pro-rata by topped-up mass, remainder on the last system", () => {
    const m = migrateSettings(legacy, systems);
    const coldShare = m.bySystem.cold.gasSwitch.retrofitCapex;
    const hvacShare = m.bySystem.hvac.gasSwitch.retrofitCapex;
    expect(coldShare).toBe(Math.round((12_000_000 * 120) / 162));
    expect(coldShare + hvacShare).toBe(12_000_000);
  });

  it("passes a new-shape object through, filling missing systems with defaults", () => {
    const fresh = migrateSettings(legacy, systems); // new shape
    const extra: RefrigerationSystem = { id: "r-9", name: "New chiller", systemType: "retailRefrigeration", refrigerant: "R134a", toppedUpKg: 5, gasCostPerKg: 700 };
    const m = migrateSettings(fresh, [...systems, extra]);
    expect(m.bySystem.cold.gasSwitch.retrofitCapex).toBe(fresh.bySystem.cold.gasSwitch.retrofitCapex); // untouched
    expect(m.bySystem["r-9"].gasSwitch.enabled).toBe(false); // defaulted
    expect(m.bySystem["r-9"].gasSwitch.altRefrigerant).toBe("R290"); // retail recommendation
  });

  it("a disabled legacy lever migrates to disabled actions", () => {
    const m = migrateSettings({ ...legacy, refrigerant: { ...legacy.refrigerant, enabled: false } }, systems);
    expect(m.bySystem.cold.gasSwitch.enabled).toBe(false);
    expect(m.bySystem.cold.leakFix.enabled).toBe(false);
  });

  it("survives persisted settings missing assumptions", () => {
    const m = migrateSettings({ byAsset: {}, refrigerant: legacy.refrigerant }, systems);
    expect(m.assumptions.gridEf).toBeGreaterThan(0);
  });
});

describe("migrateRefrigeration (mass-balance upgrade)", () => {
  it("converts old charge × leak-rate systems to a topped-up mass", () => {
    const old = { 2025: [{ id: "c", name: "Cold", systemType: "industrialColdStorage", refrigerant: "R404A", chargeKg: 800, leakRatePct: 15, gasCostPerKg: 1200 }] };
    const m = migrateRefrigeration(old);
    expect(m[2025][0].toppedUpKg).toBe(120); // 800 × 15%
    expect(m[2025][0]).not.toHaveProperty("chargeKg");
  });

  it("leaves already-migrated systems untouched", () => {
    const current = { 2025: [{ id: "c", name: "Cold", systemType: "industrialColdStorage", refrigerant: "R404A", toppedUpKg: 90, gasCostPerKg: 1200 }] };
    expect(migrateRefrigeration(current)[2025][0].toppedUpKg).toBe(90);
  });

  it("handles empty / missing input", () => {
    expect(migrateRefrigeration(undefined)).toEqual({});
  });
});
