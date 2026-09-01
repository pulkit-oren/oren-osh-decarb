/* ============================================================
   Domain types for the Scope 1 decarbonization engine.
   Pure data — no React, no I/O. Mirrors the spec's "background engine".
   ============================================================ */

import type { Equipment, CapacityUnit, AllocationBasis } from "@/lib/equipment/types";

export type FuelId =
  // Liquid fossil fuels
  | "diesel"
  | "petrol"
  | "fuelOil"
  | "ldo"
  | "kerosene"
  | "naphtha"
  // Gaseous fossil fuels
  | "lpg"
  | "propane"
  | "butane"
  | "cng"
  | "png"
  // Solid fossil fuels
  | "coal"
  | "cokingCoal"
  | "lignite"
  | "petcoke"
  // Biomass / renewable fuels — biogenic CO₂ reported separately, only CH₄/N₂O is Scope 1
  | "biogas"
  | "bioCng"
  | "bioBriquettes"
  | "biomass"
  | "bagasse"
  | "riceHusk"
  // Added from Emission Factor 2025 workbook
  | "lubricants" | "residualFuelOil" | "marineHfoVlsfo" | "marineHfoHsfo"
  | "marineLfoUlsfo" | "marineLfoVlsfo" | "marineGasOil" | "jetFuel" | "aviationGasoline"
  | "biodiesel" | "lng" | "cngScm" | "landfillGas"
  | "coalAnthracite" | "coalBituminous" | "coalBriquettes" | "coalElectricity"
  | "woodPellets" | "woodChips" | "woodLogs";

export type AltFuelId = "biodiesel" | "ethanol" | "biogas" | "bioCng" | "biomass";

export type RefrigerantId =
  // legacy — high GWP / ozone-depleting
  | "R12" | "R11" | "R502" | "R22" | "R23" | "R143a" | "R507A" | "R404A"
  | "R125" | "R408A" | "R422D" | "R417A" | "R410A" | "R407C" | "R409A" | "R407A" | "R438A"
  // current — transitional / lower GWP
  | "R407F" | "R134a" | "R449A" | "R448A" | "R452A" | "R427A" | "R513A" | "R450A" | "R466A"
  | "R515B" | "R32" | "R454B" | "R455A" | "R152a"
  // future — ultra-low GWP HFOs + naturals
  | "R1234ze" | "R1234yf" | "R1233zd" | "R1336mzz" | "R600a" | "R1270" | "R290" | "R170"
  | "R744" | "R717" | "R718"
  // Added from Emission Factor 2025 workbook
  | "R401A" | "R401B" | "R401C" | "R402A" | "R402B" | "R403A" | "R403B" | "R405A"
  | "R407B" | "R407D" | "R407E" | "R410B" | "R411A" | "R411B" | "R412A" | "R413A"
  | "R415A" | "R415B" | "R416A" | "R417B" | "R417C" | "R418A" | "R419A" | "R419B"
  | "R420A" | "R421A" | "R421B" | "R422A" | "R422B" | "R422C" | "R422E" | "R423A"
  | "R424A" | "R425A" | "R426A" | "R428A" | "R429A" | "R430A" | "R431A" | "R434A"
  | "R435A" | "R437A" | "R439A" | "R440A" | "R442A" | "R444A" | "R445A" | "R500"
  | "R503" | "R504" | "R508A" | "R508B" | "R509A" | "R511A" | "R512A";

export type FuelUnit = "L" | "kg" | "m3" | "t";

export interface FuelFactor {
  id: FuelId;
  label: string;
  unit: FuelUnit;
  /** kg of fuel per `unit`. Absent when the workbook has no density (energy step hidden). */
  densityKgPerUnit?: number;
  /** Calorific value, kJ per kg. Absent when the workbook has none. */
  cvKJperKg?: number;
  /** Combustion emission factor, kgCO2e per `unit` (the chosen source's latest). */
  co2eFactor: number;
  /** DEFRA emission factor by year (kgCO2e per `unit`). Empty for non-DEFRA fuels. */
  co2eByYear: Record<number, number>;
  /** Which dataset `co2eFactor`/`co2eByYear` came from. */
  efSource: "DEFRA" | "IPCC" | "IMO";
  /** Workbook Column-A family this fuel is listed under; absent ⇒ app-only, hidden in Activity tab. */
  excelCategory?: "liquid" | "gas" | "solid";
  renewable: boolean;
  /** Biogenic CO₂ per `unit` (kgCO2e) — reported separately under BRSR/GRI,
   *  NOT counted in Scope 1. Present only for biomass/renewable fuels. */
  biogenicCO2ePerUnit?: number;
  /** Representative price per `unit` (₹) — seeds a sensible average annual
   *  spend (OPEX) when an asset is created, so the spend field is optional. */
  typicalPricePerUnit?: number;
}

export interface AltFuelFactor {
  id: AltFuelId;
  label: string;
  unit: FuelUnit;
  densityKgPerUnit: number;
  cvKJperKg: number;
  /** Total combustion CO2e per `unit` (kg). */
  co2eTotalPerUnit: number;
  /** Fraction of that CO2 that is biogenic — reported separately, NOT Scope 1. */
  biogenicFraction: number;
  /** Max share (% of energy) that can be blended into the matching fossil fuel
   *  WITHOUT changing the equipment — the mobile / default cap (e.g. E20/B20). */
  maxBlendPct: number;
  /** Higher cap for STATIONARY equipment (boilers/burners take far more bio
   *  than vehicle engines, via a burner retrofit). Falls back to maxBlendPct. */
  stationaryMaxBlendPct?: number;
  /** Short note explaining the blend cap (shown by the lever). */
  blendNote?: string;
}

export type RefrigerantEra = "legacy" | "current" | "future";

export interface RefrigerantFactor {
  id: RefrigerantId;
  label: string;
  /** Global warming potential, kgCO2e per kg of gas (AR5 100-yr). */
  gwp: number;
  era: RefrigerantEra;
  natural: boolean;
  /** Charge-mass ratio vs an equivalent HFC system (naturals need less mass). */
  volAdj: number;
  /** Short safety/handling note for the advisor. */
  note: string;
  /** Listed in the Emission Factor 2025 workbook (selectable in the Activity tab). */
  inExcel?: boolean;
}

/* ---------- Baseline assets (user data) ---------- */

export interface CombustionAsset {
  id: string;
  name: string;
  category: "stationary" | "mobile";
  fuelType: FuelId;
  annualVolume: number;
  /** The fuel's reference unit — the basis the emission factor is keyed to. */
  unit: FuelUnit;
  /** Optional display unit for the inline consumption field (converted via density);
   *  absent ⇒ shown in the reference unit. Does not change the emission basis. */
  displayUnit?: FuelUnit;
  /** How the annual volume was sourced. Absent ⇒ metered (measured). */
  inputMode?: "metered" | "spend";
  /** Optional site / location tag for plant-level filtering. */
  site?: string;
  /** Business unit this entry belongs to. Absent ⇒ Central (consolidated). */
  bu?: string;
  /** When true, excluded from all footprint totals (a non-aggregated BU). */
  excluded?: boolean;
  /** Annual fuel + maintenance spend (currency). */
  opex: number;
  /** Set on rows emitted by resolveEquipment(), copied from the row's single
   *  equipment. Absent on a RAW source - the source of truth is
   *  equipment[].remainingLife (D4). Kept flat so the nine model consumers
   *  that read it need no change. */
  remainingLife?: number;
  /** Set on rows emitted by resolveEquipment(); see remainingLife. */
  unitCount?: number;
  /** Set on rows emitted by resolveEquipment(); see remainingLife. */
  endUse?: import("./end-use").EndUseId;
  /** FY this snapshot is for — selects the DEFRA factor year. */
  year?: number;
  /** This source's equipment. Order is display order. D8 (at least one) is a
   *  RUNTIME invariant enforced at the write points - migrateEquipment on
   *  hydrate, addCombustion / importCombustion, and source creation - not a
   *  type invariant: the field is optional because a frozen pre-equipment test
   *  fixture and a zero-error typecheck cannot both hold otherwise (Ruling K).
   *  Readers must therefore tolerate absence; resolveEquipment degrades by
   *  passing the entry through unexpanded. A RESOLVED row carries the single
   *  equipment it descends from, so a consumer reading one sees one machine. */
  equipment?: Equipment[];
  /** Per-equipment volume, keyed by Equipment.id. Sums to <= annualVolume. */
  allocations?: Record<string, number>;
  /** The unit every equipment's `capacity` is expressed in (D9). Declared once
   *  here so a source cannot hold incommensurable capacities - mixing tph with
   *  kVA is unrepresentable, not merely validated against. */
  capacityUnit?: CapacityUnit;
  /** How `allocations` should be (re)computed. Absent => "load". */
  allocationBasis?: AllocationBasis;
  /** Set on rows emitted by resolveEquipment() — the id of the entry a resolved row descends from. */
  sourceEntryId?: string;
}

export interface RefrigerationSystem {
  id: string;
  name: string;
  systemType: "commercialHVAC" | "industrialColdStorage" | "retailRefrigeration";
  /** Finer equipment class within the system type — sharpens the recommended low-GWP swap. Absent ⇒ use the system-type default. */
  equipmentClass?: import("./refrigerant-class").RefrigClassId;
  refrigerant: RefrigerantId;
  /** Refrigerant topped up over the year (kg). Under the mass-balance method
   *  the amount refilled equals the amount that leaked to atmosphere — so this
   *  IS the annual fugitive loss. */
  toppedUpKg: number;
  /** Installed charge (kg) — the mass in the system, not the mass lost.
   *  Optional: most first-year users have top-up invoices and no charge
   *  register, and requiring both would block the figure they can produce.
   *  Where present it makes the LEAK RATE measurable, which is the form every
   *  F-gas target is written in. See lib/model/refrigerant-charge.ts. */
  chargeKg?: number;
  gasCostPerKg: number;
  /** Business unit this entry belongs to. Absent ⇒ Central (consolidated). */
  bu?: string;
  /** When true, excluded from all footprint totals (a non-aggregated BU). */
  excluded?: boolean;
}

/* ---------- Per-asset action plans (the "Switch" scenario) ---------- */

export interface ElectrifyAction {
  enabled: boolean;
  unitsToConvert: number; // mobile: 0..unitCount
  capacityPct: number; // stationary: 0..100
  cop: number; // 1 = electric boiler, ~3 = heat pump / EV efficiency
  tariffPerKwh: number;
  assetCapex: number; // per-asset purchase cost (× units for mobile)
  /** MOBILE: convert at natural replacement (pay only the EV premium — you'd
   *  buy an ICE anyway) or retire early (full EV price). Defaults "replacement". */
  purchaseTiming?: "replacement" | "early";
  /** EV premium over the ICE it replaces, % of the EV price. Defaults 40. */
  replacementPremiumPct?: number;
  startYear: number;
  targetYear: number;
}

export interface FuelSwitchAction {
  enabled: boolean;
  altFuel: AltFuelId;
  blendPct: number; // 0..100 of energy
  efficiencyPenaltyPct: number;
  altFuelPricePerUnit: number;
  retrofitCapex: number;
  startYear: number;
  targetYear: number;
}

/** Flex-fuel vehicle conversion — converts specific MOBILE vehicles to run a
 *  high bio blend (E85/E100) beyond the E20/B20 drop-in limit. This is a
 *  vehicle purchase, so it's counted per vehicle (not a fleet-wide blend). */
export interface FlexFuelAction {
  enabled: boolean;
  unitsToConvert: number; // 0..unitCount vehicles converted to flex-fuel
  altFuel: AltFuelId; // matched to the engine (ethanol for petrol, biodiesel for diesel)
  highBlendPct: number; // 21..100, the blend the flex vehicles run (e.g. 85 = E85)
  vehicleCapex: number; // per-vehicle flex-fuel premium / replacement cost
  startYear: number;
  targetYear: number;
}

/** Step 0 of the stacking pipeline — demand-side efficiency (economiser
 *  packages, burner tuning, DG right-sizing, telematics…). Applied FIRST:
 *  every downstream lever acts on the reduced remainder. */
export interface EfficiencyAction {
  enabled: boolean;
  savingPct: number; // 0..40, share of fuel saved
  capex: number;
  startYear: number;
  targetYear: number;
}

export interface AssetActions {
  /** Optional — older saved plans won't have it; treated as disabled when absent. */
  efficiency?: EfficiencyAction;
  electrify: ElectrifyAction;
  fuelSwitch: FuelSwitchAction;
  /** Optional — older saved plans won't have it; treated as disabled when absent. */
  flexFuel?: FlexFuelAction;
}

/* ---- Per-system refrigerant actions ---- */

export interface GasSwitchAction {
  enabled: boolean;
  transitionPct: number; // 0..100, share of this system's charge moved
  altRefrigerant: RefrigerantId;
  retrofitCapex: number;
  /** ₹/kg of the alternative gas — the switched share still leaks and still
   *  needs top-ups. Defaults from the refrigerant price table when absent. */
  altGasPricePerKg?: number;
  startYear: number;
  targetYear: number;
}

export interface LeakFixAction {
  enabled: boolean;
  leakImprovementPct: number; // 0..80, reduction relative to today's leak
  /** Target annual leak as a % of installed charge — the absolute standard a
   *  commitment is actually written and audited against ("under 5% a year").
   *  Wins over leakImprovementPct when the system records a charge; ignored
   *  when it does not, and the plan says so. */
  targetLeakRatePct?: number;
  /** LDAR program cost (sensors, tightness surveys, maintenance contract) —
   *  small but not free; keeps the MACC honest. Optional for old plans. */
  capex?: number;
  startYear: number;
  targetYear: number;
}

/** Replace a system with one holding less refrigerant — microchannel coils,
 *  a distributed architecture, a secondary loop. Cuts the mass that CAN leak,
 *  independently of how well the system is maintained, which is why it is a
 *  separate lever from leak fixing rather than a better leak rate. */
export interface ChargeReductionAction {
  enabled: boolean;
  /** 0..80, reduction in installed charge. */
  reductionPct: number;
  capex: number;
  startYear: number;
  targetYear: number;
}

export interface SystemActions {
  gasSwitch: GasSwitchAction;
  leakFix: LeakFixAction;
  /** Optional — absent on every plan saved before this lever existed. */
  chargeReduction?: ChargeReductionAction;
}

/** Corporate-level assumptions (not per asset). */
export interface GlobalAssumptions {
  gridEf: number; // kgCO2e / kWh, base year
  /** Annual decline in grid carbon intensity, % per year. Optional for old
   *  saves; defaults to GRID_EF_DECLINE_PCT_DEFAULT. Zero reproduces the old
   *  frozen-grid behaviour exactly, which is what every save written before
   *  this field existed was silently assuming. */
  gridEfDeclinePctPerYear?: number;
  renewableSourcingPct: number; // 0..100, clean share of new electricity
  /** THE certificate price, in Rs per kWh — the unit certificates actually
   *  trade in. Both scopes read this one field: Scope 2's procurement cost is
   *  kWh x this, and Scope 1's charge on electrification's added grid load is
   *  tonnes x (this / gridEf), so the two can no longer disagree. Optional for
   *  old saves; defaults 0.45. */
  recPricePerKwh?: number;
  /** @deprecated Retired in favour of `recPricePerKwh`. Accepted on old saves
   *  so they still parse; read by nothing. A Rs/t certificate price and a
   *  Rs/kWh one are the same instrument, and holding both is how they drifted
   *  26% apart. */
  recCostPerTonne?: number;
  carbonPricePerTonne: number;
  infraCapex: number; // one-off charging / grid-upgrade cost
  /** WACC used to annualize capex (capital recovery factor). Optional for old saves; defaults 10. */
  discountRatePct?: number;
  /** Maintenance share of an asset's annual spend (fuel is the rest). Defaults 20. */
  maintenanceShareOfSpendPct?: number;
  /** EV maintenance as a share of the ICE maintenance it replaces. Defaults 65. */
  evMaintenanceRatioPct?: number;
  /** Heat-pump / electric-boiler maintenance as a share of the plant it
   *  replaces. Defaults 70. */
  heatPumpMaintenanceRatioPct?: number;
  /** Fuel price growth per year. Was hardcoded in the old cashflow module,
   *  which made it invisible to the export. Defaults 5. */
  fuelEscalationPct?: number;
  /** Grid tariff growth per year. Defaults 3. */
  elecEscalationPct?: number;
  /** Growth for everything else (RECs, maintenance). Defaults 0. */
  otherEscalationPct?: number;
  /** Business-as-usual activity growth, PERCENT per year — 2.5 means 2.5%/yr.
   *  Absent means "use the rate derived from the year-wise inventories", which
   *  the store passes to the engine; absent from both means 1. Optional so old
   *  saves parse, and `??`-resolved so an explicit 0 stays a flat BAU.
   *
   *  PRE-SPLIT: one rate for BOTH scopes. Still read, still means both, because
   *  every scenario saved before the split carries it — but nothing writes it
   *  any more. The Assumptions panel writes the two fields below. */
  bauGrowthPct?: number;
  /** Scope 1's own business-as-usual rate, PERCENT per year. Beats
   *  `bauGrowthPct` for Scope 1 and is invisible to Scope 2. Absent means
   *  Scope 1 follows `bauGrowthPct`, then its own derived history, then 1. */
  bauGrowthS1Pct?: number;
  /** Scope 2's own business-as-usual rate, PERCENT per year. The mirror of
   *  `bauGrowthS1Pct` — the two scopes grow at genuinely different rates, which
   *  is why one field could not serve both. */
  bauGrowthS2Pct?: number;
}

export interface LeverSettings {
  byAsset: Record<string, AssetActions>; // keyed by CombustionAsset id
  bySystem: Record<string, SystemActions>; // keyed by RefrigerationSystem id
  assumptions: GlobalAssumptions;
}

/* ---------- Trajectory + compute results ---------- */

export interface Wedge {
  id: string;
  label: string;
  colorIdx: number; // index into the family colour sequence
  startYear: number;
  rampYears: number;
  fullAbatementT: number; // tonnes abated per year once fully ramped
  scope: 1 | 2;
}

export interface TrajectoryConfig {
  baseYear: number;
  endYear: number;
  baseTotalT: number;
  bauGrowth: number; // fractional, e.g. 0.01
  wedges: Wedge[];
  /** Optional added Scope 2 load (electrification spillover), full-ramp tonnes/yr. */
  scope2Spill?: { startYear: number; rampYears: number; fullT: number }[];
  /** Grid carbon intensity in `year` as a multiple of the base year's, from
   *  lib/model/grid.ts. Absent ⇒ 1 for every year (a grid that never cleans).
   *  Always applied to `scope2Spill`, which is grid load in either scope. */
  gridFactor?: (year: number) => number;
  /** True when the baseline and every wedge are grid electricity — i.e. this is
   *  the Scope 2 trajectory. Scope 1's fuel baseline must NOT scale. */
  gridLinked?: boolean;
}

export interface TrajectoryRow {
  year: number;
  bau: number;
  target: number;
  net: number;
  scope2Spill: number;
  wedges: Record<string, number>;
  onTrack: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  settings: LeverSettings;
  savedAt: number;
  /** Optional context ("board option A", "CFO-constrained"…). */
  note?: string;
}

/* ---------- Multi-year data entry (FY 2021 → 2027) ---------- */

/** FY start years the planner accepts data for. */
export const FY_YEARS = [2021, 2022, 2023, 2024, 2025, 2026, 2027];

/** "FY 2024-25" label for an FY start year. */
export function fyLabel(startYear: number): string {
  const end = (startYear + 1) % 100;
  return `FY ${startYear}-${String(end).padStart(2, "0")}`;
}

/* Each financial year holds its OWN independent inventory — the set of fuels and
   cooling systems can differ year to year. A line that persists across years keeps
   the same id (so its scenario plan follows it); a genuinely new fuel gets a new id. */
export type CombustionByYear = Record<number, CombustionAsset[]>;
export type RefrigerationByYear = Record<number, RefrigerationSystem[]>;
