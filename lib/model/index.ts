/* ============================================================
   compute() — the single entry point. Iterates each asset's
   per-asset action plan (electrify + fuel-switch), rolls the
   tonnes into 3 hero wedges + a per-segment breakdown, builds the
   trajectory and KPIs. Pure: same inputs → same output.
   ============================================================ */

import { baselineScope1, refrigerantCO2e } from "./baseline";
import { FAMILY_COLORS } from "./factors";
import { weightedCostPerTonne, yearsToTarget, annualizedCapex, simplePayback } from "./finance";
import { applyRefrigerant } from "./levers";
import { applyAssetActions } from "./segments";
import { buildTrajectory, targetLine } from "./trajectory";
import type {
  CombustionAsset,
  LeverSettings,
  RefrigerationSystem,
  TrajectoryRow,
  Wedge,
} from "./types";

export const BASE_YEAR = 2025;
export const END_YEAR = 2050;
export const BAU_GROWTH = 0.01;
export const CAPEX_LIFETIME = 10; // years over which CAPEX is annualized for cost/tonne

/** One named running-cost component. Positive = cost, negative = saving. */
export interface OpexPart {
  label: string;
  amount: number;
}

export interface LeverSummary {
  id: "electrification" | "fuelSwitch" | "refrigerant";
  label: string;
  colorIdx: number;
  scope: 1 | 2;
  enabled: boolean;
  abatementT: number; // full-ramp Scope 1 tonnes/yr
  capex: number;
  annualOpexDelta: number;
  annualCost: number; // annualized capex + opex delta
  costPerTonne: number;
  opexParts: OpexPart[]; // components summing to annualOpexDelta; all zero when lever is disabled
  paybackYears: number | null; // capex ÷ annual saving, null if never
}

export interface SegmentImpact {
  key: string; // elec-mobile | elec-stationary | fuel-mobile | fuel-stationary | ref-leak | ref-gas
  label: string;
  abatementT: number; // full-ramp tonnes/yr
  colorIdx: number;
}

export interface ComputeResult {
  baseline: ReturnType<typeof baselineScope1>;
  baseTotalT: number;
  levers: LeverSummary[];
  segments: SegmentImpact[];
  wedges: Wedge[];
  trajectory: TrajectoryRow[];
  biogenicT: number;
  scope2SpillFullT: number;
  kpis: {
    reduction2030: number;
    reduction2050: number;
    costPerTonne: number;
    totalCapex: number;
    yearsToTarget: number | null;
    netScope1Now: number;
    bau2030: number;
    net2030: number;
    target2030: number;
    onTrack2030: boolean;
    paybackYears: number | null;
  };
}

export function compute(
  assets: CombustionAsset[],
  systems: RefrigerationSystem[],
  s: LeverSettings,
  baseYear: number = BASE_YEAR,
): ComputeResult {
  const baseline = baselineScope1(assets, systems);
  const baseTotalT = baseline.totalT;
  const g = s.assumptions;

  /* ---- Combustion: per-asset electrify + fuel-switch ---- */
  let elecMobile = 0, elecStationary = 0, fuelMobile = 0, fuelStationary = 0;
  let scope2SpillFullT = 0, biogenicT = 0;
  let elecEnergyCost = 0, elecDispOpex = 0, elecCapex = 0;
  let fuelNewSpend = 0, fuelDispSpend = 0, fuelCapex = 0;
  let anyElec = false;
  let elecStart = Infinity, elecEnd = -Infinity, fuelStart = Infinity, fuelEnd = -Infinity;

  for (const a of assets) {
    const acts = s.byAsset[a.id];
    if (!acts) continue;
    const r = applyAssetActions(a, acts, g);

    if (acts.electrify.enabled && r.elecFraction > 0) {
      anyElec = true;
      if (a.category === "mobile") elecMobile += r.scope1AbatementT;
      else elecStationary += r.scope1AbatementT;
      scope2SpillFullT += r.scope2AddedT;
      elecStart = Math.min(elecStart, acts.electrify.startYear);
      elecEnd = Math.max(elecEnd, acts.electrify.targetYear);
      elecEnergyCost += r.kWh * acts.electrify.tariffPerKwh;
      elecDispOpex += a.opex * r.elecFraction;
      elecCapex += acts.electrify.assetCapex * (a.category === "mobile" ? acts.electrify.unitsToConvert : 1);
    }

    // Fuel switching covers both the drop-in blend and flex-fuel vehicles —
    // both roll into the "Fuel switch" lever (same family of fuels).
    const fuelOn = acts.fuelSwitch.enabled;
    const flexOn = !!acts.flexFuel?.enabled && a.category === "mobile" && acts.flexFuel.unitsToConvert > 0;
    if ((fuelOn || flexOn) && r.fuelFraction > 0) {
      if (a.category === "mobile") fuelMobile += r.fuelAbatementT;
      else fuelStationary += r.fuelAbatementT;
      biogenicT += r.biogenicT;
      if (fuelOn) {
        fuelStart = Math.min(fuelStart, acts.fuelSwitch.startYear);
        fuelEnd = Math.max(fuelEnd, acts.fuelSwitch.targetYear);
      }
      if (flexOn) {
        fuelStart = Math.min(fuelStart, acts.flexFuel!.startYear);
        fuelEnd = Math.max(fuelEnd, acts.flexFuel!.targetYear);
      }
      const fossilUnitPrice = a.annualVolume > 0 ? a.opex / a.annualVolume : 0;
      fuelDispSpend += a.annualVolume * r.fuelFraction * fossilUnitPrice;
      fuelNewSpend += a.annualVolume * r.fuelFraction * acts.fuelSwitch.altFuelPricePerUnit;
      fuelCapex += (fuelOn ? acts.fuelSwitch.retrofitCapex : 0)
        + (flexOn ? acts.flexFuel!.unitsToConvert * acts.flexFuel!.vehicleCapex : 0);
    }
  }

  /* ---- Refrigerant: per-system gas switch + leak fix ---- */
  let refAbateLeak = 0, refAbateGas = 0, refGasSavingOpex = 0, refCapex = 0;
  let refStart = Infinity, refEnd = -Infinity;
  for (const sys of systems) {
    const acts = s.bySystem[sys.id];
    if (!acts) continue;
    const gasOn = acts.gasSwitch.enabled && acts.gasSwitch.transitionPct > 0;
    const leakOn = acts.leakFix.enabled && acts.leakFix.leakImprovementPct > 0;
    if (!gasOn && !leakOn) continue;

    // Leak fix first (operational before capital); the gas switch takes the increment.
    const leakPct = leakOn ? acts.leakFix.leakImprovementPct : 0;
    const base = refrigerantCO2e(sys);
    const leakOnly = applyRefrigerant(sys, { transitionPct: 0, altRefrigerant: acts.gasSwitch.altRefrigerant, leakImprovementPct: leakPct });
    const both = applyRefrigerant(sys, { transitionPct: gasOn ? acts.gasSwitch.transitionPct : 0, altRefrigerant: acts.gasSwitch.altRefrigerant, leakImprovementPct: leakPct });
    refAbateLeak += base - leakOnly.newFugitiveT;
    refAbateGas += leakOnly.newFugitiveT - both.newFugitiveT;

    if (leakOn) {
      refGasSavingOpex += sys.toppedUpKg * (acts.leakFix.leakImprovementPct / 100) * sys.gasCostPerKg;
      refStart = Math.min(refStart, acts.leakFix.startYear);
      refEnd = Math.max(refEnd, acts.leakFix.targetYear);
    }
    if (gasOn) {
      refCapex += acts.gasSwitch.retrofitCapex;
      refStart = Math.min(refStart, acts.gasSwitch.startYear);
      refEnd = Math.max(refEnd, acts.gasSwitch.targetYear);
    }
  }
  const refAbate = refAbateLeak + refAbateGas;
  const refCarbonValue = refAbate * g.carbonPricePerTonne;
  const refOpexDelta = -(refGasSavingOpex + refCarbonValue);

  /* ---- Roll-ups + effective ramps ---- */
  const mkRamp = (start: number, end: number) => {
    const sy = isFinite(start) ? start : baseYear + 1;
    const ey = isFinite(end) ? end : END_YEAR;
    return { startYear: sy, rampYears: Math.max(1, ey - sy + 1) };
  };
  const elecR = mkRamp(elecStart, elecEnd);
  const fuelR = mkRamp(fuelStart, fuelEnd);
  const refR = mkRamp(refStart, refEnd);
  const elecAbate = elecMobile + elecStationary;
  const fuelAbate = fuelMobile + fuelStationary;

  const elecOpexDelta = elecEnergyCost + scope2SpillFullT * g.recCostPerTonne - elecDispOpex;
  const fuelOpexDelta = fuelNewSpend - fuelDispSpend;
  const elecCapexTotal = elecCapex + (anyElec ? g.infraCapex : 0);

  const elecParts: OpexPart[] = [
    { label: "New electricity cost", amount: elecEnergyCost },
    { label: "REC cost on added Scope 2", amount: scope2SpillFullT * g.recCostPerTonne },
    { label: "Displaced fuel & maintenance", amount: -elecDispOpex },
  ];
  const fuelParts: OpexPart[] = [
    { label: "Alt-fuel spend", amount: fuelNewSpend },
    { label: "Displaced fossil fuel spend", amount: -fuelDispSpend },
  ];
  const refParts: OpexPart[] = [
    { label: "Gas top-up savings", amount: -refGasSavingOpex },
    { label: "Carbon-price value of abatement", amount: -refCarbonValue },
  ];

  const mk = (
    id: LeverSummary["id"], label: string, colorIdx: number, abatementT: number,
    capex: number, opexDelta: number, ramp: { startYear: number; rampYears: number },
    opexParts: OpexPart[],
  ): LeverSummary & { startYear: number; rampYears: number } => {
    const annualCost = annualizedCapex(capex, CAPEX_LIFETIME) + opexDelta;
    return {
      id, label, colorIdx, scope: 1, enabled: abatementT > 0,
      abatementT: Math.max(0, abatementT), capex, annualOpexDelta: opexDelta, annualCost,
      costPerTonne: abatementT > 0 ? annualCost / abatementT : 0,
      opexParts,
      paybackYears: simplePayback(capex, -opexDelta),
      ...ramp,
    };
  };

  const leverRows = [
    mk("electrification", "Electrification", 5, elecAbate, elecCapexTotal, elecOpexDelta, elecR, elecParts),
    mk("fuelSwitch", "Fuel switch", 2, fuelAbate, fuelCapex, fuelOpexDelta, fuelR, fuelParts),
    mk("refrigerant", "Refrigerant", 1, refAbate, refCapex, refOpexDelta, refR, refParts),
  ];

  const wedges: Wedge[] = leverRows
    .filter((l) => l.abatementT > 0)
    .map((l) => ({ id: l.id, label: l.label, colorIdx: l.colorIdx, scope: 1, startYear: l.startYear, rampYears: l.rampYears, fullAbatementT: l.abatementT }));

  const segments: SegmentImpact[] = [
    { key: "elec-mobile", label: "Electrification · Mobile", abatementT: elecMobile, colorIdx: 5 },
    { key: "elec-stationary", label: "Electrification · Stationary", abatementT: elecStationary, colorIdx: 6 },
    { key: "fuel-mobile", label: "Fuel switch · Mobile", abatementT: fuelMobile, colorIdx: 2 },
    { key: "fuel-stationary", label: "Fuel switch · Stationary", abatementT: fuelStationary, colorIdx: 3 },
    { key: "ref-leak", label: "Refrigerant · Leak fix", abatementT: refAbateLeak, colorIdx: 1 },
    { key: "ref-gas", label: "Refrigerant · Gas switch", abatementT: refAbateGas, colorIdx: 0 },
  ].filter((x) => x.abatementT > 0);

  const trajectory = buildTrajectory({
    baseYear, endYear: END_YEAR, baseTotalT, bauGrowth: BAU_GROWTH, wedges,
    scope2Spill: anyElec && scope2SpillFullT > 0 ? [{ startYear: elecR.startYear, rampYears: elecR.rampYears, fullT: scope2SpillFullT }] : [],
  });

  const at = (y: number) => trajectory.find((r) => r.year === y) ?? trajectory[trajectory.length - 1];
  const y2030 = at(2030);
  const y2050 = at(2050);
  const activeLevers = leverRows.filter((l) => l.abatementT > 0);

  const costPerTonne = weightedCostPerTonne(activeLevers.map((l) => ({ annualCost: l.annualCost, tonnes: l.abatementT })));
  const totalCapex = activeLevers.reduce((s2, l) => s2 + l.capex, 0);
  const totalOpexDelta = activeLevers.reduce((s2, l) => s2 + l.annualOpexDelta, 0);

  return {
    baseline,
    baseTotalT,
    levers: leverRows.map(({ startYear, rampYears, ...rest }) => { void startYear; void rampYears; return rest; }),
    segments,
    wedges,
    trajectory,
    biogenicT,
    scope2SpillFullT,
    kpis: {
      reduction2030: baseTotalT > 0 ? (y2030.bau - y2030.net) / baseTotalT : 0,
      reduction2050: baseTotalT > 0 ? (y2050.bau - y2050.net) / baseTotalT : 0,
      costPerTonne,
      totalCapex,
      yearsToTarget: yearsToTarget(trajectory),
      netScope1Now: at(baseYear).net,
      bau2030: y2030.bau,
      net2030: y2030.net,
      target2030: targetLine(baseTotalT, 2030),
      onTrack2030: y2030.onTrack,
      paybackYears: simplePayback(totalCapex, -totalOpexDelta),
    },
  };
}

export * from "./types";
export { FAMILY_COLORS };
