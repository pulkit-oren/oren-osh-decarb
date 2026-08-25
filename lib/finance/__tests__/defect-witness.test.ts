// lib/finance/__tests__/defect-witness.test.ts
import { describe, expect, it } from "vitest";
import { compute } from "@/lib/model";
import { FUELS } from "@/lib/model/factors";
import type { CombustionAsset, LeverSettings } from "@/lib/model/types";
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

  it("F1 FIXED: fuel switch reads as a SAVING, because displaced spend is real", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    const fs = r.levers.find((l) => l.id === "fuelSwitch")!;
    expect(fs.abatementT).toBeGreaterThan(0);          // the lever is doing work
    // Inverted in Task 6. Before the fix this read `toBeGreaterThan(0)` and
    // annualOpexDelta was +181,682,788 — biodiesel at ₹78/L displacing diesel
    // priced at ₹0/L could only ever be a cost.
    expect(fs.annualOpexDelta).toBeLessThan(0);   // was > 0 — a cost — before the fix
    const displaced = fs.opexParts.find((p) => p.label === "Displaced fossil fuel spend")!;
    // Was `toBeCloseTo(0)` — literally -0, because the inline
    // `a.opex / a.annualVolume` divided a zero opex. The reference price now
    // resolves, so real spend comes off.
    expect(displaced.amount).toBeLessThan(0);      // was exactly 0
  });

  it("F4 FIXED: a lever with capex but no abatement reaches totalCapex", () => {
    // Rebuilt per code review (task-1-report.md, Finding 2): the original
    // construction set efficiency.savingPct: 0, which zeroes r.effFraction
    // and skips the `acts.efficiency?.enabled && r.effFraction > 0` guard at
    // lib/model/index.ts:122 entirely — the 1,000,000 never even reached
    // effCapex, so the witness passed for the wrong reason (capex never
    // accrued, not "accrued then discarded by the roll-up filter").
    //
    // This construction isolates the actual mechanism at lib/model/index.ts's
    // `activeLevers = leverRows.filter(l => l.abatementT > 0)` roll-up:
    // a single synthetic STATIONARY asset, annualVolume 0, opex 0 — not the
    // seeded company, whose own electrification abatement would keep the
    // lever alive and mask the filter. electrify.capacityPct: 50 makes
    // `fractionFor` (lib/model/segments.ts) return 0.5 for a stationary
    // asset, which is > 0, so the per-asset loop body IS entered and
    // `electrifyCapexFor` returns assetCapex unconditionally for non-mobile —
    // the 1,000,000 genuinely accrues into elecCapexTotal. Zero volume means
    // the electrification lever's abatementT is 0. assumptions.infraCapex: 0
    // keeps the number clean (line ~236 would otherwise add it on top).
    const asset: CombustionAsset = {
      id: "f4-synthetic",
      name: "F4 synthetic zero-volume asset",
      category: "stationary",
      fuelType: "diesel",
      annualVolume: 0,
      unit: "L",
      opex: 0,
    };
    const settings: LeverSettings = {
      byAsset: {
        "f4-synthetic": {
          electrify: {
            enabled: true,
            unitsToConvert: 0,
            capacityPct: 50,
            cop: 3,
            tariffPerKwh: 9,
            assetCapex: 1_000_000,
            purchaseTiming: "replacement",
            replacementPremiumPct: 40,
            startYear: 2026,
            targetYear: 2032,
          },
          fuelSwitch: {
            enabled: false,
            altFuel: "biodiesel",
            blendPct: 0,
            efficiencyPenaltyPct: 0,
            altFuelPricePerUnit: 0,
            retrofitCapex: 0,
            startYear: 2027,
            targetYear: 2033,
          },
        },
      },
      bySystem: {},
      assumptions: {
        gridEf: 0,
        renewableSourcingPct: 0,
        recCostPerTonne: 0,
        carbonPricePerTonne: 0,
        infraCapex: 0,
      },
    };

    const r = compute([asset], [], settings, 2025);
    const elecLever = r.levers.find((l) => l.id === "electrification")!;

    expect(elecLever.abatementT).toBe(0);          // zero volume → nothing abated
    expect(elecLever.capex).toBe(1_000_000);        // the 1,000,000 DID accrue …
    // … and now SURVIVES the roll-up: the filter selects levers with money
    // attached, not levers with tonnes. Inverted in Task 6.
    expect(r.kpis.totalCapex).toBeGreaterThanOrEqual(1_000_000);  // was 0
  });

  it("F9 FIXED: zero-capex refrigerant lever reports 'no-capital', not 0.0 years", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    const ref = r.levers.find((l) => l.id === "refrigerant")!;
    expect(ref.capex).toBe(0);
    expect(ref.paybackKind).toBe("no-capital");    // was paybackYears === 0
    expect(ref.paybackYears).toBeNull();           // nothing to render as a number
  });
});
