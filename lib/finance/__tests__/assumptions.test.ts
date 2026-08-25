import { describe, expect, it } from "vitest";
import { DEFAULT_FINANCE_ASSUMPTIONS, financeAssumptionsFrom } from "@/lib/finance/assumptions";

describe("financeAssumptionsFrom", () => {
  it("an old save with none of the optional fields gets every default", () => {
    const a = financeAssumptionsFrom({ gridEf: 0.71, renewableSourcingPct: 50, recCostPerTonne: 800, carbonPricePerTonne: 2000, infraCapex: 15_000_000 });
    expect(a).toEqual(DEFAULT_FINANCE_ASSUMPTIONS);
    expect(a.discountRatePct).toBe(10);
    expect(a.fuelEscalationPct).toBe(5);
    expect(a.elecEscalationPct).toBe(3);
    expect(a.otherEscalationPct).toBe(0);
    expect(a.maintenanceShareOfSpendPct).toBe(20);
    expect(a.evMaintenanceRatioPct).toBe(65);
    expect(a.heatPumpMaintenanceRatioPct).toBe(70);
  });

  it("undefined settings resolve to defaults rather than throwing", () => {
    expect(financeAssumptionsFrom(undefined)).toEqual(DEFAULT_FINANCE_ASSUMPTIONS);
  });

  it("explicit values win, including a deliberate zero", () => {
    const a = financeAssumptionsFrom({ discountRatePct: 0, fuelEscalationPct: 0, maintenanceShareOfSpendPct: 35 } as Partial<import("@/lib/model/types").GlobalAssumptions>);
    expect(a.discountRatePct).toBe(0);      // NOT coerced to 10 by `??`-vs-`||` confusion
    expect(a.fuelEscalationPct).toBe(0);
    expect(a.maintenanceShareOfSpendPct).toBe(35);
    expect(a.elecEscalationPct).toBe(3);    // untouched field still defaults
  });
});
