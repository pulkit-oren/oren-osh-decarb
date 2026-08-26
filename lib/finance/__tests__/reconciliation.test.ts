// lib/finance/__tests__/reconciliation.test.ts
import { describe, expect, it } from "vitest";
import { compute } from "@/lib/model";
import {
  buildLeverSeries, financeAssumptionsFrom, leverMetrics, programmeMetrics, S1_LIFETIME_YEARS,
} from "@/lib/finance";
import { PRE_CHANGE_BASE_TOTAL_T, PRE_CHANGE_TOTAL_ABATEMENT_T, seedScope1 } from "./seed-fixture";

const costed = (l: { capex: number; opexParts: { amount: number }[] }) =>
  l.capex > 0 || l.opexParts.some((p) => p.amount !== 0);

describe("one engine, one answer", () => {
  it("the model's currency-per-tonne equals the engine's, recomputed independently", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    const fa = financeAssumptionsFrom(settings.assumptions);

    // Rebuilt from the PUBLIC inputs only — capex, opexParts, ramp — not from
    // the series compute() already built. If a consumer were still doing its
    // own arithmetic somewhere, these two numbers would part company.
    const rebuilt = r.levers.filter(costed).map((l) => buildLeverSeries(
      {
        // netAbatementT, not abatementT. Electrification buys RECs for the grid
        // load it adds, so the money is divided by tonnes net of that load; the
        // two are equal on every other lever. This test is what caught the
        // change — it rebuilds the denominator from the public field, so using
        // the wrong one parts the two numbers by Rs 472/t here.
        id: l.id, capex: l.capex, opexParts: l.opexParts, fullAbatementT: l.netAbatementT,
        startYear: l.startYear, rampYears: l.rampYears, assetLifeYears: S1_LIFETIME_YEARS[l.id],
      },
      baseYear, fa,
    ));

    expect(rebuilt.length).toBeGreaterThan(0);   // not vacuous over an empty list
    expect(programmeMetrics(rebuilt).levelisedCostPerTonne).toBeCloseTo(r.kpis.costPerTonne, 6);
  });

  it("each lever's own currency-per-tonne and payback agree with its series", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    let checked = 0;
    for (const l of r.levers) {
      if (!costed(l)) continue;
      const m = leverMetrics(l.series, l.capex);
      expect(l.levelisedCostPerTonne).toBeCloseTo(m.levelisedCostPerTonne, 6);
      expect(l.paybackYears).toBe(m.paybackYears);
      expect(l.paybackKind).toBe(m.paybackKind);
      checked++;
    }
    expect(checked, "no costed lever was checked; this test proved nothing").toBeGreaterThan(0);
  });

  it("costPerTonne is exactly the levelised alias, on every lever", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    for (const l of r.levers) expect(l.costPerTonne).toBe(l.levelisedCostPerTonne);
  });

  it("TONNAGE GUARD: the finance rework changed no physics", () => {
    // Captured in Task 1 (commit 0ed31ca) against the UNMODIFIED engine, which
    // is the only ordering in which these function as a guard rather than a
    // rubber stamp. A failure here means the finance work moved physics: that
    // is a stop-and-report, not an expectation to update.
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    expect(r.baseTotalT).toBeCloseTo(PRE_CHANGE_BASE_TOTAL_T, 6);
    expect(r.levers.reduce((s, l) => s + l.abatementT, 0)).toBeCloseTo(PRE_CHANGE_TOTAL_ABATEMENT_T, 6);
  });
});
