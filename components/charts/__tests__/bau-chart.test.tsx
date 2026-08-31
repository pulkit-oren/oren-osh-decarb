// @vitest-environment jsdom
/* The BAU chart renders what it is given and computes no BAU of its own. */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { BauChart, bauChartRows } from "../BauChart";

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

describe("bauChartRows", () => {
  it("carries through every bau value unchanged for its year", () => {
    const unusualValues = [
      { year: 2025, bau: 6421.37 },
      { year: 2026, bau: 8194.63 },
    ];
    const rows = bauChartRows([], unusualValues);
    expect(rows).toEqual([
      { year: 2025, actual: null, bau: 6421.37 },
      { year: 2026, actual: null, bau: 8194.63 },
    ]);
  });

  it("carries through every actual totalT unchanged for its year", () => {
    const unusualActuals = [
      { year: 2023, totalT: 5829.44 },
      { year: 2024, totalT: 7156.91 },
    ];
    const rows = bauChartRows(unusualActuals, []);
    expect(rows).toEqual([
      { year: 2023, actual: 5829.44, bau: null },
      { year: 2024, actual: 7156.91, bau: null },
    ]);
  });

  it("produces a sorted union of years with no duplicates", () => {
    const a = [
      { year: 2025, totalT: 100 },
      { year: 2023, totalT: 200 },
    ];
    const b = [
      { year: 2026, bau: 300 },
      { year: 2024, bau: 400 },
    ];
    const rows = bauChartRows(a, b);
    expect(rows.map((r) => r.year)).toEqual([2023, 2024, 2025, 2026]);
    expect(rows).toHaveLength(4);
  });

  it("yields null for a series missing a year (actuals present, bau absent)", () => {
    const a = [{ year: 2025, totalT: 100 }];
    const b = [{ year: 2026, bau: 200 }];
    const rows = bauChartRows(a, b);
    const row2025 = rows.find((r) => r.year === 2025);
    expect(row2025?.actual).toBe(100);
    expect(row2025?.bau).toBeNull();
  });

  it("yields null for a series missing a year (bau present, actuals absent)", () => {
    const a = [{ year: 2026, totalT: 100 }];
    const b = [{ year: 2025, bau: 200 }];
    const rows = bauChartRows(a, b);
    const row2025 = rows.find((r) => r.year === 2025);
    expect(row2025?.actual).toBeNull();
    expect(row2025?.bau).toBe(200);
  });

  it("returns an empty array when both inputs are empty", () => {
    const rows = bauChartRows([], []);
    expect(rows).toEqual([]);
  });

  it("returns rows from the non-empty series when one is empty", () => {
    const a = [
      { year: 2025, totalT: 500 },
      { year: 2026, totalT: 600 },
    ];
    const rows = bauChartRows(a, []);
    expect(rows).toEqual([
      { year: 2025, actual: 500, bau: null },
      { year: 2026, actual: 600, bau: null },
    ]);
  });
});
