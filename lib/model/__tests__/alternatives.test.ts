/* Stationary decarbonisation alternatives — the equipment catalog covers
   every pickable stationary end-use, and the suggester respects feasibility:
   electrification is proposed only where the reference marks it commercial. */

import { describe, expect, it } from "vitest";
import { EQUIPMENT_ALTERNATIVES, alternativesFor } from "../alternatives";
import { END_USES, endUseProfile, endUsesFor } from "../end-use";
import { suggestForAsset } from "../suggestions";
import type { CombustionAsset } from "../types";

const asset = (over: Partial<CombustionAsset>): CombustionAsset => ({
  id: "a1", name: "Test", category: "stationary", fuelType: "diesel",
  unit: "L", annualVolume: 50_000, opex: 4_000_000, remainingLife: 10, unitCount: 1,
  ...over,
});

describe("equipment catalog coverage", () => {
  it("every pickable stationary end-use has alternatives", () => {
    for (const eu of endUsesFor("stationary")) {
      const alts = alternativesFor(eu.id);
      expect(alts.length, `${eu.id} should have alternatives`).toBeGreaterThan(0);
      for (const a of alts) {
        expect(a.title.length).toBeGreaterThan(0);
        expect(a.reduction.length).toBeGreaterThan(0);
        expect(a.note.length).toBeGreaterThan(0);
      }
    }
  });

  it("mobile end-uses have no stationary catalog (panel hidden)", () => {
    expect(alternativesFor("truck")).toEqual([]);
    expect(alternativesFor(undefined)).toEqual([]);
  });

  it("kilns and fire pumps offer no direct-electrification alternative as the commercial route", () => {
    expect(END_USES.kiln.electrify.feasible).toBe("no");
    expect(END_USES.firePump.electrify.feasible).toBe("no");
    // their catalog leads with non-electrification options
    expect(EQUIPMENT_ALTERNATIVES.kiln![0].category).toBe("Renewable fuel switch");
    expect(EQUIPMENT_ALTERNATIVES.firePump![0].category).toBe("Renewable fuel switch");
  });
});

describe("end-use picker", () => {
  it("hides the legacy furnaceKiln bucket but still resolves it for old data", () => {
    const ids = endUsesFor("stationary").map((p) => p.id);
    expect(ids).not.toContain("furnaceKiln");
    for (const id of ["boiler", "generator", "tfh", "furnace", "kiln", "oven", "cooking", "absorptionChiller", "firePump", "captivePower", "dryer", "spaceHeat", "otherProcess"]) {
      expect(ids).toContain(id);
    }
    expect(endUseProfile({ endUse: "furnaceKiln" })?.label).toContain("Furnace / Kiln");
  });
});

describe("suggestForAsset respects feasibility (no electrify-by-default; efficiency always first)", () => {
  it("DG set: efficiency first, then electrification (solar + BESS / grid)", () => {
    const sug = suggestForAsset(asset({ endUse: "generator" }));
    expect(sug.actions[0].lever).toBe("efficiency");
    expect(sug.actions.some((a) => a.lever === "electrify")).toBe(true);
    expect(sug.why).toMatch(/solar \+ BESS|grid/i);
  });

  it("fire pump: drop-in fuel is the switch and electrification is NOT offered", () => {
    const sug = suggestForAsset(asset({ endUse: "firePump" }));
    expect(sug.actions.some((a) => a.lever === "fuelSwitch")).toBe(true);
    expect(sug.actions.some((a) => a.lever === "electrify")).toBe(false);
    expect(sug.altActions).toBeUndefined();
  });

  it("kiln on petcoke: AFR/biomass co-processing, never electrify", () => {
    const sug = suggestForAsset(asset({ endUse: "kiln", fuelType: "petcoke", unit: "kg" }));
    expect(sug.actions.some((a) => a.lever === "fuelSwitch")).toBe(true);
    expect(sug.actions.some((a) => a.lever === "electrify")).toBe(false);
    expect(sug.altActions).toBeUndefined();
  });

  it("kiln on a fuel with no drop-in: efficiency only, no electrify fallback", () => {
    const sug = suggestForAsset(asset({ endUse: "kiln", fuelType: "lpg", unit: "kg" }));
    expect(sug.actions.map((a) => a.lever)).toEqual(["efficiency"]);
    expect(sug.why).toMatch(/AFR|pilot|alternativ|efficiency/i);
  });

  it("boiler: electrification stays in the primary where it is commercial", () => {
    const sug = suggestForAsset(asset({ endUse: "boiler" }));
    expect(sug.actions.some((a) => a.lever === "electrify")).toBe(true);
  });
});
