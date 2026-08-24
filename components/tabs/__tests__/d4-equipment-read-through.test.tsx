// @vitest-environment jsdom
// Task 4, fix round 1 (Ruling M) — the D4 read-through.
//
// After migrateEquipment moves unitCount / remainingLife / endUse down onto
// equipment[0] and STRIPS the flat copies, every UI site still binding to the
// raw entry's flat field reads `undefined`. Three of those were user-visible
// breakages, and each one is silent — a blank input, a vanished panel, a
// plausible-looking wrong number — so each gets a test rather than a note.
//
// Every fixture here is an ALREADY-MIGRATED source: `equipment` present, no
// flat unitCount / remainingLife / endUse anywhere. That is the shape a real
// user's localStorage has after one hydrate, and it is precisely the shape the
// pre-fix code mishandled.
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider, useScenario } from "@/lib/store";
import { CompanyProvider } from "@/lib/company/store";
import { BuilderTab } from "../BuilderTab";
import { CombustionDetails } from "../DataInputTab";
import type { CombustionAsset } from "@/lib/model/types";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <ScenarioProvider>
        {children}
      </ScenarioProvider>
    </CompanyProvider>
  );
}

const EMPTY_SETTINGS = {
  assumptions: {
    gridEf: 0.71,
    renewableSourcingPct: 50,
    recCostPerTonne: 800,
    carbonPricePerTonne: 2000,
    infraCapex: 15_000_000,
  },
  byAsset: {},
  bySystem: {},
};

function seed(entry: Record<string, unknown>) {
  window.localStorage.setItem(
    "osh-scope1-planner-v4",
    JSON.stringify({
      combustion: { 2025: [entry] },
      refrigeration: {},
      settings: EMPTY_SETTINGS,
      scenarios: [],
      baseYear: 2025,
    }),
  );
}

/* ── 1. DataInputTab's two D4 controls ───────────────────────────────────── */

/** Renders the modeller-only detail block against the LIVE store entry, so an
 *  edit round-trips through updateCombustion and back into the input. The two
 *  probes expose where the value landed: on the equipment (right) or flat on
 *  the entry, where resolveEquipment would ignore it (wrong). */
function ModellerHost() {
  const { combustion } = useScenario();
  const a = combustion[2025]?.[0];
  if (!a) return null;
  return (
    <>
      <CombustionDetails a={a} year={2025} modellerOnly />
      <span data-testid="equipment">{JSON.stringify(a.equipment)}</span>
      <span data-testid="flat">{JSON.stringify({ unitCount: a.unitCount, remainingLife: a.remainingLife })}</span>
    </>
  );
}

const MIGRATED_STATIONARY = {
  id: "boiler-1",
  name: "PNG Boiler",
  category: "stationary",
  fuelType: "png",
  unit: "m3",
  annualVolume: 180000,
  opex: 9_000_000,
  bu: "Pune",
  equipment: [{ id: "boiler-1", name: "PNG Boiler", unitCount: 7, remainingLife: 4, endUse: "boiler" }],
  allocations: { "boiler-1": 180000 },
};

describe("DataInputTab — the unit-count and remaining-life controls read and write the equipment", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the equipment's unitCount, not a blank input, for a migrated source", () => {
    seed(MIGRATED_STATIONARY);
    render(<Wrapper><ModellerHost /></Wrapper>);
    const units = screen.getByLabelText("Number of units") as HTMLInputElement;
    // Pre-fix this was `a.unitCount` === undefined, so React rendered "".
    expect(units.value).toBe("7");
  });

  it("shows the equipment's remainingLife, not the 10-year default, for a migrated source", () => {
    seed(MIGRATED_STATIONARY);
    render(<Wrapper><ModellerHost /></Wrapper>);
    const life = screen.getByLabelText("Remaining life (yrs)") as HTMLInputElement;
    expect(life.value).toBe("4");
  });

  it("writes an edited unit count onto the equipment and never flat on the entry", () => {
    seed(MIGRATED_STATIONARY);
    render(<Wrapper><ModellerHost /></Wrapper>);
    fireEvent.change(screen.getByLabelText("Number of units"), { target: { value: "9" } });

    expect((screen.getByLabelText("Number of units") as HTMLInputElement).value).toBe("9");
    const equipment = JSON.parse(screen.getByTestId("equipment").textContent ?? "[]");
    expect(equipment).toHaveLength(1);
    expect(equipment[0].unitCount).toBe(9);
    // The equipment keeps its identity — the lever key must not move.
    expect(equipment[0].id).toBe("boiler-1");
    expect(equipment[0].remainingLife).toBe(4);
    expect(equipment[0].endUse).toBe("boiler");
    // A flat write is what resolveEquipment discards; there must not be one.
    expect(JSON.parse(screen.getByTestId("flat").textContent ?? "{}")).toEqual({});
  });

  it("writes an edited remaining life onto the equipment and never flat on the entry", () => {
    seed(MIGRATED_STATIONARY);
    render(<Wrapper><ModellerHost /></Wrapper>);
    fireEvent.change(screen.getByLabelText("Remaining life (yrs)"), { target: { value: "3" } });

    const equipment = JSON.parse(screen.getByTestId("equipment").textContent ?? "[]");
    expect(equipment[0].remainingLife).toBe(3);
    expect(equipment[0].unitCount).toBe(7);
    expect(JSON.parse(screen.getByTestId("flat").textContent ?? "{}")).toEqual({});
  });

  it("a source PERSISTED without equipment is minted on hydrate, so the control writes onto it", () => {
    // Deliberately not equipmentPatch's mint branch: migrateEquipment already
    // minted on hydrate, so by render time equipment[0] exists. The
    // in-session mint branch is exercised separately below.
    seed({
      id: "no-eq-1", name: "Fuel oil", category: "stationary", fuelType: "fuelOil",
      unit: "L", annualVolume: 1000, opex: 50_000, endUse: "boiler",
    });
    render(<Wrapper><ModellerHost /></Wrapper>);
    fireEvent.change(screen.getByLabelText("Number of units"), { target: { value: "4" } });
    const equipment = JSON.parse(screen.getByTestId("equipment").textContent ?? "[]");
    expect(equipment).toHaveLength(1);
    expect(equipment[0].id).toBe("no-eq-1");
    expect(equipment[0].unitCount).toBe(4);
    expect(equipment[0].endUse).toBe("boiler");
  });
});

/* ── 1b. equipmentPatch's own mint branch (Ruling O) ─────────────────────── */

/** Adds an equipment-LESS entry in-session, which is the only way to reach
 *  equipmentPatch's mint branch: anything arriving via localStorage has already
 *  been minted by migrateEquipment on hydrate. This is exactly the shape
 *  SourceListScreen creates today, pre-Task 5. */
function MintHost({ entry }: { entry: CombustionAsset }) {
  const { combustion, addCombustionAsset } = useScenario();
  const a = combustion[2025]?.find((x) => x.id === entry.id);
  return (
    <>
      <button onClick={() => addCombustionAsset(2025, entry)}>seed in session</button>
      {a && (
        <>
          <CombustionDetails a={a} year={2025} modellerOnly />
          <span data-testid="equipment">{JSON.stringify(a.equipment)}</span>
        </>
      )}
    </>
  );
}

describe("DataInputTab — equipmentPatch mints through the one shared mint", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  /** A source created the way SourceListScreen creates one today: flat fields
   *  the user set, and no equipment at all. */
  const FLAT_SOURCE = {
    id: "kiln-1",
    name: "Coal Kiln",
    category: "stationary",
    fuelType: "coal",
    unit: "t",
    annualVolume: 500,
    opex: 4_000_000,
    endUse: "furnaceKiln",
    unitCount: 6,
    remainingLife: 3,
  } as unknown as CombustionAsset;

  function renderWithFlatSource() {
    window.localStorage.setItem(
      "osh-scope1-planner-v4",
      JSON.stringify({ combustion: { 2025: [] }, refrigeration: {}, settings: EMPTY_SETTINGS, scenarios: [], baseYear: 2025 }),
    );
    render(<Wrapper><MintHost entry={FLAT_SOURCE} /></Wrapper>);
    fireEvent.click(screen.getByText("seed in session"));
  }

  it("carries the entry's endUse onto the minted equipment", () => {
    renderWithFlatSource();
    // The regression this pins: a hand-written mint literal dropped endUse, and
    // resolveEquipment then stamped `undefined` over the flat copy — silently
    // degrading this source's alternatives and suggestions.
    fireEvent.change(screen.getByLabelText("Number of units"), { target: { value: "8" } });
    const equipment = JSON.parse(screen.getByTestId("equipment").textContent ?? "[]");
    expect(equipment).toHaveLength(1);
    expect(equipment[0].endUse).toBe("furnaceKiln");
  });

  it("carries the entry's id, name and remainingLife too, and applies the patch on top", () => {
    renderWithFlatSource();
    fireEvent.change(screen.getByLabelText("Number of units"), { target: { value: "8" } });
    const equipment = JSON.parse(screen.getByTestId("equipment").textContent ?? "[]");
    expect(equipment[0].id).toBe("kiln-1");        // the lever key must not move
    expect(equipment[0].name).toBe("Coal Kiln");
    expect(equipment[0].remainingLife).toBe(3);   // NOT the 10-year default
    expect(equipment[0].unitCount).toBe(8);       // the patch wins over the entry's 6
  });

  it("mints from the shared definition when editing remaining life instead", () => {
    renderWithFlatSource();
    fireEvent.change(screen.getByLabelText("Remaining life (yrs)"), { target: { value: "2" } });
    const equipment = JSON.parse(screen.getByTestId("equipment").textContent ?? "[]");
    expect(equipment[0].endUse).toBe("furnaceKiln");
    expect(equipment[0].unitCount).toBe(6);       // carried from the entry
    expect(equipment[0].remainingLife).toBe(2);   // the patch
  });
});

/* ── 2. BuilderTab's alternatives panel ──────────────────────────────────── */

describe("BuilderTab — the alternatives panel survives migration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the decarbonisation alternatives for a migrated source whose endUse lives on the equipment", () => {
    seed(MIGRATED_STATIONARY);
    render(<Wrapper><BuilderTab /></Wrapper>);
    fireEvent.click(screen.getByText("Stationary"));
    fireEvent.click(screen.getByText("PNG Boiler"));
    // Pre-fix alternativesFor(undefined) returned [] and the whole panel
    // returned null — a silent disappearance, not an error.
    expect(screen.getByText(/Decarbonisation alternatives for/i)).toBeTruthy();
  });
});

/* ── 3. BuilderTab's suggestion card ─────────────────────────────────────── */

describe("BuilderTab — the suggestion reads unitCount and endUse off the equipment", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("suggests half of a migrated mobile fleet's real vehicle count, not 1", () => {
    seed({
      id: "fleet-1",
      name: "Diesel Fleet",
      category: "mobile",
      fuelType: "diesel",
      unit: "L",
      annualVolume: 250000,
      opex: 22_500_000,
      bu: "Pune",
      equipment: [{ id: "fleet-1", name: "Diesel Fleet", unitCount: 30, remainingLife: 6, endUse: "truck" }],
      allocations: { "fleet-1": 250000 },
    });
    render(<Wrapper><BuilderTab /></Wrapper>);
    fireEvent.click(screen.getByText("Mobile"));
    fireEvent.click(screen.getByText("Diesel Fleet"));
    // Pre-fix: asset.unitCount was undefined, suggestions.ts masked it as
    // `?? 1`, halfUnits collapsed to 1 and the headline read
    // "electrify 1 of  vehicles" with the total missing entirely.
    expect(screen.getByText(/electrify 15 of 30 vehicles/i)).toBeTruthy();
  });
});
