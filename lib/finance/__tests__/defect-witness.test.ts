// lib/finance/__tests__/defect-witness.test.ts
import { describe, expect, it } from "vitest";
import { compute } from "@/lib/model";
import { FUELS } from "@/lib/model/factors";
import { seedScope1, sourceNamed } from "./seed-fixture";

describe("defect witnesses — the seeded company, which is what users see", () => {
  it("F1 root cause: every seeded source has zero spend, so every derived price is zero", () => {
    const { combustion } = seedScope1();
    expect(combustion.length).toBeGreaterThan(0);
    for (const a of combustion) expect(a.opex).toBe(0);
    // the divide the model actually performs today
    for (const a of combustion) {
      const derived = a.annualVolume > 0 ? a.opex / a.annualVolume : 0;
      expect(derived).toBe(0);
    }
  });

  it("F1: a reference price exists for every seeded fuel and the model ignores it", () => {
    const { combustion } = seedScope1();
    for (const a of combustion) {
      expect(FUELS[a.fuelType].typicalPricePerUnit).toBeGreaterThan(0);
    }
    const dg = sourceNamed(combustion, "DG Set");
    expect(FUELS[dg.fuelType].typicalPricePerUnit).toBe(92);
    // the spend the reference price implies — the figure the entry screen offers
    expect(dg.annualVolume * 92).toBeCloseTo(880_682_079.6, 1);
  });

  it("F1 consequence: fuel switch reads as a COST because displaced spend is zero", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    const fs = r.levers.find((l) => l.id === "fuelSwitch")!;
    expect(fs.abatementT).toBeGreaterThan(0);          // the lever is doing work
    expect(fs.annualOpexDelta).toBeGreaterThan(0);      // and it costs money — WRONG
    const displaced = fs.opexParts.find((p) => p.label === "Displaced fossil fuel spend")!;
    // toBeCloseTo, not toBe: the computed amount is -0 (unary negation of the
    // +0 that `postEffVolume * fraction * 0` produces), and toBe uses
    // Object.is, which treats -0 !== 0. -0 === 0 under normal numeric
    // equality — this is still the bug, exactly. See task-1-report.md.
    expect(displaced.amount).toBeCloseTo(0);
  });

  it("F4: a lever with capex but no abatement is absent from totalCapex", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    // NOTE: the seeded company already carries electrify assetCapex 1,500,000 on
    // two sources plus infraCapex 15,000,000, so totalCapex is never 0 and
    // asserting a bare threshold here would pass no matter what. The only
    // discriminating assertion is a WITH-vs-WITHOUT comparison.
    const withDeadLever: typeof settings = {
      ...settings,
      byAsset: {
        ...settings.byAsset,
        // efficiency on with capex, but zero saving → capex spent, no tonnes
        "c-6": {
          ...settings.byAsset["c-6"],
          efficiency: { enabled: true, savingPct: 0, capex: 1_000_000, startYear: 2026, targetYear: 2028 },
        },
      },
    };
    const before = compute(combustion, systems, settings, baseYear).kpis.totalCapex;
    const after = compute(combustion, systems, withDeadLever, baseYear);

    expect(after.levers.find((l) => l.id === "efficiency")!.abatementT).toBe(0);
    expect(before).toBeGreaterThan(0);              // guards against a vacuous pass
    expect(after.kpis.totalCapex).toBe(before);      // the 1,000,000 vanished — WRONG
  });

  it("F9: zero-capex refrigerant lever renders payback as 0.0 years, not as 'no capital'", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    const ref = r.levers.find((l) => l.id === "refrigerant")!;
    expect(ref.capex).toBe(0);
    expect(ref.paybackYears).toBe(0);    // reads as a computed result; it is not
  });
});
