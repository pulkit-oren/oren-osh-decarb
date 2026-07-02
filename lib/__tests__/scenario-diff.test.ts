/* Scenario diff engine — field-level changes, whole-source plan rows,
   enabled-flips sorted first, and clean empty diffs. */

import { describe, expect, it } from "vitest";
import { diffFlat, diffLeverMaps, prettyField } from "../scenario-diff";

const nameOf = (id: string) => ({ a1: "Diesel genset", s1: "HVAC" }[id] ?? id);

describe("diffLeverMaps", () => {
  it("reports field-level changes with readable labels and values", () => {
    const cur = { a1: { electrify: { enabled: false, capacityPct: 0, targetYear: 2032 } } };
    const tgt = { a1: { electrify: { enabled: true, capacityPct: 60, targetYear: 2030 } } };
    const rows = diffLeverMaps(cur, tgt, nameOf);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ source: "Diesel genset", lever: "Electrify", field: "enabled", from: "off", to: "on" });
    expect(rows.find((r) => r.field === "capacity %")).toBeTruthy();
  });

  it("collapses sources present on one side into a single plan row", () => {
    const tgt = { a1: { electrify: { enabled: true }, fuelSwitch: { enabled: false } } };
    const rows = diffLeverMaps({}, tgt, nameOf);
    expect(rows).toHaveLength(1);
    expect(rows[0].lever).toBe("Plan");
    expect(rows[0].from).toBe("no plan");
    expect(rows[0].to).toContain("Electrify");
  });

  it("returns nothing for identical maps", () => {
    const m = { a1: { electrify: { enabled: true, capacityPct: 50 } } };
    expect(diffLeverMaps(m, JSON.parse(JSON.stringify(m)), nameOf)).toEqual([]);
  });

  it("sorts enabled-flips before parameter tweaks", () => {
    const cur = { a1: { electrify: { enabled: false, capacityPct: 10 } }, s1: { leakFix: { enabled: true, leakImprovementPct: 40 } } };
    const tgt = { a1: { electrify: { enabled: true, capacityPct: 10 } }, s1: { leakFix: { enabled: true, leakImprovementPct: 60 } } };
    const rows = diffLeverMaps(cur, tgt, nameOf);
    expect(rows[0].field).toBe("enabled");
  });
});

describe("diffFlat", () => {
  it("diffs flat records (assumptions / procurement)", () => {
    const rows = diffFlat({ gridEf: 0.71, recCostPerTonne: 800 }, { gridEf: 0.65, recCostPerTonne: 800 }, "Global assumptions");
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("Global assumptions");
    expect(rows[0].from).toBe("0.71");
  });
});

describe("prettyField", () => {
  it("humanizes camelCase lever fields", () => {
    expect(prettyField("leakImprovementPct")).toBe("leak improvement %");
    expect(prettyField("retrofitCapex")).toBe("retrofit CAPEX");
    expect(prettyField("solarKwp")).toBe("solar kWp");
  });
});
