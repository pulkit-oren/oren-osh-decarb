import { describe, it, expect } from "vitest";
import { baselineScope1 } from "../baseline";
import { resolveEquipment } from "@/lib/equipment/resolve";
import type { CombustionAsset } from "../types";

const entry = (over: Partial<CombustionAsset> = {}): CombustionAsset => ({
  id: "e-1",
  name: "Boiler diesel",
  category: "stationary",
  fuelType: "diesel",
  annualVolume: 1000,
  unit: "L",
  opex: 500,
  remainingLife: 10,
  unitCount: 1,
  ...over,
});

/** Roll-up: what the fixed consumers should do — sum every row whose
 *  sourceEntryId matches the entry, never `.find()` by id. */
function rollUpFor(perCombustion: { sourceEntryId: string; co2eT: number }[], entryId: string): number {
  return perCombustion
    .filter((p) => p.sourceEntryId === entryId)
    .reduce((s, p) => s + p.co2eT, 0);
}

describe("baseline.ts — perCombustion.sourceEntryId and the roll-up it enables", () => {
  it("a part-allocated entry's per-entry roll-up equals the same entry's full unallocated emissions", () => {
    const e = entry({
      equipment: [{ id: "a-1", name: "a-1", unitCount: 1, remainingLife: 10 }],
      allocations: { "a-1": 300 }, // partial: 300 of 1000, remainder 700
    });

    const resolved = resolveEquipment([e]);
    const resolvedBaseline = baselineScope1(resolved, []);
    const rolledUp = rollUpFor(resolvedBaseline.perCombustion, "e-1");

    // The same entry, never resolved, run through the engine whole.
    const unallocated = entry({ equipment: undefined, allocations: undefined });
    const unallocatedBaseline = baselineScope1([unallocated], []);

    expect(rolledUp).toBeCloseTo(unallocatedBaseline.perCombustion[0].co2eT, 6);
  });

  it("every resolved row carries sourceEntryId, including the remainder", () => {
    const e = entry({
      equipment: [{ id: "a-1", name: "a-1", unitCount: 1, remainingLife: 10 }],
      allocations: { "a-1": 300 },
    });
    const resolved = resolveEquipment([e]);
    const b = baselineScope1(resolved, []);
    expect(b.perCombustion.length).toBeGreaterThan(1);
    expect(b.perCombustion.every((p) => p.sourceEntryId === "e-1")).toBe(true);
  });

  it("an unallocated entry (never passed through the resolver) still resolves to its own emissions via the same roll-up — proving the `?? a.id` fallback", () => {
    const e = entry();
    const b = baselineScope1([e], []);
    const rolledUp = rollUpFor(b.perCombustion, e.id);
    expect(rolledUp).toBeCloseTo(b.perCombustion[0].co2eT, 6);
    expect(b.perCombustion[0].sourceEntryId).toBe(e.id);
  });
});
