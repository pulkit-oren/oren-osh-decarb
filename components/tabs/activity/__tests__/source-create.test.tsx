// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider, useScenario } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { EsgProvider } from "@/lib/esg/store";
import { CompanyProvider } from "@/lib/company/store";
import { ActivityDataTab } from "@/components/tabs/ActivityDataTab";

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
 *  category -> open the add-a-source form. ActivityDataTab defaults to the
 *  E/S/G pre-screen (initialNav = { level: "esg" }) when no initialNav is
 *  passed, so the full click path is required — there is no "home" shortcut
 *  available from a plain <ActivityDataTab /> mount. */
function openAddForm() {
  mount();
  fireEvent.click(screen.getByRole("button", { name: /^Environment$/i }));
  fireEvent.click(screen.getByRole("button", { name: /Energy & Emissions/i }));
  fireEvent.click(screen.getByText("Fuels – Liquid").closest("button")!);
  fireEvent.click(screen.getByRole("button", { name: /Add a source/i }));
}

beforeEach(() => window.localStorage.clear());

describe("adding a source", () => {
  it("no longer asks for End-use (D6)", () => {
    openAddForm();
    expect(screen.queryByLabelText(/end.?use/i)).toBeNull();
    expect(screen.queryByText(/^End-use$/i)).toBeNull();
  });

  it("still asks for Name, Fuel and Business unit", () => {
    openAddForm();
    // Name: the input carries aria-label="Source name" (no htmlFor/id pair).
    expect(screen.getByLabelText(/name/i)).toBeTruthy();
    // Fuel: <label htmlFor="src-fuel-select"> properly associated with the select.
    expect(screen.getByLabelText(/fuel/i)).toBeTruthy();
    // Business unit: the <label> is a sibling of the <select>, not wrapping/
    // pointing at it (no htmlFor/id), so it is not accessibility-linked —
    // assert the field is present by its visible label text instead.
    expect(screen.getByText(/business unit/i)).toBeTruthy();
  });

  it("mints exactly one equipment, reusing the source id (D8)", () => {
    openAddForm();
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "New boiler" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

    const all = JSON.parse(screen.getByTestId("dump").textContent!);
    const created = all.find((e: { name: string }) => e.name === "New boiler");
    expect(created).toBeTruthy();
    expect(created.equipment).toHaveLength(1);
    expect(created.equipment[0].id).toBe(created.id);
    expect(created.equipment[0].name).toBe("New boiler");
    expect(created.equipment[0].unitCount).toBe(1);
    expect(created.equipment[0].remainingLife).toBe(10);
    expect(Object.keys(created.allocations)).toEqual([created.id]);
  });

  it("does not put remainingLife, unitCount or endUse on the source", () => {
    openAddForm();
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Plain" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    const all = JSON.parse(screen.getByTestId("dump").textContent!);
    const created = all.find((e: { name: string }) => e.name === "Plain");
    expect(created.remainingLife).toBeUndefined();
    expect(created.unitCount).toBeUndefined();
    expect(created.endUse).toBeUndefined();
  });

  it("leaves capacityUnit unset - no capacity has been recorded yet (D9)", () => {
    openAddForm();
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "NoCap" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    const all = JSON.parse(screen.getByTestId("dump").textContent!);
    expect(all.find((e: { name: string }) => e.name === "NoCap").capacityUnit).toBeUndefined();
  });
});
