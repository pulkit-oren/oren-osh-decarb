import { describe, expect, it } from "vitest";
import { clampAllocation, computeAllocation, distribute, unallocated } from "../allocate";
import type { Asset, WeightAttribute } from "../types";

const asset = (id: string, over: Partial<Asset> = {}): Asset => ({
  id, name: id, buId: "bu-0", category: "stationary",
  unitCount: 1, remainingLife: 10, opex: 0, ...over,
});

describe("distribute", () => {
  it("splits proportionally to weights", () => {
    expect(distribute(100, [1, 1, 2])).toEqual([25, 25, 50]);
  });

  it("always sums to the total despite rounding", () => {
    const out = distribute(100, [1, 1, 1]);
    expect(out.reduce((a, b) => a + b, 0)).toBe(100);
    expect(out[2]).toBeCloseTo(33.34, 5);
  });

  it("returns zeros when every weight is zero", () => {
    expect(distribute(100, [0, 0])).toEqual([0, 0]);
  });

  it("handles a single weight", () => {
    expect(distribute(3000, [5])).toEqual([3000]);
  });

  it("rounds the total to cents and distributes that rounded value exactly", () => {
    const out = distribute(100.005, [1, 1]);
    const sum = out.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100.01, 5);
  });

  it("maintains exact sum with sub-cent total and three weights", () => {
    const out = distribute(99.995, [1, 1, 1]);
    const sum = out.reduce((a, b) => a + b, 0);
    expect(sum).toBe(100); // 99.995 rounded to cents is 100.00
    expect(Number.isFinite(out[0]) && Number.isFinite(out[1]) && Number.isFinite(out[2])).toBe(true);
  });

  it("returns all-finite output even with NaN in weights", () => {
    const out = distribute(100, [1, NaN, 1]);
    expect(out.every(Number.isFinite)).toBe(true);
    expect(out.reduce((a, b) => a + b, 0)).toBe(100);
  });

  describe("F3 — the last element is never negative", () => {
    it("clamps the final element at 0 instead of going negative (exact repro)", () => {
      const out = distribute(0.05, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
      expect(out[out.length - 1]).toBe(0);
      expect(out.every((v) => v >= 0)).toBe(true);
    });
  });

  describe("F4 — a non-finite or negative total is sanitized to 0", () => {
    it("returns all zeros for a NaN total instead of propagating NaN", () => {
      const out = distribute(NaN, [1, 1, 1]);
      expect(out.every((v) => v === 0)).toBe(true);
    });

    it('sanitizes a non-numeric total like "1,000" to 0', () => {
      const out = distribute(Number("1,000"), [1, 1, 1]); // Number("1,000") is NaN
      expect(out.every((v) => v === 0)).toBe(true);
    });

    it("sanitizes a negative total to 0", () => {
      const out = distribute(-100, [1, 1, 1]);
      expect(out.every((v) => v === 0)).toBe(true);
    });
  });
});

describe("computeAllocation — F3: no negative last element (exact repro)", () => {
  it("never returns a negative allocation for a tiny entry volume over 4 even assets", () => {
    const out = computeAllocation({
      entryVolume: 0.02, basis: "even",
      assets: [asset("c-0"), asset("c-1"), asset("c-2"), asset("c-3")],
    });
    expect(Object.values(out).every((v) => v >= 0)).toBe(true);
    expect(out["c-3"]).toBe(0); // previously -0.01
  });
});

describe("computeAllocation — even", () => {
  it("is equal PER UNIT, not per asset", () => {
    const out = computeAllocation({
      entryVolume: 6000, basis: "even",
      assets: [asset("a-0", { unitCount: 5 }), asset("a-1", { unitCount: 1 })],
    });
    expect(out).toEqual({ "a-0": 5000, "a-1": 1000 });
  });
});

describe("computeAllocation — weighted", () => {
  it("weights by rated capacity", () => {
    const out = computeAllocation({
      entryVolume: 3000, basis: "weighted", weightAttribute: "ratedCapacity",
      assets: [asset("a-0", { ratedCapacity: 1000 }), asset("a-1", { ratedCapacity: 500 })],
    });
    expect(out).toEqual({ "a-0": 2000, "a-1": 1000 });
  });

  it("falls back to unitCount when the attribute is missing", () => {
    const out = computeAllocation({
      entryVolume: 3000, basis: "weighted", weightAttribute: "ratedCapacity",
      assets: [asset("a-0", { unitCount: 2 }), asset("a-1", { unitCount: 1 })],
    });
    expect(out).toEqual({ "a-0": 2000, "a-1": 1000 });
  });

  it("weights by operating hours from tier2", () => {
    const out = computeAllocation({
      entryVolume: 900, basis: "weighted", weightAttribute: "operatingHours",
      assets: [
        asset("a-0", { tier2: { operatingHoursPerYear: 2000 } }),
        asset("a-1", { tier2: { operatingHoursPerYear: 1000 } }),
      ],
    });
    expect(out).toEqual({ "a-0": 600, "a-1": 300 });
  });

  it("guards against invalid weightAttribute by falling back to unitCount", () => {
    const out = computeAllocation({
      entryVolume: 3000, basis: "weighted", weightAttribute: "bogus" as WeightAttribute,
      assets: [asset("a-0", { unitCount: 2 }), asset("a-1", { unitCount: 1 })],
    });
    expect(Object.values(out).every(Number.isFinite)).toBe(true);
    expect(Object.values(out).reduce((a, b) => a + b, 0)).toBe(3000);
    expect(out).toEqual({ "a-0": 2000, "a-1": 1000 });
  });
});

describe("computeAllocation — carryForward", () => {
  it("reuses previous proportions, not previous absolute volumes", () => {
    const out = computeAllocation({
      entryVolume: 2000, basis: "carryForward",
      assets: [asset("a-0"), asset("a-1")],
      previous: { "a-0": 750, "a-1": 250 }, // 75/25 of a 1000 L prior year
    });
    expect(out).toEqual({ "a-0": 1500, "a-1": 500 });
  });

  it("falls back to even when there is no previous split", () => {
    const out = computeAllocation({
      entryVolume: 1000, basis: "carryForward",
      assets: [asset("a-0"), asset("a-1")],
    });
    expect(out).toEqual({ "a-0": 500, "a-1": 500 });
  });
});

describe("computeAllocation — manual", () => {
  it("returns the existing map untouched", () => {
    const existing = { "a-0": 123 };
    const out = computeAllocation({
      entryVolume: 999, basis: "manual", assets: [asset("a-0")], existing,
    });
    expect(out).toEqual(existing);
  });

  it("returns an empty map when there is no existing allocation", () => {
    expect(computeAllocation({ entryVolume: 999, basis: "manual", assets: [] })).toEqual({});
  });
});

describe("computeAllocation — degenerate inputs", () => {
  it("returns an empty map for no assets", () => {
    expect(computeAllocation({ entryVolume: 100, basis: "even", assets: [] })).toEqual({});
  });
});

describe("unallocated", () => {
  it("reports the remainder", () => {
    expect(unallocated(3000, { "a-0": 1800 })).toBe(1200);
  });

  it("is zero for a full allocation", () => {
    expect(unallocated(3000, { "a-0": 1800, "a-1": 1200 })).toBe(0);
  });

  it("never goes negative", () => {
    expect(unallocated(1000, { "a-0": 5000 })).toBe(0);
  });

  it("is the full volume when nothing is allocated", () => {
    expect(unallocated(3000, {})).toBe(3000);
  });
});

describe("clampAllocation", () => {
  it("leaves an under-allocation alone", () => {
    expect(clampAllocation(3000, { "a-0": 1800 })).toEqual({ "a-0": 1800 });
  });

  it("leaves an exact allocation alone", () => {
    expect(clampAllocation(3000, { "a-0": 1800, "a-1": 1200 }))
      .toEqual({ "a-0": 1800, "a-1": 1200 });
  });

  it("scales an over-allocation back down to the entry volume", () => {
    const out = clampAllocation(3000, { "a-0": 3000, "a-1": 3000 });
    expect(out).toEqual({ "a-0": 1500, "a-1": 1500 });
    expect(Object.values(out).reduce((a, b) => a + b, 0)).toBe(3000);
  });

  it("handles a single over-allocated asset", () => {
    expect(clampAllocation(1000, { "a-0": 5000 })).toEqual({ "a-0": 1000 });
  });

  it("returns an empty map unchanged", () => {
    expect(clampAllocation(1000, {})).toEqual({});
  });
});
