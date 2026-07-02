/* ============================================================
   Electricity instruments — the four per-BU records the Data input
   tab creates ("Purchased electricity", "Virtual PPA", "Solar
   onsite", "I-REC") and how their kWh feeds the model:

   - Purchased electricity  → physical grid load (location + market).
   - Virtual PPA / I-REC    → CONTRACT records: their kWh covers the
     BU's purchased kWh in the market-based number and renewable %,
     but is not physical consumption itself.
   - Solar onsite           → self-consumed generation: physical,
     zero-EF consumption that counts toward renewable %.

   Records are matched by name (the same convention the Data input
   screens use to find them). Pure: no React, no I/O.
   ============================================================ */

import type { Facility } from "./types";

export const INSTRUMENTS = {
  grid: "Purchased electricity",
  vppa: "Virtual PPA",
  solar: "Solar onsite",
  irec: "I-REC",
} as const;

type Named = Pick<Facility, "name">;

/** VPPA / I-REC — contractual coverage of purchased kWh, not physical load. */
export const isContractRecord = (f: Named): boolean =>
  f.name === INSTRUMENTS.vppa || f.name === INSTRUMENTS.irec;

/** The self-consumed on-site solar record. */
export const isOnsiteSolarRecord = (f: Named): boolean => f.name === INSTRUMENTS.solar;

export const isInstrumentRecord = (f: Named): boolean =>
  isContractRecord(f) || isOnsiteSolarRecord(f) || f.name === INSTRUMENTS.grid;

const buOf = (f: Facility) => f.bu ?? "";

/**
 * Allocate each BU's contract kWh (VPPA + I-REC records) across that BU's
 * grid-supplied facilities, pro-rata by load and capped at each facility's
 * load. Isolated facilities get nothing (market instruments don't reach
 * captive grids). Returns facilityId → covered kWh.
 */
export function contractCoverageByFacility(facilities: Facility[]): Record<string, number> {
  const contractByBu: Record<string, number> = {};
  for (const f of facilities) {
    if (isContractRecord(f)) contractByBu[buOf(f)] = (contractByBu[buOf(f)] ?? 0) + f.annualLoadKwh;
  }

  const out: Record<string, number> = {};
  if (Object.keys(contractByBu).length === 0) return out;

  for (const [bu, contractKwh] of Object.entries(contractByBu)) {
    if (contractKwh <= 0) continue;
    const targets = facilities.filter(
      (f) => buOf(f) === bu && !f.isolated && f.gridEf > 0 && !isContractRecord(f) && !isOnsiteSolarRecord(f),
    );
    const loadSum = targets.reduce((s, f) => s + f.annualLoadKwh, 0);
    if (loadSum <= 0) continue;
    for (const f of targets) {
      const share = (f.annualLoadKwh / loadSum) * contractKwh;
      out[f.id] = (out[f.id] ?? 0) + Math.min(f.annualLoadKwh, share);
    }
  }
  return out;
}

/** Total VPPA + I-REC kWh entered (uncapped) — for display. */
export function totalContractKwh(facilities: Facility[]): number {
  return facilities.filter(isContractRecord).reduce((s, f) => s + f.annualLoadKwh, 0);
}

/** Total self-consumed on-site solar kWh entered on Solar onsite records. */
export function onsiteSolarRecordKwh(facilities: Facility[]): number {
  return facilities.filter(isOnsiteSolarRecord).reduce((s, f) => s + f.annualLoadKwh, 0);
}
