/* ============================================================
   compute() — the single entry point. Iterates each asset's
   per-asset action plan (electrify + fuel-switch), rolls the
   tonnes into 3 hero wedges + a per-segment breakdown, builds the
   trajectory and KPIs. Pure: same inputs → same output.
   ============================================================ */

import { baselineScope1, refrigerantCO2e } from "./baseline";
import { FAMILY_COLORS, getRefrigerant, refrigerantPricePerKg } from "./factors";
import { weightedCostPerTonne, yearsToTarget, annuity, simplePayback } from "./finance";
import { applyRefrigerant } from "./levers";
import { applyAssetActions, electrifyCapexFor } from "./segments";
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
export const CAPEX_LIFETIME = 10; // legacy default; per-lever lifetimes below drive the annuity
/** Asset life per lever family — drives the capital-recovery annualization. */
export const LEVER_LIFETIME_YEARS: Record<"efficiency" | "electrification" | "fuelSwitch" | "refrigerant", number> = {
  efficiency: 7,       // economiser packages, telematics kit
  electrification: 10, // blended EV (8) / heat pump & electric boiler (15)
  fuelSwitch: 15,      // burner retrofits, conversion kit
  refrigerant: 12,     // retrofit ↔ system replacement blend
};

/** One named running-cost component. Positive = cost, negative = saving.
 *  `kind` drives price escalation in the cashflow view (fuel escalates faster
 *  than grid tariffs — often the argument for electrification). */
export interface OpexPart {
  label: string;
  amount: number;
  kind?: "fuel" | "elec" | "other";
}

export interface LeverSummary {
  id: "efficiency" | "electrification" | "fuelSwitch" | "refrigerant";
  label: string;
  colorIdx: number;
  scope: 1 | 2;
  enabled: boolean;
  abatementT: number; // full-ramp Scope 1 tonnes/yr
  capex: number;
  annualOpexDelta: number;
  annualCost: number; // annualized capex + opex delta
  costPerTonne: number;
  /** ₹/t with the internal carbon price credited — the risk-adjusted view, applied uniformly. */
  costPerTonneWithCarbon: number;
  opexParts: OpexPart[]; // components summing to annualOpexDelta; all zero when lever is disabled
  paybackYears: number | null; // capex ÷ annual saving, null if never
  /** Deployment ramp — drives the trajectory wedge AND the cashflow phasing. */
  startYear: number;
  rampYears: number;
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

  /* ---- Combustion: per-asset efficiency + electrify + fuel-switch ---- */
  let effMobileT = 0, effStationaryT = 0, effCapex = 0, effOpexSaving = 0;
  let effStart = Infinity, effEnd = -Infinity;
  let elecMobile = 0, elecStationary = 0, fuelMobile = 0, fuelStationary = 0;
  let scope2SpillFullT = 0, biogenicT = 0;
  let elecEnergyCost = 0, elecDispOpex = 0, elecCapex = 0, elecMaintAddBack = 0;
  const maintShare = (g.maintenanceShareOfSpendPct ?? 20) / 100;
  const evMaintRatio = (g.evMaintenanceRatioPct ?? 65) / 100;
  let fuelNewSpend = 0, fuelDispSpend = 0, fuelCapex = 0;
  let anyElec = false;
  let elecStart = Infinity, elecEnd = -Infinity, fuelStart = Infinity, fuelEnd = -Infinity;

  for (const a of assets) {
    const acts = s.byAsset[a.id];
    if (!acts) continue;
    const r = applyAssetActions(a, acts, g);

    // Step 0 — efficiency: tonnes on the FULL base; spend assumed to scale with volume.
    if (acts.efficiency?.enabled && r.effFraction > 0) {
      if (a.category === "mobile") effMobileT += r.efficiencyAbatementT;
      else effStationaryT += r.efficiencyAbatementT;
      effCapex += acts.efficiency.capex;
      effOpexSaving += a.opex * r.effFraction;
      effStart = Math.min(effStart, acts.efficiency.startYear);
      effEnd = Math.max(effEnd, acts.efficiency.targetYear);
    }

    if (acts.electrify.enabled && r.elecFraction > 0) {
      anyElec = true;
      if (a.category === "mobile") elecMobile += r.scope1AbatementT;
      else elecStationary += r.scope1AbatementT;
      scope2SpillFullT += r.scope2AddedT;
      elecStart = Math.min(elecStart, acts.electrify.startYear);
      elecEnd = Math.max(elecEnd, acts.electrify.targetYear);
      elecEnergyCost += r.kWh * acts.electrify.tariffPerKwh;
      // Displaced spend comes off the post-efficiency remainder (step 0 already saved its share).
      elecDispOpex += a.opex * (1 - r.effFraction) * r.elecFraction;
      // EVs still have maintenance (~65% of ICE) — add that share of the
      // displaced maintenance back so the saving isn't overstated.
      if (a.category === "mobile") {
        elecMaintAddBack += a.opex * (1 - r.effFraction) * r.elecFraction * maintShare * evMaintRatio;
      }
      elecCapex += electrifyCapexFor(a, acts.electrify);
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
      const postEffVolume = a.annualVolume * (1 - r.effFraction);
      fuelDispSpend += postEffVolume * r.fuelFraction * fossilUnitPrice;
      fuelNewSpend += postEffVolume * r.fuelFraction * acts.fuelSwitch.altFuelPricePerUnit;
      fuelCapex += (fuelOn ? acts.fuelSwitch.retrofitCapex : 0)
        + (flexOn ? acts.flexFuel!.unitsToConvert * acts.flexFuel!.vehicleCapex : 0);
    }
  }

  /* ---- Refrigerant: per-system gas switch + leak fix ---- */
  let refAbateLeak = 0, refAbateGas = 0, refGasSavingOpex = 0, refCapex = 0;
  let refAltGasSpend = 0, refBaseGasDisp = 0;
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
      refCapex += acts.leakFix.capex ?? 0;
      refStart = Math.min(refStart, acts.leakFix.startYear);
      refEnd = Math.max(refEnd, acts.leakFix.targetYear);
    }
    if (gasOn) {
      // The switched share still leaks and still needs top-ups — at the ALT
      // gas's price and (smaller) charge. Cheap naturals often turn the gas
      // switch into a running saving; premium HFO blends into a cost.
      const gShare = acts.gasSwitch.transitionPct / 100;
      const topUpAfterLeak = sys.toppedUpKg * (1 - leakPct / 100);
      const altFactor = getRefrigerant(acts.gasSwitch.altRefrigerant);
      const altPrice = acts.gasSwitch.altGasPricePerKg ?? refrigerantPricePerKg(acts.gasSwitch.altRefrigerant);
      refAltGasSpend += gShare * topUpAfterLeak * altFactor.volAdj * altPrice;
      refBaseGasDisp += gShare * topUpAfterLeak * sys.gasCostPerKg;
      refCapex += acts.gasSwitch.retrofitCapex;
      refStart = Math.min(refStart, acts.gasSwitch.startYear);
      refEnd = Math.max(refEnd, acts.gasSwitch.targetYear);
    }
  }
  const refAbate = refAbateLeak + refAbateGas;
  const refOpexDelta = refAltGasSpend - refBaseGasDisp - refGasSavingOpex;

  /* ---- Roll-ups + effective ramps ---- */
  const mkRamp = (start: number, end: number) => {
    const sy = isFinite(start) ? start : baseYear + 1;
    const ey = isFinite(end) ? end : END_YEAR;
    return { startYear: sy, rampYears: Math.max(1, ey - sy + 1) };
  };
  const effR = mkRamp(effStart, effEnd);
  const elecR = mkRamp(elecStart, elecEnd);
  const fuelR = mkRamp(fuelStart, fuelEnd);
  const refR = mkRamp(refStart, refEnd);
  const effAbate = effMobileT + effStationaryT;
  const elecAbate = elecMobile + elecStationary;
  const fuelAbate = fuelMobile + fuelStationary;
  const effParts: OpexPart[] = [
    { label: "Avoided fuel & maintenance spend", amount: -effOpexSaving, kind: "fuel" },
  ];

  const elecOpexDelta = elecEnergyCost + elecMaintAddBack + scope2SpillFullT * g.recCostPerTonne - elecDispOpex;
  const fuelOpexDelta = fuelNewSpend - fuelDispSpend;
  const elecCapexTotal = elecCapex + (anyElec ? g.infraCapex : 0);

  const elecParts: OpexPart[] = [
    { label: "New electricity cost", amount: elecEnergyCost, kind: "elec" },
    { label: "EV maintenance (retained)", amount: elecMaintAddBack, kind: "other" },
    { label: "REC cost on added Scope 2", amount: scope2SpillFullT * g.recCostPerTonne, kind: "other" },
    { label: "Displaced fuel & maintenance", amount: -elecDispOpex, kind: "fuel" },
  ];
  const fuelParts: OpexPart[] = [
    { label: "Alt-fuel spend", amount: fuelNewSpend, kind: "fuel" },
    { label: "Displaced fossil fuel spend", amount: -fuelDispSpend, kind: "fuel" },
  ];
  const refParts: OpexPart[] = [
    { label: "Gas top-up savings (leak fix)", amount: -refGasSavingOpex, kind: "other" },
    { label: "Alt-gas top-ups (switched share)", amount: refAltGasSpend, kind: "other" },
    { label: "Displaced base-gas top-ups", amount: -refBaseGasDisp, kind: "other" },
  ];

  const discountRate = g.discountRatePct ?? 10;
  const mk = (
    id: LeverSummary["id"], label: string, colorIdx: number, abatementT: number,
    capex: number, opexDelta: number, ramp: { startYear: number; rampYears: number },
    opexParts: OpexPart[],
  ): LeverSummary & { startYear: number; rampYears: number } => {
    // Capital recovery over the lever's OWN lifetime (not a flat 10 years).
    const annualCost = annuity(capex, LEVER_LIFETIME_YEARS[id], discountRate) + opexDelta;
    const costPerTonne = abatementT > 0 ? annualCost / abatementT : 0;
    return {
      id, label, colorIdx, scope: 1, enabled: abatementT > 0,
      abatementT: Math.max(0, abatementT), capex, annualOpexDelta: opexDelta, annualCost,
      costPerTonne,
      // Carbon price as a SENSITIVITY, applied uniformly to every lever —
      // never mixed into the base cash view.
      costPerTonneWithCarbon: abatementT > 0 ? costPerTonne - g.carbonPricePerTonne : 0,
      opexParts,
      paybackYears: simplePayback(capex, -opexDelta),
      ...ramp,
    };
  };

  const leverRows = [
    mk("efficiency", "Energy efficiency", 7, effAbate, effCapex, -effOpexSaving, effR, effParts),
    mk("electrification", "Electrification", 5, elecAbate, elecCapexTotal, elecOpexDelta, elecR, elecParts),
    mk("fuelSwitch", "Fuel switch", 2, fuelAbate, fuelCapex, fuelOpexDelta, fuelR, fuelParts),
    mk("refrigerant", "Refrigerant", 1, refAbate, refCapex, refOpexDelta, refR, refParts),
  ];

  const wedges: Wedge[] = leverRows
    .filter((l) => l.abatementT > 0)
    .map((l) => ({ id: l.id, label: l.label, colorIdx: l.colorIdx, scope: 1, startYear: l.startYear, rampYears: l.rampYears, fullAbatementT: l.abatementT }));

  const segments: SegmentImpact[] = [
    { key: "eff-mobile", label: "Efficiency · Mobile", abatementT: effMobileT, colorIdx: 7 },
    { key: "eff-stationary", label: "Efficiency · Stationary", abatementT: effStationaryT, colorIdx: 4 },
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
    levers: leverRows,
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
