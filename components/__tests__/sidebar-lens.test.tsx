import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Sidebar } from "../Sidebar";

describe("Sidebar persona lens", () => {
  it("CEO lens shows Overview + Compare and hides the working tabs", () => {
    const html = renderToString(
      <Sidebar tab="overview" setTab={() => {}} persona="ceo" />,
    );
    expect(html).toContain("Overview");
    expect(html).toContain("Compare &amp; track"); // HTML-escaped ampersand
    expect(html).not.toContain("Data input");
    expect(html).not.toContain("Refrigerant advisor");
  });
  it("ESG lens shows every tab", () => {
    const html = renderToString(
      <Sidebar tab="builder" setTab={() => {}} persona="esg" />,
    );
    expect(html).toContain("Data input");
    expect(html).toContain("Refrigerant advisor");
  });
});
