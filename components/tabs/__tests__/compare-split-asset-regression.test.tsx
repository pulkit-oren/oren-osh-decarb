// @vitest-environment jsdom
// Task 6, fix round 1: regression coverage for the resolved-vs-raw asset list.
//
// The brief called CompareTab the worst case because it puts a live column
// and saved-scenario columns in ONE table, computed off two different lists
// if either drifts. This test seeds a single combustion entry resolved via
// resolveAssets() into TWO asset rows (one, "asset-a", carrying an enabled
// electrify lever; the other, "asset-b", with none), then asserts the live
// column and the one saved-scenario column (identical settings) render the
// SAME "Emissions cut by 2030" figure.
//
// A revert of CompareTab.tsx:40 back to raw `baseAssets` would fail this
// test silently under the full suite otherwise: raw baseAssets for this
// fixture is a single row keyed to the ENTRY id ("split-entry"), which has
// no `settings.byAsset` entry (settings are keyed to the ASSET ids "asset-a"
// / "asset-b" the entry resolves to) — so the saved-scenario column would
// show 0% abatement while the live column (already wired to
// resolvedBaseAssets since Task 4) shows the real cut. The mismatch is
// exactly the "up to 2x" divergence the brief warns about, just visible here
// as "some abatement" vs "none" rather than a 2x ratio.
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { AssetProvider } from "@/lib/assets/store";
import { CompanyProvider } from "@/lib/company/store";
import { CompareTab } from "../CompareTab";

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

/**
 * Seeds:
 *  - an asset registry ("osh-assets-v1") with two stationary assets,
 *    "asset-a" and "asset-b"
 *  - one combustion entry ("split-entry", 100,000 L) in byAsset mode,
 *    allocating its FULL volume across those two assets (60,000 / 40,000 —
 *    no unallocated remainder, so resolveAssets emits exactly two rows)
 *  - a lever (60% electrify) enabled ONLY on settings.byAsset["asset-a"] —
 *    the raw entry id ("split-entry") has no lever settings at all
 *  - one saved scenario whose settings are a deep copy of the live settings,
 *    so the live and saved-scenario computations differ only in which
 *    asset list (raw vs resolved) they run over
 */
function seedSplitEntry() {
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
    assumptions: {
      gridEf: 0.71,
      renewableSourcingPct: 50,
      recCostPerTonne: 800,
      carbonPricePerTonne: 2000,
      infraCapex: 15_000_000,
    },
    byAsset: {
      "asset-a": {
        electrify: {
          enabled: true,
          unitsToConvert: 0,
          capacityPct: 60,
          cop: 3,
          tariffPerKwh: 9,
          assetCapex: 4_000_000,
          startYear: 2026,
          targetYear: 2028,
        },
        fuelSwitch: {
          enabled: false,
          altFuel: "biodiesel",
          blendPct: 0,
          efficiencyPenaltyPct: 2,
          altFuelPricePerUnit: 78,
          retrofitCapex: 0,
          startYear: 2027,
          targetYear: 2033,
        },
      },
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
    scenarios: [
      {
        id: "sc-1",
        name: "Saved",
        savedAt: Date.now(),
        settings: JSON.parse(JSON.stringify(settings)),
      },
    ],
    baseYear: 2025,
  };
  window.localStorage.setItem("osh-scope1-planner-v4", JSON.stringify(persisted));
}

describe("CompareTab — live vs saved-scenario columns on a split (byAsset-resolved) entry", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the identical 'Emissions cut by 2030' figure in the live and saved-scenario columns", () => {
    seedSplitEntry();
    render(
      <Wrapper>
        <CompareTab />
      </Wrapper>,
    );

    const label = screen.getByText("Emissions cut by 2030");
    const row = label.closest("tr");
    if (!row) throw new Error("comparison row ('Emissions cut by 2030') not found");
    const cells = within(row).getAllByRole("cell");
    // cells[0] = row label; cells[1] = "Current (live)"; cells[2] = the one saved scenario.
    expect(cells.length).toBeGreaterThanOrEqual(3);
    const live = cells[1].textContent;
    const saved = cells[2].textContent;

    // Sanity: the lever must actually be doing something, or a regression to
    // raw baseAssets (which would show 0% on BOTH sides, since "split-entry"
    // has no settings.byAsset entry either) would pass this test vacuously.
    expect(live).not.toBe("0%");
    expect(saved).toBe(live);
  });
});
