/* Water & waste goal metrics — baselines from the ESG inventories, the
   diversion-% math, status for increase-goals, templates, and the generic
   auto-initiative playbooks. */

import { describe, expect, it } from "vitest";
import {
  actualsSeries, baseValueFor, goalStatus, metricForYear, type Inventories,
} from "../select";
import { GOAL_TEMPLATES, customTemplateFor, getTemplate, goalFromTemplate, templatesFor } from "../catalog";
import { autoInitiatives } from "../initiatives-auto";
import type { Goal } from "../types";

const inv: Inventories = {
  combustion: {},
  refrigeration: {},
  facilities: {},
  water: {
    2024: { withdrawalKl: 12000, consumptionKl: 4000, dischargeKl: 8000 },
    2025: { withdrawalKl: 10000, consumptionKl: 3500, dischargeKl: 6500 },
  },
  waste: {
    2025: { generatedT: 500, disposedT: 300, recoveredT: 200 },
  },
};

function goalFor(templateId: Parameters<typeof getTemplate>[0], baseYear = 2025): Goal {
  return goalFromTemplate(getTemplate(templateId), "g-test", baseYear, 0);
}

describe("water metrics", () => {
  it("reads withdrawal / consumption / discharge for the year", () => {
    const g = goalFor("water_withdrawal");
    expect(metricForYear(g, inv, 2025)).toBe(10000);
    expect(metricForYear(goalFor("water_neutral"), inv, 2025)).toBe(3500);
    expect(metricForYear(goalFor("zld"), inv, 2025)).toBe(6500);
  });

  it("returns 0 with no water data, and baseValue anchors at the base year", () => {
    const g = goalFor("water_withdrawal");
    expect(metricForYear(g, inv, 2023)).toBe(0);
    expect(metricForYear(g, { combustion: {}, refrigeration: {}, facilities: {} }, 2025)).toBe(0);
    expect(baseValueFor(g, inv)).toBe(10000);
  });

  it("actualsSeries only includes years with water data", () => {
    const g = goalFor("water_withdrawal");
    expect(actualsSeries(g, inv).map((p) => p.year)).toEqual([2024, 2025]);
  });
});

describe("waste metrics", () => {
  it("computes generated tonnes and the diversion share", () => {
    expect(metricForYear(goalFor("waste_reduction"), inv, 2025)).toBe(500);
    expect(metricForYear(goalFor("zero_waste_landfill"), inv, 2025)).toBe(40); // 200/500
  });

  it("diversion is 0 when nothing is generated", () => {
    expect(metricForYear(goalFor("zero_waste_landfill"), inv, 2024)).toBe(0);
  });

  it("zero-waste goal is an increase-goal targeting the diversion share", () => {
    const g = goalFor("zero_waste_landfill");
    const base = baseValueFor(g, inv); // 40%
    const status = goalStatus(g, base, [], actualsSeries(g, inv));
    expect(status.targetEnd).toBe(90);
    expect(status.neededValue).toBe(50); // 40 → 90 pp
  });
});

describe("catalog — water & waste templates", () => {
  it("offers the standard corporate water and waste target types", () => {
    expect(templatesFor("water").map((t) => t.id)).toEqual(["water_withdrawal", "water_neutral", "water_intensity", "zld"]);
    expect(templatesFor("waste").map((t) => t.id)).toEqual(["zero_waste_landfill", "waste_reduction", "waste_recovery"]);
    for (const t of GOAL_TEMPLATES.filter((t) => t.category === "water")) expect(t.metric.startsWith("water_")).toBe(true);
    for (const t of GOAL_TEMPLATES.filter((t) => t.category === "waste")) expect(t.metric.startsWith("waste_")).toBe(true);
  });

  it("custom goals under water/waste track that pillar's metric", () => {
    expect(customTemplateFor("water").metric).toBe("water_withdrawal_kl");
    expect(customTemplateFor("waste").metric).toBe("waste_generated_t");
    expect(customTemplateFor("emissions").metric).toBe("emissions_t");
  });
});

describe("auto-initiatives — water & waste playbooks", () => {
  it("seeds water-efficiency initiatives sized from the base-year withdrawal", () => {
    const g = goalFor("water_withdrawal");
    const inits = autoInitiatives(g, inv);
    expect(inits.length).toBeGreaterThan(0);
    const total = inits.reduce((s, i) => s + i.metricImpact, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(10000); // never suggests more than the baseline
    for (const i of inits) expect(i.auto).toBe(true);
  });

  it("seeds diversion initiatives that close the gap to the target share", () => {
    const g = goalFor("zero_waste_landfill"); // base 40%, target 90%
    const inits = autoInitiatives(g, inv);
    const pp = inits.reduce((s, i) => s + i.metricImpact, 0);
    expect(pp).toBeCloseTo(50, 5);
  });

  it("returns nothing when there is no ESG data", () => {
    const empty: Inventories = { combustion: {}, refrigeration: {}, facilities: {} };
    expect(autoInitiatives(goalFor("water_withdrawal"), empty)).toEqual([]);
    expect(autoInitiatives(goalFor("waste_reduction"), empty)).toEqual([]);
  });
});
