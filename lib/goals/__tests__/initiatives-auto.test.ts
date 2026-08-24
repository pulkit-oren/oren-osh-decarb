import { describe, expect, it } from "vitest";
import type { CombustionByYear, RefrigerationByYear } from "@/lib/model/types";
import type { FacilitiesByYear, Facility } from "@/lib/scope2/model/types";
import { autoInitiatives } from "../initiatives-auto";
import type { Inventories } from "../select";
import type { Goal } from "../types";
import { GOAL_TEMPLATES, goalFromTemplate, getTemplate } from "../catalog";

function facility(p: Partial<Facility> = {}): Facility {
  return {
    id: "f1", name: "Plant A", annualLoadKwh: 1_000_000, tariffPerKwh: 9,
    loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
    roofSpaceM2: 500, peakLoadKw: 400, gridEf: 0.7, irradiance: 1400, isolated: false, ...p,
  };
}

const inv: Inventories = {
  combustion: {
    2024: [{ id: "c1", name: "Diesel boiler", category: "stationary", fuelType: "diesel", annualVolume: 50000, unit: "L", opex: 0, remainingLife: 10, unitCount: 1 }],
  } as CombustionByYear,
  refrigeration: {} as RefrigerationByYear,
  facilities: { 2024: [facility()] } as FacilitiesByYear,
};

function goalOf(templateId: Goal["templateId"]): Goal {
  return goalFromTemplate(getTemplate(templateId), "g-0", 2024, 0);
}

describe("auto-initiatives", () => {
  it("generates emissions initiatives with real tonnes and budget for an SBTi goal", () => {
    const inits = autoInitiatives(goalOf("abs_sbti"), inv);
    expect(inits.length).toBeGreaterThan(0);
    expect(inits.every((i) => i.auto)).toBe(true);
    expect(inits.every((i) => i.metricImpact > 0)).toBe(true);
    // includes the Scope 1 asset and a Scope 2 facility solar/efficiency
    expect(inits.some((i) => i.sourceRef === "c1")).toBe(true);
    expect(inits.some((i) => i.sourceRef?.startsWith("f1"))).toBe(true);
  });

  it("emissions initiatives carry the OPEX view into the goal (annualOpexDelta + payback)", () => {
    const inits = autoInitiatives(goalOf("abs_sbti"), inv);
    // Scope 2 efficiency/solar initiatives are pure savings → negative OPEX Δ and a real payback
    const eff = inits.find((i) => i.sourceRef === "f1:eff")!;
    expect(eff.annualOpexDelta).toBeLessThan(0);
    expect(eff.paybackYears).not.toBeNull();
    expect(eff.paybackYears!).toBeGreaterThan(0);
    // the Scope 1 asset initiative carries an OPEX figure too
    const s1 = inits.find((i) => i.sourceRef === "c1")!;
    expect(typeof s1.annualOpexDelta).toBe("number");
  });

  it("renewable goal yields percentage-point impacts plus a procurement top-up", () => {
    const inits = autoInitiatives(goalOf("re100"), inv);
    expect(inits.some((i) => i.sourceRef === "procurement")).toBe(true);
    expect(inits.every((i) => i.metricImpact > 0)).toBe(true);
  });

  it("solar goal yields kWp impacts", () => {
    const inits = autoInitiatives(goalOf("solar"), inv);
    expect(inits.some((i) => i.sourceRef?.includes("solar") || i.metricImpact > 0)).toBe(true);
  });

  it("ids are deterministic across runs (so edits merge)", () => {
    const a = autoInitiatives(goalOf("abs_sbti"), inv).map((i) => i.id);
    const b = autoInitiatives(goalOf("abs_sbti"), inv).map((i) => i.id);
    expect(a).toEqual(b);
  });
});

/* lib/goals/ was the last consumer still handed RAW entries. unitCount and
   endUse live on equipment[] and only resolveEquipment stamps them back onto a
   row (Ruling A) — so suggestForAsset, defaultActions and capexForAsset, which
   all read them FLAT, saw undefined on every source in the app. Nothing caught
   it because lib/defaults.ts kept a flat mirror alongside its equipment. */
describe("auto-initiatives read resolved rows, not raw entries", () => {
  const fleet: Inventories = {
    combustion: {
      2024: [{
        id: "c-fleet", name: "Diesel fleet", category: "mobile", fuelType: "diesel",
        annualVolume: 120000, unit: "L", opex: 11_400_000,
        equipment: [{ id: "c-fleet", name: "Diesel fleet", unitCount: 5, remainingLife: 6 }],
        allocations: { "c-fleet": 120000 },
      }],
    } as unknown as CombustionByYear,
    refrigeration: {} as RefrigerationByYear,
    facilities: {} as FacilitiesByYear,
  };

  it("names the real fleet size instead of 'of undefined vehicles'", () => {
    const init = autoInitiatives(goalOf("abs_sbti"), fleet).find((i) => i.sourceRef === "c-fleet")!;
    expect(init).toBeTruthy();
    expect(init.name).toContain("of 5 vehicles");
    expect(init.name).not.toContain("undefined");
    // halfUnits collapsed to 1 with unitCount undefined; five vans is three.
    expect(init.name).toContain("electrify 3 of 5");
  });

  it("prices mobile efficiency capex at the fleet, not at one van", () => {
    const init = autoInitiatives(goalOf("abs_sbti"), fleet).find((i) => i.sourceRef === "c-fleet")!;
    // segments.ts defaultEfficiency: 25,000 per unit for a mobile source.
    expect(init.budget).toBeGreaterThanOrEqual(25_000 * 5);
  });

  it("emits one initiative per EQUIPMENT and none for the remainder row", () => {
    const split: Inventories = {
      ...fleet,
      combustion: {
        2024: [{
          id: "c-fleet", name: "Diesel fleet", category: "mobile", fuelType: "diesel",
          annualVolume: 120000, unit: "L", opex: 11_400_000,
          equipment: [
            { id: "c-fleet", name: "City vans", unitCount: 3, remainingLife: 6 },
            { id: "eq-2", name: "Highway vans", unitCount: 2, remainingLife: 6 },
          ],
          // Deliberately short: 20,000 L belongs to no machine, so it resolves
          // to a `::unallocated` row that no lever can act on.
          allocations: { "c-fleet": 60000, "eq-2": 40000 },
        }],
      } as unknown as CombustionByYear,
    };
    const refs = autoInitiatives(goalOf("abs_sbti"), split).map((i) => i.sourceRef);
    expect(refs).toContain("c-fleet");
    expect(refs).toContain("eq-2");
    expect(refs.some((r) => r?.includes("::unallocated"))).toBe(false);
  });
});

describe("catalog", () => {
  it("has 8 templates split into emissions and energy", () => {
    expect(GOAL_TEMPLATES.filter((t) => t.category === "emissions").length).toBe(4);
    expect(GOAL_TEMPLATES.filter((t) => t.category === "energy").length).toBe(4);
  });
  it("seeds RE100 with interim milestones", () => {
    const g = goalFromTemplate(getTemplate("re100"), "g-1", 2024, 0);
    expect(g.metric).toBe("renewable_pct");
    expect(g.direction).toBe("increase");
    expect(g.milestones.length).toBe(2);
  });
});
