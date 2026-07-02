/* ============================================================
   Goals & Targets — domain types (v2). Pure data, no React.
   A Goal is created from a catalog template (Emissions or Energy),
   tracks a single metric, and can be assigned to a persona. Its
   initiatives are auto-suggested from the user's data and editable.
   ============================================================ */

import type { Persona } from "@/lib/persona";

export type GoalScope = "s1" | "s2" | "s1s2";
export type GoalCategory = "emissions" | "energy" | "water" | "waste";

/** What a goal measures. Determines baseline source + chart unit. */
export type GoalMetric =
  | "emissions_t" | "energy_kwh" | "renewable_pct" | "solar_kwp"
  | "water_withdrawal_kl" | "water_consumption_kl" | "water_discharge_kl"
  | "waste_generated_t" | "waste_diversion_pct";

export type GoalTemplateId =
  | "abs_sbti" | "netzero" | "carbon_neutral" | "intensity"
  | "re100" | "renewable_pct" | "energy_efficiency" | "solar"
  | "water_withdrawal" | "water_neutral" | "water_intensity" | "zld"
  | "zero_waste_landfill" | "waste_reduction" | "waste_recovery"
  | "custom";

export type InitiativeStatus = "planned" | "in_progress" | "completed" | "on_hold";

export interface Milestone {
  id: string;
  year: number;
  /** For reduce-goals: % reduction below base. For increase-goals: target % of the metric. */
  reductionPct: number;
}

export interface Goal {
  id: string;
  name: string;
  category: GoalCategory;
  templateId: GoalTemplateId;
  metric: GoalMetric;
  /** "reduce" = drive the metric down (emissions/energy); "increase" = up (renewable %, solar). */
  direction: "reduce" | "increase";
  scope: GoalScope;
  baseYear: number;
  targetYear: number;
  /** reduce: % cut at target. increase (renewable_pct): target share %. */
  targetPct?: number;
  /** net-zero: residual emissions % left. */
  residualPct?: number;
  /** carbon-neutral: % of remaining emissions offset. */
  offsetPct?: number;
  /** solar: absolute target (kWp). */
  targetAbsolute?: number;
  /** intensity: denominator label. */
  intensityUnit?: string;
  milestones: Milestone[];
  assignee?: Persona;
  createdAt: number;
}

export interface Initiative {
  id: string;
  goalId: string;
  name: string;
  assignee?: Persona;
  scope: GoalScope;
  status: InitiativeStatus;
  startYear: number;
  targetYear: number;
  /** Impact at full ramp, in the goal's metric unit (t, kWh, percentage points, kWp). */
  metricImpact: number;
  /** One-off capital cost (₹). */
  budget: number;
  /** Manual rollout completeness (0..100) — shown in the rollup, not the forecast. */
  progressPct?: number;
  note?: string;
  /** Generated from data vs hand-added. Auto ones refresh when data changes. */
  auto: boolean;
  /** Originating asset/facility id (auto initiatives) — used to merge edits. */
  sourceRef?: string;
}

export interface GoalsState {
  goals: Goal[];
  initiatives: Initiative[];
  /** Year → output (revenue / production) — only used by intensity goals. */
  output?: Record<number, number>;
}

export const EMPTY_GOALS_STATE: GoalsState = { goals: [], initiatives: [], output: {} };

export const SCOPE_LABEL: Record<GoalScope, string> = {
  s1: "Scope 1",
  s2: "Scope 2",
  s1s2: "Scope 1 + 2",
};

export const CATEGORY_LABEL: Record<GoalCategory, string> = {
  emissions: "Emissions goal",
  energy: "Energy goal",
  water: "Water goal",
  waste: "Waste goal",
};

/** Water and waste goals track site totals, not GHG scopes — hide the scope UI. */
export function categoryHasGhgScope(category: GoalCategory): boolean {
  return category === "emissions" || category === "energy";
}

/** Unit suffix shown on charts / numbers for each metric. */
export const METRIC_UNIT: Record<GoalMetric, string> = {
  emissions_t: "tCO₂e",
  energy_kwh: "kWh",
  renewable_pct: "%",
  solar_kwp: "kWp",
  water_withdrawal_kl: "kL",
  water_consumption_kl: "kL",
  water_discharge_kl: "kL",
  waste_generated_t: "t",
  waste_diversion_pct: "%",
};

export const STATUS_LABEL: Record<InitiativeStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  on_hold: "On hold",
};

export const STATUS_COLOR: Record<InitiativeStatus, string> = {
  planned: "#8A857B",
  in_progress: "#2E90FA",
  completed: "#1F9E5A",
  on_hold: "#F59E0B",
};
