/* The two Tier-1 engine fixes: a grid factor that falls over time, and a
   feasibility gate on electrification. Both were gaps found by building three
   sector datasets and discovering what the model could not say. */

import { describe, it, expect } from "vitest";
import { compute } from "@/lib/model";
import { computeScope2 } from "@/lib/scope2/model";
import { buildTrajectory } from "@/lib/model/trajectory";
import {
  GRID_EF_DECLINE_PCT_DEFAULT, GRID_EF_FLOOR_RATIO,
  gridEfForYear, gridEfMultiplier, gridFactorFn,
} from "@/lib/model/grid";
import {
  electrifyFeasibility, validateScope1, HEAT_PUMP_MAX_C, RECOVERY_COP_THRESHOLD,
} from "@/lib/model/feasibility";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { CombustionAsset, LeverSettings, RefrigerationSystem, Wedge } from "@/lib/model/types";
import type { Facility, Scope2Levers } from "@/lib/scope2/model/types";

/* ─────────────────────────── grid factor ─────────────────────────── */

describe("grid carbon intensity over time", () => {
  it("is 1.0 at the base year and never re-states the past", () => {
    expect(gridEfMultiplier(2025, 2025, 3.5)).toBe(1);
    expect(gridEfMultiplier(2020, 2025, 3.5)).toBe(1);
  });

  it("declines compounding, and 0% reproduces the old frozen grid exactly", () => {
    expect(gridEfMultiplier(2030, 2025, 0)).toBe(1);
    expect(gridEfMultiplier(2030, 2025, 3.5)).toBeCloseTo(Math.pow(0.965, 5), 10);
    // 0.71 -> roughly 0.59 by 2030 on the default rate.
    expect(gridEfForYear(0.71, 2030, 2025, GRID_EF_DECLINE_PCT_DEFAULT)).toBeCloseTo(0.594, 2);
  });

  it("floors rather than reaching zero", () => {
    // A grid factor of zero would divide by zero in every ₹/tonne measured
    // against it, so the curve stops at a floor.
    expect(gridEfMultiplier(2200, 2025, 3.5)).toBe(GRID_EF_FLOOR_RATIO);
  });

  it("accepts a dirtying grid — a captive-coal geography is a real stress case", () => {
    expect(gridEfMultiplier(2030, 2025, -2)).toBeGreaterThan(1);
  });
});

describe("buildTrajectory with a grid factor", () => {
  const wedge: Wedge = { id: "w", label: "w", colorIdx: 0, startYear: 2025, rampYears: 1, fullAbatementT: 400, scope: 2 };
  const cfg = { baseYear: 2025, endYear: 2035, baseTotalT: 1000, bauGrowth: 0, wedges: [wedge] };

  it("leaves a Scope 1 trajectory's baseline and wedges alone", () => {
    // Scope 1 is fuel. A cleaner grid does not make diesel cleaner.
    const rows = buildTrajectory({ ...cfg, gridFactor: gridFactorFn(2025, 3.5) });
    const y2035 = rows.find((r) => r.year === 2035)!;
    expect(y2035.bau).toBeCloseTo(1000, 6);
    expect(y2035.wedges.w).toBeCloseTo(400, 6);
  });

  it("scales a Scope 2 baseline AND its wedges together, so the ratio holds", () => {
    const rows = buildTrajectory({ ...cfg, gridFactor: gridFactorFn(2025, 3.5), gridLinked: true });
    const g = gridEfMultiplier(2035, 2025, 3.5);
    const y2035 = rows.find((r) => r.year === 2035)!;
    expect(y2035.bau).toBeCloseTo(1000 * g, 6);
    expect(y2035.wedges.w).toBeCloseTo(400 * g, 6);
    // Both halves move together, so a fully-ramped lever still covers the same
    // SHARE of that year's business-as-usual.
    expect(y2035.wedges.w / y2035.bau).toBeCloseTo(0.4, 6);
  });

  it("shrinks electrification's spill in either scope", () => {
    const rows = buildTrajectory({
      ...cfg, wedges: [],
      scope2Spill: [{ startYear: 2025, rampYears: 1, fullT: 100 }],
      gridFactor: gridFactorFn(2025, 3.5),
    });
    const y2025 = rows.find((r) => r.year === 2025)!;
    const y2035 = rows.find((r) => r.year === 2035)!;
    expect(y2025.scope2Spill).toBeCloseTo(100, 6);
    expect(y2035.scope2Spill).toBeCloseTo(100 * gridEfMultiplier(2035, 2025, 3.5), 6);
    expect(y2035.scope2Spill).toBeLessThan(y2025.scope2Spill);
  });

  it("holds the target line still — a science-based target is a commitment, not a forecast", () => {
    const clean = buildTrajectory({ ...cfg, gridFactor: gridFactorFn(2025, 6), gridLinked: true });
    const frozen = buildTrajectory({ ...cfg, gridFactor: gridFactorFn(2025, 0), gridLinked: true });
    const t = (rows: ReturnType<typeof buildTrajectory>) => rows.find((r) => r.year === 2030)!.target;
    expect(t(clean)).toBeCloseTo(t(frozen), 9);
  });
});

/* ── the reason this matters: electrification stops being over-charged ── */

describe("a cleaning grid stops penalising electrification", () => {
  const asset: CombustionAsset = {
    id: "boiler", name: "PNG boiler", category: "stationary", fuelType: "png", unit: "m3",
    annualVolume: 500_000, opex: 25_000_000, remainingLife: 12, unitCount: 1,
    equipment: [{ id: "boiler", name: "Boiler", unitCount: 1, remainingLife: 12, endUse: "boiler", dutyTempC: 150 }],
  };
  const settings = (declinePct: number): LeverSettings => ({
    byAsset: {
      boiler: {
        electrify: { enabled: true, unitsToConvert: 0, capacityPct: 80, cop: 1, tariffPerKwh: 9, assetCapex: 40_000_000, startYear: 2026, targetYear: 2030 },
        fuelSwitch: { enabled: false, altFuel: "biogas", blendPct: 0, efficiencyPenaltyPct: 0, altFuelPricePerUnit: 30, retrofitCapex: 0, startYear: 2027, targetYear: 2032 },
      },
    },
    bySystem: {},
    assumptions: { ...DEFAULT_SETTINGS.assumptions, gridEfDeclinePctPerYear: declinePct },
  });

  it("leaves less spilled Scope 2 load standing in 2040 than a frozen grid does", () => {
    const spillAt = (declinePct: number) => {
      const r = compute([asset], [], settings(declinePct), 2025);
      return r.trajectory.find((row) => row.year === 2040)!.scope2Spill;
    };
    const frozen = spillAt(0);
    const cleaning = spillAt(GRID_EF_DECLINE_PCT_DEFAULT);
    expect(frozen).toBeGreaterThan(0);
    expect(cleaning).toBeLessThan(frozen);
    // ~41% less by 2040 on the default curve — the standing penalty the frozen
    // grid applied to the one lever that gets cleaner over time.
    expect(cleaning / frozen).toBeCloseTo(Math.pow(0.965, 15), 3);
  });
});

/* ─────────────────────────── feasibility ─────────────────────────── */

describe("electrification feasibility", () => {
  it("allows a heat pump below the commercial ceiling", () => {
    expect(electrifyFeasibility(120, 3).ok).toBe(true);
  });

  it("refuses a heat-pump COP on a duty no heat pump reaches", () => {
    const v = electrifyFeasibility(1150, 3);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.maxCop).toBe(RECOVERY_COP_THRESHOLD);
      expect(v.reason).toContain(String(HEAT_PUMP_MAX_C));
    }
  });

  it("allows direct heating at any temperature — you just pay for every joule", () => {
    expect(electrifyFeasibility(1150, 1).ok).toBe(true);
  });

  it("allows a DELIVERY-efficiency ratio at high temperature, not just a COP of 1", () => {
    /* Induction and IR put more of the input into the workpiece at any
       temperature. END_USES ships cooking at 1.8 and oven at 1.4, so a gate
       that refused those would fire on the product's own defaults. */
    expect(electrifyFeasibility(1150, 1.8).ok).toBe(true);
    expect(electrifyFeasibility(400, 1.4).ok).toBe(true);
  });

  it("says so when the temperature is unrecorded rather than silently passing", () => {
    const v = electrifyFeasibility(undefined, 3);
    expect(v.ok).toBe(true);
    expect(v.ok && v.note).toBeTruthy();
  });

  it("sits exactly on the boundary the alternatives catalogue already documents", () => {
    expect(electrifyFeasibility(HEAT_PUMP_MAX_C, 3).ok).toBe(true);
    expect(electrifyFeasibility(HEAT_PUMP_MAX_C + 1, 3).ok).toBe(false);
  });
});

describe("validateScope1", () => {
  const furnace: CombustionAsset = {
    id: "reheat", name: "Billet reheat furnace", category: "stationary", fuelType: "png", unit: "m3",
    annualVolume: 5_000_000, opex: 250_000_000, remainingLife: 12, unitCount: 1,
    equipment: [{ id: "reheat", name: "Reheat", unitCount: 1, remainingLife: 12, endUse: "furnace", dutyTempC: 1150 }],
  };
  const withCop = (cop: number): LeverSettings => ({
    byAsset: {
      reheat: {
        electrify: { enabled: true, unitsToConvert: 0, capacityPct: 25, cop, tariffPerKwh: 8.9, assetCapex: 165_000_000, startYear: 2028, targetYear: 2033 },
        fuelSwitch: { enabled: false, altFuel: "biogas", blendPct: 0, efficiencyPenaltyPct: 0, altFuelPricePerUnit: 34, retrofitCapex: 0, startYear: 2029, targetYear: 2034 },
      },
    },
    bySystem: {},
    assumptions: DEFAULT_SETTINGS.assumptions,
  });

  it("names the asset and the fix, not just that something is wrong", () => {
    const w = validateScope1([furnace], withCop(3));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("Billet reheat furnace");
    expect(w[0]).toContain(`Set the COP to ${RECOVERY_COP_THRESHOLD}`);
  });

  it("raises no objection when the plan is physically possible", () => {
    // A resistive conversion at 1,150 °C is allowed.
    expect(validateScope1([furnace], withCop(1))).toEqual([]);
  });

  it("counts unverifiable COPs once instead of naming every asset", () => {
    /* Repeating an asset name per row turns the strip into a list nobody
       reads, and it collides with the asset names the rest of the screen is
       scanned for. Genuine infeasibility names the asset because it is
       actionable there; missing data is a single plan-level count. */
    const noTemp = (id: string): CombustionAsset => ({
      ...furnace, id, name: `Boiler ${id}`,
      equipment: [{ id, name: "B", unitCount: 1, remainingLife: 10, endUse: "boiler" }],
    });
    const settings: LeverSettings = {
      byAsset: {
        a: withCop(3).byAsset.reheat,
        b: withCop(3).byAsset.reheat,
      },
      bySystem: {},
      assumptions: DEFAULT_SETTINGS.assumptions,
    };
    const w = validateScope1([noTemp("a"), noTemp("b")], settings);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("2 electrified sources have");
    expect(w[0]).not.toContain("Boiler a");
  });

  it("says nothing about a vehicle, which has no process duty", () => {
    const van: CombustionAsset = {
      id: "van", name: "Van", category: "mobile", fuelType: "diesel", unit: "L",
      annualVolume: 50_000, opex: 5_000_000, remainingLife: 6, unitCount: 4,
      equipment: [{ id: "van", name: "Van", unitCount: 4, remainingLife: 6, endUse: "van" }],
    };
    const s = withCop(3.5);
    s.byAsset = { van: s.byAsset.reheat };
    expect(validateScope1([van], s)).toEqual([]);
  });

  it("ignores a disabled lever", () => {
    const s = withCop(3);
    s.byAsset.reheat.electrify.enabled = false;
    expect(validateScope1([furnace], s)).toEqual([]);
  });

  it("reaches compute()'s result so a UI can render it", () => {
    const r = compute([furnace], [], withCop(3), 2025);
    expect(r.warnings.some((x) => x.includes("Billet reheat furnace"))).toBe(true);
  });
});

/* ── Scope 2 keeps working, and now decarbonises ── */

describe("computeScope2 with a cleaning grid", () => {
  const facilities: Facility[] = [{
    id: "f1", name: "Purchased electricity", annualLoadKwh: 10_000_000, tariffPerKwh: 8.5,
    loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
    roofSpaceM2: 5_000, peakLoadKw: 2_000, gridEf: 0.71, irradiance: 1_600, isolated: false,
  }];
  const levers: Scope2Levers = {
    byFacility: {
      f1: {
        efficiency: { enabled: true, ledPct: 100, motorPct: 50, bmsPct: 50, ledCapex: 2_000_000, motorCapex: 8_000_000, bmsCapex: 4_000_000, startYear: 2026, targetYear: 2029 },
        generation: { enabled: false, solarKwp: 0, batteryKwh: 0, exportMode: "netMetering", solarCapexPerKw: 45_000, batteryCapexPerKwh: 25_000, subsidyPct: 0, startYear: 2026, targetYear: 2030 },
      },
    },
    procurement: {
      enabled: false, ppaPct: 0, greenTariffPct: 0, recPct: 0, ppaStrikeDeltaPerKwh: 0,
      greenTariffPremiumPerKwh: 0, recPricePerKwh: 0.45, re100Exclusion: false,
      startYear: 2026, targetYear: 2030,
    },
  };

  it("lowers the business-as-usual line itself — the same kWh emit less", () => {
    const bau2040 = (declinePct: number) => {
      const r = computeScope2(facilities, levers, 2025, { ...DEFAULT_SETTINGS.assumptions, gridEfDeclinePctPerYear: declinePct });
      return r.trajectoryLocation.find((row) => row.year === 2040)!.bau;
    };
    expect(bau2040(3.5)).toBeLessThan(bau2040(0));
  });

  it("leaves the base-year baseline untouched — this year's inventory is measured, not forecast", () => {
    const a = computeScope2(facilities, levers, 2025, { ...DEFAULT_SETTINGS.assumptions, gridEfDeclinePctPerYear: 0 });
    const b = computeScope2(facilities, levers, 2025, { ...DEFAULT_SETTINGS.assumptions, gridEfDeclinePctPerYear: 5 });
    expect(a.kpis.baseLocationT).toBeCloseTo(b.kpis.baseLocationT, 9);
  });
});
