import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { CompanyProvider } from "@/lib/company/store";
import { ActivityDataTab } from "../ActivityDataTab";

describe("ActivityDataTab", () => {
  it("renders the unified categories and total footprint", () => {
    const html = renderToString(
      <CompanyProvider>
        <ScenarioProvider>
          <Scope2Provider>
            <ActivityDataTab />
          </Scope2Provider>
        </ScenarioProvider>
      </CompanyProvider>,
    );
    expect(html).toContain("Activity data");
    expect(html).toContain("Fuels – Gaseous");
    expect(html).toContain("Electricity");
    expect(html).toContain("Total footprint");
    expect(html).toContain("Scope 1");
    expect(html).toContain("Scope 2");
  });
});
