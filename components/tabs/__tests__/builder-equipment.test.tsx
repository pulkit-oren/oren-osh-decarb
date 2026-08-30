// @vitest-environment jsdom
// Task 7 — the scenario modeller plans PER EQUIPMENT (spec 5.3, D3).
//
// Replaces components/tabs/__tests__/builder-split-entry.test.tsx, whose
// subject was the "this entry is split, so you cannot plan on it" branches
// port Task 9 added. Under D8 there is no unsplit case: every source resolves
// to one row per equipment and every row carries its own lever key, so those
// branches disabled controls that work. The Builder's per-source screen now
// renders one planning card per machine.
//
// The dead-"Add plan" assertion carried over from that file is INVERTED, not
// deleted (see "shows a live 'Add plan' button" below): it is the only
// automated guard that the port ledger's open defect stays fixed.
//
// Seeding note: every fixture here is written through localStorage, so
// migrateEquipment has already run by assertion time. That is deliberate —
// it is the shape a real user's state has after one hydrate.
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { CompanyProvider } from "@/lib/company/store";
import { BuilderTab, FuelSwitchControls, FlexFuelControls } from "../BuilderTab";
import type { CombustionAsset } from "@/lib/model/types";

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

/** One combustion source ("split-entry", 100,000 L diesel) holding TWO
 *  equipment, split 60,000 / 40,000 with no remainder, and a real enabled
 *  electrify lever on ONLY "asset-a". The source's own id carries nothing —
 *  levers are keyed by equipment id (spec 3.3). */
function seedTwoEquipment(scenarios: unknown[] = [], leveredIds: string[] = ["asset-a"]) {
  const byAsset: Record<string, unknown> = {};
  for (const id of leveredIds) byAsset[id] = { electrify: ELECTRIFY_ON, fuelSwitch: FUEL_SWITCH_OFF };
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
          bu: "Pune",
          equipment: [
            { id: "asset-a", name: "Boiler A", unitCount: 1, remainingLife: 10, endUse: "boiler" },
            { id: "asset-b", name: "Boiler B", unitCount: 1, remainingLife: 10, endUse: "boiler" },
          ],
          allocations: { "asset-a": 60000, "asset-b": 40000 },
        },
      ],
    },
    refrigeration: {},
    settings: {
      assumptions: ASSUMPTIONS,
      byAsset,
      bySystem: {},
    },
    scenarios,
    baseYear: 2025,
  };
  window.localStorage.setItem("osh-scope1-planner-v4", JSON.stringify(persisted));
}

/** The one-equipment counterpart — D8's floor, and the shape every migrated
 *  source has until the user splits it. Its single equipment REUSES the
 *  source's id, which is what keeps a pre-equipment lever resolving. */
function seedOneEquipment() {
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
          bu: "Pune",
          equipment: [{ id: "boiler-1", name: "Boiler One", unitCount: 1, remainingLife: 10, endUse: "boiler" }],
          allocations: { "boiler-1": 60000 },
        },
      ],
    },
    refrigeration: {},
    settings: {
      assumptions: ASSUMPTIONS,
      byAsset: { "boiler-1": { electrify: ELECTRIFY_ON, fuelSwitch: FUEL_SWITCH_OFF } },
      bySystem: {},
    },
    scenarios: [],
    baseYear: 2025,
  };
  window.localStorage.setItem("osh-scope1-planner-v4", JSON.stringify(persisted));
}

function openSource(name: string) {
  render(<Wrapper><BuilderTab /></Wrapper>);
  fireEvent.click(screen.getByText("Stationary"));
  fireEvent.click(screen.getByText(name));
}

function cutTonnesFrom(text: string): number {
  const m = text.match(/−([\d,.]+) t/);
  if (!m) throw new Error(`no "−X t" figure found in: ${text}`);
  return parseFloat(m[1].replace(/,/g, ""));
}

function sourceCutText(): string {
  /* The impact moved from a strip above the levers into the pinned rail beside
     them, so it is found by test id rather than by walking off a label — the
     roll-up being asserted is unchanged, only where it is displayed. */
  return screen.getByTestId("plan-cut").textContent ?? "";
}

function sourceCutTonnes(): number {
  return cutTonnesFrom(sourceCutText());
}

/** The rail prints "−X t · Y%"; the percentage is the discriminating
 *  figure, because the tonnage is clamped at the source baseline. */
function sourceCutPct(): number {
  const text = sourceCutText();
  const m = text.match(/·\s*([\d.]+)\s*%/);
  if (!m) throw new Error(`no "· Y%" figure found in: ${text}`);
  return parseFloat(m[1]);
}

describe("BuilderTab — one planning card per equipment (Task 7, D3)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders a planning card per equipment, named after the machine", () => {
    seedTwoEquipment();
    openSource("Split Boiler");
    expect(within(screen.getByTestId("equipment-card-asset-a")).getByRole("heading", { name: "Boiler A" })).toBeTruthy();
    expect(within(screen.getByTestId("equipment-card-asset-b")).getByRole("heading", { name: "Boiler B" })).toBeTruthy();
  });

  it("gives each card the machine's OWN allocated volume, not the source total", () => {
    seedTwoEquipment();
    openSource("Split Boiler");
    expect(screen.getByTestId("equipment-card-asset-a").textContent).toContain("60,000 L/yr");
    expect(screen.getByTestId("equipment-card-asset-b").textContent).toContain("40,000 L/yr");
  });

  it("offers an enabled 'Apply suggestion' per machine — the disabled split branch is gone", () => {
    seedTwoEquipment();
    openSource("Split Boiler");
    const applies = screen.getAllByRole("button", { name: /Apply suggestion/i }) as HTMLButtonElement[];
    expect(applies).toHaveLength(2);
    for (const b of applies) expect(b.disabled).toBe(false);
    expect(screen.queryByText(/split across its assets/i)).toBeFalsy();
  });

  /** INVERTED from builder-split-entry.test.tsx:191, which asserted this
   *  button was ABSENT. It was absent because a lever written under a split
   *  entry's own id was dead; under D8 the card is bound to an equipment row
   *  whose id IS the lever key, so the button works. The port ledger recorded
   *  the dead button as an open defect — this is the guard that it stays
   *  fixed. Do not re-invert it. */
  it("shows a live 'Add plan' button on a machine with no plan yet", () => {
    seedTwoEquipment();
    openSource("Split Boiler");
    const unplanned = screen.getByTestId("equipment-card-asset-b");
    expect(within(unplanned).getByRole("button", { name: /^Add plan$/i })).toBeTruthy();
  });

  it("adds the plan onto the machine that was clicked, leaving its sibling alone (D3)", () => {
    seedTwoEquipment();
    openSource("Split Boiler");
    const before = sourceCutTonnes();
    fireEvent.click(within(screen.getByTestId("equipment-card-asset-b")).getByRole("button", { name: /^Add plan$/i }));
    // Boiler B now has its own (all-levers-off) plan and its own controls;
    // Boiler A's plan is untouched, so the source cut does not move.
    expect(within(screen.getByTestId("equipment-card-asset-b")).queryByRole("button", { name: /^Add plan$/i })).toBeNull();
    expect(within(screen.getByTestId("equipment-card-asset-a")).queryByRole("button", { name: /^Add plan$/i })).toBeNull();
    expect(sourceCutTonnes()).toBeCloseTo(before, 5);
  });

  it("abates only the machine the lever is on — the sibling's volume is untouched (D3)", () => {
    seedTwoEquipment();
    openSource("Split Boiler");
    const oneLever = sourceCutPct();
    expect(within(screen.getByTestId("equipment-card-asset-b")).getByText(/No plan yet for this asset/i)).toBeTruthy();
    cleanup();

    seedTwoEquipment([], ["asset-a", "asset-b"]);
    openSource("Split Boiler");
    const bothLevers = sourceCutPct();

    // Boiler A holds 60% of the source's volume and the lever electrifies 60%
    // of its capacity, so the source-level cut is 0.6 × 0.6 = 36% — the same
    // figure the compare regression pins. A lever reaching the sibling's
    // 40,000 L as well would read 60% here, which is what the second mount
    // (both machines levered) actually costs.
    expect(oneLever).toBeCloseTo(36, 0);
    expect(bothLevers).toBeCloseTo(60, 0);
  });

  it("rolls SourceImpact up across the equipment instead of reading 0 off the source's own id", () => {
    seedTwoEquipment();
    openSource("Split Boiler");
    expect(sourceCutTonnes()).toBeGreaterThan(0);
  });

  it("resolves a lever key (equipment id) to its real machine name in the saved-scenario diff", () => {
    const changedSettings = {
      assumptions: ASSUMPTIONS,
      byAsset: {
        "asset-a": { electrify: { ...ELECTRIFY_ON, capacityPct: 90 }, fuelSwitch: FUEL_SWITCH_OFF },
      },
      bySystem: {},
    };
    seedTwoEquipment([{ id: "sc-1", name: "Saved", savedAt: Date.now(), settings: changedSettings }]);
    render(<Wrapper><BuilderTab /></Wrapper>);
    fireEvent.click(screen.getByLabelText(/Diff Saved against current plan/i));
    expect(screen.getByText(/Boiler A/)).toBeTruthy();
    expect(screen.queryByText("asset-a")).toBeFalsy();
  });
});

describe("BuilderTab — a one-equipment source (D8's floor) is unchanged", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("still rolls SourceImpact up to a non-zero cut", () => {
    seedOneEquipment();
    openSource("Boiler One");
    expect(sourceCutTonnes()).toBeGreaterThan(0);
  });

  it("still offers exactly one enabled 'Apply suggestion' and no split explanation", () => {
    seedOneEquipment();
    openSource("Boiler One");
    const applies = screen.getAllByRole("button", { name: /Apply suggestion/i }) as HTMLButtonElement[];
    expect(applies).toHaveLength(1);
    expect(applies[0].disabled).toBe(false);
    expect(screen.queryByText(/split across its assets/i)).toBeFalsy();
  });
});

describe("BuilderTab — FuelSwitchControls / FlexFuelControls tolerate a missing lever key", () => {
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

  const stationaryRow: CombustionAsset = {
    id: "asset-a",
    name: "Boiler A",
    category: "stationary",
    fuelType: "diesel",
    unit: "L",
    annualVolume: 60000,
    opex: 5_700_000,
    remainingLife: 10,
    unitCount: 1,
    bu: "Pune",
    equipment: [{ id: "asset-a", name: "Boiler A", unitCount: 1, remainingLife: 10 }],
  };

  const mobileRow: CombustionAsset = {
    id: "van-a",
    name: "Van A",
    category: "mobile",
    fuelType: "diesel",
    unit: "L",
    annualVolume: 30000,
    opex: 2_000_000,
    remainingLife: 8,
    unitCount: 5,
    bu: "Pune",
    equipment: [{ id: "van-a", name: "Van A", unitCount: 5, remainingLife: 8 }],
  };

  it("FuelSwitchControls renders without throwing when settings.byAsset has no entry for the row", () => {
    // No combustion seeded at all, so settings.byAsset["asset-a"] is genuinely
    // absent — the shape an equipment row has before Add plan is pressed.
    expect(() =>
      render(<ScenarioOnly><FuelSwitchControls asset={stationaryRow} /></ScenarioOnly>),
    ).not.toThrow();
  });

  it("FlexFuelControls renders without throwing when settings.byAsset has no entry for the row", () => {
    expect(() =>
      render(<ScenarioOnly><FlexFuelControls asset={mobileRow} /></ScenarioOnly>),
    ).not.toThrow();
  });
});
