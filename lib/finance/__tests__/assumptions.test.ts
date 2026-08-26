import { describe, expect, it } from "vitest";
import { recCostPerTonneFrom } from "@/lib/finance/assumptions";
import { DEFAULT_FINANCE_ASSUMPTIONS, financeAssumptionsFrom } from "@/lib/finance/assumptions";
import { buildLeverSeries } from "@/lib/finance/series";
import { leverMetrics } from "@/lib/finance/metrics";

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

describe("rate floor: -100% is a division by zero, and must not reach a user", () => {
  // The WACC field is a free-text number input. `min` on it blocks the spinner,
  // not typing, so -100 was reachable and the KPI card read "Rs Infinity Cr".
  it("a rate at or below -100 is floored, not passed through", () => {
    const a = financeAssumptionsFrom({ discountRatePct: -100, fuelEscalationPct: -250 } as Partial<import("@/lib/model/types").GlobalAssumptions>);
    expect(a.discountRatePct).toBeGreaterThan(-100);
    expect(a.fuelEscalationPct).toBeGreaterThan(-100);
  });

  it("a legitimate negative rate is NOT clamped to zero", () => {
    // Deflation is a real input. The floor exists to keep the arithmetic
    // finite, not to forbid negative rates.
    const a = financeAssumptionsFrom({ discountRatePct: -3, elecEscalationPct: -1.5 } as Partial<import("@/lib/model/types").GlobalAssumptions>);
    expect(a.discountRatePct).toBe(-3);
    expect(a.elecEscalationPct).toBe(-1.5);
  });

  it("NaN resolves to 0 rather than poisoning every downstream figure", () => {
    const a = financeAssumptionsFrom({ discountRatePct: Number.NaN } as Partial<import("@/lib/model/types").GlobalAssumptions>);
    expect(a.discountRatePct).toBe(0);
  });

  it("the floored rate keeps the whole series and its NPV finite", () => {
    // The end-to-end claim. Without the floor every discount factor is
    // Infinity and npv is Infinity, which is what the card rendered.
    const a = financeAssumptionsFrom({ discountRatePct: -100 } as Partial<import("@/lib/model/types").GlobalAssumptions>);
    const rows = buildLeverSeries(
      { id: "x", capex: 1000, opexParts: [{ label: "s", amount: -100, kind: "fuel" }],
        fullAbatementT: 10, startYear: 2026, rampYears: 1, assetLifeYears: 5 },
      2026, a);
    expect(rows.every((r) => Number.isFinite(r.discount))).toBe(true);
    const m = leverMetrics(rows, 1000);
    expect(Number.isFinite(m.npv)).toBe(true);
    expect(Number.isFinite(m.levelisedCostPerTonne)).toBe(true);
  });
});

describe("one certificate, one price", () => {
  it("Rs/t is derived from Rs/kWh and the grid factor, not typed separately", () => {
    // Rs 0.45/kWh at 0.71 kgCO2e/kWh = Rs 634/tCO2e. The retired
    // recCostPerTonne field said Rs 800 — 26% apart, for the same instrument.
    expect(recCostPerTonneFrom(0.45, 0.71)).toBeCloseTo(633.8028169, 6);
  });

  it("halving the price halves the Rs/t; halving the grid factor doubles it", () => {
    expect(recCostPerTonneFrom(0.225, 0.71)).toBeCloseTo(recCostPerTonneFrom(0.45, 0.71) / 2, 6);
    expect(recCostPerTonneFrom(0.45, 0.355)).toBeCloseTo(recCostPerTonneFrom(0.45, 0.71) * 2, 6);
  });

  it("a zero or absent grid factor gives 0, not Infinity", () => {
    // The charge it multiplies is also 0, but Infinity x 0 is NaN, and a NaN
    // reaching a KPI card is the failure this guards.
    for (const ef of [0, -1, Number.NaN]) {
      expect(recCostPerTonneFrom(0.45, ef)).toBe(0);
    }
    expect(Number.isFinite(recCostPerTonneFrom(Number.NaN, 0.71))).toBe(true);
  });

  it("the retired recCostPerTonne field is accepted and ignored", () => {
    // Old saves still carry it. Reading it again is how the drift comes back.
    const a = financeAssumptionsFrom({ recCostPerTonne: 5000 } as Partial<import("@/lib/model/types").GlobalAssumptions>);
    expect(a.recPricePerKwh).toBe(0.45);
  });

  it("an explicit price wins, including a deliberate zero", () => {
    expect(financeAssumptionsFrom({ recPricePerKwh: 0 } as Partial<import("@/lib/model/types").GlobalAssumptions>).recPricePerKwh).toBe(0);
    expect(financeAssumptionsFrom({ recPricePerKwh: 1.2 } as Partial<import("@/lib/model/types").GlobalAssumptions>).recPricePerKwh).toBe(1.2);
  });
});
