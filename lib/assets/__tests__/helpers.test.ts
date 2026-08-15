import { describe, expect, it } from "vitest";
import {
  addAsset, assetKey, assetsForBu, referencedAssetIds, removeAsset, updateAsset, upsertAsset,
} from "../helpers";
import type { Asset, AssetRegistry } from "../types";

const EMPTY: AssetRegistry = { assets: [] };
const base = (over: Partial<Asset> = {}): Omit<Asset, "id"> => ({
  name: "Genset", buId: "bu-0", category: "stationary",
  unitCount: 1, remainingLife: 10, opex: 0, ...over,
});

describe("assetKey", () => {
  it("namespaces per company", () => {
    expect(assetKey("acme")).toBe("osh-assets-v1::acme");
  });
});

describe("addAsset", () => {
  it("mints sequential ids and does not mutate the input", () => {
    const r1 = addAsset(EMPTY, base());
    const r2 = addAsset(r1, base({ name: "Boiler" }));
    expect(r1.assets.map((a) => a.id)).toEqual(["a-0"]);
    expect(r2.assets.map((a) => a.id)).toEqual(["a-0", "a-1"]);
    expect(EMPTY.assets).toHaveLength(0);
  });

  it("rejects a blank name", () => {
    expect(addAsset(EMPTY, base({ name: "  " })).assets).toHaveLength(0);
  });
});

describe("updateAsset", () => {
  it("patches one asset and leaves others alone", () => {
    const r = addAsset(addAsset(EMPTY, base()), base({ name: "Boiler" }));
    const out = updateAsset(r, "a-1", { unitCount: 4 });
    expect(out.assets[1].unitCount).toBe(4);
    expect(out.assets[0].unitCount).toBe(1);
  });

  it("does not mutate the input registry", () => {
    const r = addAsset(addAsset(EMPTY, base()), base({ name: "Boiler" }));
    const before = structuredClone(r);
    updateAsset(r, "a-1", { unitCount: 4 });
    expect(r).toEqual(before);
  });
});

describe("removeAsset", () => {
  it("removes an unreferenced asset", () => {
    const r = addAsset(EMPTY, base());
    expect(removeAsset(r, "a-0", []).assets).toHaveLength(0);
  });

  it("throws when the asset is referenced by an entry", () => {
    const r = addAsset(EMPTY, base());
    expect(() => removeAsset(r, "a-0", ["a-0"])).toThrow(/referenced/);
  });

  it("does not mutate the input registry", () => {
    const r = addAsset(EMPTY, base());
    const before = structuredClone(r);
    removeAsset(r, "a-0", []);
    expect(r).toEqual(before);
  });
});

describe("upsertAsset", () => {
  it("inserts with an explicit id, then updates in place", () => {
    const withIt = upsertAsset(EMPTY, { id: "c-3", ...base({ name: "Fleet" }) });
    expect(withIt.assets).toHaveLength(1);
    const again = upsertAsset(withIt, { id: "c-3", ...base({ name: "Renamed" }) });
    expect(again.assets).toHaveLength(1);
    expect(again.assets[0].name).toBe("Renamed");
  });

  it("does not mutate the input registry on insert", () => {
    const r = EMPTY;
    const before = structuredClone(r);
    upsertAsset(r, { id: "c-3", ...base({ name: "Fleet" }) });
    expect(r).toEqual(before);
  });

  it("does not mutate the input registry on update", () => {
    const r = upsertAsset(EMPTY, { id: "c-3", ...base({ name: "Fleet" }) });
    const before = structuredClone(r);
    upsertAsset(r, { id: "c-3", ...base({ name: "Renamed" }) });
    expect(r).toEqual(before);
  });
});

describe("assetsForBu", () => {
  it("filters by business unit", () => {
    const r = addAsset(addAsset(EMPTY, base({ buId: "bu-0" })), base({ buId: "bu-1" }));
    expect(assetsForBu(r, "bu-1").map((a) => a.id)).toEqual(["a-1"]);
  });

  it("does not mutate the input registry", () => {
    const r = addAsset(addAsset(EMPTY, base({ buId: "bu-0" })), base({ buId: "bu-1" }));
    const before = structuredClone(r);
    assetsForBu(r, "bu-1");
    expect(r).toEqual(before);
  });
});

describe("referencedAssetIds", () => {
  it("collects ids from byAsset entries only", () => {
    const ids = referencedAssetIds([
      { allocationMode: "byAsset", assetAllocations: { "a-0": { volume: 10 } } },
      { allocationMode: "total", assetAllocations: { "a-9": { volume: 5 } } },
      { allocationMode: "byAsset" },
    ]);
    expect(ids).toEqual(["a-0"]);
  });
});
