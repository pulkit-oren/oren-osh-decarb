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
