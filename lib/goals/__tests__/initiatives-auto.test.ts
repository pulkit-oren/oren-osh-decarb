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
