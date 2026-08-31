/* The BAU premise: an actual-emissions series off the year-wise inventories,
   and the CAGR that turns it into one growth rate. */
import { describe, expect, it } from "vitest";
import {
  BAU_GROWTH_MAX_PCT, BAU_GROWTH_MIN_PCT, deriveBauGrowth, describeBauPremise,
  resolveBauGrowthPct, scope1ActualSeries, scope2ActualSeries,
  type DerivedGrowth, type YearPoint,
} from "../bau";
import { DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR, DEFAULT_BASE_YEAR } from "../defaults";

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
