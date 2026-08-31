// @vitest-environment jsdom
/* The Assumptions tab: the premise is visible, adjustable, and resettable, and
   changing it invalidates any mixes suggested under the old one. */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { GoalsProvider } from "@/lib/goals/store";
import { CompanyProvider } from "@/lib/company/store";
import { BuilderHub } from "../BuilderHub";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider><ScenarioProvider><Scope2Provider><GoalsProvider>
      {children}
    </GoalsProvider></Scope2Provider></ScenarioProvider></CompanyProvider>
  );
}

describe("Assumptions sub-tab", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("is a fourth section tab and does not steal the landing screen", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    expect(screen.getByRole("tab", { name: /Assumptions/ })).toBeTruthy();
    // Landing stays Fine-tune levers.
    expect(screen.getByLabelText("Efficiency dial")).toBeTruthy();
  });

  it("shows the derived rate and its span", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    expect(screen.getByText(/from your data/i)).toBeTruthy();
    expect(screen.getByLabelText("BAU growth override")).toBeTruthy();
  });

  it("an override moves the required cut", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    const requiredBefore = screen.getAllByText("Required cut")[0]
      .parentElement!.textContent!;
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    fireEvent.change(screen.getByLabelText("BAU growth override"), { target: { value: "9" } });
    const requiredAfter = screen.getAllByText("Required cut")[0]
      .parentElement!.textContent!;
    expect(requiredAfter).not.toBe(requiredBefore);
  });

  it("reset clears the override rather than freezing the derived number", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    const input = screen.getByLabelText("BAU growth override") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: /reset to derived/i }));
    expect(input.value).toBe("");
  });

  it("holds a flat BAU at zero instead of treating it as cleared", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    const input = screen.getByLabelText("BAU growth override") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });
    expect(input.value).toBe("0");
  });

  it("carries the finance assumptions that were buried in Scope 1", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    expect(screen.getByLabelText(/Discount rate/i)).toBeTruthy();
    expect(screen.getByLabelText(/Fuel escalation/i)).toBeTruthy();
    // Adapted: getByLabelText(/Carbon price/i) matches two elements in the
    // real DOM — the NumField input (aria-label="Carbon price") AND its (i)
    // hint icon (aria-label="Internal carbon price — ..."), because the hint
    // copy happens to contain the same phrase. Scoping to the spinbutton role
    // (the actual <input type="number">) keeps the same assertion — a Carbon
    // price field exists — without the ambiguous match.
    expect(screen.getByRole("spinbutton", { name: /Carbon price/i })).toBeTruthy();
  });
});
