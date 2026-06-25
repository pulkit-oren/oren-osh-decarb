import { describe, expect, it } from "vitest";
import { defaultActions } from "@/lib/model/segments";
import type { CombustionAsset } from "@/lib/model/types";

function asset(over: Partial<CombustionAsset>): CombustionAsset {
  return { id: "a1", name: "x", category: "mobile", fuelType: "diesel", unit: "L", annualVolume: 1000, opex: 0, remainingLife: 10, unitCount: 4, ...over };
}

describe("defaultActions — end-use seeding", () => {
  it("unspecified end-use reproduces the legacy defaults", () => {
    const d = defaultActions(asset({}));
    expect(d.electrify.cop).toBe(3);
    expect(d.electrify.assetCapex).toBe(0);
    expect(d.electrify.capacityPct).toBe(0);
    expect(d.electrify.targetYear).toBe(2032);
    expect(d.fuelSwitch.startYear).toBe(2027);
    expect(d.fuelSwitch.altFuel).toBeTruthy();
  });

  it("a car seeds a COP (3.5) that differs from the base default", () => {
    const d = defaultActions(asset({ endUse: "car" }));
    expect(d.electrify.cop).toBe(3.5);
  });

  it("a stationary boiler seeds capacityPct from the profile capacityHint", () => {
    const d = defaultActions(asset({ category: "stationary", fuelType: "png", unit: "m3", endUse: "boiler" }));
    expect(d.electrify.capacityPct).toBe(60);
  });

  it("a truck seeds truck COP and per-unit capex", () => {
    const d = defaultActions(asset({ endUse: "truck" }));
    expect(d.electrify.cop).toBe(3.0);
    expect(d.electrify.assetCapex).toBe(9_500_000);
  });

  it("a high-temp kiln seeds COP 1.0", () => {
    const d = defaultActions(asset({ category: "stationary", fuelType: "png", unit: "m3", endUse: "furnaceKiln" }));
    expect(d.electrify.cop).toBe(1.0);
  });
});
