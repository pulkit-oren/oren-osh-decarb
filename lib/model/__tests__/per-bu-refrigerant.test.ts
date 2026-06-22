/**
 * Integration test: per-BU refrigeration systems with `bu` and `excluded` fields.
 *
 * Verifies:
 *  (a) An excluded system does NOT contribute to the baseline / compute result.
 *  (b) Two systems sharing the same gas under different BUs BOTH contribute —
 *      i.e. the model keys by system id, not by refrigerant gas (no collision).
 */
import { describe, it, expect } from "vitest";
import { compute } from "../index";
import { baselineScope1, refrigerantCO2e } from "../baseline";
import type { LeverSettings, RefrigerationSystem } from "../types";

// R-404A GWP = 3943
// R-410A GWP = 1924

const mkSystem = (
  id: string,
  refrigerant: RefrigerationSystem["refrigerant"],
  toppedUpKg: number,
  bu?: string,
  excluded?: boolean,
): RefrigerationSystem => ({
  id,
  name: `System ${id}`,
  systemType: "commercialHVAC",
  refrigerant,
  toppedUpKg,
  gasCostPerKg: 800,
  bu,
  excluded,
});

const SETTINGS: LeverSettings = {
  assumptions: {
    gridEf: 0.71,
    renewableSourcingPct: 0,
    recCostPerTonne: 0,
    carbonPricePerTonne: 0,
    infraCapex: 0,
  },
  byAsset: {},
  bySystem: {},
};

describe("per-BU refrigeration — excluded and multi-system same-gas", () => {
  /**
   * Three R-404A systems:
   *   s1 — BU "North",  50 kg → 197.15 t/yr
   *   s2 — BU "South",  30 kg → 118.29 t/yr  (same gas, different BU)
   *   s3 — BU "East",   20 kg → 78.86 t/yr   excluded: true
   *
   * After filter(!excluded): s1 + s2 = 315.44 t/yr (not 394.3 — s3 is dropped).
   */
  const s1 = mkSystem("s1", "R404A", 50, "North");
  const s2 = mkSystem("s2", "R404A", 30, "South");
  const s3 = mkSystem("s3", "R404A", 20, "East", true);
  const allSystems = [s1, s2, s3];
  const includedSystems = allSystems.filter((s) => !s.excluded);

  it("(a) excluded system is absent from baselineScope1 when caller filters", () => {
    const bl = baselineScope1([], includedSystems);
    // s1: 50 × 3943 / 1000 = 197.15
    // s2: 30 × 3943 / 1000 = 118.29
    // s3 excluded → not in result
    expect(bl.refrigerantT).toBeCloseTo(197.15 + 118.29, 1);
    expect(bl.perRefrigeration.some((p) => p.id === "s3")).toBe(false);
    expect(bl.perRefrigeration.length).toBe(2);
  });

  it("(a) excluded system is absent from compute() baseline and result", () => {
    const r = compute([], includedSystems, SETTINGS, 2025);
    expect(r.baseline.perRefrigeration.some((p) => p.id === "s3")).toBe(false);
    expect(r.baseTotalT).toBeCloseTo(197.15 + 118.29, 1);
  });

  it("(b) two same-gas different-BU systems both contribute (no id collision)", () => {
    // If the model accidentally keyed by refrigerant gas instead of system id,
    // only one system would appear. Both must appear here.
    const bl = baselineScope1([], includedSystems);
    expect(bl.perRefrigeration.find((p) => p.id === "s1")?.co2eT).toBeCloseTo(197.15, 1);
    expect(bl.perRefrigeration.find((p) => p.id === "s2")?.co2eT).toBeCloseTo(118.29, 1);
    // Total = sum of BOTH, not just one
    expect(bl.refrigerantT).toBeCloseTo(315.44, 1);
  });

  it("(b) same-gas BU pair is additive in compute() — refrigerant baseline = sum of both", () => {
    const r = compute([], includedSystems, SETTINGS, 2025);
    expect(r.baseline.refrigerantT).toBeCloseTo(315.44, 1);
  });

  it("excluded system still shows refrigerantCO2e value (it's valid data, just filtered by caller)", () => {
    // refrigerantCO2e() is a pure function — it should work on any system
    expect(refrigerantCO2e(s3)).toBeCloseTo(78.86, 1);
  });

  it("including the excluded system would increase the total (sanity check)", () => {
    const blAll = baselineScope1([], allSystems);
    const blFiltered = baselineScope1([], includedSystems);
    expect(blAll.refrigerantT).toBeCloseTo(315.44 + 78.86, 1);
    expect(blAll.refrigerantT).toBeGreaterThan(blFiltered.refrigerantT);
  });

  it("lever actions on included systems accumulate without collision across same-gas BU pair", () => {
    // Enable leak fix on BOTH s1 and s2; s3 has no actions.
    const settings: LeverSettings = {
      ...SETTINGS,
      bySystem: {
        s1: { gasSwitch: { enabled: false, transitionPct: 0, altRefrigerant: "R717", retrofitCapex: 0, startYear: 2026, targetYear: 2030 }, leakFix: { enabled: true, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 } },
        s2: { gasSwitch: { enabled: false, transitionPct: 0, altRefrigerant: "R717", retrofitCapex: 0, startYear: 2026, targetYear: 2030 }, leakFix: { enabled: true, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 } },
      },
    };
    const r = compute([], includedSystems, settings, 2025);
    const lever = r.levers.find((l) => l.id === "refrigerant")!;
    // s1 leak fix abatement: 197.15 × 50% = 98.575
    // s2 leak fix abatement: 118.29 × 50% = 59.145
    // Total abatement = 157.72 (not just one system's worth)
    expect(lever.abatementT).toBeCloseTo(98.575 + 59.145, 1);
    expect(lever.enabled).toBe(true);
  });
});
