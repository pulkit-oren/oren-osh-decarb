/* Replacement-timing capex — converting at natural replacement pays only the
   EV premium; early retirement pays the full price. Stationary unchanged. */

import { describe, expect, it } from "vitest";
import { electrifyCapexFor } from "../segments";
import type { CombustionAsset, ElectrifyAction } from "../types";

const fleet: CombustionAsset = {
  id: "a1", name: "Fleet", category: "mobile", fuelType: "diesel",
  unit: "L", annualVolume: 100_000, opex: 9_000_000, remainingLife: 2, unitCount: 10,
};
const e = (over: Partial<ElectrifyAction>): ElectrifyAction => ({
  enabled: true, unitsToConvert: 5, capacityPct: 0, cop: 3, tariffPerKwh: 9,
  assetCapex: 2_000_000, startYear: 2026, targetYear: 2030, ...over,
});

describe("electrifyCapexFor", () => {
  it("at replacement: only the EV premium per vehicle", () => {
    expect(electrifyCapexFor(fleet, e({ purchaseTiming: "replacement", replacementPremiumPct: 40 })))
      .toBe(5 * 2_000_000 * 0.4);
  });

  it("defaults to replacement timing with a 40% premium", () => {
    expect(electrifyCapexFor(fleet, e({}))).toBe(5 * 2_000_000 * 0.4);
  });

  it("early retirement: the full EV price", () => {
    expect(electrifyCapexFor(fleet, e({ purchaseTiming: "early" }))).toBe(5 * 2_000_000);
  });

  it("stationary assets keep their single asset capex", () => {
    const boiler = { ...fleet, category: "stationary" as const, unitCount: 1 };
    expect(electrifyCapexFor(boiler, e({ capacityPct: 60 }))).toBe(2_000_000);
  });

  it("disabled lever costs nothing", () => {
    expect(electrifyCapexFor(fleet, e({ enabled: false }))).toBe(0);
  });
});
