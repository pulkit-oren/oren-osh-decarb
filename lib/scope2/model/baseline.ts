/* Baseline Scope 2 picture — load, cost, and location-based emissions per
   facility before any levers. Pure: same inputs → same output. */

import type { Facility } from "./types";

export interface FacilityBaseline {
  id: string;
  name: string;
  loadKwh: number;
  costPerYear: number;
  locationT: number; // tonnes CO2e, location-based
  isolated: boolean;
}

/** Existing renewable contracts already covering a facility (kWh/yr). Ignored
 *  on isolated grids, where market instruments are unavailable. */
export function existingCoveredKwh(f: Facility): number {
  if (f.isolated) return 0;
  return f.annualLoadKwh * Math.max(0, Math.min(100, f.existingRenewablePct ?? 0)) / 100;
}

export interface Scope2Baseline {
  perFacility: FacilityBaseline[];
  totalLoadKwh: number;
  totalCost: number;
  totalLocationT: number;
  /** Market-based baseline — location minus electricity already on PPAs/RECs. */
  marketBaselineT: number;
  /** Renewable electricity already contracted (kWh/yr). */
  existingContractedKwh: number;
  isolatedLoadKwh: number;
}

export function baselineScope2(facilities: Facility[]): Scope2Baseline {
  const perFacility = facilities.map((f) => ({
    id: f.id,
    name: f.name,
    loadKwh: f.annualLoadKwh,
    costPerYear: f.annualLoadKwh * f.tariffPerKwh,
    locationT: (f.annualLoadKwh * f.gridEf) / 1000,
    isolated: f.isolated,
  }));
  const marketBaselineT = facilities.reduce(
    (s, f) => s + (Math.max(0, f.annualLoadKwh - existingCoveredKwh(f)) * f.gridEf) / 1000, 0,
  );
  return {
    perFacility,
    totalLoadKwh: perFacility.reduce((s, x) => s + x.loadKwh, 0),
    totalCost: perFacility.reduce((s, x) => s + x.costPerYear, 0),
    totalLocationT: perFacility.reduce((s, x) => s + x.locationT, 0),
    marketBaselineT,
    existingContractedKwh: facilities.reduce((s, f) => s + existingCoveredKwh(f), 0),
    isolatedLoadKwh: perFacility.filter((x) => x.isolated).reduce((s, x) => s + x.loadKwh, 0),
  };
}
