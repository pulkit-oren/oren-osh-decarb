// @vitest-environment jsdom
/**
 * E/S/G pre-screen flow: Data input opens on the pillar picker; Environment
 * leads to Energy & Emissions / Water / Waste; Water and Waste persist their
 * annual entries and deep-link into goal setup for their category.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { EsgProvider } from "@/lib/esg/store";
import { CompanyProvider } from "@/lib/company/store";
import { ActivityDataTab } from "../ActivityDataTab";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <ScenarioProvider>
        <Scope2Provider>
          <EsgProvider>
            {children}
          </EsgProvider>
        </Scope2Provider>
      </ScenarioProvider>
    </CompanyProvider>
  );
}

describe("ActivityDataTab — E/S/G pre-screen", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("opens on the pillar picker; only Environment is enabled", () => {
    render(<Wrapper><ActivityDataTab /></Wrapper>);
    expect(screen.getByText("Environment")).toBeTruthy();
    expect(screen.getByText("Social")).toBeTruthy();
    expect(screen.getByText("Governance")).toBeTruthy();
    expect(screen.getAllByText("Coming soon").length).toBe(2); // the S and G badges
    expect((screen.getByRole("button", { name: "Social" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Governance" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Environment shows the three topics; Energy & Emissions opens the categories", () => {
    render(<Wrapper><ActivityDataTab /></Wrapper>);
    fireEvent.click(screen.getByRole("button", { name: "Environment" }));
    expect(screen.getByText("Energy & Emissions")).toBeTruthy();
    expect(screen.getByText("Water")).toBeTruthy();
    expect(screen.getByText("Waste")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Energy & Emissions" }));
    // the old data-input home with the Scope 1+2 category tiles
    expect(screen.getByText("Fuels – Liquid")).toBeTruthy();
    expect(screen.getByText(/Total footprint/)).toBeTruthy();
    // and it can navigate back up to Environment
    fireEvent.click(screen.getByRole("button", { name: /Back to Environment/i }));
    expect(screen.getByText("Water")).toBeTruthy();
  });

  it("Water screen records per-source withdrawal / discharge, rolls up totals, and links to a water goal", () => {
    const onOpenGoalSetup = vi.fn();
    render(<Wrapper><ActivityDataTab onOpenGoalSetup={onOpenGoalSetup} /></Wrapper>);
    fireEvent.click(screen.getByRole("button", { name: "Environment" }));
    fireEvent.click(screen.getByRole("button", { name: "Water" }));

    fireEvent.change(screen.getByLabelText("Surface water withdrawal (kL)"), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText("Third-party water withdrawal (kL)"), { target: { value: "7000" } });
    fireEvent.change(screen.getByLabelText("To third parties discharge (kL)"), { target: { value: "8000" } });
    // total withdrawal 12,000 appears in the rollups
    expect(screen.getAllByText(/12,000/).length).toBeGreaterThan(0);
    // GRI 303 suggestion: withdrawal − discharge = 4,000 — accept it
    fireEvent.click(screen.getByRole("button", { name: /Use calculated/i }));
    expect((screen.getByLabelText("Water consumption (kL)") as HTMLInputElement).value).toBe("4000");

    fireEvent.click(screen.getByRole("button", { name: /Set a water goal/i }));
    expect(onOpenGoalSetup).toHaveBeenCalledWith("water");

    // persisted in localStorage (the Shell passes a per-company key in the real app)
    const saved = JSON.parse(window.localStorage.getItem("osh-esg-v1") ?? "{}");
    const year = Object.keys(saved.water)[0];
    expect(saved.water[year].withdrawalKl).toBe(12000);
    expect(saved.water[year].withdrawalBySource.surface).toBe(5000);
    expect(saved.water[year].dischargeKl).toBe(8000);
    expect(saved.water[year].consumptionKl).toBe(4000);
  });

  it("Waste screen records per-BRSR-category tonnes, shows the diversion rate, and links to a waste goal", () => {
    const onOpenGoalSetup = vi.fn();
    render(<Wrapper><ActivityDataTab onOpenGoalSetup={onOpenGoalSetup} /></Wrapper>);
    fireEvent.click(screen.getByRole("button", { name: "Environment" }));
    fireEvent.click(screen.getByRole("button", { name: "Waste" }));

    // all eight BRSR categories are offered
    for (const label of ["Plastic waste", "E-waste", "Bio-medical waste", "Construction & demolition", "Battery waste", "Radioactive waste", "Other hazardous", "Other non-hazardous"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    fireEvent.change(screen.getByLabelText("Plastic waste generated (t)"), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("Plastic waste recovered (t)"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Plastic waste disposed (t)"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Other non-hazardous generated (t)"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Other non-hazardous recovered (t)"), { target: { value: "50" } });
    // totals roll up: 500 t generated, diversion = 200/500 = 40%
    expect(screen.getAllByText("500").length).toBeGreaterThan(0);
    expect(screen.getByText("Diversion")).toBeTruthy();
    expect(screen.getAllByText("40").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Set a waste goal/i }));
    expect(onOpenGoalSetup).toHaveBeenCalledWith("waste");

    const saved = JSON.parse(window.localStorage.getItem("osh-esg-v1") ?? "{}");
    const year = Object.keys(saved.waste)[0];
    expect(saved.waste[year].generatedT).toBe(500);
    expect(saved.waste[year].recoveredT).toBe(200);
    expect(saved.waste[year].byCategory.plastic.generatedT).toBe(300);
  });
});
