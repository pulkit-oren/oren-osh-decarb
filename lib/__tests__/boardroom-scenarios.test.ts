import { describe, expect, it } from "vitest";
import { boardroomVariants } from "../boardroom-scenarios";
import type { LeverSettings } from "@/lib/model/types";

const settings: LeverSettings = {
  byAsset: {
    a1: {
      electrify: { enabled: true, unitsToConvert: 1, capacityPct: 40, cop: 3, tariffPerKwh: 8, assetCapex: 100, startYear: 2026, targetYear: 2035 },
      fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 90, retrofitCapex: 50, startYear: 2026, targetYear: 2034 },
    },
  },
  bySystem: {
    s1: {
      gasSwitch: { enabled: true, transitionPct: 50, altRefrigerant: "R32", retrofitCapex: 20, startYear: 2026, targetYear: 2033 },
      leakFix: { enabled: true, leakImprovementPct: 30, startYear: 2026, targetYear: 2033 },
    },
  },
  assumptions: { gridEf: 0.7, renewableSourcingPct: 0, recCostPerTonne: 0, carbonPricePerTonne: 3000, infraCapex: 0 },
};

describe("boardroomVariants", () => {
  it("returns BAU, Current and Accelerated", () => {
    expect(boardroomVariants(settings).map((v) => v.id)).toEqual(["bau", "balanced", "accelerated"]);
  });
  it("BAU disables every lever", () => {
    const bau = boardroomVariants(settings)[0].settings;
    expect(bau.byAsset.a1.electrify.enabled).toBe(false);
    expect(bau.byAsset.a1.fuelSwitch.enabled).toBe(false);
    expect(bau.bySystem.s1.gasSwitch.enabled).toBe(false);
    expect(bau.bySystem.s1.leakFix.enabled).toBe(false);
  });
  it("Current is unchanged", () => {
    expect(boardroomVariants(settings)[1].settings.byAsset.a1.electrify.capacityPct).toBe(40);
  });
  it("Accelerated pushes enabled levers harder and pulls target years to 2030", () => {
    const acc = boardroomVariants(settings)[2].settings;
    expect(acc.byAsset.a1.electrify.capacityPct).toBe(100);
    expect(acc.byAsset.a1.electrify.targetYear).toBe(2030);
    expect(acc.bySystem.s1.gasSwitch.transitionPct).toBe(100);
    expect(acc.bySystem.s1.leakFix.leakImprovementPct).toBeGreaterThanOrEqual(60);
  });
  it("does not mutate the input", () => {
    boardroomVariants(settings);
    expect(settings.byAsset.a1.electrify.enabled).toBe(true);
    expect(settings.byAsset.a1.electrify.capacityPct).toBe(40);
  });
});
