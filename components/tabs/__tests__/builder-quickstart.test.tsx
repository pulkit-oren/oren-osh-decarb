// @vitest-environment jsdom
// Quick start strip on both builder homes: "Suggest a plan for me" applies the
// suggestion engine portfolio-wide; the boardroom presets are one click away.
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { CompanyProvider } from "@/lib/company/store";
import { BuilderTab } from "../BuilderTab";
import { Scope2BuilderTab } from "@/components/scope2/BuilderTab";

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

describe("Scope 1 builder — Quick start", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("suggest-for-me turns on levers portfolio-wide (Active levers appears)", () => {
    render(<Wrapper><BuilderTab /></Wrapper>);
    fireEvent.click(screen.getByRole("button", { name: /Business as usual/i }));
    expect(screen.queryByText("Active levers")).toBeFalsy(); // everything off
    fireEvent.click(screen.getByRole("button", { name: /Suggest a plan for me/i }));
    expect(screen.getByText("Active levers")).toBeTruthy();
  });

  it("offers the Accelerated preset", () => {
    render(<Wrapper><BuilderTab /></Wrapper>);
    fireEvent.click(screen.getByRole("button", { name: /Suggest a plan for me/i }));
    fireEvent.click(screen.getByRole("button", { name: /Accelerated/i }));
    expect(screen.getByText("Active levers")).toBeTruthy(); // still planned, now full tilt
  });
});

describe("Scope 2 builder — Quick start", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("suggest-for-me plans every facility in one click", () => {
    render(<Wrapper><Scope2BuilderTab /></Wrapper>);
    fireEvent.click(screen.getByRole("button", { name: /Suggest a plan for me/i }));
    expect(screen.getByText("Active levers")).toBeTruthy();
    expect(screen.queryByText(/No plan yet/)).toBeFalsy(); // every facility card has a plan
  });
});
