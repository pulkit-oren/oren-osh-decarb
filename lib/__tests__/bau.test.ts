/* The BAU premise: an actual-emissions series off the year-wise inventories,
   and the CAGR that turns it into one growth rate. */
import { describe, expect, it } from "vitest";
import {
  BAU_GROWTH_MAX_PCT, BAU_GROWTH_MIN_PCT, deriveBauGrowth, deriveScope1Bau, deriveScope2Bau,
  describeBauPremise, resolveBauGrowthPct, scope1ActualSeries, scope2ActualSeries,
  type DerivedGrowth, type YearPoint,
} from "../bau";
import { DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR, DEFAULT_BASE_YEAR } from "../defaults";
import { DEFAULT_FACILITIES_BY_YEAR, DEFAULT_BASE_YEAR as SCOPE2_DEFAULT_BASE_YEAR } from "../scope2/defaults";
import type { CombustionAsset, CombustionByYear, RefrigerationByYear, RefrigerationSystem } from "../model/types";
import type { Facility, FacilitiesByYear } from "../scope2/model/types";

/* Minimal fixture builders — only the fields deriveScope1Bau / deriveScope2Bau's
   boundary logic actually reads (id, name, the volume that drives the total). */
const mkAsset = (id: string, name: string, annualVolume: number): CombustionAsset => ({
  id, name, category: "stationary", fuelType: "diesel", unit: "L", annualVolume, opex: 0,
});
const mkSystem = (id: string, name: string, toppedUpKg: number): RefrigerationSystem => ({
  id, name, systemType: "commercialHVAC", refrigerant: "R410A", toppedUpKg, gasCostPerKg: 0,
});
const mkFacility = (id: string, name: string, annualLoadKwh: number): Facility => ({
  id, name, annualLoadKwh, tariffPerKwh: 1,
  loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
  roofSpaceM2: 0, peakLoadKw: 0, gridEf: 0.5, irradiance: 1500, isolated: false,
});

const pts = (m: Record<number, number>): YearPoint[] =>
  Object.entries(m).map(([year, totalT]) => ({ year: Number(year), totalT }));

describe("deriveBauGrowth", () => {
  it("is the CAGR from the first year with data to the base year", () => {
    // 100 -> 400 over two years is a doubling each year.
    const d = deriveBauGrowth(pts({ 2023: 100, 2024: 200, 2025: 400 }), 2025);
    expect(d).not.toBeNull();
    expect(d!.pct).toBeCloseTo(100, 6);
    expect(d!.fromYear).toBe(2023);
    expect(d!.toYear).toBe(2025);
    expect(d!.years).toBe(2);
  });

  it("uses only the endpoints, so an odd middle year does not move it", () => {
    const straight = deriveBauGrowth(pts({ 2023: 100, 2024: 200, 2025: 400 }), 2025)!;
    const dipped = deriveBauGrowth(pts({ 2023: 100, 2024: 5, 2025: 400 }), 2025)!;
    expect(dipped.pct).toBeCloseTo(straight.pct, 6);
  });

  it("returns null with fewer than two usable years", () => {
    expect(deriveBauGrowth(pts({ 2025: 100 }), 2025)).toBeNull();
    expect(deriveBauGrowth([], 2025)).toBeNull();
  });

  it("returns null when the first total is not positive", () => {
    // A zero first year is not a 'grew from nothing' story, it is missing data.
    expect(deriveBauGrowth(pts({ 2024: 0, 2025: 100 }), 2025)).toBeNull();
  });

  it("returns null when the base year itself has no data", () => {
    expect(deriveBauGrowth(pts({ 2022: 100, 2023: 110 }), 2025)).toBeNull();
  });

  it("ignores years after the base year", () => {
    const without = deriveBauGrowth(pts({ 2023: 100, 2025: 400 }), 2025)!;
    const with2027 = deriveBauGrowth(pts({ 2023: 100, 2025: 400, 2027: 9999 }), 2025)!;
    expect(with2027.pct).toBeCloseTo(without.pct, 6);
    expect(with2027.toYear).toBe(2025);
  });
});

describe("resolveBauGrowthPct", () => {
  it("prefers the override, then the fallback, then 1", () => {
    expect(resolveBauGrowthPct(3, 2)).toBe(3);
    expect(resolveBauGrowthPct(undefined, 2)).toBe(2);
    expect(resolveBauGrowthPct(undefined, undefined)).toBe(1);
  });

  it("treats an explicit zero as zero, not as absent", () => {
    // The `||` bug this exists to prevent: a flat BAU is a legitimate premise.
    expect(resolveBauGrowthPct(0, 2)).toBe(0);
    expect(resolveBauGrowthPct(undefined, 0)).toBe(0);
  });

  /* The override field is free-text: `min`/`max` on a number input block the
     spinner, not typing, so the bound has to hold HERE — the one place both
     engines read the premise. A typed 1000000 was accepted and compounded every
     downstream figure into nonsense. */
  it("clamps an absurd premise to the bounds instead of compounding it", () => {
    expect(resolveBauGrowthPct(1_000_000, undefined)).toBe(BAU_GROWTH_MAX_PCT);
    expect(resolveBauGrowthPct(-500, undefined)).toBe(BAU_GROWTH_MIN_PCT);
    // and every plausible premise passes through untouched
    expect(resolveBauGrowthPct(7.46, undefined)).toBe(7.46);
    expect(resolveBauGrowthPct(-3.5, undefined)).toBe(-3.5);
  });

  it("falls through a non-finite premise rather than propagating NaN", () => {
    expect(resolveBauGrowthPct(Number.NaN, 2)).toBe(2);
    expect(resolveBauGrowthPct(undefined, Number.NaN)).toBe(1);
  });
});

/* One rate honestly annotates a COMBINED business-as-usual figure only when an
   override is set, because that override is what drives both engines. Two
   screens printed Scope 1's chain beside the combined tonnes; on the shipped
   inventories that read 2.8 %/yr while Scope 2 ran at 7.5. */
describe("describeBauPremise", () => {
  const g = (pct: number): DerivedGrowth => ({ pct, fromYear: 2021, toYear: 2027, years: 6 });

  it("reports both scopes' own rates, and that one number will not do", () => {
    const p = describeBauPremise(undefined, g(2.84), g(7.46));
    expect(p.s1Pct).toBeCloseTo(2.84, 9);
    expect(p.s2Pct).toBeCloseTo(7.46, 9);
    expect(p.single).toBe(false);
    expect(p.overridden).toBe(false);
  });

  it("an override IS one rate for both scopes", () => {
    const p = describeBauPremise(3.5, g(2.84), g(7.46));
    expect(p.s1Pct).toBe(3.5);
    expect(p.s2Pct).toBe(3.5);
    expect(p.single).toBe(true);
    expect(p.overridden).toBe(true);
  });

  it("a zero override is an override — a flat BAU on both scopes", () => {
    const p = describeBauPremise(0, g(2.84), g(7.46));
    expect(p.overridden).toBe(true);
    expect(p.single).toBe(true);
    expect(p.s1Pct).toBe(0);
  });

  it("collapses to one number when the two derived rates print the same", () => {
    expect(describeBauPremise(undefined, g(2.84), g(2.85)).single).toBe(true);
    expect(describeBauPremise(undefined, null, null).single).toBe(true);
  });

  it("shows the floor a scope with too few years will actually run on", () => {
    const p = describeBauPremise(undefined, g(2.84), null);
    expect(p.s1Pct).toBeCloseTo(2.84, 9);
    expect(p.s2Pct).toBe(1);
    expect(p.single).toBe(false);
  });
});

describe("scope1ActualSeries", () => {
  it("emits one point per year that has an inventory, with positive totals", () => {
    const s = scope1ActualSeries(DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR);
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s.map((p) => p.year)).toEqual([...s.map((p) => p.year)].sort((a, b) => a - b));
    for (const p of s) expect(p.totalT).toBeGreaterThan(0);
  });

  it("yields a derivable rate on the shipped inventory", () => {
    const d = deriveBauGrowth(
      scope1ActualSeries(DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR),
      DEFAULT_BASE_YEAR,
    );
    expect(d).not.toBeNull();
    // The fixture trends volumes up, but emission factors are year-aware, so the
    // rate is asserted as finite and sane rather than pinned to the 2.5% trend.
    expect(Number.isFinite(d!.pct)).toBe(true);
    expect(d!.toYear).toBe(DEFAULT_BASE_YEAR);
  });

  it("excludes sources flagged excluded", () => {
    const year = DEFAULT_BASE_YEAR;
    const all = scope1ActualSeries(DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR);
    const trimmed = scope1ActualSeries(
      { ...DEFAULT_COMBUSTION_BY_YEAR, [year]: DEFAULT_COMBUSTION_BY_YEAR[year].map((a) => ({ ...a, excluded: true })) },
      DEFAULT_REFRIGERATION_BY_YEAR,
    );
    const at = (s: YearPoint[]) => s.find((p) => p.year === year)!.totalT;
    expect(at(trimmed)).toBeLessThan(at(all));
  });
});

describe("scope2ActualSeries", () => {
  it("emits one point per year that has facilities", () => {
    const s = scope2ActualSeries({ 2024: [], 2025: [] });
    expect(s.map((p) => p.year)).toEqual([2024, 2025]);
    for (const p of s) expect(p.totalT).toBe(0);
  });
});

/* The boundary fix: the CAGR deriveBauGrowth reads off two endpoints is only
   honest when the source set is the same at both endpoints. Both scope
   entry points recompute the SAME endpoints (chosen by deriveBauGrowth,
   never reimplemented) restricted to the ids present at both. */
describe("deriveScope1Bau — like-for-like across a changed boundary", () => {
  it("excludes a source that joins mid-span from the rate", () => {
    const combustion: CombustionByYear = {
      2021: [mkAsset("a", "Genset", 1000)],
      2025: [mkAsset("a", "Genset", 1000), mkAsset("b", "Big new source", 500000)],
    };
    const refrigeration: RefrigerationByYear = { 2021: [], 2025: [] };

    const total = deriveBauGrowth(scope1ActualSeries(combustion, refrigeration), 2025)!;
    const d = deriveScope1Bau(combustion, refrigeration, 2025)!;

    expect(d.basis).toBe("like-for-like");
    expect(d.keptCount).toBe(1);
    expect(d.joined).toEqual(["Big new source"]);
    expect(d.left).toEqual([]);
    // "b" joining swamps the total-basis rate; restricting to "a" alone must
    // read very differently — this is the whole point of the fix.
    expect(d.pct).toBeLessThan(total.pct - 10);
  });

  it("excludes a source that leaves mid-span from the rate, the same way", () => {
    const combustion: CombustionByYear = {
      2021: [mkAsset("a", "Genset", 1000), mkAsset("b", "Old plant", 500000)],
      2025: [mkAsset("a", "Genset", 1000)],
    };
    const refrigeration: RefrigerationByYear = { 2021: [], 2025: [] };

    const total = deriveBauGrowth(scope1ActualSeries(combustion, refrigeration), 2025)!;
    const d = deriveScope1Bau(combustion, refrigeration, 2025)!;

    expect(d.basis).toBe("like-for-like");
    expect(d.keptCount).toBe(1);
    expect(d.joined).toEqual([]);
    expect(d.left).toEqual(["Old plant"]);
    // "b" leaving crashes the total-basis rate; "a" alone (unchanged volume)
    // must read far above it — a closure is excluded exactly like an opening.
    expect(d.pct).toBeGreaterThan(total.pct + 10);
  });

  it("is a no-op when the source set does not change: the rate equals the total basis exactly", () => {
    const combustion: CombustionByYear = {
      2021: [mkAsset("a", "Genset", 1000), mkAsset("b", "Boiler", 2000)],
      2025: [mkAsset("a", "Genset", 1500), mkAsset("b", "Boiler", 2600)],
    };
    const refrigeration: RefrigerationByYear = {
      2021: [mkSystem("r1", "Cold store", 40)],
      2025: [mkSystem("r1", "Cold store", 55)],
    };

    const total = deriveBauGrowth(scope1ActualSeries(combustion, refrigeration), 2025)!;
    const d = deriveScope1Bau(combustion, refrigeration, 2025)!;

    expect(d.basis).toBe("like-for-like");
    expect(d.joined).toEqual([]);
    expect(d.left).toEqual([]);
    expect(d.keptCount).toBe(3); // 2 combustion + 1 refrigeration
    expect(d.pct).toBe(total.pct);
  });

  it("falls back to the total basis, not to 1, when every source is new", () => {
    const combustion: CombustionByYear = {
      2021: [mkAsset("x", "Old-only asset", 1000)],
      2025: [mkAsset("y", "New-only asset", 2000)],
    };
    const refrigeration: RefrigerationByYear = { 2021: [], 2025: [] };

    const total = deriveBauGrowth(scope1ActualSeries(combustion, refrigeration), 2025)!;
    const d = deriveScope1Bau(combustion, refrigeration, 2025)!;

    expect(d.basis).toBe("total");
    expect(d.keptCount).toBe(0);
    expect(d.joined).toEqual(["New-only asset"]);
    expect(d.left).toEqual(["Old-only asset"]);
    expect(d.pct).toBe(total.pct);
  });

  it("falls back to the total basis when the intersection is non-empty but its first-year total is not positive", () => {
    // "a" is kept (present at both endpoints) but has zero volume at the
    // FROM year — the restricted first total is 0, not absent. "b" makes the
    // unrestricted from-year total positive (so deriveBauGrowth still picks
    // 2021 as fromYear) and then leaves, so it never appears as kept.
    const combustion: CombustionByYear = {
      2021: [mkAsset("a", "Kept but zero at first", 0), mkAsset("b", "Left source", 5000)],
      2025: [mkAsset("a", "Kept but zero at first", 1000)],
    };
    const refrigeration: RefrigerationByYear = { 2021: [], 2025: [] };

    const total = deriveBauGrowth(scope1ActualSeries(combustion, refrigeration), 2025)!;
    const d = deriveScope1Bau(combustion, refrigeration, 2025)!;

    expect(d.basis).toBe("total");
    expect(d.keptCount).toBe(1); // non-empty intersection — "a" is kept
    expect(d.joined).toEqual([]);
    expect(d.left).toEqual(["Left source"]);
    expect(d.pct).toBe(total.pct);
  });

  it("filters excluded sources at both endpoints before computing the boundary, matching the series builders", () => {
    // "b" is excluded at the base year. If the exclusion filter were missing
    // (or applied only inside scope1ActualSeries and not here), "b" would
    // show up as a source that JOINED — it is absent at 2021, present at
    // 2025 — even though it is filtered out of every footprint total.
    const combustion: CombustionByYear = {
      2021: [mkAsset("a", "Genset", 1000)],
      2025: [mkAsset("a", "Genset", 1200), { ...mkAsset("b", "Excluded huge source", 999999), excluded: true }],
    };
    const refrigeration: RefrigerationByYear = { 2021: [], 2025: [] };

    const d = deriveScope1Bau(combustion, refrigeration, 2025)!;

    expect(d.basis).toBe("like-for-like");
    expect(d.keptCount).toBe(1);
    expect(d.joined).toEqual([]);
    expect(d.left).toEqual([]);
  });

  it("intersects combustion and refrigeration in their own id spaces — a shared id string does not cross-contaminate", () => {
    // Both lists use the id "x", but they are different spaces: the
    // combustion "x" is present in both years (kept); the refrigeration "x" is
    // present only in 2021 (left). A boundary fix that flattened both id
    // spaces into one set would wrongly call the refrigeration "x" kept too
    // (because SOME "x" is present in both years), or wrongly drop the
    // combustion "x".
    const combustion: CombustionByYear = {
      2021: [mkAsset("x", "Shared-id combustion asset", 1000)],
      2025: [mkAsset("x", "Shared-id combustion asset", 1100)],
    };
    const refrigeration: RefrigerationByYear = {
      2021: [mkSystem("x", "Shared-id refrigeration system", 40)],
      2025: [],
    };

    const d = deriveScope1Bau(combustion, refrigeration, 2025)!;
    expect(d.keptCount).toBe(1);
    expect(d.joined).toEqual([]);
    expect(d.left).toEqual(["Shared-id refrigeration system"]);
  });

  it("reports keptCount, joined and left by name on the shipped fixture", () => {
    const d = deriveScope1Bau(DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR, DEFAULT_BASE_YEAR)!;
    expect(d.joined).toEqual(["Petrol LCVs"]);
    expect(d.left).toEqual([]);
    expect(d.keptCount).toBe(5); // genset, boiler, fleet-d + cold, hvac (both refrigeration systems, unchanged every year)
  });

  // Pinned to 2dp: this is the number the whole fix exists to produce, and a
  // future regression (e.g. a reintroduced total-basis CAGR) must fail loudly.
  it("measures the shipped fixture at 2.01 %/yr, like-for-like", () => {
    const d = deriveScope1Bau(DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR, DEFAULT_BASE_YEAR)!;
    expect(d.basis).toBe("like-for-like");
    expect(d.pct).toBeCloseTo(2.01, 2);
  });
});

describe("deriveScope2Bau — like-for-like across a changed boundary", () => {
  it("excludes a facility that joins mid-span from the rate", () => {
    const facilities: FacilitiesByYear = {
      2021: [mkFacility("f1", "Pune plant", 1_000_000)],
      2025: [mkFacility("f1", "Pune plant", 1_000_000), mkFacility("f2", "Island resort", 5_000_000)],
    };
    const total = deriveBauGrowth(scope2ActualSeries(facilities), 2025)!;
    const d = deriveScope2Bau(facilities, 2025)!;

    expect(d.basis).toBe("like-for-like");
    expect(d.keptCount).toBe(1);
    expect(d.joined).toEqual(["Island resort"]);
    expect(d.left).toEqual([]);
    expect(d.pct).toBeLessThan(total.pct - 10);
  });

  it("excludes a facility that leaves mid-span from the rate, the same way", () => {
    const facilities: FacilitiesByYear = {
      2021: [mkFacility("f1", "Pune plant", 1_000_000), mkFacility("f2", "Closed site", 5_000_000)],
      2025: [mkFacility("f1", "Pune plant", 1_000_000)],
    };
    const total = deriveBauGrowth(scope2ActualSeries(facilities), 2025)!;
    const d = deriveScope2Bau(facilities, 2025)!;

    expect(d.basis).toBe("like-for-like");
    expect(d.keptCount).toBe(1);
    expect(d.joined).toEqual([]);
    expect(d.left).toEqual(["Closed site"]);
    expect(d.pct).toBeGreaterThan(total.pct + 10);
  });

  it("is a no-op when the facility set does not change: the rate equals the total basis exactly", () => {
    const facilities: FacilitiesByYear = {
      2021: [mkFacility("f1", "Pune plant", 1_000_000), mkFacility("f2", "London office", 200_000)],
      2025: [mkFacility("f1", "Pune plant", 1_100_000), mkFacility("f2", "London office", 230_000)],
    };
    const total = deriveBauGrowth(scope2ActualSeries(facilities), 2025)!;
    const d = deriveScope2Bau(facilities, 2025)!;

    expect(d.basis).toBe("like-for-like");
    expect(d.joined).toEqual([]);
    expect(d.left).toEqual([]);
    expect(d.keptCount).toBe(2);
    expect(d.pct).toBe(total.pct);
  });

  it("falls back to the total basis, not to 1, when every facility is new", () => {
    const facilities: FacilitiesByYear = {
      2021: [mkFacility("f1", "Old-only site", 1_000_000)],
      2025: [mkFacility("f2", "New-only site", 2_000_000)],
    };
    const total = deriveBauGrowth(scope2ActualSeries(facilities), 2025)!;
    const d = deriveScope2Bau(facilities, 2025)!;

    expect(d.basis).toBe("total");
    expect(d.keptCount).toBe(0);
    expect(d.joined).toEqual(["New-only site"]);
    expect(d.left).toEqual(["Old-only site"]);
    expect(d.pct).toBe(total.pct);
  });

  it("reports keptCount, joined and left by name on the shipped fixture", () => {
    const d = deriveScope2Bau(DEFAULT_FACILITIES_BY_YEAR, SCOPE2_DEFAULT_BASE_YEAR)!;
    expect(d.joined).toEqual(["Island resort"]);
    expect(d.left).toEqual([]);
    expect(d.keptCount).toBe(2); // f-pune, f-london
  });

  // Pinned to 2dp: this is the number the whole fix exists to produce, and a
  // future regression must fail loudly.
  it("measures the shipped fixture at 2.11 %/yr, like-for-like", () => {
    const d = deriveScope2Bau(DEFAULT_FACILITIES_BY_YEAR, SCOPE2_DEFAULT_BASE_YEAR)!;
    expect(d.basis).toBe("like-for-like");
    expect(d.pct).toBeCloseTo(2.11, 2);
  });
});
