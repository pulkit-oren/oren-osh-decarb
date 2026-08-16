// @vitest-environment jsdom
//
// Task 4 wiring test — pins the deliverable: the SCENARIO STORE (not just the
// pure resolve.ts helpers, already covered by Task 1) must actually produce
// resolved rows once AssetProvider is mounted above it.
//
// Three assertions, per the brief:
//  1. an allocated entry's total emissions equal the same entry unallocated
//     (the invariant the whole port exists to preserve);
//  2. resolved rows are keyed by ASSET id, not the source entry id;
//  3. a byAsset entry resolves to MORE than one row — the assertion a
//     regression reverting the engine to raw entries could never satisfy,
//     since a raw (unresolved) entry is always exactly one row.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { AssetProvider, useAssets } from "@/lib/assets/store";
import { assetKey } from "@/lib/assets/helpers";
import { ScenarioProvider, useScenario } from "@/lib/store";
import { migrateAssets } from "@/lib/store-helpers";
import type { Asset, AssetRegistry } from "@/lib/assets/types";
import type { CombustionAsset } from "@/lib/model/types";

const COMPANY_ID = "wiring-test-co";
const ASSETS_KEY = assetKey(COMPANY_ID);
const SCENARIO_KEY = `osh-scope1-planner-v4::${COMPANY_ID}`;

const registry: AssetRegistry = {
  assets: [
    { id: "asset-a", name: "Genset A", buId: "", category: "stationary", unitCount: 1, remainingLife: 10, opex: 0 },
    { id: "asset-b", name: "Genset B", buId: "", category: "stationary", unitCount: 1, remainingLife: 10, opex: 0 },
  ],
};

const blankScenarioPayload = JSON.stringify({
  combustion: {}, refrigeration: {}, settings: { byAsset: {}, bySystem: {} }, scenarios: [], baseYear: 2025,
});

type Store = ReturnType<typeof useScenario>;

/** Captures the store via a mutated array prop, not a reassigned outer
 *  variable — matches the pattern lib/assets/__tests__/store.test.tsx uses,
 *  which avoids the react-hooks/globals "cannot reassign variables declared
 *  outside of the component" lint error a plain module-level reassignment
 *  triggers. */
function Probe({ into }: { into: Store[] }) {
  into.push(useScenario());
  return null;
}

let captured: Store[] = [];

beforeEach(() => {
  window.localStorage.setItem(ASSETS_KEY, JSON.stringify(registry));
  window.localStorage.setItem(SCENARIO_KEY, blankScenarioPayload);
  captured = [];
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("resolved-asset wiring (Task 4)", () => {
  it("resolves a byAsset entry into more than one row, keyed by asset id, with the same total emissions as the entry unallocated", () => {
    render(
      <AssetProvider storageKey={ASSETS_KEY}>
        <ScenarioProvider storageKey={SCENARIO_KEY}>
          <Probe into={captured} />
        </ScenarioProvider>
      </AssetProvider>,
    );

    const latest = () => captured[captured.length - 1];
    const baseYear = latest().baseYear;

    const unallocated: CombustionAsset = {
      id: "c-unallocated", name: "Reference boiler", category: "stationary",
      fuelType: "diesel", unit: "L", annualVolume: 1000, opex: 100,
      remainingLife: 10, unitCount: 1, year: baseYear,
    };
    const allocated: CombustionAsset = {
      id: "c-allocated", name: "Split boiler", category: "stationary",
      fuelType: "diesel", unit: "L", annualVolume: 1000, opex: 100,
      remainingLife: 10, unitCount: 1, year: baseYear,
      allocationMode: "byAsset",
      assetAllocations: { "asset-a": { volume: 600 }, "asset-b": { volume: 400 } },
    };

    act(() => {
      latest().addCombustionAsset(baseYear, unallocated);
    });
    act(() => {
      latest().addCombustionAsset(baseYear, allocated);
    });

    const resolved = latest().resolvedBaseAssets;

    // Assertion 1: a byAsset entry resolves to MORE THAN ONE row — a raw
    // (unresolved) entry is always exactly one row, so this is the assertion
    // a regression reverting the engine to raw entries could never satisfy.
    const allocatedRows = resolved.filter((r) => r.sourceEntryId === "c-allocated");
    expect(allocatedRows.length).toBeGreaterThan(1);
    expect(allocatedRows).toHaveLength(2); // fully allocated (600 + 400 = 1000): no remainder row

    // Assertion 2: rows are keyed by ASSET id, not the source entry id.
    expect(allocatedRows.map((r) => r.id).sort()).toEqual(["asset-a", "asset-b"]);
    expect(allocatedRows.every((r) => r.id !== "c-allocated")).toBe(true);

    // Assertion 3: total emissions for the allocated entry's resolved rows
    // equal the same entry's emissions if it had never been split — the
    // invariant the whole port exists to preserve. Read via the STORE's own
    // selectedBaseline (selectedYear === baseYear here), so this exercises
    // the actual wiring (AssetProvider -> resolveAssets -> baselineScope1),
    // not a reimplementation of it.
    const perC = latest().selectedBaseline.perCombustion;
    const allocatedTotal = perC
      .filter((p) => p.id === "asset-a" || p.id === "asset-b")
      .reduce((sum, p) => sum + p.co2eT, 0);
    const unallocatedTotal = perC.find((p) => p.id === "c-unallocated")!.co2eT;
    expect(allocatedTotal).toBeCloseTo(unallocatedTotal, 6);
    expect(unallocatedTotal).toBeGreaterThan(0); // guard against a vacuous 0 === 0 pass
  });
});

/** Captures the raw asset registry via a mutated array prop — same reason as
 *  Probe above (avoids the react-hooks/globals reassignment error). Uses
 *  useAssets() (the throwing accessor), which is safe here since every test
 *  below always mounts a real AssetProvider. */
function AssetProbe({ into }: { into: Asset[][] }) {
  into.push(useAssets().assets);
  return null;
}

describe("upsertUnit id-reuse seam (fix round 1 — duplicate self-asset bug)", () => {
  // The bug this seam test catches: addUnit mints a FRESH id ("a-N"), but
  // migrateAssets's idempotence is keyed on the ENTRY's own id. So an entry
  // created via addUnit got a self-asset immediately, and then the NEXT
  // hydration's migrateAssets call never found an asset whose id matched the
  // entry's id — and minted a SECOND one. A test that only checked
  // upsertUnit in isolation would not catch this: the bug is specifically at
  // the seam between "what id did the entry-creation handler use" and "what
  // id does migrateAssets look for".
  it("addCombustionAsset upserts the self-asset under the ENTRY's own id, so migrateAssets mints nothing more for it on the next hydration", () => {
    const assetSnapshots: Asset[][] = [];
    render(
      <AssetProvider storageKey={ASSETS_KEY}>
        <ScenarioProvider storageKey={SCENARIO_KEY}>
          <Probe into={captured} />
          <AssetProbe into={assetSnapshots} />
        </ScenarioProvider>
      </AssetProvider>,
    );

    const baseYear = captured[captured.length - 1].baseYear;
    const entry: CombustionAsset = {
      id: "e-5", name: "New genset", category: "stationary",
      fuelType: "diesel", unit: "L", annualVolume: 5000, opex: 200,
      remainingLife: 10, unitCount: 1, year: baseYear,
    };

    act(() => {
      captured[captured.length - 1].addCombustionAsset(baseYear, entry);
    });

    const registryAfterCreate = assetSnapshots[assetSnapshots.length - 1];
    // Exactly one self-asset, and it carries the ENTRY's own id — not some
    // other freshly-minted id.
    expect(registryAfterCreate.filter((a) => a.id === "e-5")).toHaveLength(1);

    // Simulate the NEXT hydration: migrateAssets runs over the resulting
    // combustion record and the resulting registry, exactly as
    // ScenarioProvider's gated backfill effect does via ensureAssetsFor.
    // Before the fix (addUnit instead of upsertUnit), this minted a SECOND
    // self-asset for "e-5", because migrateAssets never found "e-5" among
    // the registry's ids (only the fresh, unrelated "a-N" addUnit had
    // minted).
    const combustionAfterCreate = captured[captured.length - 1].combustion;
    const migrated = migrateAssets(combustionAfterCreate, { assets: registryAfterCreate });
    expect(migrated.assets.filter((a) => a.id === "e-5")).toHaveLength(1);
    expect(migrated.assets).toHaveLength(registryAfterCreate.length); // nothing new minted
  });

  it("calling the creation path twice for the same entry id yields one asset, not two", () => {
    const assetSnapshots: Asset[][] = [];
    render(
      <AssetProvider storageKey={ASSETS_KEY}>
        <ScenarioProvider storageKey={SCENARIO_KEY}>
          <Probe into={captured} />
          <AssetProbe into={assetSnapshots} />
        </ScenarioProvider>
      </AssetProvider>,
    );

    const baseYear = captured[captured.length - 1].baseYear;
    const entry: CombustionAsset = {
      id: "e-7", name: "Repeat genset", category: "stationary",
      fuelType: "diesel", unit: "L", annualVolume: 3000, opex: 150,
      remainingLife: 10, unitCount: 1, year: baseYear,
    };

    act(() => {
      captured[captured.length - 1].addCombustionAsset(baseYear, entry);
    });
    act(() => {
      captured[captured.length - 1].addCombustionAsset(baseYear, entry);
    });

    const finalRegistry = assetSnapshots[assetSnapshots.length - 1];
    expect(finalRegistry.filter((a) => a.id === "e-7")).toHaveLength(1);
  });
});

describe("upsertUnit id-reuse seam — addCombustion / importCombustion (fix round 2)", () => {
  // Fix round 1's demonstration reverted ONLY addCombustionAsset back to
  // addUnit and confirmed the seam test failed — but addCombustion and
  // importCombustion each mint their own line independently, so that
  // demonstration covered one call site out of three. Nothing in the repo
  // exercises addCombustion or importCombustion under an AssetProvider
  // (grepped **/*.test.tsx for both — zero hits outside this file), so a
  // regression that reverted just one of THESE two handlers back to addUnit
  // would pass the full suite undetected. These two tests close that gap.
  it("addCombustion upserts the new entry's self-asset under its own auto-generated id, so migrateAssets mints nothing more for it", () => {
    const assetSnapshots: Asset[][] = [];
    render(
      <AssetProvider storageKey={ASSETS_KEY}>
        <ScenarioProvider storageKey={SCENARIO_KEY}>
          <Probe into={captured} />
          <AssetProbe into={assetSnapshots} />
        </ScenarioProvider>
      </AssetProvider>,
    );

    const baseYear = captured[captured.length - 1].baseYear;

    act(() => {
      captured[captured.length - 1].addCombustion(baseYear);
    });

    const combustionAfterCreate = captured[captured.length - 1].combustion;
    const createdEntries = combustionAfterCreate[baseYear] ?? [];
    expect(createdEntries).toHaveLength(1);
    const entryId = createdEntries[0].id; // auto-generated by uniqueId("c", ...) inside the handler

    const registryAfterCreate = assetSnapshots[assetSnapshots.length - 1];
    // Exactly one self-asset, carrying the ENTRY's own (auto-generated) id —
    // not some other, separately-minted id.
    expect(registryAfterCreate.filter((a) => a.id === entryId)).toHaveLength(1);

    // Simulate the next hydration, as the other two seam tests do.
    const migrated = migrateAssets(combustionAfterCreate, { assets: registryAfterCreate });
    expect(migrated.assets.filter((a) => a.id === entryId)).toHaveLength(1);
    expect(migrated.assets).toHaveLength(registryAfterCreate.length); // nothing new minted
  });

  it("importCombustion upserts a self-asset for EVERY imported row, not just the first, so migrateAssets mints nothing more for any of them", () => {
    const assetSnapshots: Asset[][] = [];
    render(
      <AssetProvider storageKey={ASSETS_KEY}>
        <ScenarioProvider storageKey={SCENARIO_KEY}>
          <Probe into={captured} />
          <AssetProbe into={assetSnapshots} />
        </ScenarioProvider>
      </AssetProvider>,
    );

    const baseYear = captured[captured.length - 1].baseYear;
    // Three rows, not one — a handler that only upserted rows[0] would slip
    // through a single-row test.
    const rows: Omit<CombustionAsset, "id">[] = [
      { name: "Imported boiler 1", category: "stationary", fuelType: "diesel", unit: "L", annualVolume: 1000, opex: 50, remainingLife: 10, unitCount: 1, year: baseYear },
      { name: "Imported boiler 2", category: "stationary", fuelType: "diesel", unit: "L", annualVolume: 2000, opex: 80, remainingLife: 10, unitCount: 1, year: baseYear },
      { name: "Imported boiler 3", category: "stationary", fuelType: "diesel", unit: "L", annualVolume: 3000, opex: 120, remainingLife: 10, unitCount: 1, year: baseYear },
    ];

    act(() => {
      captured[captured.length - 1].importCombustion(baseYear, rows);
    });

    const combustionAfterImport = captured[captured.length - 1].combustion;
    const importedEntries = combustionAfterImport[baseYear] ?? [];
    expect(importedEntries).toHaveLength(3);
    const importedIds = importedEntries.map((e) => e.id);

    const registryAfterImport = assetSnapshots[assetSnapshots.length - 1];
    for (const id of importedIds) {
      expect(registryAfterImport.filter((a) => a.id === id)).toHaveLength(1);
    }

    // Simulate the next hydration over ALL three imported rows at once.
    const migrated = migrateAssets(combustionAfterImport, { assets: registryAfterImport });
    for (const id of importedIds) {
      expect(migrated.assets.filter((a) => a.id === id)).toHaveLength(1);
    }
    expect(migrated.assets).toHaveLength(registryAfterImport.length); // nothing new minted for any row
  });
});
