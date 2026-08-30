/* Pillar 2 — on-site generation. Solar capped by roof space; a battery
   lifts the self-consumption ratio toward 100% by capturing spill.
   Annual-curve approximation — no hourly dispatch (see design spec). */

import { BATTERY_FULL_CAPTURE_DAYS, M2_PER_KW, SOLAR_ONLY_SPILL } from "./constants";
import type { Facility, GenerationAction } from "./types";

export interface GenerationResult {
  effectiveKwp: number;
  solarGenKwh: number;
  selfConsumption: number;
  usedOnSiteKwh: number;
  exportedKwh: number;
  gridDrawKwh: number;
  capex: number;
  opexSaving: number;
  /** Demand-charge saving from peak shaving, INR/yr. Reported separately
   *  because it carries NO tonnes: it is the half of the business case that
   *  the carbon number cannot see. */
  demandSaving: number;
}

export function applyGeneration(f: Facility, a: GenerationAction, residualLoadKwh: number): GenerationResult {
  if (!a.enabled || a.solarKwp <= 0) {
    return { effectiveKwp: 0, solarGenKwh: 0, selfConsumption: 1, usedOnSiteKwh: 0, exportedKwh: 0, gridDrawKwh: residualLoadKwh, capex: 0, opexSaving: 0, demandSaving: 0 };
  }
  // New solar is capped by the roof headroom LEFT after any existing panels.
  const roofHeadroomKwp = Math.max(0, f.roofSpaceM2 / M2_PER_KW - (f.existingSolarKwp ?? 0));
  const effectiveKwp = Math.min(a.solarKwp, roofHeadroomKwp);
  const solarGenKwh = effectiveKwp * f.irradiance;
  const dailySolar = solarGenKwh / 365;
  const batteryFactor = dailySolar > 0 ? Math.min(1, a.batteryKwh / (BATTERY_FULL_CAPTURE_DAYS * dailySolar)) : 0;
  const loadRatio = residualLoadKwh > 0 ? Math.min(1, solarGenKwh / residualLoadKwh) : 1;
  const spill = SOLAR_ONLY_SPILL * loadRatio * (1 - batteryFactor);
  const selfConsumption = 1 - spill;
  const usedOnSiteKwh = Math.min(Math.max(0, residualLoadKwh), solarGenKwh * selfConsumption);
  const exportedKwh = solarGenKwh - usedOnSiteKwh;

  // Peak shaving cannot exceed the site's own peak, and cannot be dispatched
  // without a battery — a solar-only array does not hold a peak down after
  // sunset, which is when Indian industrial peaks usually sit.
  const shavedKw = a.batteryKwh > 0
    ? Math.max(0, Math.min(a.peakShavingKw ?? 0, f.peakLoadKw || Infinity))
    : 0;
  const demandSaving = shavedKw * (f.demandChargePerKvaMonth ?? 0) * 12;

  return {
    effectiveKwp, solarGenKwh, selfConsumption, usedOnSiteKwh, exportedKwh,
    gridDrawKwh: residualLoadKwh - usedOnSiteKwh,
    capex: (effectiveKwp * a.solarCapexPerKw + a.batteryKwh * a.batteryCapexPerKwh) * (1 - a.subsidyPct / 100),
    opexSaving: usedOnSiteKwh * f.tariffPerKwh + (a.exportMode === "netMetering" ? exportedKwh * f.tariffPerKwh : 0),
    demandSaving,
  };
}
