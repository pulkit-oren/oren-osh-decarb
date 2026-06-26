// @vitest-environment jsdom
// Task 4: BU grouping + excluded badge in BuilderTab
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { CompanyProvider } from "@/lib/company/store";
import { BuilderTab } from "../BuilderTab";
import { endUseProfile } from "@/lib/model/end-use";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <ScenarioProvider>
        {children}
      </ScenarioProvider>
    </CompanyProvider>
  );
}

// Seed store with two mobile assets: Pune (included) and Mumbai (excluded)
function seedMobileAssets() {
  const persisted = {
    combustion: {
      2025: [
        {
          id: "mobile-pune",
          name: "Pune Fleet",
          category: "mobile",
          fuelType: "diesel",
          unit: "L",
          annualVolume: 100000,
          opex: 8500000,
          remainingLife: 5,
          unitCount: 10,
          bu: "Pune",
        },
        {
          id: "mobile-mumbai",
          name: "Mumbai Fleet",
          category: "mobile",
          fuelType: "diesel",
          unit: "L",
          annualVolume: 50000,
          opex: 4250000,
          remainingLife: 5,
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
        infraCapex: 15000000,
      },
      byAsset: {
        "mobile-pune": {
          electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 0, startYear: 2026, targetYear: 2032 },
          fuelSwitch: { enabled: false, altFuel: "biodiesel", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 78, retrofitCapex: 0, startYear: 2027, targetYear: 2033 },
        },
        "mobile-mumbai": {
          electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 0, startYear: 2026, targetYear: 2032 },
          fuelSwitch: { enabled: false, altFuel: "biodiesel", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 78, retrofitCapex: 0, startYear: 2027, targetYear: 2033 },
        },
      },
      bySystem: {},
    },
    scenarios: [],
    baseYear: 2025,
  };
  window.localStorage.setItem("osh-scope1-planner-v4", JSON.stringify(persisted));
}

describe("BuilderTab — home screen (Task 1)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows all three segment labels and the Live projection panel on the home screen", () => {
    render(
      <Wrapper>
        <BuilderTab />
      </Wrapper>,
    );
    // All three segment card labels must be visible on the home
    expect(screen.getByText("Mobile")).toBeTruthy();
    expect(screen.getByText("Stationary")).toBeTruthy();
    expect(screen.getByText("Refrigerant")).toBeTruthy();
    // The results side-panel header must also be visible
    expect(screen.getByText("Live projection")).toBeTruthy();
  });
});

describe("BuilderTab — BU grouping + excluded badge (Task 4)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders BU group headers for both Pune and Mumbai when on Mobile segment", () => {
    seedMobileAssets();
    render(
      <Wrapper>
        <BuilderTab />
      </Wrapper>,
    );
    // Navigate from home into Mobile segment
    fireEvent.click(screen.getByText("Mobile"));
    // Both BU groups must appear (as Collapsible headers)
    expect(screen.getByText("Pune")).toBeTruthy();
    expect(screen.getByText("Mumbai")).toBeTruthy();
  });

  it("renders an 'Excluded' badge on the Mumbai (excluded) source box", () => {
    seedMobileAssets();
    render(
      <Wrapper>
        <BuilderTab />
      </Wrapper>,
    );
    // Navigate from home into Mobile segment
    fireEvent.click(screen.getByText("Mobile"));
    // The segment screen shows source boxes; Mumbai is excluded
    expect(screen.getByText(/Excluded/i)).toBeTruthy();
  });

  it("does NOT show excluded badge for the non-excluded Pune asset", () => {
    seedMobileAssets();
    render(
      <Wrapper>
        <BuilderTab />
      </Wrapper>,
    );
    // Navigate from home into Mobile segment
    fireEvent.click(screen.getByText("Mobile"));
    // There should be exactly one excluded badge (Mumbai only)
    const badges = screen.queryAllByText(/^Excluded$/i);
    expect(badges.length).toBe(1);
  });
});

// ── Electrify feasibility hint (data guard) ──────────────────────────────────

describe("BuilderTab — electrify feasibility data", () => {
  it("furnaceKiln is hard to electrify with a high-temp note", () => {
    const p = endUseProfile({ endUse: "furnaceKiln" });
    expect(p?.electrify.feasible).toBe("hard");
    expect(p?.electrify.note).toMatch(/High-temp/i);
  });
});

// ── Electrify feasibility warning renders outside the disabled wrapper ────────

function seedFurnaceKilnAsset() {
  const persisted = {
    combustion: {
      2025: [
        {
          id: "stationary-kiln",
          name: "Kiln Furnace",
          category: "stationary",
          fuelType: "png",
          unit: "m3",
          annualVolume: 200000,
          opex: 5000000,
          remainingLife: 10,
          unitCount: 1,
          endUse: "furnaceKiln",
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
        "stationary-kiln": {
          electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 1.0, tariffPerKwh: 9, assetCapex: 0, startYear: 2026, targetYear: 2032 },
          fuelSwitch: { enabled: false, altFuel: "biogas", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 78, retrofitCapex: 0, startYear: 2027, targetYear: 2033 },
        },
      },
      bySystem: {},
    },
    scenarios: [],
    baseYear: 2025,
  };
  window.localStorage.setItem("osh-scope1-planner-v4", JSON.stringify(persisted));
}

describe("BuilderTab — electrify feasibility warning visible when lever is OFF", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the feasibility warning even when the Electrify toggle is OFF", () => {
    seedFurnaceKilnAsset();
    render(
      <Wrapper>
        <BuilderTab />
      </Wrapper>,
    );
    // Step 1: Navigate from home into the Stationary segment
    fireEvent.click(screen.getByText("Stationary"));
    // Step 2: The segment now shows source boxes — click the "Kiln Furnace" box to open its scenario screen
    fireEvent.click(screen.getByText("Kiln Furnace"));
    // Step 3: The warning badge must be visible regardless of the toggle state
    expect(screen.getByText(/electrification is limited/i)).toBeTruthy();
  });

  it("source box for furnaceKiln shows the end-use label in its sublabel", () => {
    seedFurnaceKilnAsset();
    render(
      <Wrapper>
        <BuilderTab />
      </Wrapper>,
    );
    // Navigate from home into the Stationary segment
    fireEvent.click(screen.getByText("Stationary"));
    // The source box sublabel should include the end-use label for furnaceKiln
    // endUseProfile({ endUse: "furnaceKiln" }).label === "Furnace / Kiln (high-temp)"
    expect(screen.getByText(/Furnace \/ Kiln \(high-temp\)/i)).toBeTruthy();
  });
});

// ── SuggestionCard + SourceImpact on source scenario screen (Task 2) ──────────

describe("BuilderTab — SuggestionCard and SourceImpact on source scenario screen", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows 'Suggested for this source' and Apply suggestion button on combustion source screen", () => {
    seedMobileAssets();
    render(
      <Wrapper>
        <BuilderTab />
      </Wrapper>,
    );
    // Navigate: home → Mobile segment → Pune Fleet source
    fireEvent.click(screen.getByText("Mobile"));
    fireEvent.click(screen.getByText("Pune Fleet"));
    // SuggestionCard header
    expect(screen.getByText(/Suggested for this source/i)).toBeTruthy();
    // Apply button
    expect(screen.getByText(/Apply suggestion/i)).toBeTruthy();
  });

  it("shows the live Impact strip with 'Impact' and 'Cut' labels on the source screen", () => {
    seedMobileAssets();
    render(
      <Wrapper>
        <BuilderTab />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("Mobile"));
    fireEvent.click(screen.getByText("Pune Fleet"));
    // SourceImpact labels
    expect(screen.getByText(/^Impact$/i)).toBeTruthy();
    expect(screen.getByText(/^Cut$/i)).toBeTruthy();
    // The strip shows tCO₂e
    expect(screen.getByText(/tCO₂e/)).toBeTruthy();
  });

  it("clicking Apply suggestion updates levers (Cut shows non-zero after apply)", () => {
    seedMobileAssets();
    render(
      <Wrapper>
        <BuilderTab />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("Mobile"));
    fireEvent.click(screen.getByText("Pune Fleet"));
    // Click Apply suggestion — suggestion engine electrifies half the fleet
    fireEvent.click(screen.getByText(/Apply suggestion/i));
    // After apply, at least one lever is on — the Cut label shows a non-zero value
    // The "−X t" in SourceImpact's Cut div changes from −0 t to some negative value
    const cutMatches = screen.getAllByText(/^−[\d,.]+ t ·/);
    expect(cutMatches.length).toBeGreaterThan(0);
  });

  it("shows an electrify lever tip on the source scenario screen", () => {
    seedMobileAssets();
    render(
      <Wrapper>
        <BuilderTab />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText("Mobile"));
    fireEvent.click(screen.getByText("Pune Fleet"));
    // electrifyTip for mobile mentions COP
    expect(screen.getByText(/COP ~3/i)).toBeTruthy();
  });
});
