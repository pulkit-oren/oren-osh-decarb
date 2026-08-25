import { describe, expect, it } from "vitest";
import { DEFAULT_FINANCE_ASSUMPTIONS } from "@/lib/finance/assumptions";
import { buildLeverSeries } from "@/lib/finance/series";
import type { LeverInput } from "@/lib/finance/types";

const flat = { ...DEFAULT_FINANCE_ASSUMPTIONS, discountRatePct: 0, fuelEscalationPct: 0, elecEscalationPct: 0, otherEscalationPct: 0 };

const lever = (over: Partial<LeverInput> = {}): LeverInput => ({
  id: "x", capex: 1000, opexParts: [{ label: "saving", amount: -100, kind: "fuel" }],
  fullAbatementT: 10, startYear: 2026, rampYears: 1, assetLifeYears: 5, ...over,
});

describe("buildLeverSeries", () => {
  it("spans the whole window: first install to the last tranche's end of life", () => {
    const rows = buildLeverSeries(lever({ startYear: 2026, rampYears: 3, assetLifeYears: 5 }), 2025, flat);
    // installs 2026..2028, the 2028 tranche lives to 2032
    expect(rows[0].year).toBe(2026);
    expect(rows[rows.length - 1].year).toBe(2032);
  });

  it("capex increments sum to exactly the capex — invariant 5", () => {
    const rows = buildLeverSeries(lever({ capex: 900, rampYears: 3 }), 2025, flat);
    expect(rows.reduce((s, r) => s + r.capex, 0)).toBeCloseTo(900, 9);
  });

  it("undiscounted tonnes equal fullAbatementT × (W − (R−1)/2) — invariant 6", () => {
    const R = 4, life = 5;
    const rows = buildLeverSeries(lever({ rampYears: R, startYear: 2026, assetLifeYears: life, fullAbatementT: 10 }), 2025, flat);
    const W = rows.length;
    const tonnes = rows.reduce((s, r) => s + r.tonnes, 0);
    expect(tonnes).toBeCloseTo(10 * (W - (R - 1) / 2), 9);
  });

  it("a one-year ramp reduces invariant 6 to fullAbatementT × W", () => {
    const rows = buildLeverSeries(lever({ rampYears: 1, fullAbatementT: 7 }), 2025, flat);
    expect(rows.reduce((s, r) => s + r.tonnes, 0)).toBeCloseTo(7 * rows.length, 9);
  });

  it("escalation compounds from the BASE year, not the lever's start year", () => {
    const a = { ...flat, fuelEscalationPct: 10 };
    const rows = buildLeverSeries(lever({ startYear: 2028, rampYears: 1, opexParts: [{ label: "f", amount: 100, kind: "fuel" }] }), 2025, a);
    // 2028 is 3 years after the 2025 base year → 1.1^3
    expect(rows[0].opexDelta).toBeCloseTo(100 * Math.pow(1.1, 3), 9);
  });

  it("discount factors are relative to the base year", () => {
    const rows = buildLeverSeries(lever({ startYear: 2027, rampYears: 1 }), 2025, { ...flat, discountRatePct: 10 });
    expect(rows[0].discount).toBeCloseTo(1 / Math.pow(1.1, 2), 12);
  });

  it("each opex kind uses its own escalation line", () => {
    const a = { ...flat, fuelEscalationPct: 10, elecEscalationPct: 0, otherEscalationPct: 0 };
    const rows = buildLeverSeries(lever({
      startYear: 2025, rampYears: 1, assetLifeYears: 2,
      opexParts: [{ label: "f", amount: 100, kind: "fuel" }, { label: "e", amount: 100, kind: "elec" }, { label: "o", amount: 100, kind: "other" }],
    }), 2025, a);
    expect(rows[1].opexDelta).toBeCloseTo(100 * 1.1 + 100 + 100, 9);
  });
});
