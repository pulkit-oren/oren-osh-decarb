/* ============================================================
   Default Scope 1 inventory — each FY (2021→2027) has its OWN list
   of fuels/systems, so the mix can differ year to year (Petrol LCVs
   join in FY2023, a CNG fleet in FY2026). FY2025 is the default base
   year and carries the four core assets the starter scenario plans.
   ============================================================ */

import { GRID_EF_DEFAULT } from "./model/factors";
import { FY_YEARS } from "./model/types";
import type {
  CombustionAsset, CombustionByYear, FuelId, FuelUnit, LeverSettings,
  RefrigerationByYear, RefrigerationSystem,
} from "./model/types";
import { resolveCombustion, resolveRefrigeration } from "./yearly";

export const DEFAULT_BASE_YEAR = 2025;

/** Gentle rising trend anchored at FY2025 = 1.0. */
function trend(year: number): number {
  return 1 + 0.025 * (year - 2025);
}

interface CombustionSpec {
  id: string;
  name: string;
  category: "stationary" | "mobile";
  fuelType: FuelId;
  unit: FuelUnit;
  remainingLife: number;
  vol2025: number;
  opex2025: number;
  units: number;
  fromYear: number; // first FY this fuel appears
}

const COMBUSTION_SPECS: CombustionSpec[] = [
  { id: "genset", name: "Diesel gensets", category: "stationary", fuelType: "diesel", unit: "L", remainingLife: 9, vol2025: 250000, opex2025: 22_500_000, units: 2, fromYear: 2021 },
  { id: "boiler", name: "PNG process boiler", category: "stationary", fuelType: "png", unit: "m3", remainingLife: 12, vol2025: 180000, opex2025: 9_000_000, units: 1, fromYear: 2021 },
  { id: "fleet-d", name: "Diesel fleet", category: "mobile", fuelType: "diesel", unit: "L", remainingLife: 6, vol2025: 120000, opex2025: 11_400_000, units: 5, fromYear: 2021 },
  { id: "fleet-p", name: "Petrol LCVs", category: "mobile", fuelType: "petrol", unit: "L", remainingLife: 5, vol2025: 30000, opex2025: 3_300_000, units: 4, fromYear: 2023 },
  { id: "fleet-cng", name: "CNG delivery vans", category: "mobile", fuelType: "cng", unit: "kg", remainingLife: 8, vol2025: 45000, opex2025: 4_200_000, units: 6, fromYear: 2026 },
];

function lineFor(s: CombustionSpec, year: number): CombustionAsset {
  const f = trend(year);
  return {
    id: s.id, name: s.name, category: s.category, fuelType: s.fuelType, unit: s.unit,
    remainingLife: s.remainingLife, unitCount: s.units,
    annualVolume: Math.round(s.vol2025 * f), opex: Math.round(s.opex2025 * f),
  };
}

const DEFAULT_COMBUSTION: CombustionByYear = {};
for (const y of FY_YEARS) {
  DEFAULT_COMBUSTION[y] = COMBUSTION_SPECS.filter((s) => y >= s.fromYear).map((s) => lineFor(s, y));
}

const REFRIGERATION_SPECS: RefrigerationSystem[] = [
  { id: "cold", name: "Cold storage plant", systemType: "industrialColdStorage", refrigerant: "R404A", toppedUpKg: 120, gasCostPerKg: 1200 },
  { id: "hvac", name: "Office HVAC", systemType: "commercialHVAC", refrigerant: "R410A", toppedUpKg: 42, gasCostPerKg: 950 },
];

const DEFAULT_REFRIGERATION: RefrigerationByYear = {};
for (const y of FY_YEARS) {
  DEFAULT_REFRIGERATION[y] = REFRIGERATION_SPECS.map((s) => ({ ...s }));
}

export const DEFAULT_COMBUSTION_BY_YEAR = DEFAULT_COMBUSTION;
export const DEFAULT_REFRIGERATION_BY_YEAR = DEFAULT_REFRIGERATION;

/** Flat base-year (2025) snapshots — used by the engine and tests. */
export const DEFAULT_ASSETS = resolveCombustion(DEFAULT_COMBUSTION, DEFAULT_BASE_YEAR);
export const DEFAULT_SYSTEMS = resolveRefrigeration(DEFAULT_REFRIGERATION, DEFAULT_BASE_YEAR);

export const DEFAULT_SETTINGS: LeverSettings = {
  assumptions: {
    gridEf: GRID_EF_DEFAULT, renewableSourcingPct: 50, recCostPerTonne: 800,
    carbonPricePerTonne: 2000, infraCapex: 15_000_000,
  },
  bySystem: {
    cold: {
      gasSwitch: { enabled: true, transitionPct: 60, altRefrigerant: "R717", retrofitCapex: 8_000_000, startYear: 2026, targetYear: 2029 },
      leakFix: { enabled: true, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 },
    },
    hvac: {
      gasSwitch: { enabled: true, transitionPct: 60, altRefrigerant: "R454B", retrofitCapex: 4_000_000, startYear: 2026, targetYear: 2029 },
      leakFix: { enabled: true, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 },
    },
  },
  byAsset: {
    "fleet-d": {
      electrify: { enabled: true, unitsToConvert: 3, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 4_000_000, startYear: 2026, targetYear: 2030 },
      fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 78, retrofitCapex: 2_000_000, startYear: 2027, targetYear: 2031 },
    },
    "fleet-p": {
      electrify: { enabled: true, unitsToConvert: 2, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 2_500_000, startYear: 2026, targetYear: 2032 },
      fuelSwitch: { enabled: false, altFuel: "ethanol", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 70, retrofitCapex: 0, startYear: 2028, targetYear: 2033 },
    },
    "boiler": {
      electrify: { enabled: true, unitsToConvert: 0, capacityPct: 60, cop: 3, tariffPerKwh: 9, assetCapex: 35_000_000, startYear: 2026, targetYear: 2030 },
      fuelSwitch: { enabled: true, altFuel: "biogas", blendPct: 25, efficiencyPenaltyPct: 1, altFuelPricePerUnit: 30, retrofitCapex: 4_000_000, startYear: 2027, targetYear: 2032 },
    },
    "genset": {
      electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 0, startYear: 2026, targetYear: 2032 },
      fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 30, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 78, retrofitCapex: 3_000_000, startYear: 2026, targetYear: 2031 },
    },
  },
};

export const CURRENCY = "₹";
