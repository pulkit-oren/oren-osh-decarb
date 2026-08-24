import { describe, it, expect } from "vitest";
import {
  distribute, unallocated, clampAllocation,
  weightsFor, computeAllocation, basisAvailability, explainAllocation,
  defaultBasis, reallocateForVolume,
} from "../allocate";
import type { Equipment } from "../types";

function eq(over: Partial<Equipment> & { id: string }): Equipment {
  return { name: over.id, unitCount: 1, remainingLife: 10, ...over };
}

/** The spec 4.3 worked example: 1,88,000 SCM across five machines. */
const BOILERS: Equipment[] = [
  eq({ id: "e1", name: "Boiler 1", capacity: 2.0, operatingHours: 6000 }),
  eq({ id: "e2", name: "Boiler 2", capacity: 1.0, operatingHours: 6000 }),
  eq({ id: "e3", name: "Kitchen range", capacity: 0.5, operatingHours: 4000 }),
  eq({ id: "e4", name: "Water heater", capacity: 0.5, operatingHours: 4000 }),
  eq({ id: "e5", name: "Genset", capacity: 1.0, operatingHours: 1000 }),
];

const FLEET: Equipment[] = [
  eq({ id: "f1", name: "City vans", unitCount: 3 }),
  eq({ id: "f2", name: "Highway vans", unitCount: 2 }),
];

describe("weightsFor", () => {
  it("load weights by capacity x operatingHours", () => {
    expect(weightsFor(BOILERS, "load")).toEqual([12000, 6000, 2000, 2000, 1000]);
  });

  it("capacity weights by capacity alone", () => {
    expect(weightsFor(BOILERS, "capacity")).toEqual([2.0, 1.0, 0.5, 0.5, 1.0]);
  });

  it("units weights by unitCount (D10)", () => {
    expect(weightsFor(FLEET, "units")).toEqual([3, 2]);
  });

  it("even weights by 1 - NOT by unitCount, which is what the old module did", () => {
    expect(weightsFor(FLEET, "even")).toEqual([1, 1]);
  });

  it("carryForward reuses prior proportions", () => {
    expect(weightsFor(FLEET, "carryForward", { f1: 900, f2: 100 })).toEqual([900, 100]);
  });

  it("carryForward falls back to even when the prior year is empty", () => {
    expect(weightsFor(FLEET, "carryForward", {})).toEqual([1, 1]);
  });
});

describe("computeAllocation", () => {
  it("splits the spec 4.3 example exactly, and the rows sum to the total", () => {
    const out = computeAllocation({ entryVolume: 188000, basis: "load", equipment: BOILERS });
    expect(out).toEqual({ e1: 98086.96, e2: 49043.48, e3: 16347.83, e4: 16347.83, e5: 8173.9 });
    const sum = Object.values(out).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(188000, 2);
  });

  it("splits a fleet by units", () => {
    expect(computeAllocation({ entryVolume: 120000, basis: "units", equipment: FLEET }))
      .toEqual({ f1: 72000, f2: 48000 });
  });

  it("consumes the whole total under every computed basis (invariant 1)", () => {
    for (const basis of ["load", "capacity", "units", "even"] as const) {
      const out = computeAllocation({ entryVolume: 188000, basis, equipment: BOILERS });
      expect(unallocated(188000, out), basis).toBe(0);
    }
  });

  it("returns the existing map untouched under manual", () => {
    const existing = { e1: 5, e2: 6 };
    expect(computeAllocation({ entryVolume: 188000, basis: "manual", equipment: BOILERS, existing }))
      .toEqual(existing);
  });

  it("returns zeros rather than NaN when a basis has no usable weights", () => {
    const bare = [eq({ id: "x1" }), eq({ id: "x2" })];
    expect(computeAllocation({ entryVolume: 1000, basis: "load", equipment: bare }))
      .toEqual({ x1: 0, x2: 0 });
  });
});

describe("basisAvailability", () => {
  it("enables load and capacity when every equipment has the values", () => {
    const a = basisAvailability(BOILERS);
    expect(a.load).toBeNull();
    expect(a.capacity).toBeNull();
  });

  it("disables load with a counted reason when running hours are missing", () => {
    const mixed = [...BOILERS.slice(0, 2), eq({ id: "e9", capacity: 1 })];
    expect(basisAvailability(mixed).load).toBe("1 equipment has no running hours");
    expect(basisAvailability(mixed).capacity).toBeNull();
  });

  it("pluralises the reason", () => {
    const bare = [eq({ id: "x1" }), eq({ id: "x2" }), eq({ id: "x3" })];
    expect(basisAvailability(bare).capacity).toBe("3 equipment have no capacity");
  });

  it("always enables units, even and manual", () => {
    const a = basisAvailability([eq({ id: "x1" })]);
    expect(a.units).toBeNull();
    expect(a.even).toBeNull();
    expect(a.manual).toBeNull();
  });

  it("disables carryForward when the prior year holds nothing", () => {
    expect(basisAvailability(FLEET, {}).carryForward).toBe("no allocation recorded for the prior year");
    expect(basisAvailability(FLEET, { f1: 10 }).carryForward).toBeNull();
  });
});

describe("explainAllocation", () => {
  it("agrees with computeAllocation on the same input (spec 4.3)", () => {
    const input = { entryVolume: 188000, basis: "load" as const, equipment: BOILERS, unit: "SCM" };
    const out = computeAllocation(input);
    const ex = explainAllocation(input);
    expect(ex).not.toBeNull();
    // The worked row must quote the SAME number computeAllocation produced.
    expect(ex!.row).toContain("98,086.96");
    expect(out.e1).toBe(98086.96);
  });

  it("renders the spec 4.3 shape: the unit beside both figures, and a real ×", () => {
    const ex = explainAllocation({ entryVolume: 188000, basis: "load", equipment: BOILERS, unit: "SCM" });
    // Spec 4.3's literal mockup:
    //   Each equipment gets a share of 1,88,000 SCM in proportion to capacity × running hours.
    //   Boiler 1 = 2 × 6,000 = 12,000 of 23,000 total → 42.6% → 98,086.96 SCM
    // (the mockup's 42.6% is its own arithmetic slip; we print the computed 52.2%)
    expect(ex!.formula).toBe(
      "Each equipment gets a share of 1,88,000 SCM in proportion to capacity × running hours.",
    );
    expect(ex!.row).toBe("Boiler 1 = 2 × 6,000 = 12,000 of 23,000 total → 52.2% → 98,086.96 SCM");
    // The multiplication sign is U+00D7, never an ASCII "x" (spec 4.3 mockup).
    expect(ex!.row).not.toContain(" x ");
    expect(ex!.formula).not.toContain(" x ");
  });

  it("omits the unit entirely when the caller does not supply one", () => {
    const ex = explainAllocation({ entryVolume: 188000, basis: "load", equipment: BOILERS });
    expect(ex!.formula).toContain("share of 1,88,000 in proportion");
    expect(ex!.row.endsWith("98,086.96")).toBe(true);
  });

  it("quotes the weight total, not a re-derived one", () => {
    const ex = explainAllocation({ entryVolume: 188000, basis: "load", equipment: BOILERS });
    expect(ex!.row).toContain("23,000");
  });

  it("explains the units basis in its own terms", () => {
    const ex = explainAllocation({ entryVolume: 120000, basis: "units", equipment: FLEET, unit: "L" });
    // Spec 5.2 mockup 2, verbatim.
    expect(ex!.formula).toBe("Each equipment gets a share of 1,20,000 L in proportion to number of units.");
    expect(ex!.row).toBe("City vans = 3 of 5 units → 60.0% → 72,000 L");
    expect(ex!.row).toContain("→"); // Ruling D: the spec 4.3 mockup uses an arrow, not ->
  });

  it("returns null under manual - there is no formula to explain", () => {
    expect(explainAllocation({ entryVolume: 1, basis: "manual", equipment: FLEET })).toBeNull();
  });
});

/* distribute / clampAllocation / unallocated were copied byte-for-byte out of
   the deleted lib/assets/allocate.ts, but only five of the ~31 tests that
   pinned them came across. The cases below are recovered from
   `git show b06d745^:lib/assets/__tests__/allocate.test.ts` and re-aimed at
   this module: they are previously-found-and-FIXED defects, so their repros
   guard code that still ships. F3 and F4 keep the names they were found under. */
describe("distribute / clampAllocation / unallocated are carried over unchanged", () => {
  it("distribute lets the last element absorb the rounding remainder", () => {
    expect(distribute(100, [1, 1, 1])).toEqual([33.33, 33.33, 33.34]);
  });

  it("distribute splits proportionally to weights", () => {
    expect(distribute(100, [1, 1, 2])).toEqual([25, 25, 50]);
  });

  it("distribute sums to the total despite rounding", () => {
    const out = distribute(100, [1, 1, 1]);
    expect(out.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("distribute returns zeros when every weight is zero", () => {
    expect(distribute(100, [0, 0])).toEqual([0, 0]);
  });

  it("distribute handles a single weight", () => {
    expect(distribute(3000, [5])).toEqual([3000]);
  });

  it("distribute rounds the total to cents and distributes THAT value exactly", () => {
    expect(distribute(100.005, [1, 1]).reduce((a, b) => a + b, 0)).toBeCloseTo(100.01, 5);
  });

  it("distribute sums exactly with a sub-cent total over three weights", () => {
    const out = distribute(99.995, [1, 1, 1]);
    expect(out.reduce((a, b) => a + b, 0)).toBe(100); // 99.995 rounds to 100.00
    expect(out.every(Number.isFinite)).toBe(true);
  });

  it("distribute never returns a negative element", () => {
    expect(distribute(0.01, [1, 1, 1]).every((v) => v >= 0)).toBe(true);
  });

  it("F3 — distribute clamps the final element at 0 rather than going negative", () => {
    // The exact repro: ten equal weights and a trailing zero over 5 paise. The
    // first ten each round UP past the total, so the remainder the last element
    // would have absorbed is negative.
    const out = distribute(0.05, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
    expect(out[out.length - 1]).toBe(0);
    expect(out.every((v) => v >= 0)).toBe(true);
  });

  it("distribute coerces NaN and negative weights to zero", () => {
    expect(distribute(100, [NaN, -5, 1])).toEqual([0, 0, 100]);
  });

  it("distribute stays finite with a NaN weight and still consumes the total", () => {
    const out = distribute(100, [1, NaN, 1]);
    expect(out.every(Number.isFinite)).toBe(true);
    expect(out.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("F4 — distribute sanitises a NaN total to zeros instead of propagating it", () => {
    expect(distribute(NaN, [1, 1, 1]).every((v) => v === 0)).toBe(true);
  });

  it('F4 — distribute sanitises a non-numeric total like "1,000" to zeros', () => {
    // Number("1,000") is NaN — a thousands separator pasted into a volume field
    // is the way this reaches production.
    expect(distribute(Number("1,000"), [1, 1, 1]).every((v) => v === 0)).toBe(true);
  });

  it("F4 — distribute sanitises a negative total to zeros", () => {
    expect(distribute(-100, [1, 1, 1]).every((v) => v === 0)).toBe(true);
  });

  it("F3 — computeAllocation never returns a negative allocation", () => {
    const tiny = [eq({ id: "c-0" }), eq({ id: "c-1" }), eq({ id: "c-2" }), eq({ id: "c-3" })];
    const out = computeAllocation({ entryVolume: 0.02, basis: "even", equipment: tiny });
    expect(Object.values(out).every((v) => v >= 0)).toBe(true);
    expect(out["c-3"]).toBe(0); // previously -0.01
  });

  it("carryForward reuses prior PROPORTIONS, not prior absolute volumes", () => {
    expect(computeAllocation({
      entryVolume: 2000, basis: "carryForward", equipment: FLEET,
      previous: { f1: 750, f2: 250 }, // 75/25 of a 1,000 L prior year
    })).toEqual({ f1: 1500, f2: 500 });
  });

  it("clampAllocation scales an overshoot back proportionally", () => {
    expect(clampAllocation(100, { a: 150, b: 50 })).toEqual({ a: 75, b: 25 });
  });

  it("clampAllocation leaves an under- or exactly-allocated map alone", () => {
    expect(clampAllocation(3000, { a: 1800 })).toEqual({ a: 1800 });
    expect(clampAllocation(3000, { a: 1800, b: 1200 })).toEqual({ a: 1800, b: 1200 });
  });

  it("clampAllocation handles a single over-allocated row and an empty map", () => {
    expect(clampAllocation(1000, { a: 5000 })).toEqual({ a: 1000 });
    expect(clampAllocation(1000, {})).toEqual({});
  });

  it("unallocated reports the remainder, and zero for a full allocation", () => {
    expect(unallocated(3000, { a: 1800 })).toBe(1200);
    expect(unallocated(3000, { a: 1800, b: 1200 })).toBe(0);
    expect(unallocated(3000, {})).toBe(3000);
  });

  it("unallocated is never negative", () => {
    expect(unallocated(100, { a: 150 })).toBe(0);
  });
});

/* Ruling V / W — the two functions the composed system was missing. */
describe("defaultBasis (Ruling W)", () => {
  it("prefers load when every machine has a capacity and running hours", () => {
    expect(defaultBasis(BOILERS)).toBe("load");
  });

  it("falls to capacity when only the running hours are missing", () => {
    expect(defaultBasis([eq({ id: "a", capacity: 2 }), eq({ id: "b", capacity: 1 })]))
      .toBe("capacity");
  });

  it("falls to units for the shape every real source starts in", () => {
    // mintFirstEquipment records neither a capacity nor running hours, so this
    // — not BOILERS — is what the first "Add equipment" click actually meets.
    expect(defaultBasis(FLEET)).toBe("units");
  });

  it("never returns a basis whose weights are all zero", () => {
    const bare = [eq({ id: "x1" }), eq({ id: "x2" })];
    const b = defaultBasis(bare);
    expect(weightsFor(bare, b).reduce((a, c) => a + c, 0)).toBeGreaterThan(0);
  });

  it("never returns `even` — it is a basis a user picks, not a silent fallback", () => {
    // Spec 4.1: silently falling back to `even` is how the shipped version made
    // a wrong split look computed. `even` is ALWAYS available, so an order that
    // listed it would be reached for the moment a capacity went missing.
    const bare = [eq({ id: "x1" }), eq({ id: "x2" })];
    expect(defaultBasis(bare)).not.toBe("even");
    expect(defaultBasis(FLEET)).not.toBe("even");
    expect(defaultBasis(BOILERS)).not.toBe("even");
  });
});

describe("reallocateForVolume (Ruling V)", () => {
  it("recomputes a computed basis against the NEW volume", () => {
    expect(reallocateForVolume({ entryVolume: 250000, basis: "units", equipment: FLEET, existing: { f1: 0, f2: 0 } }))
      .toEqual({ f1: 150000, f2: 100000 });
  });

  it("scales a manual map back when the volume shrinks below it", () => {
    expect(reallocateForVolume({ entryVolume: 100, basis: "manual", equipment: FLEET, existing: { f1: 150, f2: 50 } }))
      .toEqual({ f1: 75, f2: 25 });
  });

  it("leaves a manual under-allocation standing when the volume grows", () => {
    // Invariant 2: a remainder under `manual` is the user's deliberate
    // statement that some volume is not on any machine yet. Recomputing would
    // overwrite their arithmetic; clamping preserves it.
    expect(reallocateForVolume({ entryVolume: 5000, basis: "manual", equipment: FLEET, existing: { f1: 600, f2: 400 } }))
      .toEqual({ f1: 600, f2: 400 });
  });

  it("returns an empty map when there is no equipment left to allocate onto", () => {
    // Ruling K: `equipment` is optional, so this can be reached. Under manual
    // the clamp alone would hand back a map of ids that no longer exist.
    expect(reallocateForVolume({ entryVolume: 100, basis: "units", equipment: [] })).toEqual({});
    expect(reallocateForVolume({ entryVolume: 100, basis: "manual", equipment: [], existing: { gone: 50 } }))
      .toEqual({});
  });
});
