/* Derived dials — the balance view is computed FROM the per-source levers, so
   applyDials → deriveDials round-trips and per-source edits move the dial. */

import { describe, expect, it } from "vitest";
import { applyDials, deriveDials, type BalanceDials } from "../energy-balance";
import { applyDials2, deriveDials2, type BalanceDials2 } from "@/lib/scope2/model/energy-balance";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { CombustionAsset, LeverSettings, RefrigerationSystem } from "../types";
import type { Facility, Scope2Levers } from "@/lib/scope2/model/types";

const assets: CombustionAsset[] = [
  { id: "a1", name: "Boiler", category: "stationary", fuelType: "diesel", unit: "L", annualVolume: 60_000, opex: 5_000_000, remainingLife: 12, unitCount: 1 },
  { id: "a2", name: "Fleet", category: "mobile", fuelType: "diesel", unit: "L", annualVolume: 100_000, opex: 9_000_000, remainingLife: 8, unitCount: 10 },
];
const systems: RefrigerationSystem[] = [
  { id: "s1", name: "HVAC", systemType: "commercialHVAC", refrigerant: "R404A", toppedUpKg: 25, gasCostPerKg: 400 },
];
const BASE: LeverSettings = { byAsset: {}, bySystem: {}, assumptions: DEFAULT_SETTINGS.assumptions };

const fac = (over: Partial<Facility>): Facility => ({
  id: "f1", name: "Plant", annualLoadKwh: 500_000, tariffPerKwh: 9,
  loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
  roofSpaceM2: 2_000, peakLoadKw: 0, gridEf: 0.71, irradiance: 1400,
  isolated: false, existingSolarKwp: 0, existingRenewablePct: 0,
  ...over,
});
const BASE2: Scope2Levers = {
  byFacility: {},
  procurement: {
    enabled: false, ppaPct: 0, greenTariffPct: 0, recPct: 0,
    ppaStrikeDeltaPerKwh: 0, greenTariffPremiumPerKwh: 0, recPricePerKwh: 0,
    re100Exclusion: false, startYear: 2026, targetYear: 2030,
  },
};

describe("Scope 1 dials round-trip", () => {
  it("deriveDials(applyDials(d)) ≈ d", () => {
    const d: BalanceDials = { electrifyPct: 40, renewablePct: 60, bioBlendPct: 20, refrigPct: 70 };
    const derived = deriveDials(assets, systems, applyDials(assets, systems, BASE, d));
    expect(derived.electrifyPct).toBeCloseTo(40, -1);
    expect(derived.renewablePct).toBe(60);
    expect(derived.bioBlendPct).toBeCloseTo(20, -1);
    expect(derived.refrigPct).toBe(70);
  });

  it("all-zero levers derive to zero dials", () => {
    const derived = deriveDials(assets, systems, BASE);
    expect(derived.electrifyPct).toBe(0);
    expect(derived.bioBlendPct).toBe(0);
    expect(derived.refrigPct).toBe(0);
  });

  it("a per-source edit moves the derived dial", () => {
    const s = applyDials(assets, systems, BASE, { electrifyPct: 40, renewablePct: 0, bioBlendPct: 0, refrigPct: 0 });
    const tweaked: LeverSettings = {
      ...s,
      byAsset: { ...s.byAsset, a2: { ...s.byAsset.a2, electrify: { ...s.byAsset.a2.electrify, unitsToConvert: 10 } } },
    };
    expect(deriveDials(assets, systems, tweaked).electrifyPct).toBeGreaterThan(40);
  });
});

describe("Scope 2 dials round-trip", () => {
  const facilities = [fac({}), fac({ id: "f2", annualLoadKwh: 300_000, roofSpaceM2: 0 })];

  it("deriveDials2(applyDials2(d)) ≈ d", () => {
    const d: BalanceDials2 = { efficiencyPct: 50, solarPct: 30, procurementPct: 25 };
    const derived = deriveDials2(facilities, applyDials2(facilities, BASE2, d));
    expect(derived.efficiencyPct).toBe(50);
    expect(derived.solarPct).toBeCloseTo(30, -1);
    expect(derived.procurementPct).toBe(25);
  });

  it("ignores excluded and zero-EF (instrument) records", () => {
    const withNoise = [...facilities, fac({ id: "x1", excluded: true }), fac({ id: "v1", gridEf: 0, annualLoadKwh: 9_999_999 })];
    const d: BalanceDials2 = { efficiencyPct: 50, solarPct: 0, procurementPct: 0 };
    const derived = deriveDials2(withNoise, applyDials2(facilities, BASE2, d));
    expect(derived.efficiencyPct).toBe(50);
  });
});
