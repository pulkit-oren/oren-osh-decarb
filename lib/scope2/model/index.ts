/* ============================================================
   computeScope2() — the single entry point. Compounds the three
   pillars in physical order per facility (efficiency shrinks the
   load, solar offsets the reduced load, procurement covers the
   remaining grid draw) and always reports BOTH location-based and
   market-based Scope 2. Pure: same inputs → same output.
   ============================================================ */

import {
  financeAssumptionsFrom,
  programmeMetrics,
  S2_LIFETIME_YEARS as S2_ENGINE_LIFETIMES,
  summariseLever,
} from "@/lib/finance";
import type { LeverMetrics, OpexPart as FinanceOpexPart, SeriesRow } from "@/lib/finance";
import { buildTrajectory, targetLine } from "@/lib/model/trajectory";
import type { GlobalAssumptions, TrajectoryRow, Wedge } from "@/lib/model/types";
import { defaultFacilityActions } from "../defaults";
import { baselineScope2, existingCoveredKwh, type Scope2Baseline } from "./baseline";
import { contractCoverageByFacility, isContractRecord } from "./instruments";
import { applyEfficiency, type EfficiencyResult } from "./efficiency";
import { applyGeneration, type GenerationResult } from "./generation";
import { applyProcurement, type FacilityDraw, type ProcurementResult } from "./procurement";
import type { Facility, Scope2Levers } from "./types";
import { validateScope2 } from "./validate";

export const END_YEAR = 2050;
export const BAU_GROWTH = 0.01;
// DISCOUNT_RATE_PCT and the local S2_LIFETIME_YEARS table are GONE. Both were
// module-private with no external reference, so unlike the four symbols Ruling B
// defers to Task 10, deleting them here cannot break another task — and left in
// place they are unused private consts, i.e. two new lint warnings. The engine's
// S2_LIFETIME_YEARS (lib/finance/lifetimes.ts) is now the only copy, and the
// discount rate arrives through the assumptions parameter (F8).

/** One named running-cost component — owned by `@/lib/finance`, which escalates
 *  it by `kind`. Re-exported under the same name so every existing
 *  `import { OpexPart } from "@/lib/scope2/model"` keeps resolving.
 *
 *  The local copy had NO `kind` field, and the engine falls through to
 *  `otherEscalationPct` (0%) when it is absent — so every Scope 2 part would
 *  silently stop escalating while the identical kWh in Scope 1's
 *  electrification lever escalates at `elecEscalationPct`. Worst on generation,
 *  whose window is 25 years. */
export type { OpexPart } from "@/lib/finance";

export interface Scope2LeverSummary {
  id: "efficiency" | "generation" | "procurement";
  label: string;
  colorIdx: number;
  scope: 2;
  enabled: boolean;
  abatementT: number; // full-ramp tonnes/yr (procurement: market-based only)
  capex: number;
  annualOpexDelta: number; // positive = cost, negative = saving
  /** Σ discounted net cash ÷ Σ discounted tonnes over the lever's own life.
   *  The decision number; `costPerTonne` is an alias during the UI transition. */
  levelisedCostPerTonne: number;
  costPerTonne: number;
  opexParts: FinanceOpexPart[];
  paybackYears: number | null; // discounted, off the series; null when none
  /** Why `paybackYears` is what it is. "no-capital" must never render as 0.0 yr. */
  paybackKind: LeverMetrics["paybackKind"];
  npv: number;
  /** The year-by-year cashflow every metric above is read off. */
  series: SeriesRow[];
  /** Deployment ramp — drives the trajectory wedge AND the cashflow phasing. */
  startYear: number;
  rampYears: number;
}

export interface Scope2ComputeResult {
  baseline: Scope2Baseline;
  perFacility: Record<string, { eff: EfficiencyResult; gen: GenerationResult }>;
  procurement: ProcurementResult;
  locationNowT: number; // post-lever, full ramp
  marketNowT: number;
  levers: Scope2LeverSummary[];
  wedgesLocation: Wedge[];
  wedgesMarket: Wedge[];
  trajectoryLocation: TrajectoryRow[];
  trajectoryMarket: TrajectoryRow[];
  warnings: string[];
  kpis: {
    baseLocationT: number;
    marketBaselineT: number; // location minus electricity already on PPAs/RECs
    existingContractedKwh: number; // renewable electricity already contracted
    locationNowT: number;
    marketNowT: number;
    reduction2030: number; // market net vs BAU, fraction of base
    totalCapex: number;
    annualOpexDelta: number;
    paybackYears: number | null;
    paybackKind: LeverMetrics["paybackKind"];
    npv: number;
    /** Worst cumulative undiscounted cash position — the money that must exist. */
    peakFunding: number;
    costPerTonne: number;
    coveragePct: number; // procurement coverage of addressable load
    footnote: boolean; // RE100 exclusion footnote active
    target2030: number;
    onTrack2030: boolean; // market net vs SBTi line
  };
}

export function computeScope2(
  facilities: Facility[],
  levers: Scope2Levers,
  baseYear: number,
  // OPTIONAL so every existing 3-arg caller keeps compiling. Before this
  // parameter existed the user's discount rate was structurally unreachable
  // from Scope 2 — which is WHY DISCOUNT_RATE_PCT was a module constant (F8),
  // not merely an oversight.
  assumptions?: Partial<GlobalAssumptions>,
): Scope2ComputeResult {
  const fa = financeAssumptionsFrom(assumptions);
  const baseline = baselineScope2(facilities);
  // VPPA / I-REC kWh entered in Data input, allocated to each BU's grid records.
  const contractCov = contractCoverageByFacility(facilities);

  /* ---- Pillars 1+2 per facility, in physical order ---- */
  const perFacility: Record<string, { eff: EfficiencyResult; gen: GenerationResult }> = {};
  const draws: FacilityDraw[] = [];
  const existingByFacility: Record<string, number> = {};
  let effAbateT = 0, effCapex = 0, effSaving = 0;
  let genAbateT = 0, genCapex = 0, genOnSiteSaving = 0, genExportSaving = 0;
  let effStart = Infinity, effEnd = -Infinity, genStart = Infinity, genEnd = -Infinity;

  for (const f of facilities) {
    const acts = levers.byFacility[f.id] ?? defaultFacilityActions(f);
    const eff = applyEfficiency(f, acts.efficiency);
    const gen = applyGeneration(f, acts.generation, eff.residualLoadKwh);
    perFacility[f.id] = { eff, gen };
    // Electricity already on PPAs/RECs — the legacy per-facility % plus this
    // facility's share of entered VPPA/I-REC records, capped at the post-lever
    // grid draw. New procurement only addresses what's left, so the two never
    // double-count. Contract records themselves are coverage, not load — they
    // must not enter the procurement pool.
    const existCovered = Math.min(existingCoveredKwh(f) + (contractCov[f.id] ?? 0), gen.gridDrawKwh);
    existingByFacility[f.id] = existCovered;
    if (!isContractRecord(f)) {
      draws.push({ id: f.id, gridDrawKwh: Math.max(0, gen.gridDrawKwh - existCovered), gridEf: f.gridEf, isolated: f.isolated });
    }

    if (acts.efficiency.enabled && eff.savedKwh > 0) {
      effAbateT += (eff.savedKwh * f.gridEf) / 1000;
      effCapex += eff.capex;
      effSaving += eff.opexSaving;
      effStart = Math.min(effStart, acts.efficiency.startYear);
      effEnd = Math.max(effEnd, acts.efficiency.targetYear);
    }
    if (acts.generation.enabled && gen.usedOnSiteKwh > 0) {
      genAbateT += (gen.usedOnSiteKwh * f.gridEf) / 1000;
      genCapex += gen.capex;
      genOnSiteSaving += gen.usedOnSiteKwh * f.tariffPerKwh;
      genExportSaving += gen.opexSaving - gen.usedOnSiteKwh * f.tariffPerKwh;
      genStart = Math.min(genStart, acts.generation.startYear);
      genEnd = Math.max(genEnd, acts.generation.targetYear);
    }
  }

  /* ---- Pillar 3 across the portfolio ---- */
  // The certificate price comes from the shared assumptions, not from the
  // procurement blob's own copy — that copy is what let Scope 1 charge Rs 800/t
  // for the instrument Scope 2 was buying at Rs 634/t. procurement.ts stays
  // pure and its own tests keep passing on the field; only the value changes.
  const proc = applyProcurement(draws, { ...levers.procurement, recPricePerKwh: fa.recPricePerKwh });
  const procAbateT = facilities.reduce(
    (s, f) => s + ((proc.procuredByFacility[f.id] ?? 0) * f.gridEf) / 1000, 0,
  );

  const locationNowT = facilities.reduce(
    (s, f) => s + (perFacility[f.id].gen.gridDrawKwh * f.gridEf) / 1000, 0,
  );
  // Market-based subtracts BOTH what's already contracted and the new procurement.
  const existingAbateT = facilities.reduce(
    (s, f) => s + ((existingByFacility[f.id] ?? 0) * f.gridEf) / 1000, 0,
  );
  const marketNowT = facilities.reduce(
    (s, f) =>
      s + (Math.max(0, perFacility[f.id].gen.gridDrawKwh - (existingByFacility[f.id] ?? 0) - (proc.procuredByFacility[f.id] ?? 0)) * f.gridEf) / 1000,
    0,
  );

  /* ---- Lever summaries ---- */
  const mkRamp = (start: number, end: number) => {
    const sy = isFinite(start) ? start : baseYear + 1;
    const ey = isFinite(end) ? end : END_YEAR;
    return { startYear: sy, rampYears: Math.max(1, ey - sy + 1) };
  };
  const effR = mkRamp(effStart, effEnd);
  const genR = mkRamp(genStart, genEnd);
  const procR = mkRamp(
    levers.procurement.enabled ? levers.procurement.startYear : Infinity,
    levers.procurement.enabled ? levers.procurement.targetYear : -Infinity,
  );

  const mk = (
    id: Scope2LeverSummary["id"], label: string, colorIdx: number, abatementT: number,
    capex: number, opexDelta: number, ramp: { startYear: number; rampYears: number },
    opexParts: FinanceOpexPart[],
  ): Scope2LeverSummary & { startYear: number; rampYears: number; series: SeriesRow[] } => {
    // The SAME assembly Scope 1 uses. The two scopes differ only in their
    // lifetime table and their `scope` literal; the cost assembly itself has
    // exactly one implementation, so the two can no longer drift apart.
    const { series, metrics: m } = summariseLever(
      { id, capex, opexParts, fullAbatementT: Math.max(0, abatementT), assetLifeYears: S2_ENGINE_LIFETIMES[id], ...ramp },
      baseYear, fa,
    );
    return {
      id, label, colorIdx, scope: 2,
      // A lever that spends money is enabled even at zero tonnes — dropping it
      // is how its capex used to vanish from the KPIs (F4).
      enabled: abatementT > 0 || capex > 0 || opexParts.some((p) => p.amount !== 0),
      abatementT: Math.max(0, abatementT), capex, annualOpexDelta: opexDelta,
      levelisedCostPerTonne: m.levelisedCostPerTonne,
      costPerTonne: m.levelisedCostPerTonne,   // one number, two names, during the UI transition
      opexParts,
      paybackYears: m.paybackYears,
      paybackKind: m.paybackKind,
      npv: m.npv,
      series,
      ...ramp,
    };
  };

  const leverRows = [
    mk("efficiency", "Energy efficiency", 4, effAbateT, effCapex, -effSaving, effR, [
      { label: "Avoided grid electricity", amount: -effSaving, kind: "elec" },
    ]),
    mk("generation", "On-site generation", 0, genAbateT, genCapex, -(genOnSiteSaving + genExportSaving), genR, [
      { label: "Avoided grid electricity", amount: -genOnSiteSaving, kind: "elec" },
      { label: "Export credits", amount: -genExportSaving, kind: "elec" },
    ]),
    mk("procurement", "Renewable procurement", 3, procAbateT, 0, proc.annualCost, procR, [
      { label: "PPA strike delta", amount: proc.costParts.ppa, kind: "elec" },
      { label: "Green tariff premium", amount: proc.costParts.greenTariff, kind: "elec" },
      // A REC price tracks the renewable electricity market it settles against.
      // Tagged "elec" rather than left to default: an absent kind means 0%
      // escalation silently, and a tag someone can argue with beats that.
      { label: "Unbundled RECs", amount: proc.costParts.rec, kind: "elec" },
    ]),
  ];

  const toWedge = (l: (typeof leverRows)[number]): Wedge => ({
    id: l.id, label: l.label, colorIdx: l.colorIdx, scope: 2,
    startYear: l.startYear, rampYears: l.rampYears, fullAbatementT: l.abatementT,
  });
  const wedgesLocation = leverRows.filter((l) => l.id !== "procurement" && l.abatementT > 0).map(toWedge);
  const wedgesMarket = leverRows.filter((l) => l.abatementT > 0).map(toWedge);
  // Already-contracted renewables sit at full effect from the base year (market-based only).
  if (existingAbateT > 0) {
    wedgesMarket.unshift({ id: "existing", label: "Already contracted", colorIdx: 6, scope: 2, startYear: baseYear, rampYears: 1, fullAbatementT: existingAbateT });
  }

  const baseTotalT = baseline.totalLocationT;
  const trajectoryLocation = buildTrajectory({
    baseYear, endYear: END_YEAR, baseTotalT, bauGrowth: BAU_GROWTH, wedges: wedgesLocation,
  });
  const trajectoryMarket = buildTrajectory({
    baseYear, endYear: END_YEAR, baseTotalT, bauGrowth: BAU_GROWTH, wedges: wedgesMarket,
  });

  const at = (rows: TrajectoryRow[], y: number) => rows.find((r) => r.year === y) ?? rows[rows.length - 1];
  const m2030 = at(trajectoryMarket, 2030);
  // ALL levers with money attached, not just those with tonnes (F4).
  const costedLevers = leverRows.filter((l) => l.capex > 0 || l.opexParts.some((p) => p.amount !== 0));
  const programme = programmeMetrics(costedLevers.map((l) => l.series));
  const totalCapex = programme.totalCapex;
  const totalOpexDelta = costedLevers.reduce((s, l) => s + l.annualOpexDelta, 0);

  return {
    baseline,
    perFacility,
    procurement: proc,
    locationNowT,
    marketNowT,
    levers: leverRows,
    wedgesLocation,
    wedgesMarket,
    trajectoryLocation,
    trajectoryMarket,
    warnings: validateScope2(facilities, levers),
    kpis: {
      baseLocationT: baseTotalT,
      marketBaselineT: baseline.marketBaselineT,
      existingContractedKwh: baseline.existingContractedKwh,
      locationNowT,
      marketNowT,
      reduction2030: baseTotalT > 0 ? (m2030.bau - m2030.net) / baseTotalT : 0,
      totalCapex,
      annualOpexDelta: totalOpexDelta,
      paybackYears: programme.paybackYears,
      paybackKind: programme.paybackKind,
      npv: programme.npv,
      peakFunding: programme.peakFunding,
      costPerTonne: programme.levelisedCostPerTonne,
      coveragePct: proc.coveragePct,
      footnote: proc.footnote,
      target2030: targetLine(baseTotalT, 2030),
      onTrack2030: m2030.onTrack,
    },
  };
}

export * from "./types";
