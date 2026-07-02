/* Baseline Scope 2 picture — load, cost, and location-based emissions per
   facility before any levers. Contract instrument records (VPPA / I-REC)
   entered in Data input count as existing renewable coverage: they lower the
   market-based baseline but are not physical load. Pure: same inputs → same
   output. */

import { contractCoverageByFacility, isContractRecord } from "./instruments";
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

/** All renewable kWh already covering a facility: the legacy per-facility
 *  percentage plus this facility's share of its BU's VPPA/I-REC records,
 *  capped at the facility's load. */
export function coveredKwhOf(f: Facility, contractCov: Record<string, number>): number {
  return Math.min(f.annualLoadKwh, existingCoveredKwh(f) + (contractCov[f.id] ?? 0));
}

export function baselineScope2(facilities: Facility[]): Scope2Baseline {
  const contractCov = contractCoverageByFacility(facilities);
  const perFacility = facilities.map((f) => ({
    id: f.id,
    name: f.name,
    loadKwh: f.annualLoadKwh,
    costPerYear: f.annualLoadKwh * f.tariffPerKwh,
    locationT: (f.annualLoadKwh * f.gridEf) / 1000,
    isolated: f.isolated,
  }));
  const marketBaselineT = facilities.reduce(
    (s, f) => s + (Math.max(0, f.annualLoadKwh - coveredKwhOf(f, contractCov)) * f.gridEf) / 1000, 0,
  );
  // Contract records (VPPA / I-REC) are coverage, not consumption — keep them
  // out of the physical load and cost totals.
  const physical = perFacility.filter((x) => !isContractRecord(x));
  return {
    perFacility,
    totalLoadKwh: physical.reduce((s, x) => s + x.loadKwh, 0),
    totalCost: physical.reduce((s, x) => s + x.costPerYear, 0),
    totalLocationT: perFacility.reduce((s, x) => s + x.locationT, 0),
    marketBaselineT,
    existingContractedKwh: facilities.reduce((s, f) => s + coveredKwhOf(f, contractCov), 0),
    isolatedLoadKwh: perFacility.filter((x) => x.isolated).reduce((s, x) => s + x.loadKwh, 0),
  };
}
