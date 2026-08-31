// @vitest-environment jsdom
/* The BAU chart renders what it is given and computes no BAU of its own. */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { BauChart } from "../BauChart";

const actuals = [
  { year: 2023, totalT: 6400 },
  { year: 2024, totalT: 6650 },
  { year: 2025, totalT: 6900 },
  { year: 2026, totalT: 7010 },
];
const bau = Array.from({ length: 6 }, (_, i) => ({ year: 2025 + i, bau: 6900 * Math.pow(1.025, i) }));

describe("BauChart", () => {
  it("renders without throwing on a normal series", () => {
    const { container } = render(<BauChart actuals={actuals} bau={bau} baseYear={2025} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy();
  });

  it("renders with no actuals at all — a fresh inventory is a real state", () => {
    const { container } = render(<BauChart actuals={[]} bau={bau} baseYear={2025} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy();
  });

  it("renders with no bau rows", () => {
    const { container } = render(<BauChart actuals={actuals} bau={[]} baseYear={2025} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy();
  });
});
