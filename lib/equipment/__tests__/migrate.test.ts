import { describe, it, expect } from "vitest";
import { migrateEquipment } from "../migrate";
import type { CombustionAsset } from "@/lib/model/types";

/** A pre-migration entry, shaped as it sits in persisted localStorage. */
function legacy(over: Record<string, unknown> = {}): CombustionAsset {
  return {
    id: "c-1", name: "DG Set", category: "stationary", fuelType: "diesel",
    unit: "L", annualVolume: 9572631.3, opex: 22500000,
    remainingLife: 10, unitCount: 30, endUse: "process",
    ...over,
  } as unknown as CombustionAsset;
}

describe("migrateEquipment", () => {
  it("mints one equipment reusing the entry id, so lever keys survive", () => {
    const out = migrateEquipment({ 2025: [legacy()] });
    expect(out[2025][0].equipment).toHaveLength(1);
    expect(out[2025][0].equipment![0].id).toBe("c-1");
  });

  it("carries remainingLife, endUse and unitCount down onto the equipment", () => {
    const eq = migrateEquipment({ 2025: [legacy()] })[2025][0].equipment![0];
    expect(eq.remainingLife).toBe(10);
    expect(eq.endUse).toBe("process");
    expect(eq.unitCount).toBe(30);
  });

  it("allocates the whole volume to that one equipment", () => {
    const e = migrateEquipment({ 2025: [legacy()] })[2025][0];
    expect(e.allocations).toEqual({ "c-1": 9572631.3 });
  });

  it("defaults a missing remainingLife to 10 and a missing unitCount to 1", () => {
    const eq = migrateEquipment({
      2025: [legacy({ remainingLife: undefined, unitCount: undefined })],
    })[2025][0].equipment![0];
    expect(eq.remainingLife).toBe(10);
    expect(eq.unitCount).toBe(1);
  });

  it("is idempotent - an entry that already has equipment is untouched", () => {
    const once = migrateEquipment({ 2025: [legacy()] });
    const twice = migrateEquipment(once);
    expect(twice[2025][0].equipment).toEqual(once[2025][0].equipment);
    expect(twice[2025][0].equipment).toHaveLength(1);
  });

  it("discards a shipped assetAllocations map rather than translating it", () => {
    const e = migrateEquipment({
      2025: [legacy({
        allocationMode: "byAsset",
        assetAllocations: { "a-9": { volume: 500 } },
        weightAttribute: "unitCount",
      })],
    })[2025][0] as unknown as Record<string, unknown>;
    expect(e.allocationMode).toBeUndefined();
    expect(e.assetAllocations).toBeUndefined();
    expect(e.weightAttribute).toBeUndefined();
    expect(e.allocations).toEqual({ "c-1": 9572631.3 });
  });

  // Ruling A: these are absent on a RAW source. resolveEquipment stamps them
  // back onto resolved rows, which is what keeps the model consumers working.
  it("drops the source-level fields that moved down", () => {
    const e = migrateEquipment({ 2025: [legacy()] })[2025][0] as unknown as Record<string, unknown>;
    expect(e.remainingLife).toBeUndefined();
    expect(e.unitCount).toBeUndefined();
    expect(e.endUse).toBeUndefined();
  });

  it("leaves capacityUnit unset - no capacities exist yet", () => {
    expect(migrateEquipment({ 2025: [legacy()] })[2025][0].capacityUnit).toBeUndefined();
  });

  it("survives malformed persisted entries without throwing", () => {
    const out = migrateEquipment({
      2025: [
        legacy({ annualVolume: "not a number" }),
        legacy({ id: "c-2", remainingLife: null, unitCount: -4 }),
      ],
    });
    expect(out[2025][0].allocations).toEqual({ "c-1": 0 });
    expect(out[2025][1].equipment![0].remainingLife).toBe(10);
    expect(out[2025][1].equipment![0].unitCount).toBe(1);
  });

  it("drops a literal null in a year's array instead of throwing on it", () => {
    // Persisted JSON is untrusted: a hand-edited blob can hold a null, and
    // reading `.equipment` off it threw before anything could coerce it — which
    // takes the whole app's hydrate down, not just that one source.
    const out = migrateEquipment({
      2025: [legacy(), null, legacy({ id: "c-2" })] as unknown as CombustionAsset[],
    });
    expect(out[2025]).toHaveLength(2);
    expect(out[2025].map((e) => e.id)).toEqual(["c-1", "c-2"]);
  });

  it("migrates every year independently", () => {
    const out = migrateEquipment({ 2024: [legacy()], 2025: [legacy()] });
    expect(out[2024][0].equipment![0].id).toBe("c-1");
    expect(out[2025][0].equipment![0].id).toBe("c-1");
  });
});
