import type { GlobalAssumptions } from "@/lib/model/types";

export interface FinanceAssumptions {
  /** WACC. Discounts both cost and tonnes, always to the model's base year. */
  discountRatePct: number;
  fuelEscalationPct: number;
  elecEscalationPct: number;
  /** Was a silent zero inside the old cashflow module. Now explicit and printable. */
  otherEscalationPct: number;
  /** Share of an annual bill that is maintenance; fuel is the rest. */
  maintenanceShareOfSpendPct: number;
  /** EV maintenance as a share of the ICE maintenance it replaces. */
  evMaintenanceRatioPct: number;
  /** Heat-pump / electric-boiler maintenance as a share of the plant it
   *  replaces. Previously implied to be 0%, which made stationary
   *  electrification look free to run. */
  heatPumpMaintenanceRatioPct: number;
  /** Certificate price in Rs/kWh — the ONE place either scope reads it from. */
  recPricePerKwh: number;
}

/** Certificate price per tonne, derived from the per-kWh price and the grid
 *  factor rather than typed separately. `gridEfKgPerKwh` is kgCO2e/kWh, so
 *  Rs/kWh x 1000 / (kg/kWh) lands in Rs/tonne: at Rs 0.45 and 0.71 kg/kWh that
 *  is Rs 634/t, not the Rs 800/t that used to sit in a second field.
 *
 *  A grid factor of 0 has no tonnes to certify, so the rate is 0 rather than
 *  Infinity — the charge it multiplies is also 0, but Infinity x 0 is NaN and
 *  NaN reaching a KPI card is the failure this guards. */
export function recCostPerTonneFrom(recPricePerKwh: number, gridEfKgPerKwh: number): number {
  if (!(gridEfKgPerKwh > 0) || !Number.isFinite(recPricePerKwh)) return 0;
  return (recPricePerKwh * 1000) / gridEfKgPerKwh;
}

export const DEFAULT_FINANCE_ASSUMPTIONS: FinanceAssumptions = {
  discountRatePct: 10,
  fuelEscalationPct: 5,
  elecEscalationPct: 3,
  otherEscalationPct: 0,
  maintenanceShareOfSpendPct: 20,
  evMaintenanceRatioPct: 65,
  heatPumpMaintenanceRatioPct: 70,
  recPricePerKwh: 0.45,
};

/** Lowest rate the arithmetic survives. Every rate enters as `1 + r/100`, so
 *  -100 is a division by zero and anything below it alternates sign with the
 *  exponent. The number fields these come from are free-text: `min` on the
 *  input blocks the spinner, not typing, so the floor has to live where the
 *  value is READ. -99.99 keeps the discount factor finite and absurd, which is
 *  the honest rendering of an absurd input — Infinity is not. */
const RATE_FLOOR_PCT = -99.99;
const floored = (v: number): number => (Number.isFinite(v) ? Math.max(RATE_FLOOR_PCT, v) : 0);

/** `??` not `||` throughout: a user who sets a rate to 0 means 0. */
export function financeAssumptionsFrom(g: Partial<GlobalAssumptions> | undefined): FinanceAssumptions {
  const d = DEFAULT_FINANCE_ASSUMPTIONS;
  return {
    discountRatePct: floored(g?.discountRatePct ?? d.discountRatePct),
    fuelEscalationPct: floored(g?.fuelEscalationPct ?? d.fuelEscalationPct),
    elecEscalationPct: floored(g?.elecEscalationPct ?? d.elecEscalationPct),
    otherEscalationPct: floored(g?.otherEscalationPct ?? d.otherEscalationPct),
    maintenanceShareOfSpendPct: g?.maintenanceShareOfSpendPct ?? d.maintenanceShareOfSpendPct,
    evMaintenanceRatioPct: g?.evMaintenanceRatioPct ?? d.evMaintenanceRatioPct,
    heatPumpMaintenanceRatioPct: g?.heatPumpMaintenanceRatioPct ?? d.heatPumpMaintenanceRatioPct,
    recPricePerKwh: g?.recPricePerKwh ?? d.recPricePerKwh,
  };
}
