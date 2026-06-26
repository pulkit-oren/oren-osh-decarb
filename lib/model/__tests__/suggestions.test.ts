import { describe, expect, it } from "vitest";
import { suggestForAsset, suggestForSystem, capexForAsset, capexForSystem } from "@/lib/model/suggestions";
import type { CombustionAsset, RefrigerationSystem, AssetActions } from "@/lib/model/types";

function asset(over: Partial<CombustionAsset>): CombustionAsset {
  return { id: "a1", name: "x", category: "mobile", fuelType: "diesel", unit: "L", annualVolume: 1000, opex: 0, remainingLife: 10, unitCount: 4, ...over };
}
function sys(over: Partial<RefrigerationSystem>): RefrigerationSystem {
  return { id: "r1", name: "x", systemType: "retailRefrigeration", refrigerant: "R404A", toppedUpKg: 5, gasCostPerKg: 900, ...over };
}

describe("suggestForAsset", () => {
  it("electrify-feasible end-use (truck) → primary electrify, enabled, ~half the fleet, by 2030", () => {
    const s = suggestForAsset(asset({ endUse: "truck", unitCount: 4 }));
    expect(s.actions[0].lever).toBe("electrify");
    expect(s.actions[0].patch.enabled).toBe(true);
    expect(s.actions[0].patch.unitsToConvert).toBe(2);
    expect(s.actions[0].patch.targetYear).toBe(2030);
    expect(s.altActions?.[0].lever).toBe("fuelSwitch"); // diesel has a drop-in bio
  });
  it("hard-to-electrify end-use (furnaceKiln) → primary fuelSwitch at the drop-in cap", () => {
    const s = suggestForAsset(asset({ category: "stationary", fuelType: "diesel", unit: "L", endUse: "furnaceKiln" }));
    expect(s.actions[0].lever).toBe("fuelSwitch");
    expect(s.actions[0].patch.enabled).toBe(true);
    expect(typeof s.actions[0].patch.blendPct).toBe("number");
  });
});

describe("suggestForSystem", () => {
  it("recommends gasSwitch to the class/system alt + leakFix", () => {
    const s = suggestForSystem(sys({}));
    expect(s.actions.map((a) => a.lever).sort()).toEqual(["gasSwitch", "leakFix"]);
    const gs = s.actions.find((a) => a.lever === "gasSwitch")!;
    expect(gs.patch.transitionPct).toBe(60);
    expect(typeof gs.patch.altRefrigerant).toBe("string");
  });
});

describe("capexForAsset / capexForSystem", () => {
  it("electrify mobile capex = assetCapex × unitsToConvert", () => {
    const acts = { electrify: { enabled: true, unitsToConvert: 3, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 1_000_000, startYear: 2026, targetYear: 2030 }, fuelSwitch: { enabled: false, altFuel: "biodiesel", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 78, retrofitCapex: 0, startYear: 2027, targetYear: 2033 }, flexFuel: { enabled: false, unitsToConvert: 0, altFuel: "biodiesel", highBlendPct: 85, vehicleCapex: 500_000, startYear: 2027, targetYear: 2033 } } as AssetActions;
    expect(capexForAsset(asset({ category: "mobile", unitCount: 4 }), acts)).toBe(3_000_000);
  });
  it("system capex = gasSwitch retrofit when enabled", () => {
    const acts = { gasSwitch: { enabled: true, transitionPct: 60, altRefrigerant: "R290", retrofitCapex: 2_000_000, startYear: 2026, targetYear: 2030 }, leakFix: { enabled: true, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 } } as const;
    expect(capexForSystem(acts as any)).toBe(2_000_000);
  });
});
