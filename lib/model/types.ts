/* ============================================================
   Domain types for the Scope 1 decarbonization engine.
   Pure data — no React, no I/O. Mirrors the spec's "background engine".
   ============================================================ */

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
  | "R744" | "R717" | "R718";

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
  /** Remaining useful life, years (retrofit guardrail). */
  remainingLife: number;
  /** Number of units (vehicles for mobile, units for stationary; single boiler = 1). */
  unitCount: number;
  /** FY this snapshot is for — selects the DEFRA factor year. */
  year?: number;
}

export interface RefrigerationSystem {
  id: string;
  name: string;
  systemType: "commercialHVAC" | "industrialColdStorage" | "retailRefrigeration";
  refrigerant: RefrigerantId;
  /** Refrigerant topped up over the year (kg). Under the mass-balance method
   *  the amount refilled equals the amount that leaked to atmosphere — so this
   *  IS the annual fugitive loss. */
  toppedUpKg: number;
  gasCostPerKg: number;
}

/* ---------- Per-asset action plans (the "Switch" scenario) ---------- */

export interface ElectrifyAction {
  enabled: boolean;
  unitsToConvert: number; // mobile: 0..unitCount
  capacityPct: number; // stationary: 0..100
  cop: number; // 1 = electric boiler, ~3 = heat pump / EV efficiency
  tariffPerKwh: number;
  assetCapex: number; // per-asset purchase cost (× units for mobile)
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

export interface AssetActions {
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
  startYear: number;
  targetYear: number;
}

export interface LeakFixAction {
  enabled: boolean;
  leakImprovementPct: number; // 0..80, reduction in leak rate
  startYear: number;
  targetYear: number;
}

export interface SystemActions {
  gasSwitch: GasSwitchAction;
  leakFix: LeakFixAction;
}

/** Corporate-level assumptions (not per asset). */
export interface GlobalAssumptions {
  gridEf: number; // kgCO2e / kWh
  renewableSourcingPct: number; // 0..100, clean share of new electricity
  recCostPerTonne: number;
  carbonPricePerTonne: number;
  infraCapex: number; // one-off charging / grid-upgrade cost
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
