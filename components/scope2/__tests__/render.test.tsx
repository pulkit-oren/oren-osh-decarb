// Smoke test: every Scope 2 tab renders to string inside the provider
// without throwing (server render — no DOM, no localStorage).
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import { Scope2Provider } from "@/lib/scope2/store";
import { Scope2DataInputTab } from "../DataInputTab";
import { Scope2BuilderTab, Scope2EnergyBalanceScreen } from "../BuilderTab";
import { Scope2ActionPlanTab } from "../ActionPlanTab";
import { Scope2CompareTab } from "../CompareTab";
import { Scope2CeoOverviewTab } from "../CeoOverviewTab";

const cases = [
  ["DataInputTab", Scope2DataInputTab],
  ["BuilderTab", Scope2BuilderTab],
  ["ActionPlanTab", Scope2ActionPlanTab],
  ["CompareTab", Scope2CompareTab],
  ["CeoOverviewTab", Scope2CeoOverviewTab],
] as const;

describe("scope 2 tabs render", () => {
  for (const [name, Tab] of cases) {
    it(`${name} renders with seeded defaults`, () => {
      const html = renderToString(
        React.createElement(Scope2Provider, null, React.createElement(Tab)),
      );
      expect(html.length).toBeGreaterThan(500);
    });
  }

  it("CeoOverviewTab shows the verdict, hero and pathway", () => {
    const html = renderToString(
      React.createElement(Scope2Provider, null, React.createElement(Scope2CeoOverviewTab)),
    );
    expect(html).toMatch(/2030 climate target/);
    expect(html).toContain("Cut by 2030");
    expect(html).toContain("Data confidence");
    expect(html).toContain("Emissions pathway to 2050");
  });

  it("BuilderTab home shows facility boxes, Procurement tile, Energy balance tile, and results panel", () => {
    const html = renderToString(
      React.createElement(Scope2Provider, null, React.createElement(Scope2BuilderTab)),
    );
    // Home renders the default facilities (seeded: Pune plant, London office, Island resort)
    expect(html).toContain("Pune plant");
    // Navigation tiles
    expect(html).toContain("Procurement");
    expect(html).toContain("Energy balance");
    // Results panel
    expect(html).toContain("reduction by 2030");
    expect(html).toContain("Market-based net");
  });

  it("Scope2EnergyBalanceScreen renders three dial labels and Suggest a mix button", () => {
    const html = renderToString(
      React.createElement(Scope2Provider, null,
        React.createElement(Scope2EnergyBalanceScreen, { onBack: () => {} }),
      ),
    );
    // Three dial labels
    expect(html).toContain("Efficiency %");
    expect(html).toContain("Solar %");
    expect(html).toContain("Procurement clean %");
    // Suggest button
    expect(html).toContain("Suggest a mix for");
    // Reduction 2030 result is visible
    expect(html).toContain("Reduction 2030");
  });
});
