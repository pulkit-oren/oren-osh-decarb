import { describe, it, expect } from "vitest";
import {
  distribute, unallocated, clampAllocation,
  weightsFor, computeAllocation, basisAvailability, explainAllocation,
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

describe("distribute / clampAllocation / unallocated are carried over unchanged", () => {
  it("distribute lets the last element absorb the rounding remainder", () => {
    expect(distribute(100, [1, 1, 1])).toEqual([33.33, 33.33, 33.34]);
  });

  it("distribute never returns a negative element", () => {
    expect(distribute(0.01, [1, 1, 1]).every((v) => v >= 0)).toBe(true);
  });

  it("distribute coerces NaN and negative weights to zero", () => {
    expect(distribute(100, [NaN, -5, 1])).toEqual([0, 0, 100]);
  });

  it("clampAllocation scales an overshoot back proportionally", () => {
    expect(clampAllocation(100, { a: 150, b: 50 })).toEqual({ a: 75, b: 25 });
  });

  it("unallocated is never negative", () => {
    expect(unallocated(100, { a: 150 })).toBe(0);
  });
});
