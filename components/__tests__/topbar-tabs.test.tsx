// Regression: the Topbar looks up a title/eyebrow per tab. Every navigable
// tab MUST have an entry, or the header crashes the whole screen. This caught
// the "goals" tab being added to navigation without a Topbar title.
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { CompanyProvider } from "@/lib/company/store";
import { Topbar } from "../Topbar";
import type { TabKey } from "../Sidebar";

const ALL_TABS: TabKey[] = [
  "overview", "goals", "data", "builder", "action", "finance", "refrigerant", "compare",
];

describe("Topbar renders a title for every tab", () => {
  for (const tab of ALL_TABS) {
    it(`tab="${tab}" renders without throwing`, () => {
      const html = renderToString(
        <CompanyProvider>
          <ScenarioProvider>
            <Scope2Provider>
              <Topbar scope="s1" tab={tab} persona="esg" setPersona={() => {}} />
            </Scope2Provider>
          </ScenarioProvider>
        </CompanyProvider>,
      );
      expect(html.length).toBeGreaterThan(50);
    });
  }
});
