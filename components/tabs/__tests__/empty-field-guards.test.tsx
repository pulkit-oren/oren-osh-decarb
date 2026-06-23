// @vitest-environment jsdom
/**
 * Task 8 E2: Empty-field guard hints.
 *
 * E2a — EntryScreen fuel branch: when opex === 0, shows
 *        "Add annual spend to see cost savings in the modeller."
 *        When opex > 0, the hint disappears.
 *
 * E2b — AssetActionCard: when asset.annualVolume === 0, shows
 *        "No consumption entered yet" note in the card.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { CompanyProvider } from "@/lib/company/store";
import { ActivityDataTab } from "../ActivityDataTab";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <ScenarioProvider>
        <Scope2Provider>
          {children}
        </Scope2Provider>
      </ScenarioProvider>
    </CompanyProvider>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

/** Seed a fuel source with the given opex and navigate to its entry screen. */
async function openFuelEntryWithOpex(opex: number) {
  // Seed a persisted combustion asset with opex set
  const persisted = {
    combustion: {
      2025: [
        {
          id: "diesel-opex-test",
          name: "Diesel Test",
          category: "stationary",
          fuelType: "diesel",
          unit: "L",
          annualVolume: 10000,
          opex,
          remainingLife: 8,
          unitCount: 1,
        },
      ],
    },
    refrigeration: {},
    settings: {
      assumptions: {
        gridEf: 0.71, renewableSourcingPct: 50, recCostPerTonne: 800,
        carbonPricePerTonne: 2000, infraCapex: 15000000,
      },
      byAsset: {},
      bySystem: {},
    },
    scenarios: [],
    baseYear: 2025,
  };
  window.localStorage.setItem("osh-scope1-planner-v4", JSON.stringify(persisted));
  window.localStorage.setItem(
    "osh-bus-v3::c-0",
    JSON.stringify({ mode: "bu", units: [{ name: "Pune", aggregate: true }] }),
  );

  render(
    <Wrapper>
      <ActivityDataTab />
    </Wrapper>,
  );

  // Navigate: home → Fuels – Liquid → click the row
  fireEvent.click(screen.getByText("Fuels – Liquid").closest("button")!);
  // Find the source row by the test name and click it
  const nameSpan = screen.getAllByText("Diesel Test").find((el) => el.tagName === "SPAN");
  fireEvent.click(nameSpan!.closest("div")!);
}

/* ── E2a: opex hint on fuel entry screen ─────────────────────────────────────── */

describe("EntryScreen — E2a: opex=0 hint", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the hint when opex === 0", async () => {
    await openFuelEntryWithOpex(0);
    expect(
      screen.getByText(/Add annual spend to see cost savings in the modeller\./i),
    ).toBeTruthy();
  });

  it("does NOT show the hint when opex > 0", async () => {
    await openFuelEntryWithOpex(500000);
    expect(
      screen.queryByText(/Add annual spend to see cost savings in the modeller\./i),
    ).toBeFalsy();
  });
});

/* ── E2b: annualVolume hint on AssetActionCard ───────────────────────────────── */

import { BuilderTab } from "../BuilderTab";
import type { CombustionAsset } from "@/lib/model/types";

/** Seed a combustion asset with the given annualVolume and render the BuilderTab. */
function renderBuilderWithAsset(annualVolume: number) {
  const asset: CombustionAsset = {
    id: "vol-test-asset",
    name: "Volume Test Boiler",
    category: "stationary",
    fuelType: "diesel",
    annualVolume,
    unit: "L",
    opex: 0,
    remainingLife: 10,
    unitCount: 1,
  };

  const persisted = {
    combustion: { 2025: [asset] },
    refrigeration: {},
    settings: {
      assumptions: {
        gridEf: 0.71, renewableSourcingPct: 50, recCostPerTonne: 800,
        carbonPricePerTonne: 2000, infraCapex: 15000000,
      },
      byAsset: {
        "vol-test-asset": {
          electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 0, startYear: 2026, targetYear: 2032 },
          fuelSwitch: { enabled: false, altFuel: "biodiesel", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 78, retrofitCapex: 0, startYear: 2027, targetYear: 2033 },
          flexFuel: null,
        },
      },
      bySystem: {},
    },
    scenarios: [],
    baseYear: 2025,
  };
  window.localStorage.setItem("osh-scope1-planner-v4", JSON.stringify(persisted));

  render(
    <Wrapper>
      <BuilderTab />
    </Wrapper>,
  );

  // Switch to the Stationary segment
  fireEvent.click(screen.getByText("Stationary"));
}

describe("AssetActionCard — E2b: annualVolume=0 hint", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows 'No consumption entered yet' when annualVolume === 0", () => {
    renderBuilderWithAsset(0);
    expect(screen.getByText(/No consumption entered yet/i)).toBeTruthy();
  });

  it("does NOT show 'No consumption entered yet' when annualVolume > 0", () => {
    renderBuilderWithAsset(10000);
    expect(screen.queryByText(/No consumption entered yet/i)).toBeFalsy();
  });
});
