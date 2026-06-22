// Smoke test: every Scope 2 tab renders to string inside the provider
// without throwing (server render — no DOM, no localStorage).
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Scope2Provider } from "@/lib/scope2/store";
import { Scope2DataInputTab } from "../DataInputTab";
import { Scope2BuilderTab } from "../BuilderTab";
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
        <Scope2Provider>
          <Tab />
        </Scope2Provider>,
      );
      expect(html.length).toBeGreaterThan(500);
    });
  }

  it("CeoOverviewTab shows the verdict, hero and pathway", () => {
    const html = renderToString(
      <Scope2Provider>
        <Scope2CeoOverviewTab />
      </Scope2Provider>,
    );
    expect(html).toMatch(/2030 climate target/);
    expect(html).toContain("Cut by 2030");
    expect(html).toContain("Data confidence");
    expect(html).toContain("Emissions pathway to 2050");
  });

  it("BuilderTab shows the three pillar cards", () => {
    const html = renderToString(
      <Scope2Provider>
        <Scope2BuilderTab />
      </Scope2Provider>,
    );
    expect(html).toContain("Energy efficiency");
    expect(html).toContain("On-site generation");
    expect(html).toContain("Renewable procurement");
    expect(html).toContain("Location-based");
    expect(html).toContain("Market-based");
  });
});
