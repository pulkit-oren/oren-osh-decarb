import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { HeroCard } from "../HeroCard";

describe("HeroCard", () => {
  it("renders tag, value, unit and footer chip", () => {
    const html = renderToString(
      <HeroCard tag="Target · 2030" value="2,465" unit="tCO₂e" note="▼ 42%" footLeft="Baseline" footRight="4,250 t" />,
    );
    expect(html).toContain("Target · 2030");
    expect(html).toContain("2,465");
    expect(html).toContain("tCO₂e");
    expect(html).toContain("4,250 t");
  });
});
