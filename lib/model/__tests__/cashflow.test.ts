/* Cashflow — capex follows the ramp, opex escalates by price line, and the
   headline numbers (NPV, peak funding, payback year) behave sensibly. */

import { describe, expect, it } from "vitest";
import { buildCashflow, type CashflowLever } from "../cashflow";

const lever = (over: Partial<CashflowLever>): CashflowLever => ({
  id: "x", label: "X", capex: 1_000_000,
  opexParts: [{ label: "saving", amount: -400_000, kind: "fuel" }],
  startYear: 2026, rampYears: 2, ...over,
});

describe("buildCashflow", () => {
  it("capex lands with the ramp increments and sums to the total", () => {
    const cf = buildCashflow([lever({})], 2025, 2032);
    const y26 = cf.rows.find((r) => r.year === 2026)!;
    const y27 = cf.rows.find((r) => r.year === 2027)!;
    expect(y26.capex).toBeCloseTo(500_000, 3); // half the ramp in year 1
    expect(y27.capex).toBeCloseTo(500_000, 3);
    expect(cf.rows.filter((r) => r.capex > 0)).toHaveLength(2);
    expect(cf.totalCapex).toBe(1_000_000);
  });

  it("fuel-line savings escalate faster than flat lines", () => {
    const cf = buildCashflow([lever({ rampYears: 1 })], 2025, 2035, { discountRatePct: 0, fuelEscalationPct: 5, elecEscalationPct: 3 });
    const y26 = cf.rows.find((r) => r.year === 2026)!;
    const y30 = cf.rows.find((r) => r.year === 2030)!;
    // full ramp both years; the 2030 saving is bigger because fuel prices grew
    expect(Math.abs(y30.opexDelta)).toBeGreaterThan(Math.abs(y26.opexDelta));
    expect(y30.opexDelta).toBeCloseTo(-400_000 * Math.pow(1.05, 5), 0);
  });

  it("payback year = when cumulative cash turns non-positive; NPV positive for a saver", () => {
    const cf = buildCashflow([lever({ rampYears: 1 })], 2025, 2040);
    expect(cf.paybackYear).not.toBeNull();
    expect(cf.paybackYear!).toBeLessThanOrEqual(2030); // ~1M ÷ 400k/yr escalating
    expect(cf.npv).toBeGreaterThan(0);
    expect(cf.peakFunding).toBeGreaterThan(0);
    expect(cf.peakFunding).toBeLessThanOrEqual(1_000_000);
  });

  it("a pure cost program never pays back and has negative NPV", () => {
    const cf = buildCashflow(
      [lever({ opexParts: [{ label: "cost", amount: 200_000, kind: "other" }] })],
      2025, 2040,
    );
    expect(cf.paybackYear).toBeNull();
    expect(cf.npv).toBeLessThan(0);
  });
});
