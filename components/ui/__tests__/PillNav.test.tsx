import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { PillNav } from "../PillNav";

describe("PillNav", () => {
  it("renders each item's label and marks the active one", () => {
    const html = renderToString(
      <PillNav
        active="ceo"
        onSelect={() => {}}
        items={[
          { key: "ceo", label: "CEO", sub: "Raghav" },
          { key: "cfo", label: "CFO" },
        ]}
      />,
    );
    expect(html).toContain("CEO");
    expect(html).toContain("Raghav");
    expect(html).toContain("CFO");
    expect(html).toContain('aria-current="true"'); // active item flagged
  });
});
