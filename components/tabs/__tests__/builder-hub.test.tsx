// @vitest-environment jsdom
// BuilderHub — target-first structure: Balance to target lands first, dials
// write through to the per-source levers of both scopes, and per-source
// edits move the derived dials (no drift).
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { GoalsProvider } from "@/lib/goals/store";
import { CompanyProvider } from "@/lib/company/store";
import { BuilderHub } from "../BuilderHub";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <ScenarioProvider>
        <Scope2Provider>
          <GoalsProvider>
            {children}
          </GoalsProvider>
        </Scope2Provider>
      </ScenarioProvider>
    </CompanyProvider>
  );
}

describe("BuilderHub — Balance to target lands first", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("shows the three sub-tabs and opens on the combined balance screen", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    expect(screen.getAllByText("Balance to target").length).toBeGreaterThan(0);
    expect(screen.getByText(/Scope 1 · fuels & refrigerants/)).toBeTruthy();
    expect(screen.getByText(/Scope 2 · electricity/)).toBeTruthy();
    // target-first landing content
    expect(screen.getByText("Required cut")).toBeTruthy();
    expect(screen.getByText("How it divides across levers")).toBeTruthy();
    expect(screen.getByLabelText("Efficiency dial")).toBeTruthy();
    expect(screen.getByLabelText("Electrify fuel dial")).toBeTruthy();
  });

  it("a dial writes through to per-source levers, visible in the scope tab", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.change(screen.getByLabelText("Efficiency dial"), { target: { value: "60" } });
    // jump into Scope 2 — the facilities now carry an active efficiency lever
    fireEvent.click(screen.getByText(/Scope 2 · electricity/));
    expect(screen.getAllByText(/lever(s)? on/).length).toBeGreaterThan(0);
  });

  it("a per-source edit moves the derived dial back on the balance screen", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    const dialBefore = (screen.getByLabelText("Efficiency dial") as HTMLInputElement).value;
    expect(dialBefore).toBe("0");
    // apply the portfolio suggestions inside Scope 2, then come back
    fireEvent.click(screen.getByText(/Scope 2 · electricity/));
    fireEvent.click(screen.getByRole("button", { name: /Suggest a plan for me/i }));
    fireEvent.click(screen.getAllByText("Balance to target")[0]);
    const dialAfter = (screen.getByLabelText("Efficiency dial") as HTMLInputElement).value;
    expect(Number(dialAfter)).toBeGreaterThan(0);
  });

  it("navigating to Scope 1 shows the per-source modeller", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByText(/Scope 1 · fuels & refrigerants/));
    expect(screen.getAllByText("Mobile").length).toBeGreaterThan(0);
    expect(screen.getByText("Live projection")).toBeTruthy();
  });
});
