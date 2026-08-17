// @vitest-environment jsdom
// Task 9 — teach the Builder's per-source UI about SPLIT entries.
//
// A SPLIT entry (allocationMode: "byAsset") has no lever key of its own —
// its assets hold the real settings.byAsset entries (lib/store.tsx mints
// settings.byAsset keyed by RESOLVED asset ids, never by the raw entry's own
// id, once it's split). Before this fix, BuilderTab's per-source UI looked
// levers up under the entry's OWN id, which always misses for a split entry:
//   - SourceImpact / SegmentScreen read "no plan / 0 abated" even though the
//     assets carry real, enabled levers.
//   - SuggestionCard's "Apply suggestion" would write a dead settings.byAsset
//     entry keyed to the entry's id — zero effect on computed abatement, no
//     error shown.
//   - FuelSwitchControls / FlexFuelControls dereference
//     settings.byAsset[asset.id] with no guard at all, which throws when
//     that key is genuinely absent (as it always is for a split entry's own
//     id).
//
// Seeding follows components/tabs/__tests__/compare-split-asset-regression.test.tsx
// (Task 6): a registry of two stationary assets, one combustion entry split
// across them, and a real enabled lever on only one of the two assets — the
// entry's own id carries nothing. See also the "Testing trap for Tasks 9 and
// 10" note in docs/superpowers/plans/2026-08-16-asset-layer-port.md: seed
// `combustion` explicitly so Task 4's ensureAssetsFor backfill doesn't mint
// unexpected assets from the default seed rows.
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { AssetProvider } from "@/lib/assets/store";
import { CompanyProvider } from "@/lib/company/store";
import { BuilderTab, FuelSwitchControls, FlexFuelControls } from "../BuilderTab";
import type { CombustionAsset } from "@/lib/model/types";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <AssetProvider>
        <ScenarioProvider>
          <Scope2Provider>
            {children}
          </Scope2Provider>
        </ScenarioProvider>
      </AssetProvider>
    </CompanyProvider>
  );
}

const ASSUMPTIONS = {
  gridEf: 0.71,
  renewableSourcingPct: 50,
  recCostPerTonne: 800,
  carbonPricePerTonne: 2000,
  infraCapex: 15_000_000,
};

const ELECTRIFY_ON = {
  enabled: true,
  unitsToConvert: 0,
  capacityPct: 60,
  cop: 3,
  tariffPerKwh: 9,
  assetCapex: 4_000_000,
  startYear: 2026,
  targetYear: 2028,
};

const FUEL_SWITCH_OFF = {
  enabled: false,
  altFuel: "biodiesel",
  blendPct: 0,
  efficiencyPenaltyPct: 2,
  altFuelPricePerUnit: 78,
  retrofitCapex: 0,
  startYear: 2027,
  targetYear: 2033,
};

/** Registry of two stationary assets, one combustion entry ("split-entry",
 *  100,000 L diesel) split across them 60,000 / 40,000 (no remainder), and a
 *  real enabled electrify lever on ONLY "asset-a". The entry's own id has no
 *  settings.byAsset entry at all — matching production shape exactly, since
 *  nothing (short of Task 10's not-yet-built allocation panel) ever writes a
 *  lever under a split entry's raw id. */
function seedSplitEntry(scenarios: unknown[] = []) {
  window.localStorage.setItem(
    "osh-assets-v1",
    JSON.stringify({
      assets: [
        { id: "asset-a", name: "Boiler A", buId: "Pune", category: "stationary", unitCount: 1, remainingLife: 10, opex: 5_700_000 },
        { id: "asset-b", name: "Boiler B", buId: "Pune", category: "stationary", unitCount: 1, remainingLife: 10, opex: 3_800_000 },
      ],
    }),
  );

  const settings = {
    assumptions: ASSUMPTIONS,
    byAsset: {
      "asset-a": { electrify: ELECTRIFY_ON, fuelSwitch: FUEL_SWITCH_OFF },
    },
    bySystem: {},
  };

  const persisted = {
    combustion: {
      2025: [
        {
          id: "split-entry",
          name: "Split Boiler",
          category: "stationary",
          fuelType: "diesel",
          unit: "L",
          annualVolume: 100000,
          opex: 9_500_000,
          remainingLife: 10,
          unitCount: 1,
          bu: "Pune",
          allocationMode: "byAsset",
          assetAllocations: {
            "asset-a": { volume: 60000 },
            "asset-b": { volume: 40000 },
          },
        },
      ],
    },
    refrigeration: {},
    settings,
    scenarios,
    baseYear: 2025,
  };
  window.localStorage.setItem("osh-scope1-planner-v4", JSON.stringify(persisted));
}

/** The pass-through (unsplit) counterpart: ONE entry whose own id carries a
 *  real, enabled lever directly — the property every one of these sites must
 *  keep behaving exactly as before. */
function seedUnsplitEntry() {
  window.localStorage.setItem("osh-assets-v1", JSON.stringify({ assets: [] }));
  const settings = {
    assumptions: ASSUMPTIONS,
    byAsset: {
      "boiler-1": { electrify: ELECTRIFY_ON, fuelSwitch: FUEL_SWITCH_OFF },
    },
    bySystem: {},
  };
  const persisted = {
    combustion: {
      2025: [
        {
          id: "boiler-1",
          name: "Boiler One",
          category: "stationary",
          fuelType: "diesel",
          unit: "L",
          annualVolume: 60000,
          opex: 5_700_000,
          remainingLife: 10,
          unitCount: 1,
          bu: "Pune",
        },
      ],
    },
    refrigeration: {},
    settings,
    scenarios: [],
    baseYear: 2025,
  };
  window.localStorage.setItem("osh-scope1-planner-v4", JSON.stringify(persisted));
}

function cutTonnesFrom(text: string): number {
  const m = text.match(/−([\d,.]+) t/);
  if (!m) throw new Error(`no "−X t" figure found in: ${text}`);
  return parseFloat(m[1].replace(/,/g, ""));
}

describe("BuilderTab — split entries (Task 9)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("rolls up SourceImpact's abatement across a split entry's assets instead of reading 0", () => {
    seedSplitEntry();
    render(<Wrapper><BuilderTab /></Wrapper>);
    fireEvent.click(screen.getByText("Stationary"));
    fireEvent.click(screen.getByText("Split Boiler"));
    // "Cut" readout: "−X t · Y%" — must be non-zero even though the entry's
    // OWN id ("split-entry") has no settings.byAsset entry; the real lever
    // lives on "asset-a".
    const cutLabel = screen.getByText("Cut");
    const cutValue = cutLabel.nextElementSibling as HTMLElement;
    expect(cutTonnesFrom(cutValue.textContent ?? "")).toBeGreaterThan(0);
  });

  it("disables 'Apply suggestion' for a split entry with an explanation, instead of writing a dead key", () => {
    seedSplitEntry();
    render(<Wrapper><BuilderTab /></Wrapper>);
    fireEvent.click(screen.getByText("Stationary"));
    fireEvent.click(screen.getByText("Split Boiler"));
    const applyBtn = screen.getByRole("button", { name: /Apply suggestion/i }) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    expect(screen.getAllByText(/split across its assets/i).length).toBeGreaterThan(0);
  });

  it("shows a 'split across its assets' message instead of a dead 'Add plan' button on the per-asset editor", () => {
    seedSplitEntry();
    render(<Wrapper><BuilderTab /></Wrapper>);
    fireEvent.click(screen.getByText("Stationary"));
    fireEvent.click(screen.getByText("Split Boiler"));
    expect(screen.queryByRole("button", { name: /^Add plan$/i })).toBeFalsy();
  });

  it("regression — an UNSPLIT entry's SourceImpact still rolls up (single-row pass-through) to a non-zero cut", () => {
    seedUnsplitEntry();
    render(<Wrapper><BuilderTab /></Wrapper>);
    fireEvent.click(screen.getByText("Stationary"));
    fireEvent.click(screen.getByText("Boiler One"));
    const cutLabel = screen.getByText("Cut");
    const cutValue = cutLabel.nextElementSibling as HTMLElement;
    expect(cutTonnesFrom(cutValue.textContent ?? "")).toBeGreaterThan(0);
  });

  it("regression — an UNSPLIT entry's 'Apply suggestion' stays enabled and functional", () => {
    seedUnsplitEntry();
    render(<Wrapper><BuilderTab /></Wrapper>);
    fireEvent.click(screen.getByText("Stationary"));
    fireEvent.click(screen.getByText("Boiler One"));
    const applyBtn = screen.getByRole("button", { name: /Apply suggestion/i }) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(false);
    // Clicking it must still be able to change the plan (no explanation shown).
    expect(screen.queryByText(/split across its assets/i)).toBeFalsy();
  });

  it("resolves a lever key (asset id) to its real name in the saved-scenario diff, instead of a bare id", () => {
    const changedSettings = {
      assumptions: ASSUMPTIONS,
      byAsset: {
        "asset-a": { electrify: { ...ELECTRIFY_ON, capacityPct: 90 }, fuelSwitch: FUEL_SWITCH_OFF },
      },
      bySystem: {},
    };
    seedSplitEntry([{ id: "sc-1", name: "Saved", savedAt: Date.now(), settings: changedSettings }]);
    render(<Wrapper><BuilderTab /></Wrapper>);
    // Home screen shows the saved-scenario list with a diff icon.
    fireEvent.click(screen.getByLabelText(/Diff Saved against current plan/i));
    expect(screen.getByText(/Boiler A/)).toBeTruthy();
    expect(screen.queryByText("asset-a")).toBeFalsy();
  });
});

describe("BuilderTab — FuelSwitchControls / FlexFuelControls tolerate a missing lever key (Task 9 crash fix)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function ScenarioOnly({ children }: { children: React.ReactNode }) {
    return (
      <CompanyProvider>
        <ScenarioProvider>
          {children}
        </ScenarioProvider>
      </CompanyProvider>
    );
  }

  const splitStationaryAsset: CombustionAsset = {
    id: "split-entry",
    name: "Split Boiler",
    category: "stationary",
    fuelType: "diesel",
    unit: "L",
    annualVolume: 100000,
    opex: 9_500_000,
    remainingLife: 10,
    unitCount: 1,
    bu: "Pune",
    allocationMode: "byAsset",
    assetAllocations: { "asset-a": { volume: 60000 }, "asset-b": { volume: 40000 } },
  };

  const splitMobileAsset: CombustionAsset = {
    id: "split-fleet",
    name: "Split Fleet",
    category: "mobile",
    fuelType: "diesel",
    unit: "L",
    annualVolume: 50000,
    opex: 2_000_000,
    remainingLife: 8,
    unitCount: 10,
    bu: "Pune",
    allocationMode: "byAsset",
    assetAllocations: { "asset-a": { volume: 30000 }, "asset-b": { volume: 20000 } },
  };

  it("FuelSwitchControls renders without throwing when settings.byAsset has no entry for the asset's id", () => {
    // No combustion seeded at all, so settings.byAsset["split-entry"] is
    // genuinely absent — the exact shape of a split entry's own (lever-less)
    // id. This is the crash BuilderTab.tsx:753 names: no optional chaining
    // on settings.byAsset[asset.id] before reading .fuelSwitch.
    expect(() =>
      render(
        <ScenarioOnly>
          <FuelSwitchControls asset={splitStationaryAsset} />
        </ScenarioOnly>,
      ),
    ).not.toThrow();
  });

  it("FlexFuelControls renders without throwing when settings.byAsset has no entry for the asset's id", () => {
    expect(() =>
      render(
        <ScenarioOnly>
          <FlexFuelControls asset={splitMobileAsset} />
        </ScenarioOnly>,
      ),
    ).not.toThrow();
  });
});
