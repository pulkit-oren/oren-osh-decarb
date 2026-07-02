/* ============================================================
   Goal catalog — the pre-configured templates shown as boxes in the
   creation flow, grouped into Emissions and Energy. Each template
   seeds a Goal with framework-aligned defaults. Pure data.
   ============================================================ */

import type { Goal, GoalCategory, GoalMetric, GoalScope, GoalTemplateId, Milestone } from "./types";

export interface GoalTemplate {
  id: GoalTemplateId;
  category: GoalCategory;
  metric: GoalMetric;
  direction: "reduce" | "increase";
  title: string;
  blurb: string;
  /** lucide-react icon name (resolved in the picker). */
  icon: string;
  defaultScope: GoalScope;
  defaultTargetYear: number;
  defaultTargetPct?: number;
  defaultResidualPct?: number;
  defaultOffsetPct?: number;
  defaultTargetAbsolute?: number;
  defaultMilestones?: { year: number; reductionPct: number }[];
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  // ---- Emissions ----
  {
    id: "abs_sbti", category: "emissions", metric: "emissions_t", direction: "reduce",
    title: "Absolute reduction (SBTi)", icon: "TrendingDown",
    blurb: "Cut absolute Scope 1+2 emissions on a 1.5 °C science-based path — about 42% by 2030.",
    defaultScope: "s1s2", defaultTargetYear: 2030, defaultTargetPct: 42,
  },
  {
    id: "netzero", category: "emissions", metric: "emissions_t", direction: "reduce",
    title: "Net-zero by 2050", icon: "Target",
    blurb: "SBTi Net-Zero: reduce ≥90% by 2050 and neutralize the residual.",
    defaultScope: "s1s2", defaultTargetYear: 2050, defaultResidualPct: 10,
    defaultMilestones: [{ year: 2030, reductionPct: 50 }, { year: 2040, reductionPct: 75 }],
  },
  {
    id: "carbon_neutral", category: "emissions", metric: "emissions_t", direction: "reduce",
    title: "Carbon neutral", icon: "Leaf",
    blurb: "Reduce what you can, then offset the remainder to reach net-zero on paper.",
    defaultScope: "s1s2", defaultTargetYear: 2030, defaultTargetPct: 50, defaultOffsetPct: 50,
  },
  {
    id: "intensity", category: "emissions", metric: "emissions_t", direction: "reduce",
    title: "Emissions intensity", icon: "Gauge",
    blurb: "Cut tCO₂e per unit of output or revenue — decoupling growth from emissions.",
    defaultScope: "s1s2", defaultTargetYear: 2030, defaultTargetPct: 30,
  },
  // ---- Energy ----
  {
    id: "re100", category: "energy", metric: "renewable_pct", direction: "increase",
    title: "RE100 — 100% renewable", icon: "Sun",
    blurb: "Source 100% renewable electricity. RE100 interim: 60% by 2030, 90% by 2040.",
    defaultScope: "s2", defaultTargetYear: 2030, defaultTargetPct: 100,
    defaultMilestones: [{ year: 2030, reductionPct: 60 }, { year: 2040, reductionPct: 90 }],
  },
  {
    id: "renewable_pct", category: "energy", metric: "renewable_pct", direction: "increase",
    title: "Renewable electricity %", icon: "Plug",
    blurb: "Reach a custom renewable-electricity share by a target year.",
    defaultScope: "s2", defaultTargetYear: 2028, defaultTargetPct: 50,
  },
  {
    id: "energy_efficiency", category: "energy", metric: "energy_kwh", direction: "reduce",
    title: "Energy efficiency", icon: "Activity",
    blurb: "Cut total energy consumption (fuel + electricity) by a target year.",
    defaultScope: "s1s2", defaultTargetYear: 2030, defaultTargetPct: 20,
  },
  {
    id: "solar", category: "energy", metric: "solar_kwp", direction: "increase",
    title: "On-site solar", icon: "PanelTop",
    blurb: "Install a target on-site solar capacity (kWp) across your facilities.",
    defaultScope: "s2", defaultTargetYear: 2030, defaultTargetAbsolute: 1000,
  },
  // ---- Water ----
  {
    id: "water_withdrawal", category: "water", metric: "water_withdrawal_kl", direction: "reduce",
    title: "Reduce water withdrawal", icon: "Droplets",
    blurb: "Cut absolute freshwater withdrawal — the most common CDP Water / stewardship pledge, typically 25–30% by 2030.",
    defaultScope: "s1s2", defaultTargetYear: 2030, defaultTargetPct: 25,
  },
  {
    id: "water_neutral", category: "water", metric: "water_consumption_kl", direction: "reduce",
    title: "Water neutral / positive", icon: "Waves",
    blurb: "Cut consumption and replenish the rest — net-zero water consumed, as pledged by leading water-positive programs.",
    defaultScope: "s1s2", defaultTargetYear: 2035, defaultTargetPct: 50,
    defaultMilestones: [{ year: 2030, reductionPct: 25 }],
  },
  {
    id: "water_intensity", category: "water", metric: "water_withdrawal_kl", direction: "reduce",
    title: "Water-use intensity", icon: "Gauge",
    blurb: "Cut kL withdrawn per unit of output or revenue — decoupling growth from water use.",
    defaultScope: "s1s2", defaultTargetYear: 2030, defaultTargetPct: 30,
  },
  {
    id: "zld", category: "water", metric: "water_discharge_kl", direction: "reduce",
    title: "Zero liquid discharge", icon: "CircleOff",
    blurb: "Treat and reuse all effluent so no wastewater leaves the site — discharge to (near) zero.",
    defaultScope: "s1s2", defaultTargetYear: 2035, defaultTargetPct: 100,
    defaultMilestones: [{ year: 2030, reductionPct: 50 }],
  },
  // ---- Waste ----
  {
    id: "zero_waste_landfill", category: "waste", metric: "waste_diversion_pct", direction: "increase",
    title: "Zero waste to landfill", icon: "Recycle",
    blurb: "Divert ≥90% of waste from landfill and incineration — the TRUE-certification bar for zero waste.",
    defaultScope: "s1s2", defaultTargetYear: 2030, defaultTargetPct: 90,
  },
  {
    id: "waste_reduction", category: "waste", metric: "waste_generated_t", direction: "reduce",
    title: "Reduce waste generated", icon: "TrendingDown",
    blurb: "Cut absolute waste generated at source — packaging, process scrap, and single-use materials.",
    defaultScope: "s1s2", defaultTargetYear: 2030, defaultTargetPct: 20,
  },
  {
    id: "waste_recovery", category: "waste", metric: "waste_diversion_pct", direction: "increase",
    title: "Recycling & recovery rate", icon: "RefreshCw",
    blurb: "Reach a custom share of waste recycled, reused, or otherwise recovered by a target year.",
    defaultScope: "s1s2", defaultTargetYear: 2028, defaultTargetPct: 75,
  },
];

export const CUSTOM_TEMPLATE: GoalTemplate = {
  id: "custom", category: "emissions", metric: "emissions_t", direction: "reduce",
  title: "Custom goal", icon: "Plus",
  blurb: "Start from scratch — choose the metric, scope, base year, and target yourself.",
  defaultScope: "s1s2", defaultTargetYear: 2030, defaultTargetPct: 30,
};

export function templatesFor(category: GoalCategory): GoalTemplate[] {
  return GOAL_TEMPLATES.filter((t) => t.category === category);
}

/** The Custom box shown at the end of each category — water/waste track their own metric. */
export function customTemplateFor(category: GoalCategory): GoalTemplate {
  const metric: GoalMetric =
    category === "water" ? "water_withdrawal_kl" : category === "waste" ? "waste_generated_t" : CUSTOM_TEMPLATE.metric;
  return { ...CUSTOM_TEMPLATE, category, metric };
}

export function getTemplate(id: GoalTemplateId): GoalTemplate {
  return GOAL_TEMPLATES.find((t) => t.id === id) ?? CUSTOM_TEMPLATE;
}

/** Build a fresh Goal from a template (id assigned by the caller/store). */
export function goalFromTemplate(t: GoalTemplate, id: string, baseYear: number, createdAt: number): Goal {
  const milestones: Milestone[] = (t.defaultMilestones ?? []).map((m, i) => ({
    id: `${id}-m${i}`, year: m.year, reductionPct: m.reductionPct,
  }));
  return {
    id,
    name: t.id === "custom" ? "New goal" : t.title,
    category: t.category,
    templateId: t.id,
    metric: t.metric,
    direction: t.direction,
    scope: t.defaultScope,
    baseYear,
    targetYear: t.defaultTargetYear,
    targetPct: t.defaultTargetPct,
    residualPct: t.defaultResidualPct,
    offsetPct: t.defaultOffsetPct,
    targetAbsolute: t.defaultTargetAbsolute,
    intensityUnit: t.id === "intensity" || t.id === "water_intensity" ? "per ₹ crore revenue" : undefined,
    milestones,
    createdAt,
  };
}
