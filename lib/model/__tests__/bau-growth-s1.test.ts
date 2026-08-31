/* BAU growth is a premise, not a constant. Scope 1 half. */
import { describe, expect, it } from "vitest";
import { compute } from "../index";
import { DEFAULT_ASSETS, DEFAULT_SYSTEMS, DEFAULT_SETTINGS, DEFAULT_BASE_YEAR } from "@/lib/defaults";

const run = (growthPct: number | undefined, fallbackPct?: number) =>
  compute(
    DEFAULT_ASSETS,
    DEFAULT_SYSTEMS,
    { ...DEFAULT_SETTINGS, assumptions: { ...DEFAULT_SETTINGS.assumptions, bauGrowthPct: growthPct } },
    DEFAULT_BASE_YEAR,
    fallbackPct,
  );

const bauAt = (r: ReturnType<typeof compute>, year: number) =>
  r.trajectory.find((x) => x.year === year)!.bau;

describe("Scope 1 BAU growth", () => {
  it("reproduces the old hardcoded 1% exactly when told 1", () => {
    // The regression guard that makes deleting BAU_GROWTH safe.
    const r = run(1);
    const base = bauAt(r, DEFAULT_BASE_YEAR);
    expect(bauAt(r, DEFAULT_BASE_YEAR + 10)).toBeCloseTo(base * Math.pow(1.01, 10), 6);
  });

  it("grows at the rate given", () => {
    const r = run(5);
    const base = bauAt(r, DEFAULT_BASE_YEAR);
    expect(bauAt(r, DEFAULT_BASE_YEAR + 10)).toBeCloseTo(base * Math.pow(1.05, 10), 6);
  });

  it("holds BAU flat at zero growth rather than treating 0 as absent", () => {
    const r = run(0);
    expect(bauAt(r, DEFAULT_BASE_YEAR + 10)).toBeCloseTo(bauAt(r, DEFAULT_BASE_YEAR), 6);
  });

  it("falls back to the caller's derived rate when no override is set", () => {
    const r = run(undefined, 3);
    const base = bauAt(r, DEFAULT_BASE_YEAR);
    expect(bauAt(r, DEFAULT_BASE_YEAR + 10)).toBeCloseTo(base * Math.pow(1.03, 10), 6);
  });

  it("prefers the override over the derived rate", () => {
    const r = run(2, 9);
    const base = bauAt(r, DEFAULT_BASE_YEAR);
    expect(bauAt(r, DEFAULT_BASE_YEAR + 10)).toBeCloseTo(base * Math.pow(1.02, 10), 6);
  });

  it("defaults to 1% when neither is given", () => {
    const r = run(undefined, undefined);
    const base = bauAt(r, DEFAULT_BASE_YEAR);
    expect(bauAt(r, DEFAULT_BASE_YEAR + 10)).toBeCloseTo(base * Math.pow(1.01, 10), 6);
  });
});
