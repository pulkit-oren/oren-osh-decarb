/* ============================================================
   compute() — the single entry point. Iterates each asset's
   per-asset action plan (electrify + fuel-switch), rolls the
   tonnes into 3 hero wedges + a per-segment breakdown, builds the
   trajectory and KPIs. Pure: same inputs → same output.
   ============================================================ */

import { baselineScope1, refrigerantCO2e } from "./baseline";
import { FAMILY_COLORS, getRefrigerant, refrigerantPricePerKg } from "./factors";
import { resolveBauGrowthPct } from "@/lib/bau";
import {
  financeAssumptionsFrom,
  recCostPerTonneFrom,
  programmeMetrics,
  resolveFuelSpend,
  S1_LIFETIME_YEARS,
  summariseLever,
} from "@/lib/finance";
import type { LeverMetrics, OpexPart, PriceBasis, SeriesRow } from "@/lib/finance";
import { yearsToTarget } from "./finance";
import { applyRefrigerant } from "./levers";
import { applyAssetActions, electrifyCapexFor } from "./segments";
import { validateScope1 } from "./feasibility";
import { gridFactorFn } from "./grid";
import { FAMILY_IDX } from "./palette";
import { effectiveLeakImprovementPct, validateCharge, validateTargetableSystems } from "./refrigerant-charge";
import { buildTrajectory, targetLine } from "./trajectory";
import { groupCapexLines, type CapexContribution, type CapexLine } from "./capex";
import type {
  CombustionAsset,
  LeverSettings,
  RefrigerationSystem,
  TrajectoryRow,
  Wedge,
} from "./types";

export const BASE_YEAR = 2025;
export const END_YEAR = 2050;

/** One named running-cost component — now owned by `@/lib/finance`, which is
 *  what builds the cashflow series from it. Re-exported under the same name so
 *  every existing `import { OpexPart } from "@/lib/model"` keeps resolving. */
export type { OpexPart } from "@/lib/finance";

export interface LeverSummary {
  id: "efficiency" | "electrification" | "fuelSwitch" | "refrigerant";
  label: string;
  colorIdx: number;
  scope: 1 | 2;
  enabled: boolean;
  abatementT: number; // full-ramp Scope 1 tonnes/yr
  /** Scope 1 tonnes removed LESS the Scope 2 tonnes this lever creates. Only
   *  electrification differs from `abatementT`: it charges RECs on its added
   *  grid load, so the tonnes it is costed against are net of that load. Every
   *  other lever's net equals its gross. `abatementT` stays gross because the
   *  trajectory wedge credits it and adds the spill back on the Scope 2 line —
   *  netting the wedge too would subtract the spill twice. */
  netAbatementT: number;
  capex: number;
  annualOpexDelta: number;
  /** Σ discounted net cash ÷ Σ discounted tonnes over the lever's own life.
   *  The decision number; `costPerTonne` is an alias during the UI transition. */
  levelisedCostPerTonne: number;
  costPerTonne: number;
  /** ₹/t with the internal carbon price credited — the risk-adjusted view, applied uniformly. */
  costPerTonneWithCarbon: number;
  opexParts: OpexPart[]; // components summing to annualOpexDelta; all zero when lever is disabled
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
  /** Itemised capital, one line per driver. Sums to the levers' total capex. */
  capexLines: CapexLine[];
  segments: SegmentImpact[];
  wedges: Wedge[];
  trajectory: TrajectoryRow[];
  biogenicT: number;
  scope2SpillFullT: number;
  /** Advisory feasibility + sanity warnings. Mirrors Scope2ComputeResult.warnings
   *  so one UI surface can render both scopes. */
  warnings: string[];
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
    paybackKind: LeverMetrics["paybackKind"];
    npv: number;
    /** Worst cumulative undiscounted cash position — the money that must exist. */
    peakFunding: number;
    /** How many sources were costed on each price basis. Sums to assets.length. */
    priceBasisSummary: Record<PriceBasis, number>;
  };
}

export function compute(
  assets: CombustionAsset[],
  systems: RefrigerationSystem[],
  s: LeverSettings,
  baseYear: number = BASE_YEAR,
  /** The rate derived from the year-wise inventories, injected by the store.
   *  The engine is pure and sees only the base year, so it cannot derive this
   *  itself. Overridden by `assumptions.bauGrowthPct` when that is set. */
  bauGrowthFallbackPct?: number,
): ComputeResult {
  const baseline = baselineScope1(assets, systems);
  const baseTotalT = baseline.totalT;
  const g = s.assumptions;

  /* ---- Combustion: per-asset efficiency + electrify + fuel-switch ---- */
  let effMobileT = 0, effStationaryT = 0, effCapex = 0, effOpexSaving = 0;
  let effStart = Infinity, effEnd = -Infinity;
  let elecMobile = 0, elecStationary = 0, fuelMobile = 0, fuelStationary = 0;
  let scope2SpillFullT = 0, biogenicT = 0;
  let elecEnergyCost = 0, elecDispFuel = 0, elecDispMaint = 0, elecCapex = 0, elecMaintAddBack = 0;
  const fa = financeAssumptionsFrom(g);
  // Which basis each source was priced on. Reported so the UI can mark
  // estimates instead of presenting a reference price as a measured one.
  const basisTally: Record<PriceBasis, number> = { measured: 0, reference: 0, unavailable: 0 };
  let fuelNewSpend = 0, fuelDispSpend = 0, fuelCapex = 0;
  let anyElec = false;
  let elecStart = Infinity, elecEnd = -Infinity, fuelStart = Infinity, fuelEnd = -Infinity;
  /* Pushed from the SAME expressions that accumulate the totals above, so the
     breakdown and the lever total are one set of additions rather than two. */
  const capex: CapexContribution[] = [];

  for (const a of assets) {
    const acts = s.byAsset[a.id];
    // Resolve the annual bill ONCE per source, through the engine. Every
    // money figure below reads this split; nothing divides opex inline any
    // more, which is what made the seeded company cost zero (F1).
    const spend = resolveFuelSpend(a, fa);
    basisTally[spend.basis] += 1;
    if (!acts) continue;
    const r = applyAssetActions(a, acts, g);

    // Step 0 — efficiency: tonnes on the FULL base; spend assumed to scale with volume.
    if (acts.efficiency?.enabled && r.effFraction > 0) {
      if (a.category === "mobile") effMobileT += r.efficiencyAbatementT;
      else effStationaryT += r.efficiencyAbatementT;
      effCapex += acts.efficiency.capex;
      capex.push({ driverId: "s1-efficiency", sourceId: a.id, amount: acts.efficiency.capex });
      // Efficiency cuts VOLUME, so it saves the fuel half only. Crediting the
      // whole bill charged it with maintenance it never touched (F2).
      effOpexSaving += spend.fuel * r.effFraction;
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
      // Efficiency cuts FUEL VOLUME only — `effFraction` is documented as
      // "fraction of FUEL saved" (segments.ts). So the fuel leg comes off the
      // post-efficiency remainder, while the maintenance contract is untouched
      // by efficiency and is displaced in full at the electrified share.
      // Scaling maintenance by (1 - effFraction) too, as this line used to,
      // silently dropped that share of the contract out of the model entirely:
      // neither saved by efficiency nor displaced by electrification.
      elecDispFuel += spend.fuel * (1 - r.effFraction) * r.elecFraction;
      elecDispMaint += spend.maintenance * r.elecFraction;
      // The replacement plant still needs maintaining. Mobile was already
      // handled; stationary was implicitly assumed maintenance-free (F3).
      const retainRatio = a.category === "mobile"
        ? fa.evMaintenanceRatioPct / 100
        : fa.heatPumpMaintenanceRatioPct / 100;
      elecMaintAddBack += spend.maintenance * r.elecFraction * retainRatio;
      const thisElecCapex = electrifyCapexFor(a, acts.electrify);
      elecCapex += thisElecCapex;
      if (a.category === "mobile") {
        const e = acts.electrify;
        const perUnit = (e.purchaseTiming ?? "replacement") === "replacement"
          ? e.assetCapex * ((e.replacementPremiumPct ?? 40) / 100)
          : e.assetCapex;
        capex.push({ driverId: "s1-ev", sourceId: a.id, amount: thisElecCapex, quantity: e.unitsToConvert, rate: perUnit });
      } else {
        capex.push({ driverId: "s1-heatpump", sourceId: a.id, amount: thisElecCapex });
      }
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
      const postEffVolume = a.annualVolume * (1 - r.effFraction);
      // The FUEL half only. A blend switch swaps what goes in the tank; the
      // same engine still needs the same maintenance, so no maintenance is
      // displaced. Crediting `resolvePrice().pricePerUnit` here credited the
      // whole bill on any MEASURED source, because that price is opex/volume
      // — fuel AND maintenance — while `altFuelPricePerUnit` is a pump price.
      // Same defect as F2, second branch. Invisible on the seeded company,
      // where every source is reference-priced and the two forms coincide.
      fuelDispSpend += spend.fuel * (1 - r.effFraction) * r.fuelFraction;
      fuelNewSpend += postEffVolume * r.fuelFraction * acts.fuelSwitch.altFuelPricePerUnit;
      fuelCapex += (fuelOn ? acts.fuelSwitch.retrofitCapex : 0)
        + (flexOn ? acts.flexFuel!.unitsToConvert * acts.flexFuel!.vehicleCapex : 0);
      capex.push({ driverId: "s1-fuel-retrofit", sourceId: a.id, amount: fuelOn ? acts.fuelSwitch.retrofitCapex : 0 });
      if (flexOn) {
        capex.push({
          driverId: "s1-flexfuel", sourceId: a.id,
          amount: acts.flexFuel!.unitsToConvert * acts.flexFuel!.vehicleCapex,
          quantity: acts.flexFuel!.unitsToConvert, rate: acts.flexFuel!.vehicleCapex,
        });
      }
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
    // Resolved here, not read raw: a target leak RATE (the form a commitment is
    // written in) outranks a relative improvement whenever the system records
    // an installed charge. One translation, above the physics.
    const leakPct = effectiveLeakImprovementPct(sys, acts.leakFix);
    const leakOn = leakPct > 0;
    const chargeCut = acts.chargeReduction;
    const chargeOn = !!chargeCut?.enabled && chargeCut.reductionPct > 0;
    const chargeReductionPct = chargeOn ? chargeCut!.reductionPct : 0;
    if (!gasOn && !leakOn && !chargeOn) continue;

    // Leak fix and charge reduction first (they change the leaked MASS); the
    // gas switch takes the increment on what is left.
    const base = refrigerantCO2e(sys);
    const leakOnly = applyRefrigerant(sys, { transitionPct: 0, altRefrigerant: acts.gasSwitch.altRefrigerant, leakImprovementPct: leakPct, chargeReductionPct });
    const both = applyRefrigerant(sys, { transitionPct: gasOn ? acts.gasSwitch.transitionPct : 0, altRefrigerant: acts.gasSwitch.altRefrigerant, leakImprovementPct: leakPct, chargeReductionPct });
    refAbateLeak += base - leakOnly.newFugitiveT;
    refAbateGas += leakOnly.newFugitiveT - both.newFugitiveT;

    if (leakOn) {
      refGasSavingOpex += sys.toppedUpKg * (leakPct / 100) * sys.gasCostPerKg;
      refCapex += acts.leakFix.capex ?? 0;
      capex.push({ driverId: "s1-ldar", sourceId: sys.id, amount: acts.leakFix.capex ?? 0 });
      refStart = Math.min(refStart, acts.leakFix.startYear);
      refEnd = Math.max(refEnd, acts.leakFix.targetYear);
    }
    if (chargeOn) {
      // Less charge means less gas bought to replace what leaks, on top of
      // whatever the leak fix already saved.
      refGasSavingOpex += sys.toppedUpKg * (1 - leakPct / 100) * (chargeReductionPct / 100) * sys.gasCostPerKg;
      refCapex += chargeCut!.capex;
      capex.push({ driverId: "s1-charge-cut", sourceId: sys.id, amount: chargeCut!.capex });
      refStart = Math.min(refStart, chargeCut!.startYear);
      refEnd = Math.max(refEnd, chargeCut!.targetYear);
    }
    if (gasOn) {
      // The switched share still leaks and still needs top-ups — at the ALT
      // gas's price and (smaller) charge. Cheap naturals often turn the gas
      // switch into a running saving; premium HFO blends into a cost.
      const gShare = acts.gasSwitch.transitionPct / 100;
      const topUpAfterLeak = sys.toppedUpKg * (1 - leakPct / 100) * (1 - chargeReductionPct / 100);
      const altFactor = getRefrigerant(acts.gasSwitch.altRefrigerant);
      const altPrice = acts.gasSwitch.altGasPricePerKg ?? refrigerantPricePerKg(acts.gasSwitch.altRefrigerant);
      refAltGasSpend += gShare * topUpAfterLeak * altFactor.volAdj * altPrice;
      refBaseGasDisp += gShare * topUpAfterLeak * sys.gasCostPerKg;
      refCapex += acts.gasSwitch.retrofitCapex;
      capex.push({ driverId: "s1-gas-retrofit", sourceId: sys.id, amount: acts.gasSwitch.retrofitCapex });
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
    { label: "Avoided fuel spend", amount: -effOpexSaving, kind: "fuel" },
  ];

  // Derived from the per-kWh price and the grid factor, so this line and
  // Scope 2's "Unbundled RECs" line price the same instrument at the same rate.
  const recPerTonne = recCostPerTonneFrom(fa.recPricePerKwh, g.gridEf);
  const elecOpexDelta = elecEnergyCost + elecMaintAddBack + scope2SpillFullT * recPerTonne - elecDispFuel - elecDispMaint;
  const fuelOpexDelta = fuelNewSpend - fuelDispSpend;
  const elecCapexTotal = elecCapex + (anyElec ? g.infraCapex : 0);
  if (anyElec && g.infraCapex !== 0) {
    // One lump for the whole company, not a share of any asset — which is why it
    // needs its own row rather than hiding inside Electrification (defect B4).
    capex.push({ driverId: "s1-charging-infra", sourceId: "portfolio", amount: g.infraCapex });
  }

  const elecParts: OpexPart[] = [
    { label: "New electricity cost", amount: elecEnergyCost, kind: "elec" },
    { label: "Retained maintenance on replacement plant", amount: elecMaintAddBack, kind: "other" },
    // "elec", matching lib/scope2's "Unbundled RECs" — a REC price tracks the
    // renewable electricity market it settles against, and the same instrument
    // must not escalate at 0% in one scope and elecEscalationPct in the other.
    { label: "REC cost on added Scope 2", amount: scope2SpillFullT * recPerTonne, kind: "elec" },
    // Split, because these two escalate differently and must not share a tag.
    // As one "fuel"-tagged part, the maintenance rupees inside it compounded at
    // fuelEscalationPct while the identical rupees in the add-back above
    // compounded at otherEscalationPct — one physical contract, two rates.
    { label: "Displaced fuel", amount: -elecDispFuel, kind: "fuel" },
    { label: "Displaced maintenance", amount: -elecDispMaint, kind: "other" },
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

  const mk = (
    id: LeverSummary["id"], label: string, colorIdx: number, abatementT: number,
    capex: number, opexDelta: number, ramp: { startYear: number; rampYears: number },
    opexParts: OpexPart[],
    /** Tonnes the MONEY is divided by. Defaults to `abatementT`; electrification
     *  passes its gross less the Scope 2 spill it charges RECs for. */
    financeAbatementT: number = abatementT,
  ): LeverSummary & { startYear: number; rampYears: number; series: SeriesRow[] } => {
    // Shared with Scope 2 — the cost assembly has one implementation, and the
    // two scopes differ only in the lifetime table and the `scope` literal.
    const { series, metrics: m } = summariseLever(
      { id, capex, opexParts, fullAbatementT: Math.max(0, financeAbatementT), assetLifeYears: S1_LIFETIME_YEARS[id], ...ramp },
      baseYear, fa,
    );
    return {
      id, label, colorIdx, scope: 1,
      // A lever that spends money is enabled even at zero tonnes — dropping it
      // is how its capex used to vanish from the KPIs (F4).
      enabled: abatementT > 0 || financeAbatementT > 0 || capex > 0 || opexParts.some((p) => p.amount !== 0),
      abatementT: Math.max(0, abatementT),
      netAbatementT: Math.max(0, financeAbatementT),
      capex, annualOpexDelta: opexDelta,
      levelisedCostPerTonne: m.levelisedCostPerTonne,
      costPerTonne: m.levelisedCostPerTonne,   // one number, two names, during the UI transition
      // Carbon price as a SENSITIVITY, applied uniformly to every lever —
      // never mixed into the base cash view.
      costPerTonneWithCarbon: financeAbatementT > 0 ? m.levelisedCostPerTonne - g.carbonPricePerTonne : 0,
      opexParts,
      paybackYears: m.paybackYears,
      paybackKind: m.paybackKind,
      npv: m.npv,
      series,
      ...ramp,
    };
  };

  const leverRows = [
    mk("efficiency", "Energy efficiency", FAMILY_IDX.efficiency, effAbate, effCapex, -effOpexSaving, effR, effParts),
    // The only lever whose money and physics denominators differ: it buys RECs
    // for the grid load it adds, so those tonnes are not abatement it can claim.
    mk("electrification", "Electrification", FAMILY_IDX.electrify, elecAbate, elecCapexTotal, elecOpexDelta, elecR, elecParts,
      elecAbate - scope2SpillFullT),
    mk("fuelSwitch", "Fuel switch", FAMILY_IDX.fuelSwitch, fuelAbate, fuelCapex, fuelOpexDelta, fuelR, fuelParts),
    mk("refrigerant", "Refrigerant", FAMILY_IDX.refrigerant, refAbate, refCapex, refOpexDelta, refR, refParts),
  ];

  const wedges: Wedge[] = leverRows
    .filter((l) => l.abatementT > 0)
    .map((l) => ({ id: l.id, label: l.label, colorIdx: l.colorIdx, scope: 1, startYear: l.startYear, rampYears: l.rampYears, fullAbatementT: l.abatementT }));

  const segments: SegmentImpact[] = [
    /* Family picks the hue; the mobile/stationary (or leak/gas) split picks the
       deeper step of that same hue. Eight wedges, six hues, and a reader can
       still see at a glance that two of them are the same family. */
    { key: "eff-mobile", label: "Efficiency · Mobile", abatementT: effMobileT, colorIdx: FAMILY_IDX.efficiencyDeep },
    { key: "eff-stationary", label: "Efficiency · Stationary", abatementT: effStationaryT, colorIdx: FAMILY_IDX.efficiency },
    { key: "elec-mobile", label: "Electrification · Mobile", abatementT: elecMobile, colorIdx: FAMILY_IDX.electrifyDeep },
    { key: "elec-stationary", label: "Electrification · Stationary", abatementT: elecStationary, colorIdx: FAMILY_IDX.electrify },
    { key: "fuel-mobile", label: "Fuel switch · Mobile", abatementT: fuelMobile, colorIdx: FAMILY_IDX.fuelSwitchDeep },
    { key: "fuel-stationary", label: "Fuel switch · Stationary", abatementT: fuelStationary, colorIdx: FAMILY_IDX.fuelSwitch },
    { key: "ref-leak", label: "Refrigerant · Leak fix", abatementT: refAbateLeak, colorIdx: FAMILY_IDX.refrigerantDeep },
    { key: "ref-gas", label: "Refrigerant · Gas switch", abatementT: refAbateGas, colorIdx: FAMILY_IDX.refrigerant },
  ].filter((x) => x.abatementT > 0);

  const trajectory = buildTrajectory({
    baseYear, endYear: END_YEAR, baseTotalT,
    bauGrowth: resolveBauGrowthPct(g.bauGrowthPct, bauGrowthFallbackPct) / 100,
    wedges,
    scope2Spill: anyElec && scope2SpillFullT > 0 ? [{ startYear: elecR.startYear, rampYears: elecR.rampYears, fullT: scope2SpillFullT }] : [],
    // NOT gridLinked: Scope 1's baseline and wedges are fuel. Only the spill —
    // the grid load electrification adds — follows the grid down.
    gridFactor: gridFactorFn(baseYear, g.gridEfDeclinePctPerYear),
  });

  const at = (y: number) => trajectory.find((r) => r.year === y) ?? trajectory[trajectory.length - 1];
  const y2030 = at(2030);
  const y2050 = at(2050);
  // ALL levers with money attached, not just those with tonnes (F4).
  const costedLevers = leverRows.filter((l) => l.capex > 0 || l.opexParts.some((p) => p.amount !== 0));
  const programme = programmeMetrics(costedLevers.map((l) => l.series));
  const totalCapex = programme.totalCapex;

  return {
    baseline,
    baseTotalT,
    levers: leverRows,
    capexLines: groupCapexLines(capex),
    segments,
    wedges,
    trajectory,
    biogenicT,
    scope2SpillFullT,
    warnings: [
      ...validateScope1(assets, s),
      ...validateCharge(systems),
      ...validateTargetableSystems(systems, s.bySystem),
    ],
    kpis: {
      reduction2030: baseTotalT > 0 ? (y2030.bau - y2030.net) / baseTotalT : 0,
      reduction2050: baseTotalT > 0 ? (y2050.bau - y2050.net) / baseTotalT : 0,
      costPerTonne: programme.levelisedCostPerTonne,
      totalCapex,
      yearsToTarget: yearsToTarget(trajectory),
      netScope1Now: at(baseYear).net,
      bau2030: y2030.bau,
      net2030: y2030.net,
      target2030: targetLine(baseTotalT, 2030),
      onTrack2030: y2030.onTrack,
      paybackYears: programme.paybackYears,
      paybackKind: programme.paybackKind,
      npv: programme.npv,
      peakFunding: programme.peakFunding,
      priceBasisSummary: basisTally,
    },
  };
}

export * from "./types";
export { FAMILY_COLORS };
