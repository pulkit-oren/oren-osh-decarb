// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { CompanyProvider } from "@/lib/company/store";
import { ActivityDataTab } from "../ActivityDataTab";

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

// ── renderActivityInTypeScreen ────────────────────────────────────────────────
// Seeds localStorage for BU mode with one BU "Pune" (aggregate: true),
// then renders ActivityDataTab and navigates to the given fuel's type screen
// by clicking the category card then the fuel card.

interface TypeScreenOpts {
  family: "liquid" | "gas" | "solid";
  fuel: string;   // e.g. "diesel" (matches the button label search)
  fuelLabel: string; // e.g. "Diesel"
  bus: string[];  // BU names
  value?: number; // optionally pre-seed a value via the input
}

function renderActivityInTypeScreen(opts: TypeScreenOpts) {
  // Seed BU config before mount — the default active company id is "c-0"
  window.localStorage.setItem(
    "osh-bus-v3::c-0",
    JSON.stringify({ mode: "bu", units: opts.bus.map((name) => ({ name, aggregate: true })) }),
  );

  render(
    <Wrapper>
      <ActivityDataTab />
    </Wrapper>,
  );

  // Category labels map
  const catLabel: Record<string, string> = {
    liquid: "Fuels – Liquid",
    gas: "Fuels – Gas",
    solid: "Fuels – Solid",
  };

  // Click the category card (button containing the label text)
  const catBtn = screen.getByText(catLabel[opts.family]).closest("button")!;
  fireEvent.click(catBtn);

  // Now we're on CategoryScreen — click the fuel card (button containing fuelLabel)
  const fuelBtn = screen.getByText(opts.fuelLabel).closest("button")!;
  fireEvent.click(fuelBtn);
}

// ── Existing smoke test (SSR, kept intact) ───────────────────────────────────

describe("ActivityDataTab", () => {
  beforeEach(() => {
    // Clear BU state so SSR test isn't affected by BU config
    window.localStorage.removeItem("osh-bus-v3::c-0");
  });

  it("renders the unified categories and total footprint", () => {
    const html = renderToString(
      <CompanyProvider>
        <ScenarioProvider>
          <Scope2Provider>
            <ActivityDataTab />
          </Scope2Provider>
        </ScenarioProvider>
      </CompanyProvider>,
    );
    expect(html).toContain("Activity data");
    expect(html).toContain("Fuels – Liquid");
    expect(html).toContain("Fuels – Gas");
    expect(html).toContain("Fuels – Solid");
    expect(html).toContain("Bio Fuels");
    expect(html).toContain("Electricity");
    expect(html).toContain("Total footprint");
    expect(html).toContain("Scope 1");
    expect(html).toContain("Scope 2");
  });
});

// ── Interactive BU row tests ──────────────────────────────────────────────────

describe("ActivityDataTab — inline BU row interactions", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("typing a value on a BU row creates the entry and shows emissions", async () => {
    renderActivityInTypeScreen({
      family: "liquid",
      fuel: "diesel",
      fuelLabel: "Diesel",
      bus: ["Pune"],
    });

    // The inline input should now be visible with the BU's aria-label
    const input = await screen.findByLabelText("Pune Diesel consumption");
    expect(input).toBeTruthy();

    // Type a consumption value
    fireEvent.change(input, { target: { value: "100000" } });

    // Emissions cell should now show a value ending in "t"
    const emCells = screen.getAllByText(/\d.*t$/);
    expect(emCells.length).toBeGreaterThan(0);
  });

  it("toggling the central control excludes the BU from the total", async () => {
    renderActivityInTypeScreen({
      family: "liquid",
      fuel: "diesel",
      fuelLabel: "Diesel",
      bus: ["Pune"],
    });

    // First type a value so the entry exists
    const input = await screen.findByLabelText("Pune Diesel consumption");
    fireEvent.change(input, { target: { value: "100000" } });

    // The central toggle button should be present
    const toggle = screen.getByLabelText("Include Pune in central total");
    expect(toggle).toBeTruthy();

    // "Excluded from total" must NOT be shown before the toggle
    expect(screen.queryByText(/Excluded from total/)).toBeFalsy();

    // Click to exclude
    fireEvent.click(toggle);

    // The "Excluded from total" marker should appear
    // getByText throws if not found — this is the assertion
    expect(screen.getByText(/Excluded from total/)).toBeTruthy();
  });

  it("toggling the central control on a NON-aggregate BU flips it to included (bug fix)", async () => {
    // Seed a non-aggregate BU "Goa"
    window.localStorage.setItem(
      "osh-bus-v3::c-0",
      JSON.stringify({ mode: "bu", units: [{ name: "Goa", aggregate: false }] }),
    );

    render(
      <Wrapper>
        <ActivityDataTab />
      </Wrapper>,
    );

    // Navigate to Diesel type screen
    const catBtn = screen.getByText("Fuels – Liquid").closest("button")!;
    fireEvent.click(catBtn);
    const fuelBtn = screen.getByText("Diesel").closest("button")!;
    fireEvent.click(fuelBtn);

    // Type a value to create the entry (ensureEntry is called with aggregate: false)
    const input = await screen.findByLabelText("Goa Diesel consumption");
    fireEvent.change(input, { target: { value: "50000" } });

    // Entry is now created with excluded: true (aggregate: false → excluded: !false = true)
    // "Excluded from total" should be visible
    expect(screen.getByText(/Excluded from total/)).toBeTruthy();

    // Click the central toggle — should flip excluded from true → false (include it)
    const toggle = screen.getByLabelText("Include Goa in central total");
    fireEvent.click(toggle);

    // After the toggle, "Excluded from total" should be gone
    expect(screen.queryByText(/Excluded from total/)).toBeFalsy();
  });
});

// ── Refrigerant gas-card flow tests ──────────────────────────────────────────

function renderActivityInCategory(catKey: "refrigerants") {
  window.localStorage.setItem(
    "osh-bus-v3::c-0",
    JSON.stringify({ mode: "bu", units: [{ name: "Pune", aggregate: true }] }),
  );
  render(
    <Wrapper>
      <ActivityDataTab />
    </Wrapper>,
  );
  // Click the Refrigerants category card
  const catBtn = screen.getByText("Refrigerants & cooling").closest("button")!;
  fireEvent.click(catBtn);
}

describe("ActivityDataTab — refrigerant gas-card flow", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("refrigerants category lists workbook gases and supports per-BU entry", async () => {
    renderActivityInCategory("refrigerants");
    // Should show gas cards — R-404A (HFC) is a workbook gas
    fireEvent.click(await screen.findByText(/R-404A/));
    // now on the gas type screen with BU "Pune"
    const input = await screen.findByLabelText("Pune R-404A (HFC) topped up");
    fireEvent.change(input, { target: { value: "6" } });
    // Emissions cell should now show a value ending in "t" (e.g. "24 t")
    const emCells = screen.getAllByText(/\d\s*t$/);
    expect(emCells.length).toBeGreaterThan(0);
  });

  it("toggling the central control on a refrigerant BU row excludes it from the total", async () => {
    renderActivityInCategory("refrigerants");
    // Navigate to R-404A type screen
    fireEvent.click(await screen.findByText(/R-404A/));
    // Type a kg value in the Pune row to create the entry
    const input = await screen.findByLabelText("Pune R-404A (HFC) topped up");
    fireEvent.change(input, { target: { value: "6" } });
    // "Excluded from total" must NOT appear before the toggle
    expect(screen.queryByText(/Excluded from total/)).toBeFalsy();
    // Click the central toggle to exclude Pune
    const toggle = screen.getByLabelText("Include Pune in central total");
    fireEvent.click(toggle);
    // "Excluded from total" should now appear
    expect(screen.getByText(/Excluded from total/)).toBeTruthy();
  });
});

// ── New workbook fuels visibility test ───────────────────────────────────────
// Regression: FUELS_BY_CATEGORY never included the 20 new workbook fuels
// (jetFuel, marineDiesel*, aviationGasoline, biodiesel, lng, etc.), so the
// old filter hid them from the fuel-card grid.  After re-adding the correct
// mobile/stationary filter, jet fuel is mobile-only so it appears on the Mobile
// tab, not the default Stationary tab.

describe("ActivityDataTab — new workbook fuels are selectable", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows "Jet Fuel (Aviation Turbine Fuel)" card on the Mobile tab of Fuels – Liquid', () => {
    window.localStorage.setItem(
      "osh-bus-v3::c-0",
      JSON.stringify({ mode: "bu", units: [{ name: "Pune", aggregate: true }] }),
    );

    render(
      <Wrapper>
        <ActivityDataTab />
      </Wrapper>,
    );

    // Navigate to the Fuels – Liquid category screen
    const catBtn = screen.getByText("Fuels – Liquid").closest("button")!;
    fireEvent.click(catBtn);

    // Jet Fuel is mobile-only — switch to the Mobile tab first
    const mobileBtn = screen.getByText("mobile");
    fireEvent.click(mobileBtn);

    // Jet Fuel must now be visible as a selectable card
    expect(screen.getByText("Jet Fuel (Aviation Turbine Fuel)")).toBeTruthy();
  });

  it('shows "Fuel Oil / Furnace Oil" card on the default Stationary tab of Fuels – Liquid', () => {
    window.localStorage.setItem(
      "osh-bus-v3::c-0",
      JSON.stringify({ mode: "bu", units: [{ name: "Pune", aggregate: true }] }),
    );

    render(
      <Wrapper>
        <ActivityDataTab />
      </Wrapper>,
    );

    // Navigate to the Fuels – Liquid category screen (default tab is Stationary)
    const catBtn = screen.getByText("Fuels – Liquid").closest("button")!;
    fireEvent.click(catBtn);

    // Fuel Oil is stationary-only and must appear without switching tabs
    expect(screen.getByText("Fuel Oil / Furnace Oil")).toBeTruthy();
  });
});

// ── Bio Fuels category tests ──────────────────────────────────────────────────

describe("ActivityDataTab — Bio Fuels category", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('home screen shows a "Bio Fuels" category card', () => {
    const html = renderToString(
      <CompanyProvider>
        <ScenarioProvider>
          <Scope2Provider>
            <ActivityDataTab />
          </Scope2Provider>
        </ScenarioProvider>
      </CompanyProvider>,
    );
    expect(html).toContain("Bio Fuels");
  });

  it('navigating to "Bio Fuels" shows Biodiesel card on the Mobile tab', () => {
    window.localStorage.setItem(
      "osh-bus-v3::c-0",
      JSON.stringify({ mode: "bu", units: [{ name: "Pune", aggregate: true }] }),
    );

    render(
      <Wrapper>
        <ActivityDataTab />
      </Wrapper>,
    );

    // Navigate to the Bio Fuels category screen
    const catBtn = screen.getByText("Bio Fuels").closest("button")!;
    fireEvent.click(catBtn);

    // Switch to Mobile tab — Biodiesel is in both mobile and stationary
    const mobileBtn = screen.getByText("mobile");
    fireEvent.click(mobileBtn);

    expect(screen.getByText("Biodiesel")).toBeTruthy();
  });

  it('navigating to "Bio Fuels" shows Wood Pellets card on the Stationary tab', () => {
    window.localStorage.setItem(
      "osh-bus-v3::c-0",
      JSON.stringify({ mode: "bu", units: [{ name: "Pune", aggregate: true }] }),
    );

    render(
      <Wrapper>
        <ActivityDataTab />
      </Wrapper>,
    );

    // Navigate to the Bio Fuels category screen (default tab is Stationary)
    const catBtn = screen.getByText("Bio Fuels").closest("button")!;
    fireEvent.click(catBtn);

    // Wood Pellets is stationary-only and should appear without switching tabs
    expect(screen.getByText("Wood Pellets")).toBeTruthy();
  });
});

// ── Mobile restriction tests ──────────────────────────────────────────────────

describe("ActivityDataTab — Mobile tab fuel restriction", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('Solid category Mobile tab shows empty-state (no mobile solid fuels)', () => {
    window.localStorage.setItem(
      "osh-bus-v3::c-0",
      JSON.stringify({ mode: "bu", units: [{ name: "Pune", aggregate: true }] }),
    );

    render(
      <Wrapper>
        <ActivityDataTab />
      </Wrapper>,
    );

    // Navigate to Fuels – Solid
    const catBtn = screen.getByText("Fuels – Solid").closest("button")!;
    fireEvent.click(catBtn);

    // Switch to Mobile tab
    const mobileBtn = screen.getByText("mobile");
    fireEvent.click(mobileBtn);

    // No coal/solid fuels are mobile — should see empty state
    expect(screen.getByText(/No mobile fuels available in this group/)).toBeTruthy();
  });

  it('Liquid category Mobile tab does NOT show "Fuel Oil / Furnace Oil" (stationary-only)', () => {
    window.localStorage.setItem(
      "osh-bus-v3::c-0",
      JSON.stringify({ mode: "bu", units: [{ name: "Pune", aggregate: true }] }),
    );

    render(
      <Wrapper>
        <ActivityDataTab />
      </Wrapper>,
    );

    // Navigate to Fuels – Liquid
    const catBtn = screen.getByText("Fuels – Liquid").closest("button")!;
    fireEvent.click(catBtn);

    // Switch to Mobile tab
    const mobileBtn = screen.getByText("mobile");
    fireEvent.click(mobileBtn);

    // Fuel Oil is stationary-only — must NOT appear on the Mobile tab
    expect(screen.queryByText("Fuel Oil / Furnace Oil")).toBeFalsy();
  });
});

// ── RefrigerantDetailsPanel showCalc=false test (Task 3) ─────────────────────
// Verifies that RefrigerantDetailsPanel (used in EntryScreen) does NOT render
// the "How this is calculated" section — it must live only in the Collapsible.

import { RefrigerantDetailsPanel } from "@/components/tabs/DataInputTab";
import type { RefrigerationSystem } from "@/lib/model/types";

const STUB_REFRIGERANT_SYSTEM: RefrigerationSystem = {
  id: "r-test",
  name: "Test AC",
  systemType: "commercialHVAC",
  refrigerant: "R404A",
  toppedUpKg: 5,
  gasCostPerKg: 400,
};

describe("RefrigerantDetailsPanel — showCalc=false", () => {
  it("does NOT render 'How this is calculated' when used via RefrigerantDetailsPanel", () => {
    render(
      <Wrapper>
        <RefrigerantDetailsPanel s={STUB_REFRIGERANT_SYSTEM} year={2025} />
      </Wrapper>,
    );
    // The calc section heading must NOT appear (showCalc=false)
    expect(screen.queryByText(/How this is calculated/i)).toBeFalsy();
    // The inputs section must still be present (the panel body is unchanged)
    expect(screen.getByText(/Inputs/i)).toBeTruthy();
  });
});

// ── ELEC_TYPES shape test ─────────────────────────────────────────────────────

import { ELEC_TYPES } from "@/components/tabs/activity/shared";

describe("ELEC_TYPES (4 fixed instruments)", () => {
  it("has grid, vppa, solar, irec with Solar onsite labelled and clean EFs zero", () => {
    expect(ELEC_TYPES.map((t) => t.key)).toEqual(["grid", "vppa", "solar", "irec"]);
    const solar = ELEC_TYPES.find((t) => t.key === "solar");
    expect(solar?.label).toBe("Solar onsite");
    expect(solar?.gridEf).toBe(0);
    expect(ELEC_TYPES.find((t) => t.key === "vppa")?.gridEf).toBe(0);
    expect(ELEC_TYPES.find((t) => t.key === "irec")?.gridEf).toBe(0);
    expect(ELEC_TYPES.find((t) => t.key === "grid")?.gridEf).toBe(0.71);
    expect(ELEC_TYPES.some((t) => t.key === "any")).toBe(false);
  });
});

// ── Scope drill-down tests ────────────────────────────────────────────────────

describe("ActivityDataTab — Scope drill-down", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function renderActivityHomeWithData() {
    // Seed store-independent state — just render; the default store seeds diesel + R-404A
    render(
      <Wrapper>
        <ActivityDataTab />
      </Wrapper>,
    );
  }

  it("clicking Scope 1 opens a drill-down listing sources by category", async () => {
    renderActivityHomeWithData();
    fireEvent.click(screen.getByRole("button", { name: /Scope 1 details/i }));
    expect(await screen.findByText("Fuels – Liquid")).toBeTruthy();
    expect(screen.getAllByText(/Diesel/).length).toBeGreaterThan(0);
    expect(screen.getByText("Refrigerants")).toBeTruthy();
  });

  it("null-family fuel (ldo) appears in Other Fuels group in Scope 1 drill-down", async () => {
    // Seed the scope-1 planner store with an LDO combustion asset.
    // LDO has no excelCategory so fuelFamily returns null — Fix 1 adds an
    // "Other Fuels" group for exactly these assets.
    const persisted = {
      combustion: {
        2025: [
          {
            id: "ldo-test",
            name: "LDO boiler",
            category: "stationary",
            fuelType: "ldo",
            unit: "L",
            annualVolume: 50000,
            opex: 4250000,
            remainingLife: 8,
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
          "ldo-test": {
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
    window.localStorage.setItem("osh-scope1-planner-v4", JSON.stringify(persisted));

    render(
      <Wrapper>
        <ActivityDataTab />
      </Wrapper>,
    );

    // Navigate to the Scope 1 drill-down
    fireEvent.click(screen.getByRole("button", { name: /Scope 1 details/i }));

    // Fix 1: "Other Fuels" group header must be visible
    expect(await screen.findByText("Other Fuels")).toBeTruthy();
    // Fix 1: The LDO fuel label must appear in the drill-down
    expect(screen.getByText(/Light diesel oil/i)).toBeTruthy();
  });
});

// ── Collapsible component tests ──────────────────────────────────────────────

import { Collapsible } from "@/components/tabs/activity/Collapsible";

describe("Collapsible", () => {
  it("hides content until the header is clicked", () => {
    render(<Collapsible title="How this is calculated"><p>BODY-MARKER</p></Collapsible>);
    expect(screen.queryByText("BODY-MARKER")).toBeFalsy();
    fireEvent.click(screen.getByRole("button", { name: /How this is calculated/i }));
    expect(screen.getByText("BODY-MARKER")).toBeTruthy();
  });
});

// ── Entry screen calc-collapsed test (Task 3 TDD) ────────────────────────────
// Navigates to the Diesel BU entry screen and verifies the "How this is
// calculated" block is collapsed by default, then expands on click.

async function openDieselBuEntry() {
  window.localStorage.setItem(
    "osh-bus-v3::c-0",
    JSON.stringify({ mode: "bu", units: [{ name: "Pune", aggregate: true }] }),
  );
  render(
    <Wrapper>
      <ActivityDataTab />
    </Wrapper>,
  );
  // Navigate: home → Fuels – Liquid category → Diesel type screen
  const catBtn = screen.getByText("Fuels – Liquid").closest("button")!;
  fireEvent.click(catBtn);
  const fuelBtn = screen.getByText("Diesel").closest("button")!;
  fireEvent.click(fuelBtn);
  // Type a value to create the Pune Diesel entry
  const input = await screen.findByLabelText("Pune Diesel consumption");
  fireEvent.change(input, { target: { value: "100000" } });
  // Click the gear/details button on the Pune row to open the entry screen
  const detailsBtn = screen.getByLabelText("Pune details");
  fireEvent.click(detailsBtn);
}

describe("ActivityDataTab — Entry screen calc collapsible (Task 3)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("entry screen hides the calculation until expanded", async () => {
    await openDieselBuEntry();
    // The "How this is calculated" button must exist (it's the Collapsible toggle)
    expect(screen.getByRole("button", { name: /How this is calculated/i })).toBeTruthy();
    // But the calc body (Energy step) should be hidden by default
    expect(screen.queryByText(/Energy/i)).toBeFalsy();
    // After clicking the Collapsible header, the body should appear
    fireEvent.click(screen.getByRole("button", { name: /How this is calculated/i }));
    expect(screen.getAllByText(/tCO₂e|GJ|Emission factor/i).length).toBeGreaterThan(0);
  });
});
