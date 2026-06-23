// @vitest-environment jsdom
// Task 6: excluded refrigeration systems must NOT appear in the RefrigerantTab advisor;
//         advisor cards must be grouped by BU under a section header.
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { CompanyProvider } from "@/lib/company/store";
import { RefrigerantTab } from "../RefrigerantTab";

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
 * Seeds two refrigeration systems:
 *   - "Included Chiller"  (bu: "Pune",   excluded: false) — R-404A (high GWP, will get a recommendation card)
 *   - "Excluded AC Unit"  (bu: "Mumbai",  excluded: true)  — R-404A
 * Without the fix, both names would appear in the advisor grid.
 * With the fix, only "Included Chiller" appears and "Pune" BU header is present.
 */
function seedTwoRefrigerantSystems() {
  const persisted = {
    combustion: {},
    refrigeration: {
      2025: [
        {
          id: "ref-pune",
          name: "Included Chiller",
          systemType: "commercialHVAC",
          refrigerant: "R404A",
          toppedUpKg: 20,
          gasCostPerKg: 900,
          bu: "Pune",
          // excluded absent → treated as false
        },
        {
          id: "ref-mumbai",
          name: "Excluded AC Unit",
          systemType: "commercialHVAC",
          refrigerant: "R404A",
          toppedUpKg: 10,
          gasCostPerKg: 900,
          bu: "Mumbai",
          excluded: true,
        },
      ],
    },
    settings: {
      assumptions: {
        gridEf: 0.71,
        renewableSourcingPct: 50,
        recCostPerTonne: 800,
        carbonPricePerTonne: 2000,
        infraCapex: 15000000,
      },
      byAsset: {},
      bySystem: {
        "ref-pune": {
          gasSwitch: { enabled: false, transitionPct: 0, altRefrigerant: "R290", retrofitCapex: 0, startYear: 2026, targetYear: 2030 },
          leakFix: { enabled: false, leakImprovementPct: 0, startYear: 2026, targetYear: 2030 },
        },
        "ref-mumbai": {
          gasSwitch: { enabled: false, transitionPct: 0, altRefrigerant: "R290", retrofitCapex: 0, startYear: 2026, targetYear: 2030 },
          leakFix: { enabled: false, leakImprovementPct: 0, startYear: 2026, targetYear: 2030 },
        },
      },
    },
    scenarios: [],
    baseYear: 2025,
  };
  window.localStorage.setItem("osh-scope1-planner-v4", JSON.stringify(persisted));
}

describe("RefrigerantTab — excluded filter + BU grouping (Task 6)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the included system as a recommendation card", () => {
    seedTwoRefrigerantSystems();
    render(
      <Wrapper>
        <RefrigerantTab />
      </Wrapper>,
    );
    expect(screen.getByText("Included Chiller")).toBeTruthy();
  });

  it("does NOT show the excluded system as a recommendation card", () => {
    seedTwoRefrigerantSystems();
    render(
      <Wrapper>
        <RefrigerantTab />
      </Wrapper>,
    );
    expect(screen.queryByText("Excluded AC Unit")).toBeFalsy();
  });

  it("renders a BU group header for the included system's BU", () => {
    seedTwoRefrigerantSystems();
    render(
      <Wrapper>
        <RefrigerantTab />
      </Wrapper>,
    );
    // "Pune" BU section header must appear
    expect(screen.getByText("Pune")).toBeTruthy();
  });

  it("does NOT render a BU group header for the excluded system's BU", () => {
    seedTwoRefrigerantSystems();
    render(
      <Wrapper>
        <RefrigerantTab />
      </Wrapper>,
    );
    // "Mumbai" should NOT appear because its only system is excluded
    expect(screen.queryByText("Mumbai")).toBeFalsy();
  });
});
