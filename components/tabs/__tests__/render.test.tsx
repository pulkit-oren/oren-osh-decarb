// Smoke test: the redesigned Scope 1 decision tabs render to string inside
// the provider without throwing (server render — no DOM, no localStorage).
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ScenarioProvider } from "@/lib/store";
import { ActionPlanTab } from "../ActionPlanTab";
import { RefrigerantTab } from "../RefrigerantTab";
import { CompareTab } from "../CompareTab";
import { CeoOverviewTab } from "../CeoOverviewTab";
import { CfoFinanceTab } from "../CfoFinanceTab";

const cases = [
  ["ActionPlanTab", ActionPlanTab],
  ["RefrigerantTab", RefrigerantTab],
  ["CompareTab", CompareTab],
  ["CeoOverviewTab", CeoOverviewTab],
  ["CfoFinanceTab", CfoFinanceTab],
] as const;

describe("scope 1 decision tabs render", () => {
  for (const [name, Tab] of cases) {
    it(`${name} renders with seeded defaults`, () => {
      const html = renderToString(
        <ScenarioProvider>
          <Tab />
        </ScenarioProvider>,
      );
      expect(html.length).toBeGreaterThan(500);
    });
  }

  it("ActionPlanTab leads with the verdict and the four headline KPIs", () => {
    const html = renderToString(
      <ScenarioProvider>
        <ActionPlanTab />
      </ScenarioProvider>,
    );
    expect(html).toMatch(/2030 climate target/);
    expect(html).toContain("Investment needed");
    expect(html).toContain("Running-cost impact");
    expect(html).toContain("Payback");
    expect(html).toContain("What each action costs");
  });

  it("CeoOverviewTab leads with the verdict, hero and glide path", () => {
    const html = renderToString(
      <ScenarioProvider>
        <CeoOverviewTab />
      </ScenarioProvider>,
    );
    expect(html).toMatch(/2030 climate target/);
    expect(html).toContain("Projected");
    expect(html).toContain("Cut by 2030");
    expect(html).toContain("Glide path to 2050");
    expect(html).toContain("Data confidence"); // gauge present
    expect(html).toContain("Boardroom scenarios");
    expect(html).toContain("Business as usual");
    expect(html).toContain("Accelerated");
  });

  it("CfoFinanceTab shows finance KPIs and the MACC", () => {
    const html = renderToString(
      <ScenarioProvider>
        <CfoFinanceTab />
      </ScenarioProvider>,
    );
    expect(html).toContain("Capital required");
    expect(html).toContain("Blended cost / tonne");
    expect(html).toContain("Marginal abatement cost curve");
    expect(html).toContain("Portfolio payback");
  });

  it("RefrigerantTab puts recommendations first and collapses the gas library", () => {
    const html = renderToString(
      <ScenarioProvider>
        <RefrigerantTab />
      </ScenarioProvider>,
    );
    expect(html).toContain("Your systems — recommended swaps");
    expect(html).toContain("Full comparison");
    // the 30-bar chart is collapsed by default
    expect(html).not.toContain("phase out</span>");
  });

  it("CompareTab shows the trimmed board metrics", () => {
    const html = renderToString(
      <ScenarioProvider>
        <CompareTab />
      </ScenarioProvider>,
    );
    expect(html).toContain("Which option wins?");
    expect(html).toContain("Emissions cut by 2030");
    expect(html).toContain("Investment needed");
    expect(html).not.toContain("Biogenic CO₂"); // technical row removed from the board table
  });
});
