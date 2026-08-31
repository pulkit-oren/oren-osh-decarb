/* BAU growth is a premise, not a constant. Scope 2 half — and BOTH curves. */
import { describe, expect, it } from "vitest";
import { computeScope2 } from "../index";
import { DEFAULT_FACILITIES_BY_YEAR, DEFAULT_SCOPE2_LEVERS, DEFAULT_BASE_YEAR } from "@/lib/scope2/defaults";
import { resolveFacilities } from "@/lib/scope2/store-helpers";

// There is no flat facilities fixture — the shipped defaults are keyed by year,
// which is the whole premise of this feature. Resolve the base year.
const FACILITIES = resolveFacilities(DEFAULT_FACILITIES_BY_YEAR, DEFAULT_BASE_YEAR);

const run = (growthPct: number | undefined, fallbackPct?: number) =>
  computeScope2(
    FACILITIES,
    DEFAULT_SCOPE2_LEVERS,
    DEFAULT_BASE_YEAR,
    { bauGrowthPct: growthPct },
    fallbackPct,
  );

const at = (rows: { year: number; bau: number }[], year: number) =>
  rows.find((x) => x.year === year)!.bau;

describe("Scope 2 BAU growth", () => {
  it("makes 1% behave as 1% — the guard that lets BAU_GROWTH be deleted", () => {
    // Scope 2 IS gridLinked, so bau = baseTotalT x (1+g)^n x gridFactor(n) and
    // an absolute figure would be asserting the grid decline too. Dividing two
    // runs at the same year cancels gridFactor exactly, leaving the growth
    // ratio alone — so this is the honest form of "1% still means 1%".
    const y = DEFAULT_BASE_YEAR + 10;
    const flat = at(run(0).trajectoryLocation, y);
    const onePct = at(run(1).trajectoryLocation, y);
    expect(flat).toBeGreaterThan(0);
    expect(onePct / flat).toBeCloseTo(Math.pow(1.01, 10), 6);
  });

  it("a higher rate raises BAU on BOTH curves", () => {
    const low = run(1), high = run(6);
    const y = DEFAULT_BASE_YEAR + 10;
    expect(at(high.trajectoryLocation, y)).toBeGreaterThan(at(low.trajectoryLocation, y));
    // The market curve is the one Balance to target reads. A fallback threaded
    // into only one of the two call sites passes the location test and fails here.
    expect(at(high.trajectoryMarket, y)).toBeGreaterThan(at(low.trajectoryMarket, y));
  });

  it("scales BAU by exactly the growth ratio, holding the grid factor fixed", () => {
    const a = run(0), b = run(4);
    const y = DEFAULT_BASE_YEAR + 8;
    expect(at(b.trajectoryLocation, y) / at(a.trajectoryLocation, y)).toBeCloseTo(Math.pow(1.04, 8), 6);
  });

  it("treats an explicit zero as a flat premise, not as absent", () => {
    const zero = run(0), one = run(1);
    const y = DEFAULT_BASE_YEAR + 10;
    expect(at(zero.trajectoryLocation, y)).toBeLessThan(at(one.trajectoryLocation, y));
  });

  it("falls back to the derived rate, and the override wins over it", () => {
    const y = DEFAULT_BASE_YEAR + 8;
    const derived = run(undefined, 4);
    const explicit = run(4);
    expect(at(derived.trajectoryLocation, y)).toBeCloseTo(at(explicit.trajectoryLocation, y), 6);

    const overridden = run(1, 9);
    const justOne = run(1);
    expect(at(overridden.trajectoryLocation, y)).toBeCloseTo(at(justOne.trajectoryLocation, y), 6);
  });
});
