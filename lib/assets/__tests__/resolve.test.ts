import { describe, expect, it } from "vitest";
import { isUnallocatedId, resolveAssets, UNALLOCATED_SUFFIX } from "../resolve";
import type { Asset, AssetRegistry } from "../types";
import type { CombustionAsset } from "@/lib/model/types";

const asset = (id: string, over: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  buId: "",
  category: "stationary",
  unitCount: 1,
  remainingLife: 10,
  opex: 0,
  ...over,
});

const registry = (assets: Asset[]): AssetRegistry => ({ assets });

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

/** The single most important property: rows for a byAsset entry always sum
 *  to exactly the entry's annualVolume, whatever the allocation state. */
function sumFor(rows: CombustionAsset[], sourceEntryId: string): number {
  return rows
    .filter((r) => r.sourceEntryId === sourceEntryId)
    .reduce((s, r) => s + r.annualVolume, 0);
}

describe("resolveAssets — non-byAsset entries pass through by reference", () => {
  it("returns the exact same entry object when allocationMode is absent", () => {
    const e = entry();
    const out = resolveAssets([e], registry([]));
    expect(out).toEqual([e]);
    expect(out[0]).toBe(e);
  });

  it("returns the exact same entry object when allocationMode is 'entry'", () => {
    const e = entry({ allocationMode: "entry" });
    const out = resolveAssets([e], registry([asset("a-1")]));
    expect(out[0]).toBe(e);
  });

  it("a pass-through entry keeps its original allocationMode/assetAllocations, unlike a resolved row", () => {
    const e = entry({
      allocationMode: "entry",
      assetAllocations: { "a-1": { volume: 1000 } },
    });
    const out = resolveAssets([e], registry([asset("a-1")]));
    expect(out[0]).toBe(e);
    expect(out[0].allocationMode).toBe("entry");
    expect(out[0].assetAllocations).toEqual({ "a-1": { volume: 1000 } });
  });
});

describe("resolveAssets — byAsset allocation invariant", () => {
  it("full allocation: rows sum exactly to annualVolume", () => {
    const e = entry({
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: 600 }, "a-2": { volume: 400 } },
    });
    const out = resolveAssets([e], registry([asset("a-1"), asset("a-2")]));
    expect(sumFor(out, "e-1")).toBe(1000);
    expect(out.find((r) => r.id === "a-1")?.annualVolume).toBe(600);
    expect(out.find((r) => r.id === "a-2")?.annualVolume).toBe(400);
    // fully allocated => no remainder row
    expect(out.some((r) => isUnallocatedId(r.id))).toBe(false);
  });

  it("partial allocation: emits a remainder row carrying sourceEntryId", () => {
    const e = entry({
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: 300 } },
    });
    const out = resolveAssets([e], registry([asset("a-1")]));
    expect(sumFor(out, "e-1")).toBe(1000);
    const remainder = out.find((r) => isUnallocatedId(r.id));
    expect(remainder).toBeDefined();
    expect(remainder?.sourceEntryId).toBe("e-1");
    expect(remainder?.annualVolume).toBe(700);
    expect(remainder?.id).toBe(`e-1${UNALLOCATED_SUFFIX}`);
  });

  it("zero allocation: the whole entry becomes the remainder", () => {
    const e = entry({
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: 0 } },
    });
    const out = resolveAssets([e], registry([asset("a-1")]));
    expect(sumFor(out, "e-1")).toBe(1000);
    const remainder = out.find((r) => isUnallocatedId(r.id));
    expect(remainder?.annualVolume).toBe(1000);
  });

  it("annualVolume: 0 — every row (asset and remainder) is zero, sum is zero", () => {
    const e = entry({
      annualVolume: 0,
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: 500 } },
    });
    const out = resolveAssets([e], registry([asset("a-1")]));
    expect(sumFor(out, "e-1")).toBe(0);
  });

  it("an id absent from the registry: its share flows into the remainder, sum still exact", () => {
    const e = entry({
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: 400 }, "ghost": { volume: 600 } },
    });
    const out = resolveAssets([e], registry([asset("a-1")]));
    expect(sumFor(out, "e-1")).toBe(1000);
    expect(out.some((r) => r.id === "ghost")).toBe(false);
    const remainder = out.find((r) => isUnallocatedId(r.id));
    expect(remainder?.annualVolume).toBe(600);
  });

  it("an electrical asset is never allocated Scope 1 fuel — its share flows into the remainder", () => {
    const e = entry({
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: 400 }, "elec-1": { volume: 600 } },
    });
    const out = resolveAssets(
      [e],
      registry([asset("a-1"), asset("elec-1", { category: "electrical" })]),
    );
    expect(sumFor(out, "e-1")).toBe(1000);
    expect(out.some((r) => r.id === "elec-1")).toBe(false);
    const remainder = out.find((r) => isUnallocatedId(r.id));
    expect(remainder?.annualVolume).toBe(600);
  });

  it("over-allocation: allocations summing above the total are clamped, sum stays exact", () => {
    const e = entry({
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: 3000 }, "a-2": { volume: 3000 } },
    });
    const out = resolveAssets([e], registry([asset("a-1"), asset("a-2")]));
    expect(sumFor(out, "e-1")).toBe(1000);
    expect(out.find((r) => r.id === "a-1")?.annualVolume).toBe(500);
    expect(out.find((r) => r.id === "a-2")?.annualVolume).toBe(500);
  });

  it("NaN volume is sanitised to 0, not propagated to an emitted row", () => {
    const e = entry({
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: NaN }, "a-2": { volume: 400 } },
    });
    const out = resolveAssets([e], registry([asset("a-1"), asset("a-2")]));
    expect(out.every((r) => Number.isFinite(r.annualVolume))).toBe(true);
    expect(sumFor(out, "e-1")).toBe(1000);
    expect(out.find((r) => r.id === "a-1")?.annualVolume).toBe(0);
  });

  it("a negative volume is sanitised to 0", () => {
    const e = entry({
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: -500 }, "a-2": { volume: 400 } },
    });
    const out = resolveAssets([e], registry([asset("a-1"), asset("a-2")]));
    expect(out.every((r) => r.annualVolume >= 0)).toBe(true);
    expect(sumFor(out, "e-1")).toBe(1000);
    expect(out.find((r) => r.id === "a-1")?.annualVolume).toBe(0);
  });

  it("a non-numeric volume (string) is sanitised to 0", () => {
    const e = entry({
      allocationMode: "byAsset",
      assetAllocations: {
        "a-1": { volume: "not-a-number" as unknown as number },
        "a-2": { volume: 400 },
      },
    });
    const out = resolveAssets([e], registry([asset("a-1"), asset("a-2")]));
    expect(out.every((r) => Number.isFinite(r.annualVolume))).toBe(true);
    expect(sumFor(out, "e-1")).toBe(1000);
  });

  it("a null allocation-map member does not throw and is treated as 0", () => {
    const e = entry({
      allocationMode: "byAsset",
      assetAllocations: {
        "a-1": null as unknown as { volume: number },
        "a-2": { volume: 400 },
      },
    });
    expect(() => resolveAssets([e], registry([asset("a-1"), asset("a-2")]))).not.toThrow();
    const out = resolveAssets([e], registry([asset("a-1"), asset("a-2")]));
    expect(sumFor(out, "e-1")).toBe(1000);
    expect(out.find((r) => r.id === "a-1")?.annualVolume).toBe(0);
  });

  it("bu falls back to the entry's own bu when the asset has none", () => {
    const e = entry({
      bu: "central",
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: 1000 } },
    });
    const out = resolveAssets([e], registry([asset("a-1", { buId: "" })]));
    expect(out.find((r) => r.id === "a-1")?.bu).toBe("central");
  });

  it("bu takes the asset's buId when set", () => {
    const e = entry({
      bu: "central",
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: 1000 } },
    });
    const out = resolveAssets([e], registry([asset("a-1", { buId: "bu-plant-2" })]));
    expect(out.find((r) => r.id === "a-1")?.bu).toBe("bu-plant-2");
  });

  it("does not double-count opex: asset rows plus the scaled remainder equal the entry's opex", () => {
    const e = entry({
      opex: 1000,
      annualVolume: 1000,
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: 300 } },
    });
    const out = resolveAssets([e], registry([asset("a-1", { opex: 999 })]));
    const assetRow = out.find((r) => r.id === "a-1");
    const remainder = out.find((r) => isUnallocatedId(r.id));
    // asset row's opex comes from the asset, not the entry
    expect(assetRow?.opex).toBe(999);
    // remainder is the entry's opex scaled by its 70% share of annualVolume
    expect(remainder?.opex).toBe(700);
  });

  it("clears allocationMode and assetAllocations on every emitted row (asset rows and the remainder)", () => {
    const e = entry({
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: 300 } },
    });
    const out = resolveAssets([e], registry([asset("a-1")]));
    const assetRow = out.find((r) => r.id === "a-1");
    const remainder = out.find((r) => isUnallocatedId(r.id));
    expect(assetRow?.allocationMode).toBeUndefined();
    expect(assetRow?.assetAllocations).toBeUndefined();
    expect(remainder?.allocationMode).toBeUndefined();
    expect(remainder?.assetAllocations).toBeUndefined();
    // the original entry object itself is untouched
    expect(e.allocationMode).toBe("byAsset");
    expect(e.assetAllocations).toEqual({ "a-1": { volume: 300 } });
  });

  it("annualVolume: NaN does not silently drop the entry — rows stay finite", () => {
    const e = entry({
      annualVolume: NaN,
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: 500 } },
    });
    const out = resolveAssets([e], registry([asset("a-1")]));
    const rowsForEntry = out.filter((r) => r.sourceEntryId === "e-1");
    expect(rowsForEntry.length).toBeGreaterThan(0);
    expect(rowsForEntry.every((r) => Number.isFinite(r.annualVolume))).toBe(true);
  });

  it("takes unitCount and remainingLife from the ASSET, not the entry, when they differ", () => {
    const e = entry({
      unitCount: 1,
      remainingLife: 10,
      allocationMode: "byAsset",
      assetAllocations: { "a-1": { volume: 1000 } },
    });
    const out = resolveAssets(
      [e],
      registry([asset("a-1", { unitCount: 7, remainingLife: 25 })]),
    );
    const assetRow = out.find((r) => r.id === "a-1");
    expect(assetRow?.unitCount).toBe(7);
    expect(assetRow?.remainingLife).toBe(25);
  });
});
