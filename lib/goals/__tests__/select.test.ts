import { describe, expect, it } from "vitest";
import type { CombustionByYear, RefrigerationByYear } from "@/lib/model/types";
import type { FacilitiesByYear, Facility } from "@/lib/scope2/model/types";
import {
  actualsSeries, baseValueFor, endTargetValue, energyForYear, forecastSeries, goalStatus,
  initiativeRamp, renewablePctForYear, solarKwpForYear, targetSeries, targetValueAt,
  type Inventories,
} from "../select";
import type { Goal, Initiative } from "../types";

function goal(p: Partial<Goal> = {}): Goal {
  return {
    id: "g-0", name: "T", category: "emissions", templateId: "abs_sbti", metric: "emissions_t",
    direction: "reduce", scope: "s1", baseYear: 2024, targetYear: 2030, targetPct: 50,
    milestones: [], createdAt: 0, ...p,
  };
}
function init(p: Partial<Initiative> = {}): Initiative {
  return {
    id: "i-0", goalId: "g-0", name: "I", scope: "s1", status: "planned",
    startYear: 2025, targetYear: 2030, metricImpact: 100, budget: 0, auto: true, ...p,
  };
}
function facility(p: Partial<Facility> = {}): Facility {
  return {
    id: "f1", name: "Plant", annualLoadKwh: 1_000_000, tariffPerKwh: 9,
    loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
    roofSpaceM2: 5000, peakLoadKw: 400, gridEf: 0.7, irradiance: 1400, isolated: false, ...p,
  };
}

describe("reduce-goal target line", () => {
  it("runs from base to the committed cut", () => {
    const s = targetSeries(goal({ baseYear: 2024, targetYear: 2030, targetPct: 50 }), 1000);
    expect(s[0]).toEqual({ year: 2024, value: 1000 });
    expect(s[s.length - 1].value).toBeCloseTo(500);
  });
  it("net-zero respects residual", () => {
    expect(endTargetValue(goal({ templateId: "netzero", residualPct: 10 }), 1000)).toBeCloseTo(100);
  });
  it("bends through milestones", () => {
    const g = goal({ baseYear: 2024, targetYear: 2030, targetPct: 90, milestones: [{ id: "m", year: 2027, reductionPct: 30 }] });
    expect(targetValueAt(g, 1000, 2027)).toBeCloseTo(700); // 30% cut → 700
  });
});

describe("increase-goal (renewable %) target line", () => {
  const g = goal({
    category: "energy", templateId: "re100", metric: "renewable_pct", direction: "increase",
    scope: "s2", baseYear: 2024, targetYear: 2030, targetPct: 100,
    milestones: [{ id: "m", year: 2027, reductionPct: 60 }],
  });
  it("rises from base value toward the target share", () => {
    const s = targetSeries(g, 20); // base 20% renewable
    expect(s[0].value).toBeCloseTo(20);
    expect(targetValueAt(g, 20, 2027)).toBeCloseTo(60); // milestone = absolute 60%
    expect(s[s.length - 1].value).toBeCloseTo(100);
  });
});

describe("forecast direction", () => {
  it("reduce subtracts impact, floored at 0", () => {
    const f = forecastSeries(goal({ targetYear: 2026 }), [init({ startYear: 2025, targetYear: 2025, metricImpact: 400 })], { year: 2025, value: 1000 });
    expect(f[0]).toEqual({ year: 2025, value: 600 });
  });
  it("increase adds impact, capped at 100 for renewable %", () => {
    const g = goal({ metric: "renewable_pct", direction: "increase", targetYear: 2026 });
    const f = forecastSeries(g, [init({ startYear: 2025, targetYear: 2025, metricImpact: 90 })], { year: 2025, value: 30 });
    expect(f[0].value).toBeCloseTo(100); // 30 + 90 capped
  });
});

describe("initiative ramp", () => {
  it("ramps from start to target", () => {
    const i = init({ startYear: 2025, targetYear: 2029, metricImpact: 100 });
    expect(initiativeRamp(i, 2024)).toBe(0);
    expect(initiativeRamp(i, 2029)).toBe(1);
  });
});

describe("verdict", () => {
  const actuals = [{ year: 2024, value: 1000 }];
  it("reduce on-track when forecast meets target", () => {
    const g = goal({ baseYear: 2024, targetYear: 2030, targetPct: 50 });
    const s = goalStatus(g, 1000, [init({ startYear: 2024, targetYear: 2024, metricImpact: 500 })], actuals);
    expect(s.verdict).toBe("on-track");
  });
  it("reduce off-track when far short", () => {
    const g = goal({ baseYear: 2024, targetYear: 2030, targetPct: 50 });
    const s = goalStatus(g, 1000, [init({ startYear: 2024, targetYear: 2024, metricImpact: 50 })], actuals);
    expect(s.verdict).toBe("off-track");
  });
});

describe("energy + renewable + solar metrics from data", () => {
  const combustion: CombustionByYear = {
    2024: [{ id: "c1", name: "Boiler", category: "stationary", fuelType: "diesel", annualVolume: 10000, unit: "L", opex: 0, remainingLife: 10, unitCount: 1 }],
  };
  const refrigeration: RefrigerationByYear = {};
  const facilities: FacilitiesByYear = {
    2024: [facility({ annualLoadKwh: 1_000_000, existingRenewablePct: 20, existingSolarKwp: 100, irradiance: 1400 })],
  };
  const inv: Inventories = { combustion, refrigeration, facilities };

  it("scope-2 energy equals facility load", () => {
    expect(energyForYear("s2", inv, 2024)).toBeCloseTo(1_000_000);
  });
  it("renewable % combines contracted + solar over total electricity", () => {
    // contracted = 20% of 1,000,000 = 200,000; solar = 100*1400 = 140,000; total = 1,140,000
    const expected = ((200_000 + 140_000) / 1_140_000) * 100;
    expect(renewablePctForYear(inv, 2024)).toBeCloseTo(expected, 1);
  });
  it("solar kWp sums existing capacity", () => {
    expect(solarKwpForYear(inv, 2024)).toBeCloseTo(100);
  });
  it("actuals only include years with data", () => {
    const g = goal({ metric: "energy_kwh", scope: "s2" });
    expect(actualsSeries(g, inv).map((p) => p.year)).toEqual([2024]);
  });
  it("base value reads the base year", () => {
    expect(baseValueFor(goal({ metric: "solar_kwp", scope: "s2", baseYear: 2024 }), inv)).toBeCloseTo(100);
  });
});
