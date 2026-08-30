/* The Scope 1 / Scope 2 coupling neither engine can see alone: storage planned
   on one side, generators it could displace left unmodelled on the other. */

import { describe, it, expect } from "vitest";
import { dgDisplacementOpportunities } from "../cross-scope";
import type { CombustionAsset, LeverSettings } from "@/lib/model/types";
import type { Facility, Scope2Levers } from "@/lib/scope2/model/types";
import { DEFAULT_SETTINGS } from "@/lib/defaults";

const dg = (bu: string, id = "dg"): CombustionAsset => ({
  id, name: "DG sets", category: "stationary", fuelType: "diesel", unit: "L",
  annualVolume: 268_000, opex: 29_500_000, bu,
  equipment: [{ id, name: "DG", unitCount: 6, remainingLife: 9, endUse: "generator" }],
});

const facility = (bu: string): Facility => ({
  id: "f1", name: "Purchased electricity", annualLoadKwh: 78_000_000, tariffPerKwh: 8.4,
  loadSplit: { lightingPct: 18, motorPct: 14, hvacPct: 55 },
  roofSpaceM2: 34_000, peakLoadKw: 14_500, gridEf: 0.71, irradiance: 1500, isolated: false, bu,
});

const levers = (batteryKwh: number): Scope2Levers => ({
  byFacility: {
    f1: {
      efficiency: { enabled: false, ledPct: 0, motorPct: 0, bmsPct: 0, ledCapex: 0, motorCapex: 0, bmsCapex: 0, startYear: 2026, targetYear: 2030 },
      generation: { enabled: true, solarKwp: 3400, batteryKwh, exportMode: "netMetering", solarCapexPerKw: 44_000, batteryCapexPerKwh: 25_000, subsidyPct: 0, startYear: 2026, targetYear: 2030 },
    },
  },
  procurement: {
    enabled: false, ppaPct: 0, greenTariffPct: 0, recPct: 0, ppaStrikeDeltaPerKwh: 0,
    greenTariffPremiumPerKwh: 0, recPricePerKwh: 0.45, re100Exclusion: false,
    startYear: 2026, targetYear: 2030,
  },
});

const s1 = (electrifyOn: boolean): LeverSettings => ({
  byAsset: {
    dg: {
      electrify: { enabled: electrifyOn, unitsToConvert: 0, capacityPct: 60, cop: 1, tariffPerKwh: 8.4, assetCapex: 0, startYear: 2027, targetYear: 2031 },
      fuelSwitch: { enabled: false, altFuel: "biodiesel", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 82, retrofitCapex: 0, startYear: 2026, targetYear: 2029 },
    },
  },
  bySystem: {},
  assumptions: DEFAULT_SETTINGS.assumptions,
});

describe("dgDisplacementOpportunities", () => {
  it("spots storage planned beside an unmodelled generator in the same BU", () => {
    const out = dgDisplacementOpportunities([dg("Bengaluru Campus")], s1(false), [facility("Bengaluru Campus")], levers(8000));
    expect(out).toHaveLength(1);
    expect(out[0].bu).toBe("Bengaluru Campus");
    expect(out[0].tonnesAtStake).toBeGreaterThan(600);
    expect(out[0].message).toContain("8,000 kWh of storage");
    // Names the existing mechanism rather than inventing a second one.
    expect(out[0].message).toContain("COP of 1");
  });

  it("stays quiet once the generator IS modelled as displaced", () => {
    expect(dgDisplacementOpportunities([dg("Bengaluru Campus")], s1(true), [facility("Bengaluru Campus")], levers(8000))).toEqual([]);
  });

  it("stays quiet when no storage is planned", () => {
    expect(dgDisplacementOpportunities([dg("Bengaluru Campus")], s1(false), [facility("Bengaluru Campus")], levers(0))).toEqual([]);
  });

  it("does not pair a battery with a generator in a different business unit", () => {
    // Storage in Pune cannot carry an outage in Bengaluru.
    expect(dgDisplacementOpportunities([dg("Bengaluru Campus")], s1(false), [facility("Pune SEZ Campus")], levers(8000))).toEqual([]);
  });

  it("ignores non-generator combustion — a boiler is not outage backup", () => {
    const boiler: CombustionAsset = {
      id: "b", name: "Boiler", category: "stationary", fuelType: "png", unit: "m3",
      annualVolume: 500_000, opex: 25_000_000, bu: "Bengaluru Campus",
      equipment: [{ id: "b", name: "B", unitCount: 1, remainingLife: 10, endUse: "boiler" }],
    };
    expect(dgDisplacementOpportunities([boiler], s1(false), [facility("Bengaluru Campus")], levers(8000))).toEqual([]);
  });

  it("ranks business units by the tonnes actually at stake", () => {
    const small = dg("Pune SEZ Campus", "dg2");
    small.annualVolume = 40_000;
    const facilities = [facility("Bengaluru Campus"), { ...facility("Pune SEZ Campus"), id: "f2" }];
    const lv = levers(8000);
    lv.byFacility.f2 = lv.byFacility.f1;
    const s1both: LeverSettings = { ...s1(false), byAsset: { ...s1(false).byAsset, dg2: s1(false).byAsset.dg } };
    const out = dgDisplacementOpportunities([dg("Bengaluru Campus"), small], s1both, facilities, lv);
    expect(out).toHaveLength(2);
    expect(out[0].tonnesAtStake).toBeGreaterThan(out[1].tonnesAtStake);
  });
});
