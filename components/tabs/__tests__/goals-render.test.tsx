// Smoke test: the Goals tab renders inside its providers without throwing.
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { GoalsProvider } from "@/lib/goals/store";
import { EsgProvider } from "@/lib/esg/store";
import { GoalsTab } from "../GoalsTab";

function render() {
  return renderToString(
    <ScenarioProvider>
      <Scope2Provider>
        <GoalsProvider>
          <EsgProvider>
            <GoalsTab persona="esg" />
          </EsgProvider>
        </GoalsProvider>
      </Scope2Provider>
    </ScenarioProvider>,
  );
}

describe("GoalsTab", () => {
  it("renders the Dashboard / Set up goal / My goals toggle", () => {
    const html = render();
    expect(html.length).toBeGreaterThan(300);
    expect(html).toContain("Dashboard");
    expect(html).toContain("Set up goal");
    expect(html).toContain("My goals");
  });

  it("shows the empty-state prompt when no goals exist", () => {
    const html = render();
    expect(html).toContain("No goals to track yet");
  });
});
