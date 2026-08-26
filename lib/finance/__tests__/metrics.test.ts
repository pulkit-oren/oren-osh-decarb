import { describe, expect, it } from "vitest";
import { DEFAULT_FINANCE_ASSUMPTIONS } from "@/lib/finance/assumptions";
import { leverMetrics, programmeMetrics } from "@/lib/finance/metrics";
import { buildLeverSeries } from "@/lib/finance/series";
import type { LeverInput } from "@/lib/finance/types";

const flat = { ...DEFAULT_FINANCE_ASSUMPTIONS, discountRatePct: 0, fuelEscalationPct: 0, elecEscalationPct: 0, otherEscalationPct: 0 };
const lever = (over: Partial<LeverInput> = {}): LeverInput => ({
  id: "x", capex: 1000, opexParts: [{ label: "saving", amount: -100, kind: "fuel" }],
  fullAbatementT: 10, startYear: 2026, rampYears: 1, assetLifeYears: 5, ...over,
});

describe("leverMetrics", () => {
  it("with no discounting, ₹/t is plain undiscounted cost ÷ tonnes — invariant 4", () => {
    const rows = buildLeverSeries(lever(), 2026, flat);
    const m = leverMetrics(rows, 1000);
    const cost = rows.reduce((s, r) => s + r.net, 0);
    const tonnes = rows.reduce((s, r) => s + r.tonnes, 0);
    expect(m.levelisedCostPerTonne).toBeCloseTo(cost / tonnes, 9);
  });

  it("a pure saving with zero capex levelises NEGATIVE — invariant 2", () => {
    const rows = buildLeverSeries(lever({ capex: 0 }), 2026, flat);
    expect(leverMetrics(rows, 0).levelisedCostPerTonne).toBeLessThan(0);
  });

  it("no capital at risk reports no-capital, and payback is null not zero — F9", () => {
    const rows = buildLeverSeries(lever({ capex: 0 }), 2026, flat);
    const m = leverMetrics(rows, 0);
    expect(m.paybackKind).toBe("no-capital");
    expect(m.paybackYears).toBeNull();
  });

  it("capex recovered by savings gives a discounted payback in years from the start", () => {
    // Window 2026..2030 (life 5, ramp 1). Cumulative, undiscounted at 0%:
    //   2026: +1000 capex −400 saving = +600  → cum  600
    //   2027:              −400        → cum  200
    //   2028:              −400        → cum −200  ← first non-positive
    // payback is measured in years FROM the first row: 2028 − 2026 = 2.
    const rows = buildLeverSeries(lever({ capex: 1000, opexParts: [{ label: "s", amount: -400, kind: "fuel" }] }), 2026, flat);
    const m = leverMetrics(rows, 1000);
    expect(m.paybackKind).toBe("discounted");
    expect(m.paybackYears).toBe(2);
  });

  it("a lever that never repays reports never, with a null payback", () => {
    const rows = buildLeverSeries(lever({ capex: 1000, opexParts: [{ label: "c", amount: 50, kind: "fuel" }] }), 2026, flat);
    const m = leverMetrics(rows, 1000);
    expect(m.paybackKind).toBe("never");
    expect(m.paybackYears).toBeNull();
  });

  it("zero abatement yields Infinity ₹/t, and the capex is still reported — F4", () => {
    const rows = buildLeverSeries(lever({ fullAbatementT: 0, capex: 5000 }), 2026, flat);
    const m = leverMetrics(rows, 5000);
    expect(m.levelisedCostPerTonne).toBe(Infinity);
    expect(m.totalCapex).toBe(5000);
  });

  it("peak funding is the worst UNdiscounted cumulative position", () => {
    const rows = buildLeverSeries(lever({ capex: 1000, opexParts: [{ label: "s", amount: -400, kind: "fuel" }] }), 2026, flat);
    expect(leverMetrics(rows, 1000).peakFunding).toBeCloseTo(600, 9); // 1000 spent, 400 back in year one
  });

  it("all three headline metrics move when the series moves — invariant 3", () => {
    const base = leverMetrics(buildLeverSeries(lever(), 2026, flat), 1000);
    const worse = leverMetrics(buildLeverSeries(lever({ capex: 4000 }), 2026, flat), 4000);
    expect(worse.levelisedCostPerTonne).not.toBeCloseTo(base.levelisedCostPerTonne, 6);
    expect(worse.npv).not.toBeCloseTo(base.npv, 6);
    expect(worse.peakFunding).not.toBeCloseTo(base.peakFunding, 6);
  });
});

describe("programmeMetrics", () => {
  it("is Σcost ÷ Σtonnes across levers, NOT the mean of their ₹/t", () => {
    const cheapBig = buildLeverSeries(lever({ id: "a", capex: 100, fullAbatementT: 1000, opexParts: [] }), 2026, flat);
    const dearSmall = buildLeverSeries(lever({ id: "b", capex: 9000, fullAbatementT: 1, opexParts: [] }), 2026, flat);
    const p = programmeMetrics([cheapBig, dearSmall]);

    const cost = [...cheapBig, ...dearSmall].reduce((s, r) => s + r.net * r.discount, 0);
    const tonnes = [...cheapBig, ...dearSmall].reduce((s, r) => s + r.tonnes * r.discount, 0);
    expect(p.levelisedCostPerTonne).toBeCloseTo(cost / tonnes, 9);

    const mean = (leverMetrics(cheapBig, 100).levelisedCostPerTonne + leverMetrics(dearSmall, 9000).levelisedCostPerTonne) / 2;
    expect(p.levelisedCostPerTonne).not.toBeCloseTo(mean, 3); // the bug this guards
  });

  it("totals capex across every lever, including zero-abatement ones — F4", () => {
    const dead = buildLeverSeries(lever({ id: "d", capex: 2000, fullAbatementT: 0, opexParts: [] }), 2026, flat);
    const live = buildLeverSeries(lever({ id: "l", capex: 1000, fullAbatementT: 10, opexParts: [] }), 2026, flat);
    expect(programmeMetrics([dead, live]).totalCapex).toBeCloseTo(3000, 6);
  });

  it("throws when levers were built against different baseYears — mismatched discount factors on a shared year", () => {
    const discounted = { ...flat, discountRatePct: 10 };
    const seriesA = buildLeverSeries(lever({ id: "a" }), 2026, discounted);
    const seriesB = buildLeverSeries(lever({ id: "b" }), 2020, discounted); // different baseYear
    expect(() => programmeMetrics([seriesA, seriesB])).toThrow(
      /different discount factors/
    );
  });
});

// Added after a mutation review found that this file tests the plumbing at ZERO
// PRESSURE: the `flat` fixture above sets discountRatePct: 0, so every value
// assertion here ran where discounted and undiscounted cash are numerically
// identical. Discounting — the thing this module is named for — was pinned only
// in series.test.ts where the factor is PRODUCED, never here where it is
// CONSUMED. Four mutations lived in that gap and left the whole suite green.
const disc = { ...DEFAULT_FINANCE_ASSUMPTIONS, discountRatePct: 10, fuelEscalationPct: 0, elecEscalationPct: 0, otherEscalationPct: 0 };

describe("leverMetrics under a NON-ZERO discount rate", () => {
  it("peak funding is real cash — it must NOT be discounted", () => {
    // baseYear must be BEFORE startYear, or the first row's factor is 1 and the
    // distinction hides again exactly as it did before.
    const rows = buildLeverSeries(
      lever({ startYear: 2026, capex: 1000, opexParts: [{ label: "s", amount: -400, kind: "fuel" }] }),
      2025, disc);
    expect(rows[0].discount).toBeLessThan(1);          // the distinction is live
    expect(leverMetrics(rows, 1000).peakFunding).toBeCloseTo(600, 9);
  });

  it("the levelised DENOMINATOR is discounted tonnes, not raw tonnes", () => {
    const rows = buildLeverSeries(lever({ capex: 1000 }), 2025, disc);
    const dCost = rows.reduce((s, r) => s + r.net * r.discount, 0);
    const dT = rows.reduce((s, r) => s + r.tonnes * r.discount, 0);
    const rawT = rows.reduce((s, r) => s + r.tonnes, 0);
    expect(dT).toBeLessThan(rawT * 0.95);             // the two are far apart
    expect(leverMetrics(rows, 1000).levelisedCostPerTonne).toBeCloseTo(dCost / dT, 9);
  });

  it("a net-cost lever has a NEGATIVE npv, and its magnitude is pinned", () => {
    // Sign was untested anywhere: `npv: -discCost` could be flipped to
    // `discCost` and every test still passed, because the only npv assertions
    // were "it moved".
    const rows = buildLeverSeries(
      lever({ capex: 1000, opexParts: [{ label: "c", amount: 50, kind: "fuel" }] }), 2026, flat);
    const discCost = rows.reduce((s, r) => s + r.net * r.discount, 0);
    expect(discCost).toBeGreaterThan(0);              // it really is a net cost
    expect(leverMetrics(rows, 1000).npv).toBeCloseTo(-discCost, 9);
    expect(leverMetrics(rows, 1000).npv).toBeLessThan(0);
  });

  it("a pure-saving lever has a POSITIVE npv", () => {
    const rows = buildLeverSeries(
      lever({ capex: 0, opexParts: [{ label: "s", amount: -100, kind: "fuel" }] }), 2026, flat);
    expect(leverMetrics(rows, 0).npv).toBeGreaterThan(0);
  });
});

describe("programmeMetrics merges by CALENDAR YEAR, not by concatenation", () => {
  it("peak funding sees two levers spending in the same year", () => {
    // This is the entire reason programmeMetrics takes a second pass over a
    // year-merged array. Replacing `pbSource` with the concatenated metrics
    // changed nothing in the suite, so the merge and its discount guard were
    // unobserved. Two identical levers starting together: concatenated the
    // worst position is one lever's 2,200; by calendar year both spend at once
    // and the real requirement is 3,400.
    const mk = (id: string) => buildLeverSeries(
      { id, capex: 2000, opexParts: [{ label: "s", amount: -300, kind: "fuel" }],
        fullAbatementT: 10, startYear: 2026, rampYears: 1, assetLifeYears: 5 },
      2026, flat);
    const p = programmeMetrics([mk("a"), mk("b")]);
    expect(p.peakFunding).toBeCloseTo(3400, 6);
    expect(p.totalCapex).toBeCloseTo(4000, 6);
  });
});
