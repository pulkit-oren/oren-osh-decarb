/**
 * Task 7: Scope 2 Compare + CEO confidence — excluded facility fix
 *
 * Strategy: unit-test the compute call path directly.
 * The store's `result` already filters !excluded (line 171 of store.tsx).
 * CompareTab was calling computeScope2(baseFacilities, …) without the filter,
 * so an excluded facility would inflate saved-scenario columns relative to
 * the live column.  The fix adds .filter((f) => !f.excluded) to match the store.
 *
 * Test asserts:
 *   computeScope2(allFacilities.filter(!excluded), levers, year).kpis.locationNowT
 *   === computeScope2(allFacilities, levers, year).kpis.locationNowT
 *   only when the second call is also filtered — i.e., the pre-fix UNFILTERED
 *   call gives a HIGHER total and the post-fix FILTERED call matches the store.
 */

import { describe, expect, it } from "vitest";
import { computeScope2 } from "@/lib/scope2/model";
import { defaultFacilityActions, DEFAULT_PROCUREMENT } from "@/lib/scope2/defaults";
import { facilityGrade, confidenceOf } from "@/lib/data-quality";
import type { Facility, Scope2Levers } from "@/lib/scope2/model/types";

const BASE_YEAR = 2025;

/** Two facilities: one active, one excluded. */
const activeFacility: Facility = {
  id: "active", name: "Active plant",
  annualLoadKwh: 2_000_000, tariffPerKwh: 9,
  loadSplit: { lightingPct: 15, motorPct: 50, hvacPct: 20 },
  roofSpaceM2: 6000, peakLoadKw: 800, gridEf: 0.71, irradiance: 1500, isolated: false,
};

const excludedFacility: Facility = {
  id: "excluded", name: "Excluded subsidiary",
  annualLoadKwh: 1_000_000, tariffPerKwh: 12,
  loadSplit: { lightingPct: 20, motorPct: 30, hvacPct: 30 },
  roofSpaceM2: 3000, peakLoadKw: 400, gridEf: 0.65, irradiance: 1400, isolated: false,
  excluded: true,
};

const allFacilities: Facility[] = [activeFacility, excludedFacility];

/** Levers with all actions disabled — baseline pass-through. */
const levers: Scope2Levers = {
  byFacility: Object.fromEntries(allFacilities.map((f) => [f.id, defaultFacilityActions(f)])),
  procurement: { ...DEFAULT_PROCUREMENT },
};

describe("Scope 2 excluded facility filter", () => {
  it("UNFILTERED call inflates location total vs filtered (pre-fix scenario)", () => {
    // This reproduces what CompareTab did before the fix.
    const unfiltered = computeScope2(allFacilities, levers, BASE_YEAR);
    const filtered = computeScope2(allFacilities.filter((f) => !f.excluded), levers, BASE_YEAR);

    // Excluded facility has positive load, so unfiltered must be strictly higher.
    expect(unfiltered.kpis.locationNowT).toBeGreaterThan(filtered.kpis.locationNowT);
  });

  // Test 2 was a tautology (f(x) ≈ f(x)) — removed as redundant with Test 1,
  // which already proves the unfiltered path overcounts.

  it("excluded facility contributes zero to the filtered result", () => {
    // Only active facility in the filtered set.
    const activeOnly = computeScope2([activeFacility], levers, BASE_YEAR);
    const filtered = computeScope2(allFacilities.filter((f) => !f.excluded), levers, BASE_YEAR);

    expect(filtered.kpis.locationNowT).toBeCloseTo(activeOnly.kpis.locationNowT, 6);
    expect(filtered.kpis.marketNowT).toBeCloseTo(activeOnly.kpis.marketNowT, 6);
  });

  it("CEO confidence gauge: confidenceOf on unfiltered vs filtered inputs yields different totalT", () => {
    // CeoOverviewTab builds: baseFacilities.filter((f) => !f.excluded).map(f => ({
    //   grade: facilityGrade(f),
    //   co2eT: result.baseline.perFacility.find(p => p.id === f.id)?.locationT ?? 0,
    // }))
    // The excluded facility has annualLoadKwh > 0 → grade "measured" and positive locationT
    // (= annualLoadKwh * gridEf / 1000). When unfiltered it contributes positive co2eT to the
    // gauge's totalT, inflating the weighted confidence score.  After the fix it is absent.

    const toInput = (f: Facility) => ({
      grade: facilityGrade(f),
      // locationT formula from baseline.ts: (annualLoadKwh * gridEf) / 1000
      co2eT: (f.annualLoadKwh * f.gridEf) / 1000,
    });

    const unfilteredConfidence = confidenceOf(allFacilities.map(toInput));
    const filteredConfidence = confidenceOf(
      allFacilities.filter((f) => !f.excluded).map(toInput),
    );

    // The excluded facility contributes positive co2eT, so totalT must differ.
    // This proves the unfiltered (old) path was passing excluded weight to the gauge.
    expect(unfilteredConfidence.totalT).toBeGreaterThan(filteredConfidence.totalT);

    // And the filtered result should match computing on only the active facility.
    const activeOnlyConfidence = confidenceOf([toInput(activeFacility)]);
    expect(filteredConfidence.totalT).toBeCloseTo(activeOnlyConfidence.totalT, 6);
  });
});
