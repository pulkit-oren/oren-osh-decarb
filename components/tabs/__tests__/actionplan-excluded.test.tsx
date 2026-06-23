// @vitest-environment jsdom
// Task 5: excluded sources must NOT appear in Action Plan plan-item rows;
//         plan items must be grouped by BU.
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { CompanyProvider } from "@/lib/company/store";
import { ActionPlanTab } from "../ActionPlanTab";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <ScenarioProvider>
        {children}
      </ScenarioProvider>
    </CompanyProvider>
  );
}

/**
 * Seeds two mobile assets:
 *   - "Included Fleet" (bu: "Pune", excluded: false) — electrify lever ON
 *   - "Excluded Fleet" (bu: "Mumbai", excluded: true)  — electrify lever ON
 * Both have the same lever settings so, without the filter, both would
 * produce a plan-item row.  With the filter only "Included Fleet" appears.
 */
function seedTwoMobileAssets() {
  const persisted = {
    combustion: {
      2025: [
        {
          id: "inc-fleet",
          name: "Included Fleet",
          category: "mobile",
          fuelType: "diesel",
          unit: "L",
          annualVolume: 120000,
          opex: 11_400_000,
          remainingLife: 6,
          unitCount: 5,
          bu: "Pune",
          // excluded absent → treated as false
        },
        {
          id: "exc-fleet",
          name: "Excluded Fleet",
          category: "mobile",
          fuelType: "diesel",
          unit: "L",
          annualVolume: 50000,
          opex: 4_750_000,
          remainingLife: 6,
          unitCount: 5,
          bu: "Mumbai",
          excluded: true,
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
        infraCapex: 15_000_000,
      },
      byAsset: {
        "inc-fleet": {
          electrify: {
            enabled: true,
            unitsToConvert: 3,
            capacityPct: 0,
            cop: 3,
            tariffPerKwh: 9,
            assetCapex: 4_000_000,
            startYear: 2026,
            targetYear: 2030,
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
        "exc-fleet": {
          electrify: {
            enabled: true,
            unitsToConvert: 3,
            capacityPct: 0,
            cop: 3,
            tariffPerKwh: 9,
            assetCapex: 4_000_000,
            startYear: 2026,
            targetYear: 2030,
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
    },
    scenarios: [],
    baseYear: 2025,
  };
  window.localStorage.setItem("osh-scope1-planner-v4", JSON.stringify(persisted));
}

describe("ActionPlanTab — excluded filter + BU grouping (Task 5)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the included asset as a plan-item row", () => {
    seedTwoMobileAssets();
    render(
      <Wrapper>
        <ActionPlanTab />
      </Wrapper>,
    );
    // The non-excluded asset's name must appear in the plan list
    expect(screen.getByText("Included Fleet")).toBeTruthy();
  });

  it("does NOT show the excluded asset as a plan-item row", () => {
    seedTwoMobileAssets();
    render(
      <Wrapper>
        <ActionPlanTab />
      </Wrapper>,
    );
    // The excluded asset's name must NOT appear anywhere in the rendered output
    expect(screen.queryByText("Excluded Fleet")).toBeFalsy();
  });

  it("renders a BU group header for the included asset's BU", () => {
    seedTwoMobileAssets();
    render(
      <Wrapper>
        <ActionPlanTab />
      </Wrapper>,
    );
    // The "Pune" BU section header must appear (plan is grouped by BU)
    expect(screen.getByText("Pune")).toBeTruthy();
  });

  it("does NOT render a BU group header for the excluded asset's BU", () => {
    seedTwoMobileAssets();
    render(
      <Wrapper>
        <ActionPlanTab />
      </Wrapper>,
    );
    // "Mumbai" should NOT appear as a plan-item section header
    // (the excluded asset has no row, so its BU group is never created)
    expect(screen.queryByText("Mumbai")).toBeFalsy();
  });
});
