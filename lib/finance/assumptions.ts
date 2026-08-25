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
}

export const DEFAULT_FINANCE_ASSUMPTIONS: FinanceAssumptions = {
  discountRatePct: 10,
  fuelEscalationPct: 5,
  elecEscalationPct: 3,
  otherEscalationPct: 0,
  maintenanceShareOfSpendPct: 20,
  evMaintenanceRatioPct: 65,
  heatPumpMaintenanceRatioPct: 70,
};

/** `??` not `||` throughout: a user who sets a rate to 0 means 0. */
export function financeAssumptionsFrom(g: Partial<GlobalAssumptions> | undefined): FinanceAssumptions {
  const d = DEFAULT_FINANCE_ASSUMPTIONS;
  return {
    discountRatePct: g?.discountRatePct ?? d.discountRatePct,
    fuelEscalationPct: g?.fuelEscalationPct ?? d.fuelEscalationPct,
    elecEscalationPct: g?.elecEscalationPct ?? d.elecEscalationPct,
    otherEscalationPct: g?.otherEscalationPct ?? d.otherEscalationPct,
    maintenanceShareOfSpendPct: g?.maintenanceShareOfSpendPct ?? d.maintenanceShareOfSpendPct,
    evMaintenanceRatioPct: g?.evMaintenanceRatioPct ?? d.evMaintenanceRatioPct,
    heatPumpMaintenanceRatioPct: g?.heatPumpMaintenanceRatioPct ?? d.heatPumpMaintenanceRatioPct,
  };
}
