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
    // Target-first landing: the target band is pinned above the tabs, the
    // verdict rail is always on screen, and the pane opens on the levers —
    // the working surface — rather than on an empty "press Suggest" panel.
    expect(screen.getByLabelText("Target year")).toBeTruthy();
    expect(screen.getByLabelText("Combined reduction target")).toBeTruthy();
    // "Required cut" appears twice: the rail row and the arithmetic below it.
    expect(screen.getAllByText("Required cut").length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: /Compare mixes/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Fine-tune levers/ })).toBeTruthy();
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

  it("suggest compares four bases and applying one moves the dials", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    // The suggester lives in its own tab now — open it the way a user does.
    fireEvent.click(screen.getByRole("tab", { name: /Compare mixes/ }));
    fireEvent.click(screen.getByRole("button", { name: /suggest mixes/i }));
    // the four option cards with their trade-off stats. "Cheapest overall" is
    // deliberately absent: it ranked on a per-tonne figure that is negative on
    // a money-saving plan, so it named the most capital-hungry mix "cheapest".
    expect(screen.getByText("Best value per tonne")).toBeTruthy();
    expect(screen.getByText("Lowest total cost")).toBeTruthy();
    expect(screen.getByText("Lowest CAPEX")).toBeTruthy();
    expect(screen.getByText("Best OPEX saving")).toBeTruthy();
    expect(screen.queryByText("Cheapest overall")).toBeNull();
    // preview does NOT change the plan yet — check the dial back in its tab
    fireEvent.click(screen.getByRole("tab", { name: /Fine-tune levers/ }));
    expect((screen.getByLabelText("Efficiency dial") as HTMLInputElement).value).toBe("0");
    fireEvent.click(screen.getByRole("tab", { name: /Compare mixes/ }));
    // the (i) icon flips a card to its calculation logic
    fireEvent.click(screen.getByRole("button", { name: /how best opex saving is calculated/i }));
    expect(screen.getByText(/biggest yearly running-cost saving/i)).toBeTruthy();
    // apply the OPEX-saving basis (last card) → dials move
    const applyButtons = screen.getAllByRole("button", { name: /apply this mix/i });
    fireEvent.click(applyButtons[applyButtons.length - 1]);
    expect(screen.getByText("Applied")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Fine-tune levers/ }));
    const dials = ["Efficiency dial", "Solar onsite dial", "Electrify fuel dial", "Bio-blend fuel dial", "Low-GWP refrigerant dial", "Procurement (market) dial"]
      .map((l) => Number((screen.getByLabelText(l) as HTMLInputElement).value));
    expect(Math.max(...dials)).toBeGreaterThan(0);
  });

  it("target year is adjustable and relabels the lever impact column", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.change(screen.getByLabelText("Target year"), { target: { value: "2040" } });
    expect(screen.getAllByText("By 2040").length).toBeGreaterThan(0);
  });

  it("clicking a lever deep-links to that lever's exact screen", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    // refrigerant lever → Scope 1 refrigerant segment screen directly
    fireEvent.click(screen.getByRole("button", { name: /Low-GWP refrigerant/ }));
    expect(screen.getByText("All segments")).toBeTruthy();
    expect(screen.getByText("Cooling — per-system plans", { exact: false })).toBeTruthy();
    // back to the balance screen, then procurement lever → Scope 2 procurement screen
    fireEvent.click(screen.getAllByText("Balance to target")[0]);
    fireEvent.click(screen.getByRole("button", { name: /Procurement \(market\)/ }));
    expect(screen.getAllByText(/procurement/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("tab", { name: /Fine-tune levers/ })).toBeNull();
  });
});
