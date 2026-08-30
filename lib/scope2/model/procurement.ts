/* Pillar 3 — renewable procurement (PPA / green tariff / RECs), portfolio-wide.
   Only the market-based number moves; isolated (captive-grid) facilities never
   receive an allocation, and the RE100 exclusion removes them from the
   denominator entirely (triggering the report footnote). */

import { openAccessAdderPerKwh } from "./open-access";
import type { ProcurementSettings } from "./types";

export interface FacilityDraw {
  id: string;
  gridDrawKwh: number;
  gridEf: number;
  isolated: boolean;
  /** This site's grid tariff, INR/kWh — needed to price banking losses, which
   *  are a quantity shortfall bought back at grid rates rather than a charge. */
  tariffPerKwh?: number;
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
  /** The open-access stack charged on the PPA share, INR/yr. Reported
   *  separately from the strike so a user can see what the regulator, rather
   *  than the developer, is charging them. */
  openAccessCost: number;
  /** The all-in stack, INR/kWh, at the load-weighted grid tariff. */
  openAccessAdderPerKwh: number;
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
    annualCost: 0, costParts: { ppa: 0, greenTariff: 0, rec: 0 },
    openAccessCost: 0, openAccessAdderPerKwh: 0, footnote,
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
  // Banking losses are priced at the grid tariff, so the stack needs one:
  // the load-weighted average across the sites the PPA actually serves.
  const servedDraw = draws.filter((d) => !d.isolated).reduce((s, d) => s + d.gridDrawKwh, 0);
  const weightedTariff = servedDraw > 0
    ? draws.filter((d) => !d.isolated)
        .reduce((s, d) => s + (d.tariffPerKwh ?? 0) * d.gridDrawKwh, 0) / servedDraw
    : 0;
  const adder = openAccessAdderPerKwh(p.openAccessCharges, weightedTariff);
  const openAccessCost = ppaKwh * adder;

  const costParts = {
    // The stack rides with the PPA, because it is a cost of the PPA — keeping
    // it out of costParts.ppa would make the instrument look cheaper than the
    // contract a user actually signs.
    ppa: ppaKwh * p.ppaStrikeDeltaPerKwh + openAccessCost,
    greenTariff: greenTariffKwh * p.greenTariffPremiumPerKwh,
    rec: recKwh * p.recPricePerKwh,
  };
  return {
    addressableKwh, coveredKwh,
    coveragePct: addressableKwh > 0 ? (coveredKwh / addressableKwh) * 100 : 0,
    ppaKwh, greenTariffKwh, recKwh, procuredByFacility,
    annualCost: costParts.ppa + costParts.greenTariff + costParts.rec,
    costParts, openAccessCost, openAccessAdderPerKwh: adder, footnote,
  };
}
