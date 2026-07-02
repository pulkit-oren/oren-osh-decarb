/* ============================================================
   computeScope2() — the single entry point. Compounds the three
   pillars in physical order per facility (efficiency shrinks the
   load, solar offsets the reduced load, procurement covers the
   remaining grid draw) and always reports BOTH location-based and
   market-based Scope 2. Pure: same inputs → same output.
   ============================================================ */

import { annualizedCapex, simplePayback, weightedCostPerTonne } from "@/lib/model/finance";
import { buildTrajectory, targetLine } from "@/lib/model/trajectory";
import type { TrajectoryRow, Wedge } from "@/lib/model/types";
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
export const CAPEX_LIFETIME = 10; // years over which CAPEX is annualized for cost/tonne

export interface OpexPart {
  label: string;
  amount: number; // positive = cost, negative = saving
}

export interface Scope2LeverSummary {
  id: "efficiency" | "generation" | "procurement";
  label: string;
  colorIdx: number;
  scope: 2;
  enabled: boolean;
  abatementT: number; // full-ramp tonnes/yr (procurement: market-based only)
  capex: number;
  annualOpexDelta: number; // positive = cost, negative = saving
  annualCost: number;
  costPerTonne: number;
  opexParts: OpexPart[];
  paybackYears: number | null;
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
): Scope2ComputeResult {
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
  const proc = applyProcurement(draws, levers.procurement);
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
    opexParts: OpexPart[],
  ): Scope2LeverSummary & { startYear: number; rampYears: number } => {
    const annualCost = annualizedCapex(capex, CAPEX_LIFETIME) + opexDelta;
    return {
      id, label, colorIdx, scope: 2, enabled: abatementT > 0,
      abatementT: Math.max(0, abatementT), capex, annualOpexDelta: opexDelta, annualCost,
      costPerTonne: abatementT > 0 ? annualCost / abatementT : 0,
      opexParts,
      paybackYears: simplePayback(capex, -opexDelta),
      ...ramp,
    };
  };

  const leverRows = [
    mk("efficiency", "Energy efficiency", 4, effAbateT, effCapex, -effSaving, effR, [
      { label: "Avoided grid electricity", amount: -effSaving },
    ]),
    mk("generation", "On-site generation", 0, genAbateT, genCapex, -(genOnSiteSaving + genExportSaving), genR, [
      { label: "Avoided grid electricity", amount: -genOnSiteSaving },
      { label: "Export credits", amount: -genExportSaving },
    ]),
    mk("procurement", "Renewable procurement", 3, procAbateT, 0, proc.annualCost, procR, [
      { label: "PPA strike delta", amount: proc.costParts.ppa },
      { label: "Green tariff premium", amount: proc.costParts.greenTariff },
      { label: "Unbundled RECs", amount: proc.costParts.rec },
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
  const activeLevers = leverRows.filter((l) => l.abatementT > 0);
  const totalCapex = activeLevers.reduce((s, l) => s + l.capex, 0);
  const totalOpexDelta = activeLevers.reduce((s, l) => s + l.annualOpexDelta, 0);

  return {
    baseline,
    perFacility,
    procurement: proc,
    locationNowT,
    marketNowT,
    levers: leverRows.map(({ startYear, rampYears, ...rest }) => { void startYear; void rampYears; return rest; }),
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
      paybackYears: simplePayback(totalCapex, -totalOpexDelta),
      costPerTonne: weightedCostPerTonne(activeLevers.map((l) => ({ annualCost: l.annualCost, tonnes: l.abatementT }))),
      coveragePct: proc.coveragePct,
      footnote: proc.footnote,
      target2030: targetLine(baseTotalT, 2030),
      onTrack2030: m2030.onTrack,
    },
  };
}

export * from "./types";
