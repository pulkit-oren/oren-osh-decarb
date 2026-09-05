// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider, useScenario } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { EsgProvider } from "@/lib/esg/store";
import { CompanyProvider } from "@/lib/company/store";
import { ActivityDataTab } from "@/components/tabs/ActivityDataTab";
import { FUELS, REFRIGERANTS } from "@/lib/model/factors";

function Probe() {
  const { combustion, baseYear } = useScenario();
  return <span data-testid="dump">{JSON.stringify(combustion[baseYear] ?? [])}</span>;
}

function mount() {
  render(
    <CompanyProvider>
      <ScenarioProvider>
        <Scope2Provider>
          <EsgProvider>
            <ActivityDataTab />
            <Probe />
          </EsgProvider>
        </Scope2Provider>
      </ScenarioProvider>
    </CompanyProvider>,
  );
}

/** Navigate esg -> Environment -> Energy & Emissions -> a stationary
 *  category -> open the add-a-fuel form. ActivityDataTab defaults to the
 *  E/S/G pre-screen (initialNav = { level: "esg" }) when no initialNav is
 *  passed, so the full click path is required — there is no "home" shortcut
 *  available from a plain <ActivityDataTab /> mount. */
function openAddForm() {
  mount();
  fireEvent.click(screen.getByRole("button", { name: /^Environment$/i }));
  fireEvent.click(screen.getByRole("button", { name: /Energy & Emissions/i }));
  fireEvent.click(screen.getByText("Fuels – Liquid").closest("button")!);
  fireEvent.click(screen.getByRole("button", { name: /Add a fuel/i }));
}

beforeEach(() => window.localStorage.clear());

/** Pick a fuel by its visible label and submit. The entry's name follows the
 *  fuel — the form has no name box to fill in. */
function addFuel(label: string) {
  fireEvent.change(screen.getByLabelText(/^fuel$/i), {
    target: { value: FUEL_ID_BY_LABEL[label] },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
}

const FUEL_ID_BY_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(FUELS).map((f) => [f.label, f.id]),
);

describe("adding a fuel", () => {
  it("no longer asks for End-use (D6)", () => {
    openAddForm();
    expect(screen.queryByLabelText(/end.?use/i)).toBeNull();
    expect(screen.queryByText(/^End-use$/i)).toBeNull();
  });

  it("asks for Fuel and Business unit, and offers no name box", () => {
    openAddForm();
    // Fuel: <label htmlFor="src-fuel-select"> properly associated with the select.
    expect(screen.getByLabelText(/^fuel$/i)).toBeTruthy();
    // Business unit: the <label> is a sibling of the <select>, not wrapping/
    // pointing at it (no htmlFor/id), so it is not accessibility-linked —
    // assert the field is present by its visible label text instead.
    expect(screen.getByText(/business unit/i)).toBeTruthy();
    // The name comes from the fuel, so there is nothing to type.
    expect(screen.queryByLabelText(/source name/i)).toBeNull();
  });

  it("names the entry after the fuel picked from the dropdown", () => {
    openAddForm();
    addFuel("Kerosene / Burning Oil");
    const all = JSON.parse(screen.getByTestId("dump").textContent!);
    expect(all.map((e: { name: string }) => e.name)).toContain("Kerosene / Burning Oil");
  });

  it("suffixes a repeat of the same fuel so the two rows stay distinguishable", () => {
    openAddForm();
    addFuel("Diesel");
    fireEvent.click(screen.getByRole("button", { name: /Add a fuel/i }));
    addFuel("Diesel");
    const names = JSON.parse(screen.getByTestId("dump").textContent!)
      .map((e: { name: string }) => e.name)
      .filter((n: string) => /^Diesel( \d+)?$/.test(n));
    expect(names).toEqual(["Diesel", "Diesel 2"]);
  });

  it("does not offer Lubricants — a consumable, not a combusted fuel", () => {
    openAddForm();
    const opts = Array.from(
      (screen.getByLabelText(/^fuel$/i) as HTMLSelectElement).options,
    ).map((o) => o.textContent);
    expect(opts).toContain("Diesel");
    expect(opts).not.toContain("Lubricants");
  });

  it("mints exactly one equipment, reusing the source id (D8)", () => {
    openAddForm();
    addFuel("Fuel Oil / Furnace Oil");

    const all = JSON.parse(screen.getByTestId("dump").textContent!);
    const created = all.find((e: { name: string }) => e.name === "Fuel Oil / Furnace Oil");
    expect(created).toBeTruthy();
    expect(created.equipment).toHaveLength(1);
    expect(created.equipment[0].id).toBe(created.id);
    expect(created.equipment[0].name).toBe("Fuel Oil / Furnace Oil");
    expect(created.equipment[0].unitCount).toBe(1);
    expect(created.equipment[0].remainingLife).toBe(10);
    expect(Object.keys(created.allocations)).toEqual([created.id]);
  });

  it("does not put remainingLife, unitCount or endUse on the source", () => {
    openAddForm();
    addFuel("Residual Fuel Oil");
    const all = JSON.parse(screen.getByTestId("dump").textContent!);
    const created = all.find((e: { name: string }) => e.name === "Residual Fuel Oil");
    expect(created.remainingLife).toBeUndefined();
    expect(created.unitCount).toBeUndefined();
    expect(created.endUse).toBeUndefined();
  });

  it("leaves capacityUnit unset - no capacity has been recorded yet (D9)", () => {
    openAddForm();
    addFuel("Kerosene / Burning Oil");
    const all = JSON.parse(screen.getByTestId("dump").textContent!);
    expect(all.find((e: { name: string }) => e.name === "Kerosene / Burning Oil").capacityUnit).toBeUndefined();
  });
});

/** Same journey, but into Refrigerants & cooling. */
function openAddRefrigerantForm() {
  mount();
  fireEvent.click(screen.getByRole("button", { name: /^Environment$/i }));
  fireEvent.click(screen.getByRole("button", { name: /Energy & Emissions/i }));
  fireEvent.click(screen.getByText("Refrigerants & cooling").closest("button")!);
  fireEvent.click(screen.getByRole("button", { name: /Add a refrigerant/i }));
}

describe("adding a refrigerant", () => {
  it("offers no name box — the system is named by the gas", () => {
    openAddRefrigerantForm();
    expect(screen.queryByLabelText(/source name/i)).toBeNull();
    expect(screen.getByLabelText(/Refrigerant gas/i)).toBeTruthy();
    // System type and equipment class are model inputs, not names — still here.
    expect(screen.getByLabelText(/Equipment class/i)).toBeTruthy();
    expect(screen.getByText(/System type/i)).toBeTruthy();
  });

  it("names the system after the gas picked from the dropdown", () => {
    openAddRefrigerantForm();
    fireEvent.change(screen.getByLabelText(/Refrigerant gas/i), { target: { value: "R407C" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    expect(screen.getAllByText(REFRIGERANTS.R407C.label).some((el) => el.tagName === "SPAN")).toBe(true);
  });
});
