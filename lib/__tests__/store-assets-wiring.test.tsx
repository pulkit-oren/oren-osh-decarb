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
import { AssetProvider } from "@/lib/assets/store";
import { assetKey } from "@/lib/assets/helpers";
import { ScenarioProvider, useScenario } from "@/lib/store";
import type { AssetRegistry } from "@/lib/assets/types";
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
