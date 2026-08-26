import { describe, expect, it } from "vitest";
import { maccLayout } from "../macc";

const levers = [
  { id: "ref", label: "Refrigerant", colorIdx: 1, costPerTonne: -1200, abatementT: 300 },
  { id: "fuel", label: "Biofuel", colorIdx: 2, costPerTonne: 1800, abatementT: 400 },
  { id: "elec", label: "Electrify", colorIdx: 5, costPerTonne: 3500, abatementT: 100 },
];

describe("maccLayout", () => {
  it("orders cheapest first and lays out cumulative width by tonnes", () => {
    const { bars, totalT, maxCost, minCost } = maccLayout(levers);
    expect(bars.map((b) => b.id)).toEqual(["ref", "fuel", "elec"]);
    expect(totalT).toBe(800);
    expect(bars[0].x).toBe(0);
    expect(bars[0].width).toBe(300);
    expect(bars[1].x).toBe(300);
    expect(bars[2].x).toBe(700);
    expect(minCost).toBe(-1200);
    expect(maxCost).toBe(3500);
  });
  it("is safe on an empty list", () => {
    const out = maccLayout([]);
    expect(out.bars).toEqual([]);
    expect(out.totalT).toBe(0);
  });
});

describe("a lever with no NET abatement has no cost per tonne to plot", () => {
  // Reachable since electrification's Scope 2 spill was netted out of the
  // finance denominator: gross abatementT can be positive while the tonnes the
  // money divides by are zero, which makes costPerTonne Infinity.
  const withInfinite = [
    { id: "ref", label: "Refrigerant", colorIdx: 1, costPerTonne: -1200, abatementT: 300 },
    { id: "elec", label: "Electrify", colorIdx: 5, costPerTonne: Infinity, abatementT: 500 },
    { id: "fuel", label: "Biofuel", colorIdx: 2, costPerTonne: 1800, abatementT: 400 },
  ];

  it("is excluded from the bars and named in `unpriced`", () => {
    const { bars, unpriced } = maccLayout(withInfinite);
    expect(bars.map((b) => b.id)).toEqual(["ref", "fuel"]);
    expect(unpriced).toEqual(["Electrify"]);
  });

  it("THE BLAST RADIUS: one Infinity must not break every OTHER bar", () => {
    // This is why it has to be filtered rather than rendered oddly. maxCost
    // takes Math.max over the costs, so an Infinity makes the span infinite and
    // the chart's `yOf` returns NaN for every bar, not just the bad one.
    const { maxCost, minCost, bars } = maccLayout(withInfinite);
    expect(Number.isFinite(maxCost)).toBe(true);
    expect(Number.isFinite(minCost)).toBe(true);
    expect(maxCost).toBe(1800);
    expect(minCost).toBe(-1200);
    // reproduce the chart's own scale arithmetic and require it stays finite
    const span = Math.max(maxCost, 0) - Math.min(minCost, 0) || 1;
    for (const b of bars) {
      expect(Number.isFinite((Math.max(maxCost, 0) - b.costPerTonne) / span)).toBe(true);
    }
  });

  it("the excluded lever's tonnes leave the width total, so the axis still reads true", () => {
    // 300 + 400. Keeping 500 unplaceable tonnes in the total would label the
    // chart with abatement no bar accounts for.
    expect(maccLayout(withInfinite).totalT).toBe(700);
  });

  it("NaN is treated the same way as Infinity", () => {
    const { bars, unpriced } = maccLayout([
      { id: "a", label: "A", colorIdx: 1, costPerTonne: Number.NaN, abatementT: 10 },
    ]);
    expect(bars).toEqual([]);
    expect(unpriced).toEqual(["A"]);
  });

  it("nothing is reported unpriced when every cost is finite", () => {
    expect(maccLayout(levers).unpriced).toEqual([]);
    expect(maccLayout([]).unpriced).toEqual([]);
  });
});
