/* Scope 1 CAPEX lines. The load-bearing assertion is that the lines sum to the
   lever capex the finance engine reports — if those two ever diverge, the card
   shows a breakdown that does not add up to its own total. */

import { describe, expect, it } from "vitest";
import { compute } from "../index";
import { sumCapexLines } from "../capex";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { CombustionAsset, LeverSettings, RefrigerationSystem } from "../types";

const assets: CombustionAsset[] = [
  { id: "boiler", name: "Boiler", category: "stationary", fuelType: "diesel", unit: "L", annualVolume: 60_000, opex: 5_000_000, remainingLife: 12, unitCount: 1 },
  { id: "fleet", name: "Fleet", category: "mobile", fuelType: "diesel", unit: "L", annualVolume: 100_000, opex: 9_000_000, remainingLife: 8, unitCount: 10 },
];
const systems: RefrigerationSystem[] = [
  { id: "hvac", name: "HVAC", systemType: "commercialHVAC", refrigerant: "R404A", toppedUpKg: 25, gasCostPerKg: 400 },
];

/** Every Scope 1 capex driver switched on at once, so the sum-invariant is
 *  actually exercised rather than passing on a mostly-empty plan. */
const allOn: LeverSettings = {
  assumptions: { ...DEFAULT_SETTINGS.assumptions, infraCapex: 15_000_000 },
  byAsset: {
    boiler: {
      efficiency: { enabled: true, savingPct: 10, capex: 400_000, startYear: 2026, targetYear: 2030 },
      electrify: { enabled: true, unitsToConvert: 0, capacityPct: 60, cop: 3, tariffPerKwh: 9, assetCapex: 3_000_000, purchaseTiming: "early", startYear: 2026, targetYear: 2030 },
      fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 0, altFuelPricePerUnit: 95, retrofitCapex: 250_000, startYear: 2026, targetYear: 2030 },
    },
    fleet: {
      efficiency: { enabled: true, savingPct: 5, capex: 100_000, startYear: 2026, targetYear: 2030 },
      electrify: { enabled: true, unitsToConvert: 4, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 2_500_000, purchaseTiming: "replacement", replacementPremiumPct: 40, startYear: 2026, targetYear: 2030 },
      fuelSwitch: { enabled: false, altFuel: "biodiesel", blendPct: 0, efficiencyPenaltyPct: 0, altFuelPricePerUnit: 95, retrofitCapex: 0, startYear: 2026, targetYear: 2030 },
      flexFuel: { enabled: true, unitsToConvert: 3, altFuel: "biodiesel", highBlendPct: 85, vehicleCapex: 150_000, startYear: 2026, targetYear: 2030 },
    },
  },
  bySystem: {
    hvac: {
      leakFix: { enabled: true, leakImprovementPct: 60, capex: 120_000, startYear: 2026, targetYear: 2030 },
      chargeReduction: { enabled: true, reductionPct: 15, capex: 80_000, startYear: 2026, targetYear: 2030 },
      gasSwitch: { enabled: true, transitionPct: 50, altRefrigerant: "R32", retrofitCapex: 300_000, startYear: 2026, targetYear: 2030 },
    },
  },
} as LeverSettings;

describe("Scope 1 capexLines", () => {
  const r = compute(assets, systems, allOn, 2025);

  it("sums to the same capital the levers report", () => {
    const leverTotal = r.levers.reduce((s, l) => s + l.capex, 0);
    expect(sumCapexLines(r.capexLines)).toBeCloseTo(leverTotal, 6);
  });

  it("sums to each lever's own capex, driver by driver", () => {
    for (const lever of r.levers) {
      const mine = r.capexLines.filter((l) => l.leverId === lever.id);
      expect(sumCapexLines(mine), lever.id).toBeCloseTo(lever.capex, 6);
    }
  });

  it("gives the charging / grid lump its own line, charged once for the company", () => {
    const infra = r.capexLines.filter((l) => l.driverId === "s1-charging-infra");
    expect(infra).toHaveLength(1);
    expect(infra[0].amount).toBeCloseTo(15_000_000, 6);
    expect(infra[0].sourceIds).toEqual(["portfolio"]);
  });

  it("omits the charging lump entirely when nothing is electrified", () => {
    const noElec: LeverSettings = {
      ...allOn,
      byAsset: Object.fromEntries(Object.entries(allOn.byAsset).map(([k, a]) => [
        k, { ...a, electrify: { ...a.electrify, enabled: false } },
      ])),
    };
    const out = compute(assets, systems, noElec, 2025);
    expect(out.capexLines.some((l) => l.driverId === "s1-charging-infra")).toBe(false);
  });

  it("separates vehicles from stationary electrification, and prices vehicles per unit", () => {
    const ev = r.capexLines.find((l) => l.driverId === "s1-ev")!;
    // 4 vehicles at 2,500,000 x 40% premium = 4,000,000
    expect(ev.unit).toMatchObject({ quantity: 4, unitLabel: "vehicles" });
    expect(ev.amount).toBeCloseTo(4_000_000, 6);
    const hp = r.capexLines.find((l) => l.driverId === "s1-heatpump")!;
    expect(hp.amount).toBeCloseTo(3_000_000, 6);
    expect(hp.unit).toBeUndefined();
  });

  it("reports all three refrigerant drivers separately", () => {
    const ids = r.capexLines.filter((l) => l.leverId === "refrigerant").map((l) => l.driverId);
    expect(ids).toEqual(expect.arrayContaining(["s1-ldar", "s1-charge-cut", "s1-gas-retrofit"]));
  });
});
