// @vitest-environment jsdom
/**
 * Tests for Change 1 (FacilityDetailContent "What we already have" removal)
 * and Change 2 (ScopeScreen hides zero-raw-value rows).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { CompanyProvider } from "@/lib/company/store";
import { ActivityDataTab } from "../ActivityDataTab";
import { FacilityDetailContent } from "@/components/scope2/DataInputTab";
import type { Facility } from "@/lib/scope2/model/types";

// ── Provider wrapper ─────────────────────────────────────────────────────────

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

// ── Change 1: FacilityDetailContent no longer renders "What we already have" ─

const STUB_FACILITY: Facility = {
  id: "fac-test",
  name: "Test Facility",
  annualLoadKwh: 100000,
  peakLoadKw: 100,
  tariffPerKwh: 8,
  gridEf: 0.71,
  loadSplit: { lightingPct: 20, motorPct: 30, hvacPct: 25 },
  roofSpaceM2: 500,
  irradiance: 1500,
  isolated: false,
  existingSolarKwp: 10,
  existingRenewablePct: 5,
};

describe("FacilityDetailContent — Change 1: 'What we already have' removed", () => {
  it("does NOT render 'What we already have' section header", () => {
    render(
      <Wrapper>
        <FacilityDetailContent f={STUB_FACILITY} year={2025} locationT={71} />
      </Wrapper>,
    );
    expect(screen.queryByText(/What we already have/i)).toBeFalsy();
  });

  it("does NOT render the 'Solar already installed' input", () => {
    render(
      <Wrapper>
        <FacilityDetailContent f={STUB_FACILITY} year={2025} locationT={71} />
      </Wrapper>,
    );
    expect(screen.queryByText(/Solar already installed/i)).toBeFalsy();
  });

  it("does NOT render the 'Already on green contracts' input", () => {
    render(
      <Wrapper>
        <FacilityDetailContent f={STUB_FACILITY} year={2025} locationT={71} />
      </Wrapper>,
    );
    expect(screen.queryByText(/Already on green contracts/i)).toBeFalsy();
  });
});

// ── Change 2: ScopeScreen hides zero-raw-value rows ─────────────────────────
//
// Seeded via localStorage ("osh-scope1-planner-v4") with:
//   - "Non-zero fuel" diesel: annualVolume 10000  (MUST show)
//   - "Zero fuel"     diesel: annualVolume 0      (MUST be hidden)
//
// The test clicks the "Scope 1 details" button to reach ScopeScreen.

const SCOPE1_WITH_ZERO_ROW = {
  combustion: {
    2025: [
      {
        id: "nz-fuel",
        name: "Non-zero fuel",
        category: "stationary",
        fuelType: "diesel",
        unit: "L",
        annualVolume: 10000,
        opex: 850000,
        remainingLife: 10,
        unitCount: 1,
      },
      {
        id: "zero-fuel",
        name: "Zero fuel",
        category: "stationary",
        fuelType: "diesel",
        unit: "L",
        annualVolume: 0,
        opex: 0,
        remainingLife: 10,
        unitCount: 1,
      },
    ],
  },
  refrigeration: {},
  settings: {
    assumptions: {
      gridEf: 0.71,
      renewableSourcingPct: 50,
      recCostPerTonne: 800,
      carbonPricePerTonne: 2000,
      infraCapex: 15000000,
    },
    byAsset: {
      "nz-fuel": {
        electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 0, startYear: 2026, targetYear: 2032 },
        fuelSwitch: { enabled: false, altFuel: "biodiesel", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 78, retrofitCapex: 0, startYear: 2027, targetYear: 2033 },
        flexFuel: { enabled: false, unitsToConvert: 0, altFuel: "biodiesel", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 78, retrofitCapex: 0, startYear: 2027, targetYear: 2033 },
      },
      "zero-fuel": {
        electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 0, startYear: 2026, targetYear: 2032 },
        fuelSwitch: { enabled: false, altFuel: "biodiesel", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 78, retrofitCapex: 0, startYear: 2027, targetYear: 2033 },
        flexFuel: { enabled: false, unitsToConvert: 0, altFuel: "biodiesel", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 78, retrofitCapex: 0, startYear: 2027, targetYear: 2033 },
      },
    },
    bySystem: {},
  },
  scenarios: [],
  baseYear: 2025,
};

describe("ScopeScreen — Change 2: hide zero-raw-value rows", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("Scope 1 drill-down shows non-zero source and hides zero-volume source", async () => {
    window.localStorage.setItem("osh-scope1-planner-v4", JSON.stringify(SCOPE1_WITH_ZERO_ROW));

    render(
      <Wrapper>
        <ActivityDataTab />
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Scope 1 details/i }));

    // Non-zero source must appear — its fuel label is "Diesel"
    // (FUELS.diesel.label). We seed two diesel sources named differently,
    // but ScopeScreen shows the fuel label (FUELS[a.fuelType].label) not asset.name,
    // so both would show as "Diesel". Instead check by looking for the raw column
    // which shows "10,000 L" vs "0 L". After filtering, "0 L" must not appear.
    expect((await screen.findAllByText("Fuels – Liquid")).length).toBeGreaterThan(0);
    // The non-zero row's raw input shows as "10,000 L" (fmt(10000) + " L")
    expect(screen.getAllByText(/10[,.]?000 L/i).length).toBeGreaterThan(0);
    // The zero row's raw input shows as "0 L" — must NOT appear
    expect(screen.queryByText(/^0 L$/)).toBeFalsy();
  });
});
