/* Typing a figure on a capex line turns into per-source writes.

   The rule the whole table rests on: SCALE, don't flatten. Overwriting every
   source with the typed value destroys per-asset prices entered in the scope
   screens, and the line reads back the same number either way — so the
   destructive option buys nothing. */
import { describe, expect, it } from "vitest";
import {
  capexEditPatches, editableFigure, isEditable, scaleFactor,
} from "../capex-edit";
import type { CapexLine } from "../capex";

const line = (over: Partial<CapexLine>): CapexLine => ({
  driverId: "s2-solar",
  label: "Rooftop solar",
  scope: 2,
  leverId: "generation",
  amount: 9_000_000,
  sourceIds: ["f-a", "f-b"],
  edit: { kind: "s2-facility", action: "generation", field: "solarCapexPerKw" },
  mixed: false,
  ...over,
});

describe("editableFigure", () => {
  it("offers the RATE where the driver genuinely decomposes", () => {
    const l = line({ unit: { quantity: 200, rate: 45_000, unitLabel: "kW", rateLabel: "per kW" } });
    expect(editableFigure(l)).toEqual({ value: 45_000, kind: "rate" });
  });

  it("offers the TOTAL where it does not — no invented unit rate", () => {
    // An LED package is one lump per facility; there is no per-fixture rate,
    // and inventing one to make the table uniform is the defect this guards.
    const l = line({ driverId: "s2-led", amount: 1_200_000, unit: undefined });
    expect(editableFigure(l)).toEqual({ value: 1_200_000, kind: "total" });
  });
});

describe("isEditable", () => {
  it("refuses a line that consumes no capital", () => {
    expect(isEditable(line({ driverId: "s2-procurement", edit: null }))).toBe(false);
  });

  it("refuses the solar subsidy, which is a percentage not a rate", () => {
    // Scaling a percentage by a rupee ratio is not a meaningful operation.
    const subsidy = line({
      driverId: "s2-solar-subsidy",
      edit: { kind: "s2-facility", action: "generation", field: "subsidyPct" },
    });
    expect(isEditable(subsidy)).toBe(false);
  });

  it("allows an ordinary rupee rate", () => {
    expect(isEditable(line({}))).toBe(true);
  });
});

describe("scaleFactor", () => {
  it("is the ratio that makes the figure land on what was typed", () => {
    expect(scaleFactor(45_000, 50_000)).toBeCloseTo(50_000 / 45_000, 12);
  });

  it("is zero for a typed zero, rather than reading it as no change", () => {
    expect(scaleFactor(45_000, 0)).toBe(0);
  });

  it("cannot scale from zero, and says so instead of dividing", () => {
    // No ratio exists; the caller assigns the typed value directly, which is
    // flattening a set of zeros and loses nothing.
    expect(scaleFactor(0, 50_000)).toBeNull();
  });
});

describe("capexEditPatches", () => {
  const rateLine = line({
    unit: { quantity: 200, rate: 45_000, unitLabel: "kW", rateLabel: "per kW" },
    mixed: true,
  });

  it("scales every source so the spread between them survives", () => {
    // f-a is the cheap site and f-b the expensive one; they must stay in that
    // relation after the edit, only shifted.
    const now: Record<string, number> = { "f-a": 40_000, "f-b": 60_000 };
    const patches = capexEditPatches(rateLine, 50_000, (id) => now[id]);

    expect(patches).toHaveLength(2);
    const by = Object.fromEntries(patches.map((p) => [("sourceId" in p ? p.sourceId : ""), p.value]));
    const factor = 50_000 / 45_000;
    expect(by["f-a"]).toBeCloseTo(40_000 * factor, 6);
    expect(by["f-b"]).toBeCloseTo(60_000 * factor, 6);
    // The relation is preserved exactly, which is the point.
    expect(by["f-b"] / by["f-a"]).toBeCloseTo(60_000 / 40_000, 12);
  });

  it("routes each write to the store, action and field the line names", () => {
    const patches = capexEditPatches(rateLine, 50_000, () => 45_000);
    for (const p of patches) {
      expect(p.kind).toBe("s2-facility");
      if (p.kind === "s2-facility") {
        expect(p.action).toBe("generation");
        expect(p.field).toBe("solarCapexPerKw");
      }
    }
  });

  it("sets every source to zero when zero is typed", () => {
    const patches = capexEditPatches(rateLine, 0, () => 45_000);
    expect(patches.map((p) => p.value)).toEqual([0, 0]);
  });

  it("assigns the typed value directly when there is nothing to scale from", () => {
    const fromZero = line({ unit: { quantity: 200, rate: 0, unitLabel: "kW", rateLabel: "per kW" } });
    const patches = capexEditPatches(fromZero, 50_000, () => 0);
    expect(patches.map((p) => p.value)).toEqual([50_000, 50_000]);
  });

  it("scales a lump line on its total, not on an invented rate", () => {
    const led = line({
      driverId: "s2-led", amount: 1_200_000, unit: undefined,
      edit: { kind: "s2-facility", action: "efficiency", field: "ledCapex" },
    });
    const now: Record<string, number> = { "f-a": 800_000, "f-b": 400_000 };
    const patches = capexEditPatches(led, 2_400_000, (id) => now[id]);
    // Doubling the total doubles each site's lump.
    expect(patches.map((p) => p.value)).toEqual([1_600_000, 800_000]);
  });

  it("writes a whole-company lump directly, having no spread to preserve", () => {
    const infra = line({
      driverId: "s1-charging-infra", scope: 1, leverId: "electrification",
      amount: 15_000_000, unit: undefined, sourceIds: ["portfolio"],
      edit: { kind: "s1-assumption", field: "infraCapex" },
    });
    expect(capexEditPatches(infra, 20_000_000, () => 15_000_000))
      .toEqual([{ kind: "s1-assumption", field: "infraCapex", value: 20_000_000 }]);
  });

  it("writes nothing for a line that is not editable", () => {
    const proc = line({ driverId: "s2-procurement", edit: null });
    expect(capexEditPatches(proc, 5, () => 1)).toEqual([]);
  });

  it("skips a source it cannot resolve rather than guessing a value for it", () => {
    const patches = capexEditPatches(rateLine, 50_000, (id) => (id === "f-a" ? 40_000 : undefined));
    expect(patches).toHaveLength(1);
    expect("sourceId" in patches[0] && patches[0].sourceId).toBe("f-a");
  });

  it("ignores a non-finite typed value instead of writing NaN into the model", () => {
    expect(capexEditPatches(rateLine, Number.NaN, () => 45_000)).toEqual([]);
  });
});
