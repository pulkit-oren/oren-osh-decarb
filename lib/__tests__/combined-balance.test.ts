/* Combined balance engine — one target across both scopes: reduction
   measurement, derived current dials, and the cheapest-first suggester. */

import { describe, expect, it } from "vitest";
import { combinedReduction2030, currentCombinedDials, suggestCombinedMix, type CombinedInputs } from "../combined-balance";
import { applyDials } from "@/lib/model/energy-balance";
import { applyDials2 } from "@/lib/scope2/model/energy-balance";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { CombustionAsset, LeverSettings, RefrigerationSystem } from "@/lib/model/types";
import type { Facility, Scope2Levers } from "@/lib/scope2/model/types";

const assets: CombustionAsset[] = [
  { id: "a1", name: "Boiler", category: "stationary", fuelType: "diesel", unit: "L", annualVolume: 60_000, opex: 5_000_000, remainingLife: 12, unitCount: 1 },
  { id: "a2", name: "Fleet", category: "mobile", fuelType: "diesel", unit: "L", annualVolume: 100_000, opex: 9_000_000, remainingLife: 8, unitCount: 10 },
];
const systems: RefrigerationSystem[] = [
  { id: "s1", name: "HVAC", systemType: "commercialHVAC", refrigerant: "R404A", toppedUpKg: 25, gasCostPerKg: 400 },
];
const facilities: Facility[] = [{
  id: "f1", name: "Plant", annualLoadKwh: 900_000, tariffPerKwh: 9,
  loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
  roofSpaceM2: 3_000, peakLoadKw: 0, gridEf: 0.71, irradiance: 1400,
  isolated: false, existingSolarKwp: 0, existingRenewablePct: 0,
}];

const s1Base: LeverSettings = { byAsset: {}, bySystem: {}, assumptions: DEFAULT_SETTINGS.assumptions };
const s2Base: Scope2Levers = {
  byFacility: {},
  procurement: {
    enabled: false, ppaPct: 0, greenTariffPct: 0, recPct: 0,
    ppaStrikeDeltaPerKwh: 0, greenTariffPremiumPerKwh: 0, recPricePerKwh: 0,
    re100Exclusion: false, startYear: 2026, targetYear: 2030,
  },
};

const inp: CombinedInputs = { assets, systems, s1Base, facilities, s2Base, baseYear: 2025 };

describe("combinedReduction2030", () => {
  const ZERO = currentCombinedDials(inp);

  it("is ~0 with everything off and grows when dials rise", () => {
    expect(combinedReduction2030(inp, ZERO)).toBeCloseTo(0, 3);
    const withEff = { ...ZERO, s2: { ...ZERO.s2, efficiencyPct: 100 } };
    expect(combinedReduction2030(inp, withEff)).toBeGreaterThan(0.02);
  });
});

describe("currentCombinedDials", () => {
  it("derives from the live lever state on both scopes", () => {
    const s1 = applyDials(assets, systems, s1Base, { electrifyPct: 40, renewablePct: 50, bioBlendPct: 0, refrigPct: 0 });
    const s2 = applyDials2(facilities, s2Base, { efficiencyPct: 60, solarPct: 0, procurementPct: 0 });
    const d = currentCombinedDials({ ...inp, s1Base: s1, s2Base: s2 });
    expect(d.s1.electrifyPct).toBeCloseTo(40, -1);
    expect(d.s2.efficiencyPct).toBe(60);
  });
});

describe("suggestCombinedMix", () => {
  it("meets a modest target and reports the cost ranking", () => {
    const { dials, achieved, order } = suggestCombinedMix(inp, 0.1);
    expect(achieved).toBeGreaterThanOrEqual(0.1);
    expect(order.length).toBeGreaterThan(0);
    const all = [...Object.values(dials.s1), ...Object.values(dials.s2)];
    for (const v of all) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
  });

  it("returns its best reachable mix for an impossible target without hanging", () => {
    const { achieved } = suggestCombinedMix(inp, 0.99);
    expect(achieved).toBeGreaterThan(0);
    expect(achieved).toBeLessThan(0.99);
  });
});
