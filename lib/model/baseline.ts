/* ============================================================
   Baseline engine — turns user assets into energy (kJ) and
   tonnes CO2e using the factor library. Emission factors are
   year-aware (DEFRA 2022–2025); calorific values are the DEFRA
   reference per fuel. Every number traces to factors.ts. Spec §5.
   ============================================================ */

import { defraEF, getFuel, getRefrigerant, type EFLookup } from "./factors";
import type { CombustionAsset, RefrigerationSystem } from "./types";

/** Combustion emissions for one asset, in tonnes CO2e/yr (uses the asset's FY factor). */
export function combustionCO2e(a: CombustionAsset): number {
  return (a.annualVolume * defraEF(a.fuelType, a.year).value) / 1000;
}

/** Combustion energy for one asset, in kJ/yr. */
export function combustionEnergyKJ(a: CombustionAsset): number {
  const f = getFuel(a.fuelType);
  return a.annualVolume * f.densityKgPerUnit * f.cvKJperKg;
}

/** Annual fugitive emissions for one refrigeration system, tonnes CO2e/yr.
 *  Mass-balance: the refrigerant topped up over the year = the amount leaked. */
export function refrigerantCO2e(s: RefrigerationSystem): number {
  return (s.toppedUpKg * getRefrigerant(s.refrigerant).gwp) / 1000;
}

export interface BaselineResult {
  combustionT: number;
  refrigerantT: number;
  totalT: number;
  perCombustion: { id: string; name: string; co2eT: number; energyKJ: number }[];
  perRefrigeration: { id: string; name: string; co2eT: number }[];
}

export function baselineScope1(
  assets: CombustionAsset[],
  systems: RefrigerationSystem[],
): BaselineResult {
  const perCombustion = assets.map((a) => ({
    id: a.id,
    name: a.name,
    co2eT: combustionCO2e(a),
    energyKJ: combustionEnergyKJ(a),
  }));
  const perRefrigeration = systems.map((s) => ({
    id: s.id,
    name: s.name,
    co2eT: refrigerantCO2e(s),
  }));
  const combustionT = perCombustion.reduce((s, x) => s + x.co2eT, 0);
  const refrigerantT = perRefrigeration.reduce((s, x) => s + x.co2eT, 0);
  return {
    combustionT,
    refrigerantT,
    totalT: combustionT + refrigerantT,
    perCombustion,
    perRefrigeration,
  };
}

/* ---------- Calculation breakdowns (for the side panel) ---------- */

export interface CombustionBreakdown {
  kind: "combustion";
  name: string;
  fuelLabel: string;
  year: number;
  unit: string;
  volume: number;
  density: number;
  cv: number;
  ef: EFLookup;
  energyMJ: number;
  energyGJ: number;
  co2eT: number;
  /** True for biomass fuels — combustion CO₂ is biogenic. */
  renewable: boolean;
  /** Biogenic CO₂ for this asset, tonnes/yr — reported separately, not Scope 1. */
  biogenicCO2eT: number;
}

export function combustionBreakdown(a: CombustionAsset): CombustionBreakdown {
  const f = getFuel(a.fuelType);
  const ef = defraEF(a.fuelType, a.year);
  const energyKJ = combustionEnergyKJ(a);
  return {
    kind: "combustion",
    name: a.name,
    fuelLabel: f.label,
    year: a.year ?? ef.sourceYear,
    unit: a.unit,
    volume: a.annualVolume,
    density: f.densityKgPerUnit,
    cv: f.cvKJperKg,
    ef,
    energyMJ: energyKJ / 1000,
    energyGJ: energyKJ / 1_000_000,
    co2eT: combustionCO2e(a),
    renewable: f.renewable,
    biogenicCO2eT: (a.annualVolume * (f.biogenicCO2ePerUnit ?? 0)) / 1000,
  };
}

export interface RefrigerantBreakdown {
  kind: "refrigerant";
  name: string;
  refrigerantLabel: string;
  gwp: number;
  toppedUpKg: number;
  co2eT: number;
}

export function refrigerantBreakdown(s: RefrigerationSystem): RefrigerantBreakdown {
  const r = getRefrigerant(s.refrigerant);
  return {
    kind: "refrigerant",
    name: s.name,
    refrigerantLabel: r.label,
    gwp: r.gwp,
    toppedUpKg: s.toppedUpKg,
    co2eT: refrigerantCO2e(s),
  };
}
