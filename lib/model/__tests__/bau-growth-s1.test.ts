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

/* The premise split: Scope 1 and Scope 2 grow at different rates, so each
   carries its own override. The scope fields are what the Assumptions panel
   writes; `bauGrowthPct` is what scenarios saved before the split carry, and it
   has to keep driving both scopes or every one of them changes answer on
   upgrade. */
describe("Scope 1 BAU growth · per-scope override", () => {
  const runWith = (assumptions: Partial<typeof DEFAULT_SETTINGS.assumptions>, fallbackPct?: number) =>
    compute(
      DEFAULT_ASSETS,
      DEFAULT_SYSTEMS,
      { ...DEFAULT_SETTINGS, assumptions: { ...DEFAULT_SETTINGS.assumptions, ...assumptions } },
      DEFAULT_BASE_YEAR,
      fallbackPct,
    );
  const ratioOver10 = (r: ReturnType<typeof compute>) =>
    bauAt(r, DEFAULT_BASE_YEAR + 10) / bauAt(r, DEFAULT_BASE_YEAR);

  it("grows at the Scope 1 rate when one is set", () => {
    expect(ratioOver10(runWith({ bauGrowthS1Pct: 5 }))).toBeCloseTo(Math.pow(1.05, 10), 6);
  });

  it("ignores the Scope 2 rate entirely", () => {
    // The bug this exists to catch: one shared field read by both engines, so
    // typing a Scope 2 rate moves the Scope 1 curve too.
    expect(ratioOver10(runWith({ bauGrowthS2Pct: 9 }, 3))).toBeCloseTo(Math.pow(1.03, 10), 6);
  });

  it("prefers its own rate over one saved for both scopes", () => {
    expect(ratioOver10(runWith({ bauGrowthS1Pct: 2, bauGrowthPct: 9 }))).toBeCloseTo(Math.pow(1.02, 10), 6);
  });

  it("still honours a rate saved for both scopes before the split", () => {
    expect(ratioOver10(runWith({ bauGrowthPct: 6 }))).toBeCloseTo(Math.pow(1.06, 10), 6);
  });

  it("falls back to its derived rate when only Scope 2 is overridden", () => {
    expect(ratioOver10(runWith({ bauGrowthS2Pct: 9 }, 4))).toBeCloseTo(Math.pow(1.04, 10), 6);
  });
});
