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

// ── renderActivityWithBu ───────────────────────────────────────────────────────
// Seeds BU config and renders the ActivityDataTab.

interface BuOpts {
  units: { name: string; aggregate: boolean }[];
}

function renderActivityWithBu(opts: BuOpts) {
  window.localStorage.setItem(
    "osh-bus-v3::c-0",
    JSON.stringify({ mode: "bu", units: opts.units }),
  );
  render(
    <Wrapper>
      <ActivityDataTab />
    </Wrapper>,
  );
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
// Navigates to the Diesel BU entry screen via the new SourceListScreen flow
// and verifies the "How this is calculated" block is collapsed by default.

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
  // Navigate: home → Fuels – Liquid category → Add a source → fill in Diesel → submit → click row
  fireEvent.click(screen.getByText("Fuels – Liquid").closest("button")!);
  fireEvent.click(screen.getByRole("button", { name: /Add a source/i }));
  fireEvent.change(screen.getByLabelText(/Source name/i), { target: { value: "Pune Diesel" } });
  // Leave all defaults (stationary, first fuel, no BU), just submit
  fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
  // Now click the source row to open the entry screen
  // The row is a div with onClick; find the name span and click its parent
  const nameSpan = screen.getAllByText("Pune Diesel").find((el) => el.tagName === "SPAN");
  fireEvent.click(nameSpan!.closest("div")!);
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

// ── Refrigerant gear → full screen (Task 5) ──────────────────────────────────
// Navigate via the new SourceListScreen flow.

async function openR404aBuRow() {
  window.localStorage.setItem(
    "osh-bus-v3::c-0",
    JSON.stringify({ mode: "bu", units: [{ name: "Pune", aggregate: true }] }),
  );
  render(
    <Wrapper>
      <ActivityDataTab />
    </Wrapper>,
  );
  // Navigate: home → Refrigerants & cooling → Add a source → name + R-404A → submit
  fireEvent.click(screen.getByText("Refrigerants & cooling").closest("button")!);
  fireEvent.click(screen.getByRole("button", { name: /Add a source/i }));
  fireEvent.change(screen.getByLabelText(/Source name/i), { target: { value: "Pune R404A System" } });
  // The gas dropdown should have R-404A; select it by label
  const gasSelect = screen.getByLabelText(/Refrigerant gas/i);
  // Find the option value for R-404A
  const r404aOption = Array.from(gasSelect.querySelectorAll("option")).find(
    (o) => o.textContent?.includes("R-404A")
  );
  if (r404aOption) {
    fireEvent.change(gasSelect, { target: { value: r404aOption.value } });
  }
  fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
}

describe("ActivityDataTab — refrigerant gear opens full entry screen (Task 5)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("refrigerant gear opens the full refrigerant entry screen", async () => {
    await openR404aBuRow();
    // Click the source row to navigate to the entry screen
    const nameSpanR = screen.getAllByText("Pune R404A System").find((el) => el.tagName === "SPAN");
    fireEvent.click(nameSpanR!.closest("div")!);
    // full screen: Details for the scenario modeller + collapsible calc, NOT a side panel
    expect(screen.getByRole("button", { name: /How this is calculated/i })).toBeTruthy();
    expect(screen.getByText(/Details for the scenario modeller/i)).toBeTruthy();
  });
});

// ── Electricity BU-first 4-box flow tests (Task 4) ───────────────────────────

async function openElectricityCategory() {
  window.localStorage.setItem(
    "osh-bus-v3::c-0",
    JSON.stringify({ mode: "bu", units: [{ name: "Pune", aggregate: true }] }),
  );
  render(
    <Wrapper>
      <ActivityDataTab />
    </Wrapper>,
  );
  // Click the Electricity category card
  const catBtn = screen.getByText("Electricity").closest("button")!;
  fireEvent.click(catBtn);
}

async function openPuneElectricity() {
  await openElectricityCategory();
  // Click the "Pune" row to navigate to the BU electricity screen
  const puneBtn = screen.getByText("Pune").closest("button")!;
  fireEvent.click(puneBtn);
}

describe("ActivityDataTab — Electricity BU-first flow (Task 4)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("electricity goes straight to the BU list (no instrument cards)", async () => {
    await openElectricityCategory(); // helper: bu mode w/ a unit "Pune", click Electricity card
    expect(screen.queryByText("Virtual PPA")).toBeFalsy();   // no instrument card on the cat screen
    expect(screen.getByText("Pune")).toBeTruthy();           // BU row present
  });

  it("a BU electricity screen has 4 boxes; only Purchased drives emissions", async () => {
    await openPuneElectricity();   // helper: ...→ click the Pune row
    const purchased = screen.getByLabelText("Pune Purchased electricity");
    const vppa = screen.getByLabelText("Pune Virtual PPA");
    expect(screen.getByLabelText("Pune Solar onsite")).toBeTruthy();
    expect(screen.getByLabelText("Pune I-REC")).toBeTruthy();
    fireEvent.change(purchased, { target: { value: "200000" } });
    // 200000 * 0.71 / 1000 = 142
    expect(screen.getAllByText(/142/).length).toBeGreaterThan(0);
    fireEvent.change(vppa, { target: { value: "50000" } });
    expect(screen.getAllByText(/142/).length).toBeGreaterThan(0); // unchanged — vppa is clean
  });
});

// ── Task 2: BU mode removal tests ────────────────────────────────────────────

describe("ActivityDataTab — Task 2: BU mode removal", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("Business Units screen has no central/by-BU mode and lists units", async () => {
    renderActivityWithBu({ units: [{ name: "Pune", aggregate: true }] });
    fireEvent.click(screen.getByRole("button", { name: /Business units/i }));
    expect(screen.queryByText(/How is the data collected/i)).toBeFalsy(); // mode radio gone
    expect(screen.getByText("Pune")).toBeTruthy();
  });

  it("electricity shows a Company-wide row plus each BU", async () => {
    renderActivityWithBu({ units: [{ name: "Pune", aggregate: true }] });
    fireEvent.click(await screen.findByText("Electricity"));
    expect(screen.getByText(/Company-wide/i)).toBeTruthy();
    expect(screen.getByText("Pune")).toBeTruthy();
  });
});

// ── Task 3: Fuel entry screen shows modeller fields only ─────────────────────
// Verifies the fuel entry "Details for the scenario modeller" section shows
// only Annual spend, Number of units, and Remaining life — no Category control,
// no Site / location, no Metered volume / spend toggle.

async function openDieselSourceEntry() {
  window.localStorage.setItem(
    "osh-bus-v3::c-0",
    JSON.stringify({ mode: "bu", units: [{ name: "Pune", aggregate: true }] }),
  );
  render(
    <Wrapper>
      <ActivityDataTab />
    </Wrapper>,
  );
  // Navigate: home → Fuels – Liquid category → Add a source → fill in Diesel → submit → click row
  fireEvent.click(screen.getByText("Fuels – Liquid").closest("button")!);
  fireEvent.click(screen.getByRole("button", { name: /Add a source/i }));
  fireEvent.change(screen.getByLabelText(/Source name/i), { target: { value: "Diesel gensets" } });
  fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
  // Click the source row to open the entry screen
  const nameSpan = screen.getAllByText("Diesel gensets").find((el) => el.tagName === "SPAN");
  fireEvent.click(nameSpan!.closest("div")!);
}

describe("ActivityDataTab — Task 3: fuel entry modeller fields only", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("fuel entry details show modeller fields only (no stationary/mobile, no site)", async () => {
    await openDieselSourceEntry(); // helper: add 'Diesel gensets', click it
    expect(screen.getByLabelText(/Number of units/i)).toBeTruthy();
    expect(screen.getByText(/Annual spend/i)).toBeTruthy();
    expect(screen.queryByText(/Site \/ location/i)).toBeFalsy();
    expect(screen.queryByText(/Metered volume/i)).toBeFalsy();   // inputMode toggle gone
    // category control absent in details
    expect(screen.queryByText(/^Category$/i)).toBeFalsy();
  });
});

// ── SourceListScreen tests (Task 1) ──────────────────────────────────────────

describe("ActivityDataTab — SourceListScreen (Task 1)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("category shows a source list and adding a source creates it", async () => {
    renderActivityWithBu({ units: [{ name: "Pune", aggregate: true }] });
    fireEvent.click(await screen.findByText("Fuels – Liquid"));
    // no all-fuels grid: a known non-added fuel card is absent
    expect(screen.queryByText("Marine Gas Oil (ULSGO)")).toBeFalsy();
    fireEvent.click(screen.getByRole("button", { name: /Add a source/i }));
    fireEvent.change(screen.getByLabelText(/Source name/i), { target: { value: "Diesel gensets" } });
    // fuel + type + BU default to first sensible values; submit
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    expect(screen.getAllByText("Diesel gensets").length).toBeGreaterThan(0);
  });

  it("excluded source shows an always-visible 'Excluded from total' badge on the row", async () => {
    renderActivityWithBu({ units: [{ name: "Pune", aggregate: true }] });
    fireEvent.click(await screen.findByText("Fuels – Liquid"));
    // Add a source
    fireEvent.click(screen.getByRole("button", { name: /Add a source/i }));
    fireEvent.change(screen.getByLabelText(/Source name/i), { target: { value: "Excluded Genset" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    // Badge should not be visible yet (source is included by default)
    expect(screen.queryByText(/Excluded from total/i)).toBeFalsy();
    // Toggle excluded via the central button (it's inside hover group but still clickable)
    const toggleBtn = screen.getByRole("button", { name: /Include Excluded Genset in central total/i });
    fireEvent.click(toggleBtn);
    // Now the always-visible badge must appear
    expect(screen.getByText(/Excluded from total/i)).toBeTruthy();
  });
});
