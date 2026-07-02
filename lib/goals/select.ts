/* ============================================================
   Goals engine — pure, per-metric. Turns entered inventory + a goal +
   its initiatives into baseline/actuals/target/forecast series and a
   verdict. Handles four metrics (emissions tCO₂e, total energy kWh,
   renewable-electricity %, on-site solar kWp) and both directions
   (reduce a quantity vs increase toward a target). No React, no I/O.
   ============================================================ */

import { baselineScope1, combustionEnergyKJ } from "@/lib/model/baseline";
import { FY_YEARS } from "@/lib/model/types";
import type { CombustionByYear, RefrigerationByYear } from "@/lib/model/types";
import { resolveCombustion, resolveRefrigeration } from "@/lib/yearly";
import { baselineScope2, coveredKwhOf } from "@/lib/scope2/model/baseline";
import { contractCoverageByFacility, isContractRecord, isOnsiteSolarRecord } from "@/lib/scope2/model/instruments";
import { resolveFacilities } from "@/lib/scope2/store-helpers";
import type { FacilitiesByYear } from "@/lib/scope2/model/types";
import { wasteDiversionPct, type WasteByYear, type WaterByYear } from "@/lib/esg/types";
import type { Goal, GoalScope, Initiative, InitiativeStatus } from "./types";

export interface SeriesPoint { year: number; value: number; }

export interface Inventories {
  combustion: CombustionByYear;
  refrigeration: RefrigerationByYear;
  facilities: FacilitiesByYear;
  /** Environment-pillar annual totals (Data input → Water / Waste). */
  water?: WaterByYear;
  waste?: WasteByYear;
}

const KJ_PER_KWH = 3600;

/* ---------- Raw per-year quantities from entered data ---------- */

export function s1TotalForYear(inv: Inventories, year: number): number {
  const assets = resolveCombustion(inv.combustion, year).filter((a) => !a.excluded);
  const systems = resolveRefrigeration(inv.refrigeration, year).filter((s) => !s.excluded);
  return baselineScope1(assets, systems).totalT;
}
export function s2TotalForYear(inv: Inventories, year: number): number {
  return baselineScope2(facilitiesFor(inv, year)).totalLocationT;
}

function facilitiesFor(inv: Inventories, year: number) {
  return resolveFacilities(inv.facilities, year).filter((f) => !f.excluded);
}

/** Scope 1 fuel energy in kWh-equivalent for a year. */
export function s1EnergyKwh(inv: Inventories, year: number): number {
  return resolveCombustion(inv.combustion, year)
    .filter((a) => !a.excluded)
    .reduce((sum, a) => sum + combustionEnergyKJ(a) / KJ_PER_KWH, 0);
}
/** Scope 2 electricity consumption (kWh) for a year. VPPA / I-REC records are
 *  contractual coverage of purchased kWh, not consumption — skip them. */
export function s2EnergyKwh(inv: Inventories, year: number): number {
  return facilitiesFor(inv, year)
    .filter((f) => !isContractRecord(f))
    .reduce((s, f) => s + f.annualLoadKwh, 0);
}

/** On-site solar generation (kWh/yr): installed kWp plus any kWh entered on
 *  the "Solar onsite" records in Data input. */
function solarGenKwh(inv: Inventories, year: number): number {
  return facilitiesFor(inv, year).reduce(
    (s, f) => s + (f.existingSolarKwp ?? 0) * f.irradiance + (isOnsiteSolarRecord(f) ? f.annualLoadKwh : 0),
    0,
  );
}

/* ---------- Metric value for a goal in a given year ---------- */

export function emissionsForYear(scope: GoalScope, inv: Inventories, year: number): number {
  const s1 = s1TotalForYear(inv, year), s2 = s2TotalForYear(inv, year);
  return scope === "s1" ? s1 : scope === "s2" ? s2 : s1 + s2;
}
export function energyForYear(scope: GoalScope, inv: Inventories, year: number): number {
  const s1 = s1EnergyKwh(inv, year), s2 = s2EnergyKwh(inv, year);
  return scope === "s1" ? s1 : scope === "s2" ? s2 : s1 + s2;
}
/** Renewable electricity share (0..100): contracted (per-facility % + entered
 *  VPPA/I-REC records) + on-site solar, over total physical consumption. */
export function renewablePctForYear(inv: Inventories, year: number): number {
  const facilities = facilitiesFor(inv, year);
  const contractCov = contractCoverageByFacility(facilities);
  const contracted = facilities.reduce((s, f) => s + coveredKwhOf(f, contractCov), 0);
  const solar = solarGenKwh(inv, year); // includes the "Solar onsite" records' kWh
  const gridLoad = facilities
    .filter((f) => !isContractRecord(f) && !isOnsiteSolarRecord(f))
    .reduce((s, f) => s + f.annualLoadKwh, 0);
  const total = gridLoad + solar;
  return total > 0 ? Math.min(100, ((contracted + solar) / total) * 100) : 0;
}
export function solarKwpForYear(inv: Inventories, year: number): number {
  return facilitiesFor(inv, year).reduce((s, f) => s + (f.existingSolarKwp ?? 0), 0);
}

/** The goal's metric value in a year. */
export function metricForYear(goal: Goal, inv: Inventories, year: number): number {
  switch (goal.metric) {
    case "emissions_t": return emissionsForYear(goal.scope, inv, year);
    case "energy_kwh": return energyForYear(goal.scope, inv, year);
    case "renewable_pct": return renewablePctForYear(inv, year);
    case "solar_kwp": return solarKwpForYear(inv, year);
    case "water_withdrawal_kl": return inv.water?.[year]?.withdrawalKl ?? 0;
    case "water_consumption_kl": return inv.water?.[year]?.consumptionKl ?? 0;
    case "water_discharge_kl": return inv.water?.[year]?.dischargeKl ?? 0;
    case "waste_generated_t": return inv.waste?.[year]?.generatedT ?? 0;
    case "waste_diversion_pct": return wasteDiversionPct(inv.waste?.[year]);
  }
}

const isWaterMetric = (m: Goal["metric"]) => m.startsWith("water_");
const isWasteMetric = (m: Goal["metric"]) => m.startsWith("waste_");

function metricHasData(goal: Goal, inv: Inventories, year: number): boolean {
  if (isWaterMetric(goal.metric)) {
    const w = inv.water?.[year];
    return !!w && (w.withdrawalKl > 0 || w.consumptionKl > 0 || w.dischargeKl > 0);
  }
  if (isWasteMetric(goal.metric)) {
    const w = inv.waste?.[year];
    return !!w && (w.generatedT > 0 || w.disposedT > 0 || w.recoveredT > 0);
  }
  const s1 = (inv.combustion[year]?.length ?? 0) > 0 || (inv.refrigeration[year]?.length ?? 0) > 0;
  const s2 = (inv.facilities[year]?.length ?? 0) > 0;
  if (goal.metric === "renewable_pct" || goal.metric === "solar_kwp") return s2;
  if (goal.scope === "s1") return s1;
  if (goal.scope === "s2") return s2;
  return s1 || s2;
}

/** Actual metric per FY (only years with entered data). */
export function actualsSeries(goal: Goal, inv: Inventories): SeriesPoint[] {
  return FY_YEARS.filter((y) => metricHasData(goal, inv, y)).map((y) => ({
    year: y, value: metricForYear(goal, inv, y),
  }));
}

/** Base-year metric value — the anchor for the target. */
export function baseValueFor(goal: Goal, inv: Inventories): number {
  return metricForYear(goal, inv, goal.baseYear);
}

/* ---------- Target line ---------- */

/** Reduce-goals: the fraction cut at the target year (0..1). */
export function endReductionFrac(goal: Goal): number {
  if (goal.templateId === "netzero") return clamp01(1 - (goal.residualPct ?? 0) / 100);
  return clamp01((goal.targetPct ?? 0) / 100);
}

/** The goal's target metric value at the target year. */
export function endTargetValue(goal: Goal, baseValue: number): number {
  if (goal.direction === "reduce") return baseValue * (1 - endReductionFrac(goal));
  if (goal.metric === "solar_kwp") return goal.targetAbsolute ?? baseValue;
  return goal.targetPct ?? 100; // percentage-share target (renewable %, waste diversion %)
}

/** Interpolated target value for a year, bending through milestones. */
export function targetValueAt(goal: Goal, baseValue: number, year: number): number {
  const end = endTargetValue(goal, baseValue);
  const milestoneValue = (reductionPct: number) =>
    goal.direction === "reduce" ? baseValue * (1 - clamp01(reductionPct / 100)) : reductionPct;

  const anchors: [number, number][] = [
    [goal.baseYear, baseValue] as [number, number],
    ...goal.milestones
      .filter((m) => m.year > goal.baseYear && m.year < goal.targetYear)
      .map((m) => [m.year, milestoneValue(m.reductionPct)] as [number, number]),
    [goal.targetYear, end] as [number, number],
  ].sort((a, b) => a[0] - b[0]);

  if (year <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (year >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [y0, v0] = anchors[i];
    const [y1, v1] = anchors[i + 1];
    if (year >= y0 && year <= y1) {
      const t = y1 === y0 ? 0 : (year - y0) / (y1 - y0);
      return v0 + (v1 - v0) * t;
    }
  }
  return last[1];
}

export function targetSeries(goal: Goal, baseValue: number): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let y = goal.baseYear; y <= goal.targetYear; y++) {
    out.push({ year: y, value: targetValueAt(goal, baseValue, y) });
  }
  return out;
}

/* ---------- Forecast from initiatives ---------- */

function contributes(status: InitiativeStatus): boolean {
  return status !== "on_hold";
}

/** Linear ramp 0→1; the start year counts as year 1. */
export function initiativeRamp(init: Initiative, year: number): number {
  if (year < init.startYear) return 0;
  const span = init.targetYear - init.startYear + 1;
  if (span <= 1) return 1;
  return clamp01((year - init.startYear + 1) / span);
}

/** Cumulative initiative impact landing in `year`, in the goal's metric unit. */
export function impactInYear(initiatives: Initiative[], year: number): number {
  return initiatives
    .filter((i) => contributes(i.status))
    .reduce((sum, i) => sum + i.metricImpact * initiativeRamp(i, year), 0);
}

/**
 * Forward projection from the latest actual. Reduce-goals subtract impact
 * (floored at 0); increase-goals add it (renewable % capped at 100).
 */
export function forecastSeries(goal: Goal, initiatives: Initiative[], latest: SeriesPoint | null): SeriesPoint[] {
  if (!latest) return [];
  const out: SeriesPoint[] = [];
  for (let y = latest.year; y <= goal.targetYear; y++) {
    const impact = impactInYear(initiatives, y);
    let v = goal.direction === "reduce" ? latest.value - impact : latest.value + impact;
    v = Math.max(0, v);
    if (goal.metric.endsWith("_pct")) v = Math.min(100, v);
    out.push({ year: y, value: v });
  }
  return out;
}

/* ---------- Verdict + rollups ---------- */

export type Verdict = "on-track" | "at-risk" | "off-track";

export interface GoalStatus {
  verdict: Verdict;
  /** Shortfall at the target year, in the goal's unit (positive = falling short). */
  gapValue: number;
  /** Shortfall normalized (fraction) for the verdict bands. */
  gapFrac: number;
  /** Impact still needed from the latest actual to hit target, in the goal's unit. */
  neededValue: number;
  /** Impact committed by non-on-hold initiatives at full ramp, in the goal's unit. */
  committedValue: number;
  coverage: number;
  targetEnd: number;
  forecastEnd: number;
}

export function valueAt(series: SeriesPoint[], year: number): number | null {
  const hit = series.find((p) => p.year === year);
  return hit ? hit.value : null;
}

export function goalStatus(goal: Goal, baseValue: number, initiatives: Initiative[], actuals: SeriesPoint[]): GoalStatus {
  const latest = actuals.length ? actuals[actuals.length - 1] : null;
  const target = targetSeries(goal, baseValue);
  const forecast = forecastSeries(goal, initiatives, latest);

  const targetEnd = valueAt(target, goal.targetYear) ?? endTargetValue(goal, baseValue);
  const forecastEnd = valueAt(forecast, goal.targetYear) ?? latest?.value ?? baseValue;
  const latestVal = latest?.value ?? baseValue;

  const reduce = goal.direction === "reduce";
  const gapValue = reduce ? forecastEnd - targetEnd : targetEnd - forecastEnd;
  const denom = reduce ? Math.max(baseValue, 1) : Math.max(targetEnd, 1);
  const gapFrac = gapValue / denom;

  const neededValue = Math.max(0, reduce ? latestVal - targetEnd : targetEnd - latestVal);
  const committedValue = initiatives
    .filter((i) => contributes(i.status))
    .reduce((s, i) => s + i.metricImpact, 0);
  const coverage = neededValue > 0 ? committedValue / neededValue : committedValue > 0 ? 1 : 0;

  let verdict: Verdict = "on-track";
  if (gapFrac > 0.1) verdict = "off-track";
  else if (gapFrac > 0.01) verdict = "at-risk";

  return { verdict, gapValue, gapFrac, neededValue, committedValue, coverage, targetEnd, forecastEnd };
}

export interface InitiativeRollup {
  total: number;
  byStatus: Record<InitiativeStatus, number>;
  committedValue: number;
  /** Impact actually delivered so far, from owners' progress updates. */
  deliveredValue: number;
  totalBudget: number;
}

/** Progress toward the target so far (0..1), from the latest actual. */
export function progressFraction(goal: Goal, baseValue: number, latestValue: number): number {
  if (goal.direction === "reduce") {
    const targetReduction = endReductionFrac(goal) * baseValue;
    const achieved = baseValue - latestValue;
    return targetReduction > 0 ? clamp01(achieved / targetReduction) : achieved > 0 ? 1 : 0;
  }
  const end = endTargetValue(goal, baseValue);
  const span = end - baseValue;
  return span > 0 ? clamp01((latestValue - baseValue) / span) : latestValue >= end ? 1 : 0;
}

export function initiativeRollup(goalId: string, initiatives: Initiative[]): InitiativeRollup {
  const mine = initiatives.filter((i) => i.goalId === goalId);
  const byStatus: Record<InitiativeStatus, number> = { planned: 0, in_progress: 0, completed: 0, on_hold: 0 };
  for (const i of mine) byStatus[i.status]++;
  const active = mine.filter((i) => contributes(i.status));
  return {
    total: mine.length,
    byStatus,
    committedValue: active.reduce((s, i) => s + i.metricImpact, 0),
    deliveredValue: active.reduce((s, i) => s + i.metricImpact * ((i.progressPct ?? 0) / 100), 0),
    totalBudget: mine.reduce((s, i) => s + i.budget, 0),
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
