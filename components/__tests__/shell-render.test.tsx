// Smoke test: the whole Shell (CompanyProvider → keyed scope stores →
// topbar with company switcher) server-renders without throwing.
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Shell } from "../Shell";

describe("Shell with company support", () => {
  it("renders the full app shell with the default company", () => {
    const html = renderToString(<Shell />);
    expect(html.length).toBeGreaterThan(1000);
    expect(html).toContain("Acme Industries Ltd"); // default company in the switcher
    expect(html).toContain("Company"); // switcher chip label
    expect(html).toContain("ESG Lead"); // active persona shown on the avatar dropdown trigger
  });
});
