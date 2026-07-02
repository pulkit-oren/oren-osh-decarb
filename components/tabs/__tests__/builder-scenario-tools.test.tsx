// @vitest-environment jsdom
// Scenario notes, duplicate-and-tweak, and the diff drawer on the builder home.
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { CompanyProvider } from "@/lib/company/store";
import { BuilderTab } from "../BuilderTab";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <ScenarioProvider>
        {children}
      </ScenarioProvider>
    </CompanyProvider>
  );
}

function saveScenario(name: string, note?: string) {
  fireEvent.change(screen.getByPlaceholderText(/Name this scenario/i), { target: { value: name } });
  if (note) fireEvent.change(screen.getByPlaceholderText(/Add a note/i), { target: { value: note } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
}

describe("BuilderTab — scenario notes / duplicate / diff", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("saves a scenario with a note and shows it in the list", () => {
    render(<Wrapper><BuilderTab /></Wrapper>);
    saveScenario("Board option A", "CFO-constrained capex");
    expect(screen.getByText("Board option A")).toBeTruthy();
    expect(screen.getByText("CFO-constrained capex")).toBeTruthy();
  });

  it("duplicate creates an editable copy", () => {
    render(<Wrapper><BuilderTab /></Wrapper>);
    saveScenario("Base plan");
    fireEvent.click(screen.getByRole("button", { name: /Duplicate Base plan/i }));
    expect(screen.getByText("Base plan (copy)")).toBeTruthy();
  });

  it("diff drawer says identical for a just-saved scenario, then lists changes after edits", () => {
    render(<Wrapper><BuilderTab /></Wrapper>);
    saveScenario("Snapshot");
    fireEvent.click(screen.getByRole("button", { name: /Diff Snapshot/i }));
    expect(screen.getByText(/identical to your current plan/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Close/i }));

    // change the working plan, then the diff must show rows
    fireEvent.click(screen.getByRole("button", { name: /Business as usual/i }));
    fireEvent.click(screen.getByRole("button", { name: /Diff Snapshot/i }));
    expect(screen.getByText(/Loading “Snapshot” would change/i)).toBeTruthy();
    expect(screen.queryByText(/identical to your current plan/i)).toBeFalsy();
    expect(screen.getAllByText("→").length).toBeGreaterThan(0);

    // load from the drawer restores the snapshot
    fireEvent.click(screen.getByRole("button", { name: /Load this scenario/i }));
    fireEvent.click(screen.getByRole("button", { name: /Diff Snapshot/i }));
    expect(screen.getByText(/identical to your current plan/i)).toBeTruthy();
  });
});
