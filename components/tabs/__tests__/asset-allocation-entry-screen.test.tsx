// @vitest-environment jsdom
/**
 * Task 10 — end-to-end wiring: a real user action inside EntryScreen's fuel
 * branch (via ActivityDataTab) must write allocationMode: "byAsset" +
 * assetAllocations back onto the entry, and the store's resolved rows must
 * pick it up. Before this task, no UI wrote those fields at all (grepped by
 * the plan doc for Task 9); this test is what proves the gap is closed.
 *
 * Per the "Testing trap for Tasks 9 and 10" note in the plan doc: `combustion`
 * and the asset registry are seeded explicitly, and the registry already
 * contains an asset keyed to the entry's OWN id (mirroring the entry-id
 * self-asset Task 4's migration would otherwise mint), so hydration mints
 * nothing extra and the eligible-asset count stays exactly what the test
 * expects.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { AssetProvider } from "@/lib/assets/store";
import { CompanyProvider } from "@/lib/company/store";
import { ScenarioProvider, useScenario } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { EsgProvider } from "@/lib/esg/store";
import { ActivityDataTab } from "../ActivityDataTab";

const SCENARIO_KEY = "osh-scope1-planner-v4";
const ASSETS_KEY = "osh-assets-v1";
const BU_KEY = "osh-bus-v3::c-0";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function seed() {
  const persisted = {
    combustion: {
      2025: [
        {
          id: "c-1", name: "Diesel Test", category: "stationary", fuelType: "diesel",
          unit: "L", annualVolume: 1000, opex: 5000, remainingLife: 10, unitCount: 1, bu: "Pune",
        },
      ],
    },
    refrigeration: {},
    settings: {
      assumptions: {
        gridEf: 0.71, renewableSourcingPct: 50, recCostPerTonne: 800,
        carbonPricePerTonne: 2000, infraCapex: 15000000,
      },
      byAsset: {}, bySystem: {},
    },
    scenarios: [],
    baseYear: 2025,
  };
  window.localStorage.setItem(SCENARIO_KEY, JSON.stringify(persisted));
  window.localStorage.setItem(BU_KEY, JSON.stringify({ mode: "bu", units: [{ name: "Pune", aggregate: true }] }));
  // Registry: the entry's own self-asset (id === entry id, so migrateAssets
  // mints nothing more for it) plus ONE additional real asset in the same BU
  // — exactly two eligible rows for the panel.
  window.localStorage.setItem(ASSETS_KEY, JSON.stringify({
    assets: [
      { id: "c-1", name: "Diesel Test", buId: "Pune", category: "stationary", unitCount: 1, remainingLife: 10, opex: 5000 },
      { id: "asset-2", name: "Boiler 2", buId: "Pune", category: "stationary", unitCount: 1, remainingLife: 10, opex: 0 },
    ],
  }));
}

type Store = ReturnType<typeof useScenario>;
function Probe({ into }: { into: Store[] }) {
  into.push(useScenario());
  return null;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <AssetProvider>
        <ScenarioProvider>
          <Scope2Provider>
            <EsgProvider>
              {children}
            </EsgProvider>
          </Scope2Provider>
        </ScenarioProvider>
      </AssetProvider>
    </CompanyProvider>
  );
}

describe("AssetAllocationPanel wired into EntryScreen via ActivityDataTab", () => {
  it("writing an even split through the panel reaches updateCombustion, and the store resolves it into per-asset rows", () => {
    seed();
    const captured: Store[] = [];
    // Start at "home" (not directly at "entry") and navigate there via
    // clicks, same as components/tabs/__tests__/empty-field-guards.test.tsx's
    // openFuelEntryWithOpex helper — jumping straight to nav: "entry" via
    // initialNav races the ScenarioProvider hydration effect: EntryScreen's
    // own `if (!a) setNav({ level: "home" })` guard fires against the
    // pre-hydration empty registry on the very first render and permanently
    // redirects away, before the persisted combustion ever lands.
    render(
      <Wrapper>
        <Probe into={captured} />
        <ActivityDataTab initialNav={{ level: "home" }} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("Fuels – Liquid").closest("button")!);
    const nameSpan = screen.getAllByText("Diesel Test").find((el) => el.tagName === "SPAN");
    fireEvent.click(nameSpan!.closest("div")!);

    // Sanity: the panel rendered with both eligible assets, unsplit so far.
    expect(screen.getByDisplayValue("Diesel Test")).toBeTruthy(); // hero name field
    expect(screen.getByText("Boiler 2")).toBeTruthy(); // panel row
    const before = captured[captured.length - 1].combustion[2025].find((e) => e.id === "c-1")!;
    expect(before.allocationMode).not.toBe("byAsset");

    // A real basis change — a genuine value change on the <select>, not a
    // re-selection of an already-selected option.
    act(() => {
      fireEvent.change(screen.getByLabelText("Allocation basis"), { target: { value: "even" } });
    });

    const after = captured[captured.length - 1].combustion[2025].find((e) => e.id === "c-1")!;
    expect(after.allocationMode).toBe("byAsset");
    expect(after.allocationBasis).toBe("even");
    // Even, per unit: both assets have unitCount 1 → 500/500 of the 1000 L total.
    expect(after.assetAllocations).toEqual({
      "c-1": { volume: 500 },
      "asset-2": { volume: 500 },
    });

    // The store's resolved rows now carry more than one row for this entry —
    // the exact property Task 4 wired the engine for, now finally reachable
    // from the UI.
    const resolvedRows = captured[captured.length - 1].resolvedBaseAssets.filter(
      (r) => r.sourceEntryId === "c-1",
    );
    expect(resolvedRows).toHaveLength(2);
    expect(resolvedRows.map((r) => r.id).sort()).toEqual(["asset-2", "c-1"]);

    // The invariant the whole port exists to preserve: total emissions for
    // the split entry's resolved rows equal what the unsplit entry reported.
    const splitTotal = resolvedRows.reduce((s, r) => s + r.annualVolume, 0);
    expect(splitTotal).toBe(1000);
  });
});
