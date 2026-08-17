// @vitest-environment jsdom
// Task 8 — asset registry editor.
//
// The load-bearing case here mirrors lib/assets/__tests__/store.test.tsx:
// removeUnit throws SYNCHRONOUSLY (before any setAssets call) when the asset
// is referenced by an entry's assetAllocations, precisely so a caller's own
// try/catch can catch it and put the message somewhere visible. This screen
// is that caller — deleting a referenced asset must leave it in the list and
// show an inline error, not crash or silently no-op.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssetProvider, useAssets } from "@/lib/assets/store";
import { ScenarioProvider } from "@/lib/store";
import { AssetRegistryScreen } from "../activity/AssetRegistryScreen";

/** Exposes the registry's raw ids so a test can assert on id IDENTITY, not
 *  just on names appearing in the DOM — the only way to actually tell
 *  addUnit (mints a fresh id) apart from upsertUnit (would reuse/collide an
 *  explicit one), since the screen itself never renders ids. */
function IdsProbe() {
  const { assets } = useAssets();
  return <div data-testid="asset-ids">{assets.map((a) => a.id).join(",")}</div>;
}

const ASSET_KEY = "osh-assets-v1";
const SCENARIO_KEY = "osh-scope1-planner-v4";

const SETTINGS_SHAPE = {
  assumptions: {
    gridEf: 0.71,
    renewableSourcingPct: 50,
    recCostPerTonne: 800,
    carbonPricePerTonne: 2000,
    infraCapex: 15_000_000,
  },
  byAsset: {},
  bySystem: {},
};

function seedAssets(assets: unknown[]) {
  window.localStorage.setItem(ASSET_KEY, JSON.stringify({ assets }));
}

function seedReferencingEntry(assetId: string) {
  window.localStorage.setItem(
    SCENARIO_KEY,
    JSON.stringify({
      combustion: {
        2025: [
          {
            id: "entry-1",
            name: "Split boiler",
            category: "stationary",
            fuelType: "diesel",
            unit: "L",
            annualVolume: 1000,
            opex: 0,
            remainingLife: 10,
            unitCount: 1,
            allocationMode: "byAsset",
            assetAllocations: { [assetId]: { volume: 1000 } },
          },
        ],
      },
      refrigeration: {},
      settings: SETTINGS_SHAPE,
      scenarios: [],
      baseYear: 2025,
    }),
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <AssetProvider>
      <ScenarioProvider>
        {children}
      </ScenarioProvider>
    </AssetProvider>
  );
}

function renderScreen() {
  render(
    <Wrapper>
      <AssetRegistryScreen setNav={() => {}} buUnits={[{ name: "Pune", aggregate: true }]} />
    </Wrapper>,
  );
}

describe("AssetRegistryScreen", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
  });

  it("lists every asset already in the registry", () => {
    seedAssets([
      { id: "a-0", name: "Genset A", buId: "Pune", category: "stationary", unitCount: 1, remainingLife: 10, opex: 0 },
      { id: "a-1", name: "Genset B", buId: "", category: "mobile", unitCount: 2, remainingLife: 5, opex: 0 },
    ]);
    renderScreen();
    expect(screen.getByText("Genset A")).toBeTruthy();
    expect(screen.getByText("Genset B")).toBeTruthy();
  });

  it("creating an asset mints a fresh id (addUnit) instead of colliding with an entry-shaped existing id (upsertUnit)", () => {
    // "c-1" mimics the id shape migrateAssets/upsertUnit produce for a
    // not-yet-split combustion entry's self-asset (lib/assets/store.tsx) —
    // exactly the id an errant upsertUnit call could collide with. Asserting
    // only that "New Boiler" appears would pass just as well under
    // upsertUnit, so this pins ID IDENTITY via IdsProbe instead.
    seedAssets([
      { id: "c-1", name: "Existing Genset", buId: "", category: "stationary", unitCount: 1, remainingLife: 10, opex: 0 },
    ]);
    // Seed an EMPTY combustion year map so ScenarioProvider's one-time
    // backfill (ensureAssetsFor, lib/store.tsx:164-168) has no default
    // entries to migrate — otherwise it mints extra assets for
    // DEFAULT_COMBUSTION_BY_YEAR's seed rows and pollutes the id count this
    // test is asserting on.
    window.localStorage.setItem(
      SCENARIO_KEY,
      JSON.stringify({ combustion: {}, refrigeration: {}, settings: SETTINGS_SHAPE, scenarios: [], baseYear: 2025 }),
    );
    render(
      <Wrapper>
        <IdsProbe />
        <AssetRegistryScreen setNav={() => {}} buUnits={[{ name: "Pune", aggregate: true }]} />
      </Wrapper>,
    );
    expect(screen.getByTestId("asset-ids").textContent).toBe("c-1");

    fireEvent.click(screen.getByRole("button", { name: /Add asset/i }));
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "New Boiler" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    // The seeded asset is untouched — not overwritten in place.
    expect(screen.getByText("Existing Genset")).toBeTruthy();
    expect(screen.getByText("New Boiler")).toBeTruthy();

    // And the new asset landed under a FRESH, DISTINCT id — proof this is
    // addUnit, not upsertUnit (which would have to reuse/collide an id to
    // even be called from a create form with no id field of its own).
    const ids = screen.getByTestId("asset-ids").textContent!.split(",");
    expect(ids).toHaveLength(2);
    expect(ids).toContain("c-1");
    expect(ids.some((id) => id !== "c-1")).toBe(true);
  });

  it("deleting an unreferenced asset removes it from the list", () => {
    seedAssets([
      { id: "a-0", name: "Genset A", buId: "", category: "stationary", unitCount: 1, remainingLife: 10, opex: 0 },
    ]);
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: /Remove Genset A/i }));

    expect(screen.queryByText("Genset A")).toBeFalsy();
  });

  it("deleting a referenced asset leaves it in place and shows a visible inline error", () => {
    seedAssets([
      { id: "a-0", name: "Genset A", buId: "", category: "stationary", unitCount: 1, remainingLife: 10, opex: 0 },
    ]);
    seedReferencingEntry("a-0");
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: /Remove Genset A/i }));

    // Still present — removeUnit's synchronous throw was caught before any
    // setAssets ran, so the registry is unchanged.
    expect(screen.getByText("Genset A")).toBeTruthy();
    // And the error reached the DOM via this component's own try/catch, not
    // an error boundary / render crash.
    expect(screen.getByRole("alert").textContent).toMatch(/referenced/i);
  });

  it("shows edit controls for a selected asset and saves changes via updateUnit", () => {
    seedAssets([
      { id: "a-0", name: "Genset A", buId: "", category: "stationary", unitCount: 1, remainingLife: 10, opex: 0 },
    ]);
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: /Edit Genset A/i }));
    const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Genset A");

    fireEvent.change(nameInput, { target: { value: "Genset A Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    expect(screen.getByText("Genset A Renamed")).toBeTruthy();
  });
});
