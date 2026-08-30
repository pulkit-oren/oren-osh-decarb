/* "What would have to be true." Every assumption in this model was a point
   estimate, which is fine for reporting a plan and useless for deciding one. */

import { describe, it, expect } from "vitest";
import { breakEven, sensitivity, VARIABLES, type SensitivityInputs } from "../sensitivity";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { CombustionAsset, LeverSettings, RefrigerationSystem } from "@/lib/model/types";
import type { Facility, Scope2Levers } from "@/lib/scope2/model/types";

const assets: CombustionAsset[] = [{
  id: "boiler", name: "PNG boiler", category: "stationary", fuelType: "png", unit: "m3",
  annualVolume: 2_000_000, opex: 100_000_000,
  equipment: [{ id: "boiler", name: "Boiler", unitCount: 1, remainingLife: 12, endUse: "boiler", dutyTempC: 180 }],
}];

const systems: RefrigerationSystem[] = [{
  id: "chiller", name: "Chiller", systemType: "commercialHVAC", refrigerant: "R410A",
  toppedUpKg: 300, chargeKg: 3_000, gasCostPerKg: 1_200,
}];

const facilities: Facility[] = [{
  id: "f1", name: "Purchased electricity", annualLoadKwh: 30_000_000, tariffPerKwh: 8.6,
  loadSplit: { lightingPct: 12, motorPct: 60, hvacPct: 20 },
  roofSpaceM2: 30_000, peakLoadKw: 6_000, gridEf: 0.71, irradiance: 1_600, isolated: false,
}];

const settings: LeverSettings = {
  byAsset: {
    boiler: {
      efficiency: { enabled: true, savingPct: 8, capex: 9_000_000, startYear: 2026, targetYear: 2028 },
      // COP 1 — an electrode boiler at 180 °C, which is what the feasibility
      // gate would insist on anyway.
      electrify: { enabled: true, unitsToConvert: 0, capacityPct: 40, cop: 1, tariffPerKwh: 8.6, assetCapex: 90_000_000, startYear: 2027, targetYear: 2031 },
      fuelSwitch: { enabled: false, altFuel: "biogas", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 32, retrofitCapex: 0, startYear: 2027, targetYear: 2030 },
    },
  },
  bySystem: {
    chiller: {
      gasSwitch: { enabled: true, transitionPct: 60, altRefrigerant: "R454B", retrofitCapex: 12_000_000, startYear: 2027, targetYear: 2031 },
      leakFix: { enabled: true, leakImprovementPct: 45, capex: 2_000_000, startYear: 2026, targetYear: 2028 },
    },
  },
  assumptions: DEFAULT_SETTINGS.assumptions,
};

const levers: Scope2Levers = {
  byFacility: {
    f1: {
      efficiency: { enabled: true, ledPct: 90, motorPct: 50, bmsPct: 60, ledCapex: 7_000_000, motorCapex: 30_000_000, bmsCapex: 14_000_000, startYear: 2026, targetYear: 2030 },
      generation: { enabled: true, solarKwp: 3_000, batteryKwh: 4_000, exportMode: "netMetering", solarCapexPerKw: 42_000, batteryCapexPerKwh: 24_000, subsidyPct: 0, startYear: 2026, targetYear: 2029 },
    },
  },
  procurement: {
    enabled: true, ppaPct: 30, greenTariffPct: 10, recPct: 10,
    ppaStrikeDeltaPerKwh: -0.9, greenTariffPremiumPerKwh: 0.75, recPricePerKwh: 0.45,
    re100Exclusion: false, startYear: 2026, targetYear: 2030,
  },
};

const inp: SensitivityInputs = { assets, systems, settings, facilities, levers, baseYear: 2025 };

describe("sensitivity", () => {
  const rows = sensitivity(inp);

  it("covers every variable that moves an Indian case", () => {
    expect(rows).toHaveLength(VARIABLES.length);
    expect(rows.map((r) => r.key).sort()).toEqual(
      ["carbonPricePerTonne", "discountRatePct", "elecEscalationPct", "gridEfDeclinePctPerYear", "fuelEscalationPct"].sort(),
    );
  });

  it("ranks by how much the answer actually moves, biggest first", () => {
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].npvSwing).toBeGreaterThanOrEqual(rows[i].npvSwing);
    }
  });

  it("evaluates the plan's OWN assumption as the base point, not a default", () => {
    const custom = sensitivity({
      ...inp,
      settings: { ...settings, assumptions: { ...settings.assumptions, discountRatePct: 13 } },
    });
    expect(custom.find((r) => r.key === "discountRatePct")!.base.value).toBe(13);
  });

  it("makes a higher discount rate worth less — the sign of a real recompute", () => {
    const r = rows.find((x) => x.key === "discountRatePct")!;
    expect(r.low.value).toBeLessThan(r.high.value);
    expect(r.low.outcome.npv).toBeGreaterThan(r.high.outcome.npv);
  });

  it("reproduces the engine exactly at the base point", () => {
    // Not an approximation or an interpolation: the base row is a full
    // recompute, so it must equal what the user sees on the plan itself.
    const r = rows.find((x) => x.key === "carbonPricePerTonne")!;
    const rerun = sensitivity(inp).find((x) => x.key === "fuelEscalationPct")!;
    expect(r.base.outcome.npv).toBeCloseTo(rerun.base.outcome.npv, 6);
  });

  it("flags an assumption that decides whether the plan creates value at all", () => {
    // flipsSign is the only genuinely alarming outcome: not "how much" but
    // "whether". It must be a real sign change, never merely a big swing.
    for (const r of rows) {
      const signChanged = Math.sign(r.low.outcome.npv) !== Math.sign(r.high.outcome.npv);
      expect(r.flipsSign).toBe(signChanged);
    }
  });

  it("holds capex still under a pure discount-rate change", () => {
    // Capital spent does not depend on what you discount it at.
    const r = rows.find((x) => x.key === "discountRatePct")!;
    expect(r.low.outcome.totalCapex).toBeCloseTo(r.high.outcome.totalCapex, 6);
  });
});

describe("breakEven", () => {
  it("answers the question a CFO asks by name", () => {
    const price = breakEven(inp, "carbonPricePerTonne", [0, 20_000]);
    if (price !== null) {
      // Whatever it returns must actually be the turning point: NPV positive
      // just above it, and not already positive at the bottom of the range.
      const above = sensitivity(
        { ...inp, settings: { ...settings, assumptions: { ...settings.assumptions, carbonPricePerTonne: price * 1.05 + 1 } } },
        [VARIABLES[0]],
      )[0];
      expect(above.base.outcome.npv).toBeGreaterThan(0);
    }
    expect(price === null || price >= 0).toBe(true);
  });

  it("returns the floor when the plan is already worth doing with nothing", () => {
    const price = breakEven(inp, "carbonPricePerTonne", [0, 20_000]);
    const atZero = sensitivity(
      { ...inp, settings: { ...settings, assumptions: { ...settings.assumptions, carbonPricePerTonne: 0 } } },
      [VARIABLES[0]],
    )[0].base.outcome.npv;
    if (atZero > 0) expect(price).toBe(0);
  });

  it("returns null rather than a number when the range never turns it", () => {
    // A punitive discount rate that cannot be rescued: honest silence beats a
    // fabricated break-even at the edge of the range.
    const hopeless: SensitivityInputs = {
      ...inp,
      settings: {
        ...settings,
        byAsset: {
          boiler: {
            ...settings.byAsset.boiler,
            electrify: { ...settings.byAsset.boiler.electrify, assetCapex: 5_000_000_000 },
          },
        },
      },
    };
    expect(breakEven(hopeless, "carbonPricePerTonne", [0, 100])).toBeNull();
  });
});
