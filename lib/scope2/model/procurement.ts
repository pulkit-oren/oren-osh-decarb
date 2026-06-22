/* Pillar 3 — renewable procurement (PPA / green tariff / RECs), portfolio-wide.
   Only the market-based number moves; isolated (captive-grid) facilities never
   receive an allocation, and the RE100 exclusion removes them from the
   denominator entirely (triggering the report footnote). */

import type { ProcurementSettings } from "./types";

export interface FacilityDraw {
  id: string;
  gridDrawKwh: number;
  gridEf: number;
  isolated: boolean;
}

export interface ProcurementResult {
  addressableKwh: number;
  coveredKwh: number;
  coveragePct: number;
  ppaKwh: number;
  greenTariffKwh: number;
  recKwh: number;
  procuredByFacility: Record<string, number>;
  annualCost: number;
  costParts: { ppa: number; greenTariff: number; rec: number };
  footnote: boolean;
}

export function applyProcurement(draws: FacilityDraw[], p: ProcurementSettings): ProcurementResult {
  const totalDraw = draws.reduce((s, d) => s + d.gridDrawKwh, 0);
  const isolatedDraw = draws.filter((d) => d.isolated).reduce((s, d) => s + d.gridDrawKwh, 0);
  const nonIsolatedDraw = totalDraw - isolatedDraw;
  const addressableKwh = p.re100Exclusion ? nonIsolatedDraw : totalDraw;
  const footnote = p.re100Exclusion && isolatedDraw > 0;
  const zero: ProcurementResult = {
    addressableKwh, coveredKwh: 0, coveragePct: 0, ppaKwh: 0, greenTariffKwh: 0, recKwh: 0,
    procuredByFacility: Object.fromEntries(draws.map((d) => [d.id, 0])),
    annualCost: 0, costParts: { ppa: 0, greenTariff: 0, rec: 0 }, footnote,
  };
  if (!p.enabled) return zero;
  const rawSum = p.ppaPct + p.greenTariffPct + p.recPct;
  if (rawSum <= 0) return zero;

  const effectivePct = Math.min(100, rawSum);
  const coveredKwh = Math.min(addressableKwh * (effectivePct / 100), nonIsolatedDraw);
  const share = (pct: number) => pct / rawSum; // instrument mix keeps its ratio when clamped
  const ppaKwh = coveredKwh * share(p.ppaPct);
  const greenTariffKwh = coveredKwh * share(p.greenTariffPct);
  const recKwh = coveredKwh * share(p.recPct);
  const procuredByFacility = Object.fromEntries(
    draws.map((d) => [
      d.id,
      d.isolated || nonIsolatedDraw <= 0 ? 0 : (d.gridDrawKwh / nonIsolatedDraw) * coveredKwh,
    ]),
  );
  const costParts = {
    ppa: ppaKwh * p.ppaStrikeDeltaPerKwh,
    greenTariff: greenTariffKwh * p.greenTariffPremiumPerKwh,
    rec: recKwh * p.recPricePerKwh,
  };
  return {
    addressableKwh, coveredKwh,
    coveragePct: addressableKwh > 0 ? (coveredKwh / addressableKwh) * 100 : 0,
    ppaKwh, greenTariffKwh, recKwh, procuredByFacility,
    annualCost: costParts.ppa + costParts.greenTariff + costParts.rec,
    costParts, footnote,
  };
}
