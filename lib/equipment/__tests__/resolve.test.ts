import { describe, it, expect } from "vitest";
import { resolveEquipment, isUnallocatedId } from "../resolve";
import type { CombustionAsset } from "@/lib/model/types";
import type { Equipment } from "../types";

function eq(id: string, over: Partial<Equipment> = {}): Equipment {
  return { id, name: id, unitCount: 1, remainingLife: 10, ...over };
}

function source(over: Partial<CombustionAsset> = {}): CombustionAsset {
  return {
    id: "c-1", name: "PNG boiler", category: "stationary", fuelType: "png",
    unit: "m3", annualVolume: 180000, opex: 9000000, bu: "Pune",
    equipment: [eq("e1", { name: "Boiler 1", unitCount: 2, remainingLife: 12 }),
                eq("e2", { name: "Boiler 2", unitCount: 3, remainingLife: 8 })],
    allocations: { e1: 108000, e2: 72000 },
    ...over,
  } as CombustionAsset;
}

describe("resolveEquipment", () => {
  it("emits one row per equipment, keyed by equipment id", () => {
    const rows = resolveEquipment([source()]);
    expect(rows.map((r) => r.id)).toEqual(["e1", "e2"]);
  });

  it("stamps sourceEntryId on every row so roll-ups can recover the source", () => {
    expect(resolveEquipment([source()]).every((r) => r.sourceEntryId === "c-1")).toBe(true);
  });

  it("takes name, remainingLife, endUse and unitCount from the equipment", () => {
    const [a, b] = resolveEquipment([source()]);
    expect(a.name).toBe("Boiler 1");
    expect(a.equipment[0].remainingLife).toBe(12);
    expect(a.equipment[0].unitCount).toBe(2);
    expect(b.equipment[0].unitCount).toBe(3);
  });

  it("stamps remainingLife, unitCount and endUse FLAT on the row (Ruling A)", () => {
    const [a, b] = resolveEquipment([source()]);
    // The nine model consumers read these flat; equipment[0] is the truth,
    // the flat copy is what keeps them from being rewritten.
    expect(a.remainingLife).toBe(12);
    expect(a.unitCount).toBe(2);
    expect(b.unitCount).toBe(3);
    expect(b.remainingLife).toBe(8);
  });

  it("inherits fuelType, unit and bu from the source", () => {
    const [a] = resolveEquipment([source()]);
    expect(a.fuelType).toBe("png");
    expect(a.unit).toBe("m3");
    expect(a.bu).toBe("Pune");
  });

  it("VOLUME is invariant to the split (invariant 4)", () => {
    const split = resolveEquipment([source()]);
    const whole = resolveEquipment([source({
      equipment: [eq("e1")], allocations: { e1: 180000 },
    })]);
    const sum = (rs: CombustionAsset[]) => rs.reduce((s, r) => s + r.annualVolume, 0);
    expect(sum(split)).toBe(180000);
    expect(sum(whole)).toBe(180000);
  });

  it("SPEND is invariant to the split (invariant 6) - this FAILS on the shipped resolver", () => {
    const rows = resolveEquipment([source()]);
    const spend = rows.reduce((s, r) => s + r.opex, 0);
    expect(spend).toBeCloseTo(9000000, 2);
    // and it is apportioned by volume share, not copied
    expect(rows[0].opex).toBeCloseTo(5400000, 2); // 108000/180000
    expect(rows[1].opex).toBeCloseTo(3600000, 2); //  72000/180000
  });

  it("gives every row the same fossil unit price, since it is the same fuel", () => {
    const rows = resolveEquipment([source()]);
    const price = (r: CombustionAsset) => r.opex / r.annualVolume;
    expect(price(rows[0])).toBeCloseTo(price(rows[1]), 6);
  });

  it("emits a remainder row when the allocation under-covers (invariant 2)", () => {
    const rows = resolveEquipment([source({ allocations: { e1: 100000, e2: 50000 } })]);
    expect(rows).toHaveLength(3);
    const rem = rows[2];
    expect(isUnallocatedId(rem.id)).toBe(true);
    expect(rem.annualVolume).toBe(30000);
    expect(rem.opex).toBeCloseTo(1500000, 2); // 30000/180000 of 90,00,000
  });

  it("keeps spend invariant even with a remainder", () => {
    const rows = resolveEquipment([source({ allocations: { e1: 100000, e2: 50000 } })]);
    expect(rows.reduce((s, r) => s + r.opex, 0)).toBeCloseTo(9000000, 2);
  });

  it("scales an overshoot back rather than over-allocating (invariant 3)", () => {
    const rows = resolveEquipment([source({ allocations: { e1: 200000, e2: 100000 } })]);
    expect(rows.reduce((s, r) => s + r.annualVolume, 0)).toBeCloseTo(180000, 2);
  });

  it("falls back to the whole volume on the first equipment when allocations are absent", () => {
    const rows = resolveEquipment([source({ allocations: undefined })]);
    expect(rows).toHaveLength(2);
    expect(rows[0].annualVolume).toBe(180000);
    expect(rows[1].annualVolume).toBe(0);
  });

  it("ignores allocation keys naming equipment the source does not have", () => {
    const rows = resolveEquipment([source({ allocations: { e1: 90000, ghost: 90000 } })]);
    expect(rows.map((r) => r.id)).toEqual(["e1", "e2", "c-1::unallocated"]);
  });

  it("never emits a byAsset row that could be re-split", () => {
    const rows = resolveEquipment([source()]);
    expect(rows.every((r) => r.allocations === undefined)).toBe(true);
  });

  it("survives a NaN source volume without vanishing the source", () => {
    const rows = resolveEquipment([source({ annualVolume: NaN as unknown as number })]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => Number.isFinite(r.annualVolume))).toBe(true);
  });

  it("survives a source with a malformed empty equipment list", () => {
    const rows = resolveEquipment([source({ equipment: [] })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("c-1");
  });

  it("clears allocations on the malformed empty-equipment fallback row too", () => {
    const rows = resolveEquipment([source({ equipment: [] })]);
    expect(rows[0].allocations).toBeUndefined();
  });
});
