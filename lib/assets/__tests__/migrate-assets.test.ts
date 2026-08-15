import { describe, expect, it } from "vitest";
import { migrateAssets } from "../../store-helpers";
import type { AssetRegistry } from "../types";
import type { CombustionAsset, CombustionByYear } from "@/lib/model/types";

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

const emptyRegistry = (): AssetRegistry => ({ assets: [] });

describe("migrateAssets — id reuse", () => {
  it("mints an asset whose id is the entry's own id", () => {
    const combustion: CombustionByYear = { 2024: [entry({ id: "e-1" })] };
    const out = migrateAssets(combustion, emptyRegistry());
    expect(out.assets).toHaveLength(1);
    expect(out.assets[0].id).toBe("e-1");
  });

  it("carries over name, category, unitCount, remainingLife, opex, and buId from bu", () => {
    const combustion: CombustionByYear = {
      2024: [
        entry({
          id: "e-1", name: "Genset", category: "mobile",
          unitCount: 4, remainingLife: 7, opex: 12345, bu: "bu-plant-1",
        }),
      ],
    };
    const out = migrateAssets(combustion, emptyRegistry());
    expect(out.assets[0]).toMatchObject({
      id: "e-1", name: "Genset", category: "mobile",
      unitCount: 4, remainingLife: 7, opex: 12345, buId: "bu-plant-1",
    });
  });

  it("buId is empty string when the entry has no bu", () => {
    const combustion: CombustionByYear = { 2024: [entry({ id: "e-1" })] };
    const out = migrateAssets(combustion, emptyRegistry());
    expect(out.assets[0].buId).toBe("");
  });
});

describe("migrateAssets — first-occurrence-wins dedupe across years", () => {
  it("an entry id appearing in several fiscal years yields exactly one asset", () => {
    const combustion: CombustionByYear = {
      2024: [entry({ id: "e-1", name: "2024 name" })],
      2025: [entry({ id: "e-1", name: "2025 name" })],
    };
    const out = migrateAssets(combustion, emptyRegistry());
    const matches = out.assets.filter((a) => a.id === "e-1");
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe("2024 name");
  });
});

describe("migrateAssets — idempotence across runs", () => {
  it("running twice in a row produces the same registry as running once", () => {
    const combustion: CombustionByYear = {
      2024: [entry({ id: "e-1" })],
      2025: [entry({ id: "e-1" }), entry({ id: "e-2", name: "Second fuel" })],
    };
    const once = migrateAssets(combustion, emptyRegistry());
    const twice = migrateAssets(combustion, once);
    expect(twice.assets).toEqual(once.assets);
  });

  it("does not touch assets already present, keyed on id presence", () => {
    const combustion: CombustionByYear = { 2024: [entry({ id: "e-1" })] };
    const first = migrateAssets(combustion, emptyRegistry());
    const second = migrateAssets(combustion, first);
    expect(second.assets).toHaveLength(1);
    expect(second.assets[0]).toEqual(first.assets[0]);
  });
});

describe("migrateAssets — user edits survive re-migration", () => {
  it("a user-renamed asset is left untouched on the next hydration", () => {
    const combustion: CombustionByYear = { 2024: [entry({ id: "e-1", name: "Original name" })] };
    const migrated = migrateAssets(combustion, emptyRegistry());
    const edited: AssetRegistry = {
      assets: [{ ...migrated.assets[0], name: "User-edited name", opex: 999999 }],
    };
    const rerun = migrateAssets(combustion, edited);
    expect(rerun.assets).toHaveLength(1);
    expect(rerun.assets[0].name).toBe("User-edited name");
    expect(rerun.assets[0].opex).toBe(999999);
  });
});

describe("migrateAssets — entries are never mutated", () => {
  it("leaves the entry objects (including allocationMode) byte-for-byte unchanged", () => {
    const e = entry({ id: "e-1", allocationMode: "byAsset", assetAllocations: { "a-1": { volume: 500 } } });
    const snapshot = JSON.parse(JSON.stringify(e));
    const combustion: CombustionByYear = { 2024: [e] };
    migrateAssets(combustion, emptyRegistry());
    expect(e).toEqual(snapshot);
    expect(e.allocationMode).toBe("byAsset");
  });
});

describe("migrateAssets — malformed shapes never throw", () => {
  it.each([{}, [], 5, "x", { assets: null }])(
    "tolerates a malformed existing registry: %j",
    (malformed) => {
      const combustion: CombustionByYear = { 2024: [entry({ id: "e-1" })] };
      expect(() => migrateAssets(combustion, malformed as unknown as AssetRegistry)).not.toThrow();
      const out = migrateAssets(combustion, malformed as unknown as AssetRegistry);
      expect(out.assets.some((a) => a.id === "e-1")).toBe(true);
    },
  );

  it("tolerates a year value that is not an array", () => {
    const combustion = { 2024: "not-an-array", 2025: [entry({ id: "e-1" })] } as unknown as CombustionByYear;
    expect(() => migrateAssets(combustion, emptyRegistry())).not.toThrow();
    const out = migrateAssets(combustion, emptyRegistry());
    expect(out.assets).toHaveLength(1);
    expect(out.assets[0].id).toBe("e-1");
  });

  it("tolerates a year value that is null", () => {
    const combustion = { 2024: null } as unknown as CombustionByYear;
    expect(() => migrateAssets(combustion, emptyRegistry())).not.toThrow();
  });

  it("tolerates a null entry and a non-object entry within a year's list", () => {
    const combustion = {
      2024: [null, 42, "a string", entry({ id: "e-1" })],
    } as unknown as CombustionByYear;
    expect(() => migrateAssets(combustion, emptyRegistry())).not.toThrow();
    const out = migrateAssets(combustion, emptyRegistry());
    expect(out.assets).toHaveLength(1);
    expect(out.assets[0].id).toBe("e-1");
  });

  it("skips an entry with no usable string id, without minting a fresh one", () => {
    const combustion = {
      2024: [
        { ...entry(), id: undefined },
        { ...entry(), id: 42 },
        entry({ id: "e-1" }),
      ],
    } as unknown as CombustionByYear;
    expect(() => migrateAssets(combustion, emptyRegistry())).not.toThrow();
    const out = migrateAssets(combustion, emptyRegistry());
    expect(out.assets).toHaveLength(1);
    expect(out.assets[0].id).toBe("e-1");
  });

  it("skips an entry missing name or category", () => {
    const combustion = {
      2024: [
        { ...entry({ id: "no-name" }), name: undefined },
        { ...entry({ id: "no-category" }), category: undefined },
        entry({ id: "e-1" }),
      ],
    } as unknown as CombustionByYear;
    expect(() => migrateAssets(combustion, emptyRegistry())).not.toThrow();
    const out = migrateAssets(combustion, emptyRegistry());
    expect(out.assets).toHaveLength(1);
    expect(out.assets[0].id).toBe("e-1");
  });

  it("tolerates an entirely empty/malformed combustion object", () => {
    expect(() => migrateAssets({} as CombustionByYear, emptyRegistry())).not.toThrow();
    expect(() => migrateAssets(null as unknown as CombustionByYear, emptyRegistry())).not.toThrow();
  });
});
