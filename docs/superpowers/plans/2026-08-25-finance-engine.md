# Finance Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace three drifting money implementations with one auditable levelised-cost engine, and fix the eleven defects that make every rupee figure in the deployed app wrong.

**Architecture:** A new pure module `lib/finance/` owns price resolution, the fuel/maintenance split, asset lifetimes, the year-by-year series, and every derived metric. Scope 1, Scope 2 and the goals initiatives become consumers that do no money arithmetic of their own. Levelised cost over each lever's own asset life replaces the annuity-vs-cashflow split, so ₹/t, payback and NPV all come off one series and cannot disagree.

**Tech Stack:** TypeScript, Next.js 16 (Turbopack), Vitest, Tailwind. Path alias `@/` → repo root.

**Spec:** `docs/superpowers/specs/2026-08-25-finance-engine-design.md` — binding authority. Read it before Task 1; every ruling below argues from it.

## Global Constraints

- **Gate for every task:** `npx tsc --noEmit && npm test && npm run lint && npm run build`
- **Lint ceiling:** 3 errors / 28 warnings. Not higher. This is the branch baseline, not the 22 an older plan quoted.
- **Frozen test files — never edit:** `components/tabs/__tests__/activity-data.test.tsx`, `components/tabs/__tests__/empty-field-guards.test.tsx`
- **`lib/finance/` is pure.** Same inputs → same output. No `Date.now()`, no randomness, no imports from UI or store. Imports from `lib/model/` are `type`-only, with **one named exception**: `prices.ts` imports the `FUELS` table from `lib/model/factors` as a value. That table is reference data, not logic, and copying it into `lib/finance` would create exactly the second source of truth this change exists to remove. No other value import from `lib/model` is permitted — if you want one, the dependency is pointing the wrong way.
- **Do not edit `lib/company/seed.ts`.** Its `opex: 0` shape is the fixture that exercises the reference-price path. Making numbers appear by editing the seed defeats the entire exercise.
- **Physics is out of scope.** Emission factors, energy balance and abatement tonnage must not change. Task 10 asserts tonnage is identical before and after.
- **Every new test records its killing mutation** in the task report — the edit that makes it fail. A test with no recorded mutation is not done.
- **Reference price anchor:** diesel `typicalPricePerUnit` is 92 ₹/L. DG Set's 9,572,631.3 L × 92 = **880,682,079.6**. This number appears in several tasks; it is the same number the entry screen offers as "≈ ₹88.07 Cr".

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `lib/finance/types.ts` | `OpexPart`, `PriceBasis`, `ResolvedPrice`, `SpendSplit`, `LeverInput`, `SeriesRow`, `LeverMetrics`. Types only, no logic — this is what lets `lib/model` import from finance without a cycle. |
| `lib/finance/assumptions.ts` | `FinanceAssumptions`, defaults, and resolution from `GlobalAssumptions`. |
| `lib/finance/prices.ts` | `resolvePrice`, `splitSpend`, `resolveFuelSpend`. The only place a price is derived. |
| `lib/finance/lifetimes.ts` | `S1_LIFETIME_YEARS`, `S2_LIFETIME_YEARS`, `windowFor`. |
| `lib/finance/series.ts` | `buildLeverSeries` — the one year-by-year series. |
| `lib/finance/metrics.ts` | `leverMetrics`, `programmeMetrics`. |
| `lib/finance/index.ts` | Public surface. Consumers import only from here. |
| `lib/finance/__tests__/seed-fixture.ts` | Parses `SEED_ENTRIES` into a Scope 1 fixture. Shared by the characterisation tests. |

**Modified:** `lib/model/index.ts`, `lib/model/finance.ts`, `lib/model/types.ts`, `lib/scope2/model/index.ts`, `lib/goals/initiatives-auto.ts`, `lib/export.ts`.

**Deleted:** `lib/model/cashflow.ts` (superseded by `series.ts` + `metrics.ts`) and its test, after Task 5 ports the coverage.

---

## Task 1: Prove all eleven defects are real, against the seeded company

**Files:**
- Create: `lib/finance/__tests__/seed-fixture.ts`
- Test: `lib/finance/__tests__/defect-witness.test.ts`

**Interfaces:**
- Consumes: `SEED_ENTRIES` from `@/lib/company/seed`; `migrateEquipment`, `resolveEquipment`; `compute` from `@/lib/model`.
- Produces: `seedScope1()` → `{ combustion, systems, settings, baseYear }`, used by Tasks 6–10.

This task writes **no production code**. It produces evidence. Every assertion here pins the *current, wrong* behaviour so the fix has something to flip. A defect nobody reproduced is a defect nobody has.

- [ ] **Step 1: Build the seed fixture**

```ts
// lib/finance/__tests__/seed-fixture.ts
import { SEED_ENTRIES } from "@/lib/company/seed";
import { migrateEquipment } from "@/lib/equipment/migrate";
import { resolveEquipment } from "@/lib/equipment/resolve";
import type { CombustionAsset, LeverSettings, RefrigerationSystem } from "@/lib/model/types";

const PLANNER_KEY = "osh-scope1-planner-v4::c-1";

/** The Scope 1 planner state the deployed app actually loads, migrated and
 *  resolved exactly as ScenarioProvider does on hydrate. Legacy-shaped at rest
 *  (no `equipment` key), which is the point: this is the real upgrade path. */
export function seedScope1(): {
  raw: CombustionAsset[];
  combustion: CombustionAsset[];
  systems: RefrigerationSystem[];
  settings: LeverSettings;
  baseYear: number;
} {
  const blob = JSON.parse(SEED_ENTRIES[PLANNER_KEY]);
  const migrated = migrateEquipment(blob.combustion);
  const raw = migrated[blob.baseYear] ?? [];
  return {
    raw,
    combustion: resolveEquipment(raw),
    systems: blob.refrigeration[String(blob.baseYear)] ?? [],
    settings: blob.settings,
    baseYear: blob.baseYear,
  };
}

export const sourceNamed = (rows: CombustionAsset[], name: string): CombustionAsset => {
  const hit = rows.find((r) => r.name === name);
  if (!hit) throw new Error(`no source named ${name}; have ${rows.map((r) => r.name).join(", ")}`);
  return hit;
};
```

- [ ] **Step 2: Write the witness test**

```ts
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
    expect(displaced.amount).toBe(0);                   // this is the bug, exactly
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
```

- [ ] **Step 3: Run it and confirm every witness passes**

Run: `npx vitest run lib/finance/__tests__/defect-witness.test.ts`
Expected: **PASS** — all five. These assert the broken behaviour, so passing is the evidence.

If any assertion fails, **stop and report**. A failing witness means the defect is not what the spec says it is, and the spec is then wrong. Do not adjust the test to make it pass.

- [ ] **Step 4: Record the observed numbers**

Write the actual values of `fs.annualOpexDelta`, `fs.abatementT` and `r.kpis.costPerTonne` into the task report. Tasks 6 and 10 flip these, and the report is the before-picture.

- [ ] **Step 5: Capture the tonnage snapshot — this MUST happen before any engine change**

The tonnage guard in Task 10 is only a guard if its expected values were captured
**before** the finance rework. Taken afterwards it would simply agree with
whatever the changed code produces, which proves nothing.

Add a throwaway test that prints the numbers:

```ts
  it("PRINTS the pre-change tonnage snapshot", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    console.log("SNAPSHOT baseTotalT =", r.baseTotalT);
    console.log("SNAPSHOT totalAbatementT =", r.levers.reduce((s, l) => s + l.abatementT, 0));
    expect(r.baseTotalT).toBeGreaterThan(0);
  });
```

Run it, then write the two printed values into the fixture as real constants:

```ts
// lib/finance/__tests__/seed-fixture.ts — append
/** Captured 2026-08-25 from the seeded company BEFORE the finance rework.
 *  The finance engine must not move physics; Task 10 asserts against these.
 *  If a later change legitimately moves tonnage, that is a separate decision
 *  and these constants get updated in that change, with a reason. */
export const PRE_CHANGE_BASE_TOTAL_T = /* printed value */ 0;
export const PRE_CHANGE_TOTAL_ABATEMENT_T = /* printed value */ 0;
```

Replace both `0`s with the printed values and delete the throwaway test. Leaving
either at `0` fails this task.

- [ ] **Step 6: Commit**

```bash
git add lib/finance/__tests__/seed-fixture.ts lib/finance/__tests__/defect-witness.test.ts
git commit -m "test(finance): witness all eleven defects against the seeded company

The suite's 619 tests use lib/defaults.ts, which carries real spend. The
seeded company the app loads carries opex:0 on all seven sources, so the
finance layer is only wrong on data a user actually sees. These tests pin
the wrong behaviour so the fix has something to flip."
```

---

## Task 2: Finance types and assumptions

**Files:**
- Create: `lib/finance/types.ts`, `lib/finance/assumptions.ts`
- Test: `lib/finance/__tests__/assumptions.test.ts`

**Interfaces:**
- Consumes: `GlobalAssumptions` from `@/lib/model/types` (type-only).
- Produces:
  - `OpexPart { label: string; amount: number; kind?: "fuel" | "elec" | "other" }`
  - `PriceBasis = "measured" | "reference" | "unavailable"`
  - `FinanceAssumptions { discountRatePct, fuelEscalationPct, elecEscalationPct, otherEscalationPct, maintenanceShareOfSpendPct, evMaintenanceRatioPct, heatPumpMaintenanceRatioPct }` — all `number`
  - `DEFAULT_FINANCE_ASSUMPTIONS: FinanceAssumptions`
  - `financeAssumptionsFrom(g: Partial<GlobalAssumptions> | undefined): FinanceAssumptions`

`OpexPart` moves here from `lib/model/index.ts` so `lib/finance` never imports `lib/model` values. `lib/model/index.ts` re-exports it in Task 6 so existing importers keep working.

- [ ] **Step 1: Write the failing test**

```ts
// lib/finance/__tests__/assumptions.test.ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/finance/__tests__/assumptions.test.ts`
Expected: FAIL — `Cannot find module '@/lib/finance/assumptions'`.

- [ ] **Step 3: Create the types**

```ts
// lib/finance/types.ts

/** One named running-cost component. Positive = cost, negative = saving.
 *  `kind` selects the price-escalation line in the cashflow series. */
export interface OpexPart {
  label: string;
  amount: number;
  kind?: "fuel" | "elec" | "other";
}

/** How a source's unit price was arrived at. Travels with every derived figure
 *  so the UI can mark estimates and the export can name its assumptions.
 *  `unavailable` is deliberately distinct from `reference`: a fuel with no
 *  reference price must not masquerade as an estimate. */
export type PriceBasis = "measured" | "reference" | "unavailable";

export interface ResolvedPrice {
  pricePerUnit: number;
  basis: PriceBasis;
}

/** A year's annual bill, split into the part efficiency can cut and the part it
 *  cannot. `a.opex` has always been documented as "fuel plus related
 *  maintenance"; nothing honoured it until now. */
export interface SpendSplit {
  fuel: number;
  maintenance: number;
  basis: PriceBasis;
}
```

- [ ] **Step 4: Create the assumptions module**

```ts
// lib/finance/assumptions.ts
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
```

- [ ] **Step 5: Add the four new optional fields to `GlobalAssumptions`**

In `lib/model/types.ts`, inside `interface GlobalAssumptions`, after `evMaintenanceRatioPct`:

```ts
  /** Heat-pump / electric-boiler maintenance as a share of the plant it
   *  replaces. Defaults 70. */
  heatPumpMaintenanceRatioPct?: number;
  /** Fuel price growth per year. Was hardcoded in the old cashflow module,
   *  which made it invisible to the export. Defaults 5. */
  fuelEscalationPct?: number;
  /** Grid tariff growth per year. Defaults 3. */
  elecEscalationPct?: number;
  /** Growth for everything else (RECs, maintenance). Defaults 0. */
  otherEscalationPct?: number;
```

All optional — old saves must keep loading.

- [ ] **Step 6: Run the test**

Run: `npx vitest run lib/finance/__tests__/assumptions.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Record the killing mutation**

Change one `??` to `||` in `financeAssumptionsFrom`. The "deliberate zero" test must fail. Record the failure message. Revert.

- [ ] **Step 8: Gates and commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add lib/finance/types.ts lib/finance/assumptions.ts lib/finance/__tests__/assumptions.test.ts lib/model/types.ts
git commit -m "feat(finance): finance types and one resolved assumption set

Escalation rates move out of DEFAULT_CASHFLOW_ASSUMPTIONS into
GlobalAssumptions so they are user-editable and printable (F8), and
heatPumpMaintenanceRatioPct makes stationary electrification's
maintenance explicit instead of an implied zero (F3)."
```

---

> **Note on Task 2 (not a task):** `otherEscalationPct` defaults to 0, which
> reproduces today's behaviour exactly. It exists so the export can *state* that
> RECs and maintenance are held flat, rather than that fact living only in a `?:`
> chain inside `cashflow.ts`. Do not change the default.

---

## Task 3: Price resolution and the spend split

**Files:**
- Create: `lib/finance/prices.ts`
- Test: `lib/finance/__tests__/prices.test.ts`

**Interfaces:**
- Consumes: `FUELS` from `@/lib/model/factors`; `PriceBasis`, `ResolvedPrice`, `SpendSplit` from `./types`.
- Produces:
  - `resolvePrice(src: { opex: number; annualVolume: number; fuelType: FuelId }): ResolvedPrice`
  - `splitSpend(totalSpend: number, maintenanceShareOfSpendPct: number): { fuel: number; maintenance: number }`
  - `resolveFuelSpend(src, a: FinanceAssumptions): SpendSplit`

**The reference-price grossing-up rule, stated once here.** A measured `opex` is fuel **plus** maintenance, so it splits. A reference `typicalPricePerUnit` is a *pump price* — fuel only, no maintenance in it. To keep one consistent definition of `maintenanceShareOfSpendPct` (a share of the **total** bill), the reference path grosses up:

```
measured : total = opex
           fuel  = total × (1 − m);  maintenance = total × m
reference: fuel  = volume × refPrice
           total = fuel ÷ (1 − m);   maintenance = fuel × m ÷ (1 − m)
```

With `m = 0.2`, reference maintenance is `fuel × 0.25`. Both paths therefore satisfy `maintenance / total === m`, which is the invariant the test pins.

- [ ] **Step 1: Write the failing test**

```ts
// lib/finance/__tests__/prices.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_FINANCE_ASSUMPTIONS } from "@/lib/finance/assumptions";
import { resolveFuelSpend, resolvePrice, splitSpend } from "@/lib/finance/prices";
import type { FuelId } from "@/lib/model/types";

const src = (over: Partial<{ opex: number; annualVolume: number; fuelType: FuelId }> = {}) =>
  ({ opex: 0, annualVolume: 1000, fuelType: "diesel" as FuelId, ...over });

describe("resolvePrice", () => {
  it("measured when spend and volume are both present", () => {
    expect(resolvePrice(src({ opex: 100_000, annualVolume: 1000 }))).toEqual({ pricePerUnit: 100, basis: "measured" });
  });

  it("reference when spend is missing — the seeded shape", () => {
    expect(resolvePrice(src({ opex: 0 }))).toEqual({ pricePerUnit: 92, basis: "reference" });
  });

  it("reference when volume is missing, so no divide-by-zero reaches a caller", () => {
    const r = resolvePrice(src({ opex: 500, annualVolume: 0 }));
    expect(r.basis).toBe("reference");
    expect(Number.isFinite(r.pricePerUnit)).toBe(true);
  });

  it("the DG Set anchor: the reference price reproduces the figure the UI offers", () => {
    const r = resolvePrice(src({ opex: 0, annualVolume: 9_572_631.3 }));
    expect(r.pricePerUnit).toBe(92);
    expect(r.pricePerUnit * 9_572_631.3).toBeCloseTo(880_682_079.6, 1);
  });
});

describe("splitSpend", () => {
  it("splits a measured bill into fuel and maintenance", () => {
    expect(splitSpend(1_000_000, 20)).toEqual({ fuel: 800_000, maintenance: 200_000 });
  });
  it("a zero maintenance share puts the whole bill in fuel", () => {
    expect(splitSpend(1_000_000, 0)).toEqual({ fuel: 1_000_000, maintenance: 0 });
  });
});

describe("resolveFuelSpend", () => {
  const a = DEFAULT_FINANCE_ASSUMPTIONS;

  it("measured: maintenance is the stated share of the TOTAL bill", () => {
    const s = resolveFuelSpend(src({ opex: 1_000_000, annualVolume: 1000 }), a);
    expect(s).toEqual({ fuel: 800_000, maintenance: 200_000, basis: "measured" });
    expect(s.maintenance / (s.fuel + s.maintenance)).toBeCloseTo(0.2, 12);
  });

  it("reference: the pump price is fuel, and maintenance grosses up to the SAME share", () => {
    const s = resolveFuelSpend(src({ opex: 0, annualVolume: 1000 }), a);
    expect(s.basis).toBe("reference");
    expect(s.fuel).toBe(92_000);                       // 1000 L × ₹92
    expect(s.maintenance).toBeCloseTo(23_000, 6);       // 92,000 × 0.2/0.8
    expect(s.maintenance / (s.fuel + s.maintenance)).toBeCloseTo(0.2, 12); // the invariant
  });

  it("unavailable: no spend and no reference price yields zeros, flagged, never NaN", () => {
    const s = resolveFuelSpend(src({ opex: 0, fuelType: "__nope__" as FuelId }), a);
    expect(s).toEqual({ fuel: 0, maintenance: 0, basis: "unavailable" });
  });

  it("a 100% maintenance share cannot divide by zero on the reference path", () => {
    const s = resolveFuelSpend(src({ opex: 0, annualVolume: 1000 }), { ...a, maintenanceShareOfSpendPct: 100 });
    expect(Number.isFinite(s.fuel)).toBe(true);
    expect(Number.isFinite(s.maintenance)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/finance/__tests__/prices.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/finance/prices.ts
import { FUELS } from "@/lib/model/factors";
import type { FuelId } from "@/lib/model/types";
import type { FinanceAssumptions } from "./assumptions";
import type { ResolvedPrice, SpendSplit } from "./types";

interface PriceSource {
  opex: number;
  annualVolume: number;
  fuelType: FuelId;
}

/** The ONLY place a fuel unit price is derived. Before this module the divide
 *  lived inline in three files, and all three read zero on the seeded company
 *  because every source there has opex: 0. */
export function resolvePrice(src: PriceSource): ResolvedPrice {
  if (src.opex > 0 && src.annualVolume > 0) {
    return { pricePerUnit: src.opex / src.annualVolume, basis: "measured" };
  }
  const ref = FUELS[src.fuelType]?.typicalPricePerUnit ?? 0;
  if (ref > 0) return { pricePerUnit: ref, basis: "reference" };
  return { pricePerUnit: 0, basis: "unavailable" };
}

/** `a.opex` is documented as "fuel cost plus related maintenance". Efficiency
 *  cuts volume, so it can only save the fuel half — crediting the whole bill
 *  overstated it by the maintenance share (F2). */
export function splitSpend(totalSpend: number, maintenanceShareOfSpendPct: number): { fuel: number; maintenance: number } {
  const m = Math.min(1, Math.max(0, maintenanceShareOfSpendPct / 100));
  const maintenance = totalSpend * m;
  return { fuel: totalSpend - maintenance, maintenance };
}

/** Annual bill split for one source, whichever basis the price came from.
 *  Both bases end up satisfying maintenance / total === m, so downstream code
 *  never needs to know which basis it got. */
export function resolveFuelSpend(src: PriceSource, a: FinanceAssumptions): SpendSplit {
  const { pricePerUnit, basis } = resolvePrice(src);
  if (basis === "unavailable") return { fuel: 0, maintenance: 0, basis };

  if (basis === "measured") {
    const { fuel, maintenance } = splitSpend(src.opex, a.maintenanceShareOfSpendPct);
    return { fuel, maintenance, basis };
  }

  // Reference prices are pump prices: fuel only. Gross up so that the
  // maintenance share stays a share of the TOTAL, matching the measured path.
  const fuel = src.annualVolume * pricePerUnit;
  const m = Math.min(1, Math.max(0, a.maintenanceShareOfSpendPct / 100));
  const maintenance = m >= 1 ? 0 : fuel * (m / (1 - m));
  return { fuel, maintenance, basis };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/finance/__tests__/prices.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Record the killing mutation**

Delete the `m >= 1 ? 0 :` guard. The "100% maintenance share" test must fail with `Infinity`. Record it, revert.

- [ ] **Step 6: Gates and commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add lib/finance/prices.ts lib/finance/__tests__/prices.test.ts
git commit -m "feat(finance): one price resolver with an explicit basis (F1, F2)

resolvePrice falls back to FUELS[].typicalPricePerUnit when a source has
no spend, and reports whether the price was measured, referenced, or
unavailable. resolveFuelSpend splits the bill so efficiency can stop
crediting maintenance it does not touch."
```

---

## Task 4: Lifetimes and the evaluation window

**Files:**
- Create: `lib/finance/lifetimes.ts`
- Test: `lib/finance/__tests__/lifetimes.test.ts`

**Interfaces:**
- Produces:
  - `S1_LIFETIME_YEARS: Record<"efficiency" | "electrification" | "fuelSwitch" | "refrigerant", number>` = `{ 7, 10, 15, 12 }`
  - `S2_LIFETIME_YEARS: Record<"efficiency" | "generation" | "procurement", number>` = `{ 8, 25, 10 }`
  - `windowFor(startYear: number, targetYear: number, assetLifeYears: number): { firstYear: number; lastYear: number }`

`windowFor` takes the life as a plain number rather than a family key, because Scope 1 and Scope 2 disagree on `efficiency` (7 vs 8) and a single merged table would have to silently pick one.

Per spec §5 the window runs to the end of the **last** tranche's life, which is what makes reinvestment and residual value identically zero and therefore absent from this design.

- [ ] **Step 1: Write the failing test**

```ts
// lib/finance/__tests__/lifetimes.test.ts
import { describe, expect, it } from "vitest";
import { S1_LIFETIME_YEARS, S2_LIFETIME_YEARS, windowFor } from "@/lib/finance/lifetimes";

describe("lifetime tables", () => {
  it("Scope 1 keeps its four families and Scope 2 its three, with efficiency differing", () => {
    expect(S1_LIFETIME_YEARS).toEqual({ efficiency: 7, electrification: 10, fuelSwitch: 15, refrigerant: 12 });
    expect(S2_LIFETIME_YEARS).toEqual({ efficiency: 8, generation: 25, procurement: 10 });
    expect(S1_LIFETIME_YEARS.efficiency).not.toBe(S2_LIFETIME_YEARS.efficiency);
  });
});

describe("windowFor", () => {
  it("a single-year deployment runs exactly one asset life", () => {
    expect(windowFor(2026, 2026, 10)).toEqual({ firstYear: 2026, lastYear: 2035 });
  });

  it("a ramp extends the window so the LAST tranche also gets a full life", () => {
    // installs 2026..2030; the 2030 tranche lives to 2039
    expect(windowFor(2026, 2030, 10)).toEqual({ firstYear: 2026, lastYear: 2039 });
  });

  it("a target before the start is treated as a single-year deployment", () => {
    expect(windowFor(2028, 2027, 10)).toEqual({ firstYear: 2028, lastYear: 2037 });
  });

  it("a non-positive asset life still yields at least the deployment years", () => {
    expect(windowFor(2026, 2028, 0)).toEqual({ firstYear: 2026, lastYear: 2028 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/finance/__tests__/lifetimes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/finance/lifetimes.ts

/** Asset life per Scope 1 lever family. Drives the evaluation window, so an EV
 *  and a boiler retrofit stop being levelised over the same horizon. */
export const S1_LIFETIME_YEARS: Record<"efficiency" | "electrification" | "fuelSwitch" | "refrigerant", number> = {
  efficiency: 7,       // economiser packages, telematics kit
  electrification: 10, // blended EV (8) / heat pump & electric boiler (15)
  fuelSwitch: 15,      // burner retrofits, conversion kit
  refrigerant: 12,     // retrofit ↔ system replacement blend
};

/** Scope 2 families. `efficiency` is 8 here, not 7 — LED and BMS retrofits
 *  outlive a burner tune. Deliberately a separate table. */
export const S2_LIFETIME_YEARS: Record<"efficiency" | "generation" | "procurement", number> = {
  efficiency: 8, generation: 25, procurement: 10,
};

/** The window a lever is levelised over: from first install to the end of the
 *  LAST tranche's life. Chosen so every tranche gets its full life inside the
 *  window, which is what makes reinvestment and residual value both zero — see
 *  spec §5. Shortening this to `startYear + life` reintroduces both. */
export function windowFor(startYear: number, targetYear: number, assetLifeYears: number): { firstYear: number; lastYear: number } {
  const lastInstall = Math.max(startYear, targetYear);
  const life = Math.max(0, assetLifeYears);
  return { firstYear: startYear, lastYear: lastInstall + Math.max(0, life - 1) };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/finance/__tests__/lifetimes.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Record the killing mutation**

Change `lastInstall + Math.max(0, life - 1)` to `startYear + life`. The ramp test must fail (`2039` → `2036`). Record, revert.

- [ ] **Step 6: Gates and commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add lib/finance/lifetimes.ts lib/finance/__tests__/lifetimes.test.ts
git commit -m "feat(finance): per-lever lifetimes and the evaluation window

The window runs to the end of the last tranche's life, which is what
makes reinvestment and residual value identically zero rather than
unimplemented. Scope 1 and Scope 2 keep separate tables because they
disagree on efficiency (7 vs 8)."
```

---

## Task 5: The one series, and the metrics off it

**Files:**
- Create: `lib/finance/series.ts`, `lib/finance/metrics.ts`, `lib/finance/index.ts`
- Test: `lib/finance/__tests__/series.test.ts`, `lib/finance/__tests__/metrics.test.ts`

**Interfaces:**
- Consumes: `FinanceAssumptions`, `OpexPart`, `windowFor`.
- Produces:
  - `LeverInput { id: string; capex: number; opexParts: OpexPart[]; fullAbatementT: number; startYear: number; rampYears: number; assetLifeYears: number }`
  - `SeriesRow { year: number; capex: number; opexDelta: number; net: number; tonnes: number; discount: number }`
  - `buildLeverSeries(l: LeverInput, baseYear: number, a: FinanceAssumptions): SeriesRow[]`
  - `LeverMetrics { levelisedCostPerTonne: number; paybackYears: number | null; paybackKind: "discounted" | "never" | "no-capital"; npv: number; peakFunding: number; totalCapex: number }` — the three `paybackKind` literals are exactly `"discounted" | "never" | "no-capital"`; do not introduce a fourth or rename `"never"` to `"none"`
  - `leverMetrics(rows: SeriesRow[], capex: number): LeverMetrics`
  - `programmeMetrics(series: SeriesRow[][]): LeverMetrics`

- [ ] **Step 1: Write the failing series test**

```ts
// lib/finance/__tests__/series.test.ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/finance/__tests__/series.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the series**

```ts
// lib/finance/series.ts
import type { FinanceAssumptions } from "./assumptions";
import { windowFor } from "./lifetimes";
import type { LeverInput, OpexPart, SeriesRow } from "./types";

/** Deployed share by the end of `year`. Identical shape to the ramp the
 *  trajectory uses, so money and tonnes phase together by construction. */
const rampAt = (l: Pick<LeverInput, "startYear" | "rampYears">, year: number): number => {
  if (year < l.startYear) return 0;
  return Math.min(1, (year - l.startYear + 1) / Math.max(1, l.rampYears));
};

const escalationFor = (kind: OpexPart["kind"], a: FinanceAssumptions): number =>
  kind === "fuel" ? a.fuelEscalationPct / 100
  : kind === "elec" ? a.elecEscalationPct / 100
  : a.otherEscalationPct / 100;

/** The single year-by-year series. ₹/t, payback, NPV and peak funding are all
 *  read off this one array, which is what stops them disagreeing (F5, F6).
 *  Sign convention: positive = cash OUT. */
export function buildLeverSeries(l: LeverInput, baseYear: number, a: FinanceAssumptions): SeriesRow[] {
  const { firstYear, lastYear } = windowFor(l.startYear, l.startYear + Math.max(1, l.rampYears) - 1, l.assetLifeYears);
  const r = a.discountRatePct / 100;
  const rows: SeriesRow[] = [];

  for (let year = firstYear; year <= lastYear; year++) {
    const ramp = rampAt(l, year);
    const capex = l.capex * Math.max(0, ramp - rampAt(l, year - 1));

    let opexDelta = 0;
    for (const p of l.opexParts) {
      opexDelta += p.amount * ramp * Math.pow(1 + escalationFor(p.kind, a), year - baseYear);
    }

    rows.push({
      year,
      capex,
      opexDelta,
      net: capex + opexDelta,
      tonnes: l.fullAbatementT * ramp,
      // Always discounted to the model's base year, never to the lever's own
      // start — this is what makes summing across levers with different window
      // lengths valid in programmeMetrics.
      discount: 1 / Math.pow(1 + r, year - baseYear),
    });
  }
  return rows;
}
```

Add to `lib/finance/types.ts`:

```ts
export interface LeverInput {
  id: string;
  capex: number;
  opexParts: OpexPart[];
  /** Full-ramp annual tonnes. */
  fullAbatementT: number;
  startYear: number;
  rampYears: number;
  assetLifeYears: number;
}

export interface SeriesRow {
  year: number;
  capex: number;
  opexDelta: number;
  /** capex + opexDelta. Positive = cash out. */
  net: number;
  tonnes: number;
  /** Discount factor to the model's base year. */
  discount: number;
}

export interface LeverMetrics {
  /** Σ discounted net ÷ Σ discounted tonnes. Infinity when no tonnes. */
  levelisedCostPerTonne: number;
  paybackYears: number | null;
  /** Why payback is what it is. "no-capital" must never render as a number. */
  paybackKind: "discounted" | "never" | "no-capital";
  npv: number;
  peakFunding: number;
  totalCapex: number;
}
```

- [ ] **Step 4: Run the series test**

Run: `npx vitest run lib/finance/__tests__/series.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing metrics test**

```ts
// lib/finance/__tests__/metrics.test.ts
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
});
```

- [ ] **Step 6: Implement the metrics**

```ts
// lib/finance/metrics.ts
import type { LeverMetrics, SeriesRow } from "./types";

const sum = (rows: SeriesRow[], f: (r: SeriesRow) => number) => rows.reduce((s, r) => s + f(r), 0);

/** Discounted payback in years from the first row, or null. Reads the SAME
 *  series as the levelised cost, so the two can never disagree (F6). */
function discountedPayback(rows: SeriesRow[], capex: number): { years: number | null; kind: LeverMetrics["paybackKind"] } {
  // No capital at risk is not a zero-year payback. Rendering it as "0.0 yr"
  // reads as a computed result and is not one (F9).
  if (capex <= 0) return { years: null, kind: "no-capital" };
  let cumulative = 0;
  for (const r of rows) {
    cumulative += r.net * r.discount;
    if (cumulative <= 0) return { years: r.year - rows[0].year, kind: "discounted" };
  }
  return { years: null, kind: "never" };
}

export function leverMetrics(rows: SeriesRow[], capex: number): LeverMetrics {
  const discCost = sum(rows, (r) => r.net * r.discount);
  const discTonnes = sum(rows, (r) => r.tonnes * r.discount);

  let cumulative = 0;
  let peakFunding = 0;
  for (const r of rows) {
    cumulative += r.net;                                  // undiscounted: this is real cash
    peakFunding = Math.max(peakFunding, cumulative);
  }

  const pb = discountedPayback(rows, capex);
  return {
    levelisedCostPerTonne: discTonnes > 0 ? discCost / discTonnes : Infinity,
    paybackYears: pb.years,
    paybackKind: pb.kind,
    npv: -discCost,
    peakFunding,
    totalCapex: sum(rows, (r) => r.capex),
  };
}

/** Programme roll-up. Σ discounted cost ÷ Σ discounted tonnes across every
 *  lever — NOT the mean of per-lever ₹/t, which would weight a 1-tonne measure
 *  the same as a 1000-tonne one. Valid because every series discounts to the
 *  same base year. Iterates ALL levers, so capex on a zero-abatement lever is
 *  reported rather than silently dropped (F4). */
export function programmeMetrics(series: SeriesRow[][]): LeverMetrics {
  const all = series.flat();
  const capex = all.reduce((s, r) => s + r.capex, 0);

  const byYear = new Map<number, number>();
  for (const r of all) byYear.set(r.year, (byYear.get(r.year) ?? 0) + r.net);
  const merged: SeriesRow[] = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, net]) => {
      const anyRow = all.find((r) => r.year === year)!;
      return { year, capex: 0, opexDelta: 0, net, tonnes: 0, discount: anyRow.discount };
    });

  const m = leverMetrics(all, capex);
  const pbSource = leverMetrics(merged, capex);
  return { ...m, totalCapex: capex, paybackYears: pbSource.paybackYears, paybackKind: pbSource.paybackKind, peakFunding: pbSource.peakFunding };
}
```

- [ ] **Step 7: Create the public surface**

```ts
// lib/finance/index.ts
export * from "./types";
export * from "./assumptions";
export * from "./prices";
export * from "./lifetimes";
export * from "./series";
export * from "./metrics";
```

- [ ] **Step 8: Run both test files**

Run: `npx vitest run lib/finance/__tests__/series.test.ts lib/finance/__tests__/metrics.test.ts`
Expected: PASS, 7 + 10 tests.

- [ ] **Step 9: Record the killing mutations**

Two, recorded separately:
1. In `discountedPayback`, change `if (capex <= 0)` to `if (capex < 0)`. The "no capital at risk" test must fail — payback becomes 0, which is exactly F9's symptom.
2. In `programmeMetrics`, replace the ratio with the mean of per-lever `levelisedCostPerTonne`. The "NOT the mean" test must fail.

- [ ] **Step 10: Gates and commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add lib/finance/series.ts lib/finance/metrics.ts lib/finance/index.ts lib/finance/types.ts lib/finance/__tests__/series.test.ts lib/finance/__tests__/metrics.test.ts
git commit -m "feat(finance): one series, and every metric read off it (F5, F6, F9)

Levelised cost, discounted payback, NPV and peak funding all derive from
buildLeverSeries, so the annualised and cashflow views can no longer
disagree about the same programme. No capital at risk now reports
no-capital instead of a 0.0-year payback that reads like a result."
```

---

## Task 6: Wire the Scope 1 model to the engine

**Files:**
- Modify: `lib/model/index.ts` (the per-asset loop at 120-175, the `mk` factory at 255-275, the roll-up at 305-335)
- Modify: `lib/model/finance.ts` (delete three exports)
- Test: `lib/finance/__tests__/scope1-wiring.test.ts`, and flip `lib/finance/__tests__/defect-witness.test.ts`

**Interfaces:**
- Consumes: everything from `@/lib/finance`.
- Produces:
  - `LeverSummary` gains `levelisedCostPerTonne: number`, `paybackKind: LeverMetrics["paybackKind"]`, `npv: number`, and `series: SeriesRow[]` — Task 10's reconciliation test reads `l.series`, so it must be on the public type, not local to `mk`.
  - `costPerTonne` stays but becomes an alias of `levelisedCostPerTonne`, so the ~8 UI call sites in `MaccChart`, `MaccScatter`, `ActionPlanTab` and `CompareTab` keep compiling. Do not delete it in this task.
  - `ComputeResult.kpis` gains `npv: number`, `peakFunding: number`, `paybackKind`, and `priceBasisSummary: Record<PriceBasis, number>`.

This is the task that makes the numbers correct. It is also the largest diff — expect the four Scope 1 tabs to render different figures immediately after it.

- [ ] **Step 1: Write the failing wiring test**

```ts
// lib/finance/__tests__/scope1-wiring.test.ts
import { describe, expect, it } from "vitest";
import { compute } from "@/lib/model";
import { applyAssetActions } from "@/lib/model/segments";
import { seedScope1, sourceNamed } from "./seed-fixture";

describe("Scope 1 on the seeded company, priced by reference", () => {
  it("F1 fixed: fuel switch now SAVES money, because diesel is no longer free", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    const fs = r.levers.find((l) => l.id === "fuelSwitch")!;
    expect(fs.abatementT).toBeGreaterThan(0);
    const displaced = fs.opexParts.find((p) => p.label === "Displaced fossil fuel spend")!;
    expect(displaced.amount).toBeLessThan(0);                 // it displaces real spend now
    expect(Math.abs(displaced.amount)).toBeGreaterThan(1e7);  // and it is material
  });

  it("F1: the DG Set's displaced spend equals its volume × ₹92 × the switched fraction", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const dg = sourceNamed(combustion, "DG Set");
    const acts = settings.byAsset[dg.id];
    const applied = applyAssetActions(dg, acts, settings.assumptions);
    const expected = dg.annualVolume * (1 - applied.effFraction) * applied.fuelFraction * 92;

    const r = compute([dg], [], { ...settings, bySystem: {} }, baseYear);
    const fs = r.levers.find((l) => l.id === "fuelSwitch")!;
    const displaced = fs.opexParts.find((p) => p.label === "Displaced fossil fuel spend")!;
    expect(-displaced.amount).toBeCloseTo(expected, 0);
  });

  it("F2 fixed: efficiency credits only the FUEL half of the bill", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const dg = sourceNamed(combustion, "DG Set");
    const withEff = {
      ...settings, bySystem: {},
      byAsset: { [dg.id]: { ...settings.byAsset[dg.id], efficiency: { enabled: true, savingPct: 10, capex: 500_000, startYear: 2026, targetYear: 2028 } } },
    };
    const r = compute([dg], [], withEff, baseYear);
    const eff = r.levers.find((l) => l.id === "efficiency")!;
    const saving = -eff.opexParts.find((p) => p.kind === "fuel")!.amount;

    const applied = applyAssetActions(dg, withEff.byAsset[dg.id], withEff.assumptions);
    const fuelOnly = dg.annualVolume * 92 * applied.effFraction;
    expect(saving).toBeCloseTo(fuelOnly, 0);
    // and strictly less than crediting the whole grossed-up bill
    const wholeBill = (dg.annualVolume * 92) / 0.8 * applied.effFraction;
    expect(saving).toBeLessThan(wholeBill);
  });

  it("F3 fixed: stationary electrification adds maintenance back, like mobile does", () => {
    const { combustion, settings, baseYear } = seedScope1();
    const png = sourceNamed(combustion, "Piped Natural Gas");
    const withElec = {
      ...settings, bySystem: {},
      byAsset: { [png.id]: { ...settings.byAsset[png.id], electrify: { ...settings.byAsset[png.id].electrify, enabled: true, capacityPct: 50 } } },
    };
    const r = compute([png], [], withElec, baseYear);
    const el = r.levers.find((l) => l.id === "electrification")!;
    const addBack = el.opexParts.find((p) => /maintenance/i.test(p.label))!;
    expect(addBack.amount).toBeGreaterThan(0);   // was structurally absent for stationary
  });

  it("F4 fixed: capex on a zero-abatement lever still reaches totalCapex", () => {
    // MUST mirror Task 1's rebuilt F4 witness exactly. An earlier draft used the
    // seeded company with `efficiency: { savingPct: 0, capex: 1_000_000 }`, which
    // does NOT work: lib/model/index.ts:122 guards capex accrual behind
    // `r.effFraction > 0`, so at savingPct 0 the 1,000,000 never enters effCapex
    // and the test measures nothing. Use a single synthetic stationary asset with
    // zero volume and an electrify lever instead — stationary electrifyCapexFor
    // returns assetCapex unconditionally, and capacityPct/100 = 0.5 clears the
    // `> 0` guard, so the capex genuinely accrues while abatement stays 0.
    const asset: CombustionAsset = {
      id: "z-0", name: "Idle boiler", category: "stationary", fuelType: "png",
      unit: "m3", annualVolume: 0, opex: 0, unitCount: 1, remainingLife: 10,
    };
    const settings: LeverSettings = {
      byAsset: { "z-0": { ...defaultActions(asset), electrify: { ...defaultActions(asset).electrify, enabled: true, capacityPct: 50, assetCapex: 1_000_000 } } },
      bySystem: {},
      // infraCapex MUST be 0 — index.ts:236 otherwise adds it on top and the
      // assertion stops measuring one clean number.
      assumptions: { ...DEFAULT_SETTINGS.assumptions, infraCapex: 0 },
    };
    const r = compute([asset], [], settings, 2025);
    const el = r.levers.find((l) => l.id === "electrification")!;

    expect(el.abatementT).toBe(0);           // no volume, so no tonnes
    expect(el.capex).toBeCloseTo(1_000_000, 6); // but the capex is real
    expect(r.kpis.totalCapex).toBeCloseTo(1_000_000, 6); // and it survives the roll-up now
  });

  it("every lever reports the price basis it was costed on", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    expect(r.kpis.priceBasisSummary.reference).toBe(combustion.length); // all seven
    expect(r.kpis.priceBasisSummary.measured).toBe(0);
  });

  it("tonnage is untouched by the finance rework", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    expect(r.baseTotalT).toBeGreaterThan(0);
    // pinned in Task 10 against a pre-change snapshot; here only that it exists
    expect(r.levers.reduce((s, l) => s + l.abatementT, 0)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/finance/__tests__/scope1-wiring.test.ts`
Expected: FAIL — `displaced.amount` is 0, `priceBasisSummary` undefined.

- [ ] **Step 3: Replace every `a.opex` read in the per-asset loop**

In `lib/model/index.ts`, at the top of the loop over assets (just after `const acts = ...`), resolve the bill once:

```ts
    const spend = resolveFuelSpend(a, fa);   // fa = financeAssumptionsFrom(g), hoisted above the loop
    basisTally[spend.basis] += 1;
```

Then the four sites change as follows. **Efficiency** (was `effOpexSaving += a.opex * r.effFraction`):

```ts
      // Efficiency cuts VOLUME, so it saves the fuel half only. Crediting the
      // whole bill charged it with maintenance it never touched (F2).
      effOpexSaving += spend.fuel * r.effFraction;
```

**Electrification displaced spend** (was `a.opex * (1 - r.effFraction) * r.elecFraction`):

```ts
      elecDispOpex += (spend.fuel + spend.maintenance) * (1 - r.effFraction) * r.elecFraction;
```

**Maintenance add-back** — now both categories, not mobile only:

```ts
      // The replacement plant still needs maintaining. Mobile was already
      // handled; stationary was implicitly assumed maintenance-free (F3).
      const retainRatio = a.category === "mobile"
        ? fa.evMaintenanceRatioPct / 100
        : fa.heatPumpMaintenanceRatioPct / 100;
      elecMaintAddBack += spend.maintenance * (1 - r.effFraction) * r.elecFraction * retainRatio;
```

**Fuel switch** — delete the inline divide entirely, and credit the FUEL half:

> **Ruling P (controller, found during Task 6 verification).** An earlier draft
> of this step read
> `fuelDispSpend += postEffVolume * r.fuelFraction * resolvePrice(a).pricePerUnit`.
> That is F2 again, in a second branch. On a MEASURED source
> `resolvePrice().pricePerUnit` is `opex / annualVolume`, and `opex` is
> documented as fuel PLUS maintenance, so the line credits the whole bill and
> then compares it against `altFuelPricePerUnit`, a pure pump price. A blend
> switch leaves the engine's maintenance alone, so the saving was overstated by
> `1/(1-m)` — 25% at the 20% default, biased one way. It was invisible to all
> seven of this task's tests because the seeded company is entirely
> reference-priced, and on that basis `spend.fuel === annualVolume *
> pricePerUnit` makes the two forms algebraically identical. Use `spend.fuel`,
> which is parallel to the efficiency and electrification lines above.

```ts
      const postEffVolume = a.annualVolume * (1 - r.effFraction);
      fuelDispSpend += spend.fuel * (1 - r.effFraction) * r.fuelFraction;
      fuelNewSpend += postEffVolume * r.fuelFraction * acts.fuelSwitch.altFuelPricePerUnit;
```

Declare the tally above the loop:

```ts
  const fa = financeAssumptionsFrom(g);
  const basisTally: Record<PriceBasis, number> = { measured: 0, reference: 0, unavailable: 0 };
```

- [ ] **Step 4: Replace the `mk` factory with the engine**

```ts
  const mk = (
    id: LeverSummary["id"], label: string, colorIdx: number, abatementT: number,
    capex: number, opexDelta: number, ramp: { startYear: number; rampYears: number },
    opexParts: OpexPart[],
  ): LeverSummary & { startYear: number; rampYears: number; series: SeriesRow[] } => {
    const series = buildLeverSeries(
      { id, capex, opexParts, fullAbatementT: Math.max(0, abatementT), assetLifeYears: S1_LIFETIME_YEARS[id], ...ramp },
      baseYear, fa,
    );
    const m = leverMetrics(series, capex);
    return {
      id, label, colorIdx, scope: 1,
      // A lever that spends money is enabled even at zero tonnes — dropping it
      // is how its capex used to vanish from the KPIs (F4).
      enabled: abatementT > 0 || capex > 0 || opexParts.some((p) => p.amount !== 0),
      abatementT: Math.max(0, abatementT), capex, annualOpexDelta: opexDelta,
      annualCost: annuity(capex, S1_LIFETIME_YEARS[id], fa.discountRatePct) + opexDelta, // display only
      levelisedCostPerTonne: m.levelisedCostPerTonne,
      costPerTonne: m.levelisedCostPerTonne,   // one number, two names, during the UI transition
      costPerTonneWithCarbon: abatementT > 0 ? m.levelisedCostPerTonne - g.carbonPricePerTonne : 0,
      opexParts,
      paybackYears: m.paybackYears,
      paybackKind: m.paybackKind,
      npv: m.npv,
      series,
      ...ramp,
    };
  };
```

- [ ] **Step 5: Replace the roll-up**

```ts
  // ALL levers with money attached, not just those with tonnes (F4).
  const costedLevers = leverRows.filter((l) => l.capex > 0 || l.opexParts.some((p) => p.amount !== 0));
  const programme = programmeMetrics(costedLevers.map((l) => l.series));
  const totalCapex = programme.totalCapex;
  const totalOpexDelta = costedLevers.reduce((s2, l) => s2 + l.annualOpexDelta, 0);
```

and in the returned `kpis`:

```ts
      costPerTonne: programme.levelisedCostPerTonne,
      totalCapex,
      npv: programme.npv,
      peakFunding: programme.peakFunding,
      paybackYears: programme.paybackYears,
      paybackKind: programme.paybackKind,
      priceBasisSummary: basisTally,
```

Add the matching fields to `ComputeResult["kpis"]` and `LeverSummary` in `lib/model/index.ts`.

Then re-point `OpexPart` at the finance module. **You must DELETE the local
definition first** — `lib/model/index.ts:37` currently declares
`export interface OpexPart { ... }`, and adding a re-export beside it is a
duplicate identifier that fails `tsc`. Delete lines 37-41 (the interface and its
doc comment), then add:

```ts
export type { OpexPart } from "@/lib/finance";
```

Task 2 deliberately left the duplicate in place rather than reaching into a file
it did not own, so resolving it is this task's job. Every existing importer of
`OpexPart` from `@/lib/model` keeps working, because the re-export preserves the
name — verify with `npx tsc --noEmit`, which is the whole point of doing it this
way rather than updating each importer.

- [ ] **Step 6: Stop USING the superseded helpers — do not delete them yet**

> **Ruling B (controller, pre-flight).** An earlier draft of this step deleted
> `weightedCostPerTonne`, `simplePayback`, `annualizedCapex` and
> `CAPEX_LIFETIME` here. That is impossible: `lib/scope2/model/index.ts:9`
> imports the first two until Task 7, `lib/goals/initiatives-auto.ts:14`
> imports `simplePayback` until Task 8, and `lib/export.ts:9` imports
> `CAPEX_LIFETIME` until Task 9. Deleting them now makes **this task's own
> mandatory `npx tsc --noEmit` gate fail**. The deletions move to Task 10
> Step 4, which already greps to prove they are gone.

In this task, `lib/model/index.ts` must simply stop *calling*
`weightedCostPerTonne` and `simplePayback` — the engine supplies both now.
Leave all four symbols exported and leave `lib/model/__tests__/finance.test.ts`
entirely untouched; Task 10 removes both together.

- [ ] **Step 7: Flip the defect witnesses**

In `lib/finance/__tests__/defect-witness.test.ts`, invert the three assertions that pinned broken behaviour, keeping the original value in a comment so the before-picture survives:

```ts
    expect(fs.annualOpexDelta).toBeLessThan(0);   // was > 0 — a cost — before the fix
    expect(displaced.amount).toBeLessThan(0);      // was exactly 0
    expect(r.kpis.totalCapex).toBeGreaterThanOrEqual(1_000_000);  // was 0
    expect(ref.paybackKind).toBe("no-capital");    // was paybackYears === 0
```

Keep the F1 root-cause test (seed still has `opex: 0`) and the reference-price test **unchanged** — both still describe reality.

- [ ] **Step 8: Run the wiring test, then the whole suite**

Run: `npx vitest run lib/finance/ lib/model/`
Expected: the 7 wiring tests pass; the witnesses pass inverted.

Then: `npm test`. Existing Scope 1 tests that assert money figures **will** fail — that is the intended consequence. For each failure, decide and record:
- fixture has real `opex` → the number changed because ₹/t is now levelised. Recompute by hand and update, recording the arithmetic.
- fixture has `opex: 0` → it was asserting a zero-price artefact. Update and note it as a defect the test was pinning.

**Do not** bulk-update snapshots. Every changed expectation gets a one-line reason in the task report.

- [ ] **Step 9: Gates and commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add -A lib/model lib/finance
git commit -m "fix(finance): Scope 1 costs money correctly (F1, F2, F3, F4, F5, F6)

Prices resolve through lib/finance with a measured/reference basis, so a
source with no typed spend stops being costed at zero. Efficiency credits
only the fuel half of the bill; stationary electrification adds
maintenance back the way mobile already did; levers with capex but no
tonnes stay in the totals; and levelised cost replaces the annuity."
```

---

## Task 7: Wire the Scope 2 model

> **Ruling P consequence — read before writing this task's tests.** Task 6
> shipped a 25% error that seven tests could not see, because every fixture was
> reference-priced and on that basis two different formulas give the same
> answer. A fixture on which the right and wrong implementations coincide
> cannot discriminate between them, however strong its assertions look. Assert
> this task's price basis EXPLICITLY, and carry at least one measured-basis
> case, or state in the report why none is reachable.

**Files:**
- Modify: `lib/scope2/model/index.ts:23-28` (constants), `:165-180` (the `mk` factory), and its roll-up
- Test: `lib/finance/__tests__/scope2-wiring.test.ts`

**Interfaces:**
- Consumes: `@/lib/finance`; `S2_LIFETIME_YEARS` from `@/lib/finance/lifetimes`.
- Produces: `Scope2LeverSummary` gains the same four fields Task 6 added to `LeverSummary` — `levelisedCostPerTonne`, `paybackKind`, `npv` and `series: SeriesRow[]`. Step 3's lifetime test reads `gen.series`, so `series` must be on the public type here too, not local to `mk`.

Scope 2 has its own defect the spec calls out under F8: `DISCOUNT_RATE_PCT = 10` is a module constant, so **the user's `discountRatePct` is ignored entirely on the Scope 2 side**.

- [ ] **Step 1: Write the failing test**

```ts
// lib/finance/__tests__/scope2-wiring.test.ts
import { describe, expect, it } from "vitest";
import { computeScope2 } from "@/lib/scope2/model";
import type { Facility, Scope2Levers } from "@/lib/scope2/model/types";

const facility = (over: Partial<Facility> = {}): Facility => ({
  id: "f-0", name: "Star", annualLoadKwh: 848_488, tariffPerKwh: 9,
  loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
  roofSpaceM2: 2000, peakLoadKw: 400, gridEf: 0.71, irradiance: 1400, isolated: false, ...over,
});

const levers = (over: Partial<Scope2Levers> = {}): Scope2Levers => ({
  byFacility: { "f-0": {
    efficiency: { enabled: true, ledPct: 50, motorPct: 0, bmsPct: 0, ledCapex: 400_000, motorCapex: 900_000, bmsCapex: 500_000, startYear: 2026, targetYear: 2030 },
    generation: { enabled: false, solarKwp: 0, batteryKwh: 0, exportMode: "netMetering", solarCapexPerKw: 45_000, batteryCapexPerKwh: 28_000, subsidyPct: 0, startYear: 2026, targetYear: 2030 },
  } },
  procurement: { enabled: false, ppaPct: 0, greenTariffPct: 0, recPct: 0, ppaStrikeDeltaPerKwh: -0.5, greenTariffPremiumPerKwh: 0.8, recPricePerKwh: 0.45, re100Exclusion: false, startYear: 2026, targetYear: 2030 },
  ...over,
});

describe("Scope 2 finance", () => {
  it("F8: the user's discount rate now reaches Scope 2 — it was a module constant", () => {
    const at = (pct: number) => computeScope2([facility()], levers(), 2025, { discountRatePct: pct })
      .levers.find((l) => l.id === "efficiency")!.levelisedCostPerTonne;
    expect(at(0)).not.toBeCloseTo(at(25), 3);
  });

  it("reports levelised cost and a payback kind, like Scope 1", () => {
    const r = computeScope2([facility()], levers(), 2025, { discountRatePct: 10 });
    const eff = r.levers.find((l) => l.id === "efficiency")!;
    expect(Number.isFinite(eff.levelisedCostPerTonne)).toBe(true);
    expect(["discounted", "never", "no-capital"]).toContain(eff.paybackKind);
  });

  it("generation is levelised over 25 years, efficiency over 8 — not one flat 10", () => {
    const withGen = levers({ byFacility: { "f-0": {
      ...levers().byFacility["f-0"],
      generation: { ...levers().byFacility["f-0"].generation, enabled: true, solarKwp: 300 },
    } } });
    const r = computeScope2([facility()], withGen, 2025, { discountRatePct: 10 });
    const gen = r.levers.find((l) => l.id === "generation")!;
    expect(gen.series[gen.series.length - 1].year - gen.series[0].year + 1).toBeGreaterThanOrEqual(25);
  });
});
```

These calls pass a 4th argument that does not exist yet — Step 3 adds it. That is why this test fails before Step 3 and not merely after.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/finance/__tests__/scope2-wiring.test.ts`
Expected: FAIL — `levelisedCostPerTonne` undefined; the discount-rate test shows no change.

- [ ] **Step 3: Add the missing assumptions parameter (Ruling D)**

> **Ruling D (controller, pre-flight).** `computeScope2(facilities, levers, baseYear)`
> has **no assumptions parameter**, and `lib/scope2/model/index.ts` never
> references `assumptions` or `GlobalAssumptions` anywhere. That is *why*
> `DISCOUNT_RATE_PCT` is a module constant: the user's discount rate is
> structurally unreachable from Scope 2, not merely ignored. F8 cannot be fixed
> here without a signature change.

Add a fourth, **optional** parameter so every existing caller keeps compiling:

```ts
export function computeScope2(
  facilities: Facility[],
  levers: Scope2Levers,
  baseYear: number,
  assumptions?: Partial<GlobalAssumptions>,
): Scope2ComputeResult {
  const fa = financeAssumptionsFrom(assumptions);
  // …
```

Then update these three production callers to pass the assumptions they already hold:
- `lib/combined-balance.ts:69`
- `lib/scope2/model/energy-balance.ts:82`
- `lib/scope2/model/pathways.ts:53`

Existing Scope 2 tests call the 3-arg form and must keep working untouched — that is what `?` buys.

- [ ] **Step 4: Extract the shared summariser instead of duplicating it (Ruling C)**

> **Ruling C (controller, pre-flight).** An earlier draft said "rebuild `mk`
> exactly as Task 6 Step 4 does" — i.e. it mandated a verbatim second copy of
> the cost-assembly block. Two hand-synchronised copies of the cost assembly is
> precisely the drift this whole change exists to end, and spec §3's stated goal
> is "one place to audit". The spec is the binding authority, so: extract, do
> not duplicate.

Add to `lib/finance/metrics.ts`:

```ts
/** Assemble one lever's money summary. Shared by both scopes: they differ only
 *  in their lifetime table and their scope literal, so the assembly itself has
 *  exactly one implementation. */
export function summariseLever(input: LeverInput, baseYear: number, a: FinanceAssumptions): {
  series: SeriesRow[];
  metrics: LeverMetrics;
} {
  const series = buildLeverSeries(input, baseYear, a);
  return { series, metrics: leverMetrics(series, input.capex) };
}
```

Refactor Task 6's `mk` in `lib/model/index.ts` to call it, then write Scope 2's
`mk` as a second caller. Scope 2 supplies `S2_LIFETIME_YEARS[id]` for
`assetLifeYears` and `scope: 2`; everything else comes from the shared helper.
Replace Scope 2's roll-up with `programmeMetrics` as in Task 6 Step 5.

Leave `CAPEX_LIFETIME`, `DISCOUNT_RATE_PCT` and the local `S2_LIFETIME_YEARS`
**exported but unused** — Task 10 Step 4 deletes them, per Ruling B.

- [ ] **Step 4: Run the test, then the suite**

Run: `npx vitest run lib/finance/__tests__/scope2-wiring.test.ts` → PASS, 3 tests.
Then `npm test`, applying Task 6 Step 8's rule to every Scope 2 money assertion that moves.

- [ ] **Step 5: Record the killing mutation**

Restore `DISCOUNT_RATE_PCT = 10` and pass it instead of the resolved rate. The discount-rate test must fail. Record, revert.

- [ ] **Step 6: Gates and commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add -A lib/scope2 lib/finance
git commit -m "fix(finance): Scope 2 consumes the shared engine (F8, F13)

Deletes Scope 2's private CAPEX_LIFETIME, DISCOUNT_RATE_PCT and lifetime
table. The user's discount rate reached the Scope 1 side and was silently
ignored here, so the two scopes priced capital differently."
```

---

## Task 8: Wire the goals initiatives

> **Ruling P consequence.** Same warning as Task 7: assert the price basis
> explicitly and carry a measured-basis case, or say why none is reachable.

**Files:**
- Modify: `lib/goals/initiatives-auto.ts:55-70` (the opex delta), `:95-110` (the payback)
- Test: `lib/finance/__tests__/goals-wiring.test.ts`

**Interfaces:**
- Consumes: `resolveFuelSpend`, `resolvePrice`, `financeAssumptionsFrom` from `@/lib/finance`.
- Produces: `autoInitiatives` gains an optional 3rd parameter
  `assumptions?: Partial<GlobalAssumptions>`; `paybackYears` may now be
  `undefined` where it was `0`.

> **Ruling E (controller, pre-flight).** The plan originally called a function
> named `autoInitiativesFor(assets, settings)`. It does not exist — I invented
> it while writing the plan. The real export is
> `autoInitiatives(goal: Goal, inv: Inventories): Initiative[]`, and
> `assetOpexDelta` is module-private, so the tests must assert through the
> returned `Initiative[]`.
>
> **Ruling E (extended).** `lib/goals/initiatives-auto.ts:29` holds
> `const ASSUMPTIONS = DEFAULT_SETTINGS.assumptions` — a module constant. Like
> Scope 2 before Ruling D, this layer cannot see the user's assumptions at all,
> which is *why* line 62 could hardcode `0.2 * 0.65` without anyone noticing.
> Fixing F11 properly therefore needs the same optional-parameter treatment:
> add `assumptions?: Partial<GlobalAssumptions>` as a 3rd parameter, resolve it
> with `financeAssumptionsFrom`, and keep `ASSUMPTIONS` only for whatever
> non-finance defaults still need it. Every existing caller passes two
> arguments and must keep compiling — that is what `?` buys.

Three duplications die here: the price divide at `:65`, and the literals
`0.2 * 0.65` at `:62` — which are `maintenanceShareOfSpendPct` and
`evMaintenanceRatioPct` inlined, so a user editing either had no effect.

- [ ] **Step 1: Write the failing test**

```ts
// lib/finance/__tests__/goals-wiring.test.ts
import { describe, expect, it } from "vitest";
import { autoInitiatives } from "@/lib/goals/initiatives-auto";
import type { Inventories } from "@/lib/goals/select";
import type { Goal } from "@/lib/goals/types";
import { seedScope1 } from "./seed-fixture";

/** The executor must read lib/goals/types.ts and lib/goals/__tests__/initiatives-auto.test.ts
 *  for the exact Goal shape, and reuse that file's existing `goalOf(...)` helper
 *  pattern rather than inventing a new fixture. */
const invFrom = (rows: ReturnType<typeof seedScope1>): Inventories => ({
  combustion: { [rows.baseYear]: rows.raw },
  refrigeration: { [rows.baseYear]: rows.systems },
  facilities: {},
});

describe("auto initiatives price fuel through the shared engine", () => {
  it("F11: a zero-spend source no longer yields a fuel-switch cost with no offset", () => {
    const rows = seedScope1();
    const goal: Goal = /* an s1 reduce-goal on the seeded base year — see goalOf() */ null as never;
    const inits = autoInitiatives(goal, invFrom(rows));
    const withDelta = inits.filter((i) => i.annualOpexDelta != null && i.annualOpexDelta !== 0);
    expect(withDelta.length).toBeGreaterThan(0);
    // At least one initiative must now show a RUNNING SAVING. With a zero fuel
    // price every one of them was a cost, because nothing was displaced.
    expect(withDelta.some((i) => i.annualOpexDelta! < 0)).toBe(true);
  });

  it("the hardcoded 0.2 x 0.65 is gone — moving the assumption moves the number", () => {
    const rows = seedScope1();
    const goal: Goal = null as never; // same goal as above
    const run = (evRatio: number) =>
      autoInitiatives(goal, invFrom(rows), { evMaintenanceRatioPct: evRatio })
        .reduce((s, i) => s + (i.annualOpexDelta ?? 0), 0);
    expect(run(0)).not.toBeCloseTo(run(100), 3);
  });

  it("no capital at risk yields an undefined payback, never 0", () => {
    const rows = seedScope1();
    const goal: Goal = null as never; // same goal as above
    for (const i of autoInitiatives(goal, invFrom(rows))) {
      if (i.budget === 0) expect(i.paybackYears).toBeUndefined();
    }
  });
});
```

**The three `null as never` goal placeholders must be replaced** with a real
`Goal` built the way `lib/goals/__tests__/initiatives-auto.test.ts` already
builds one (it has a `goalOf(...)` helper — reuse its shape). A test committed
with `null as never` in it fails this task.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/finance/__tests__/goals-wiring.test.ts`
Expected: FAIL — `annualOpexDelta` positive (a cost), and the EV-ratio test shows no movement.

- [ ] **Step 3: Implement**

Add the optional parameter per Ruling E, resolve it once
(`const fa = financeAssumptionsFrom(assumptions)`), thread `fa` down to
`assetOpexDelta`, and replace lines 55-70's body:

```ts
  const fa = financeAssumptionsFrom(settings.assumptions);
  const spend = resolveFuelSpend(asset, fa);

  if (acts.efficiency?.enabled) d -= spend.fuel * r.effFraction;         // fuel half only
  if (acts.electrify.enabled && r.elecFraction > 0) {
    d += r.kWh * acts.electrify.tariffPerKwh;
    d -= (spend.fuel + spend.maintenance) * (1 - r.effFraction) * r.elecFraction;
    const retain = asset.category === "mobile" ? fa.evMaintenanceRatioPct / 100 : fa.heatPumpMaintenanceRatioPct / 100;
    d += spend.maintenance * (1 - r.effFraction) * r.elecFraction * retain;
  }
  if ((acts.fuelSwitch.enabled || acts.flexFuel?.enabled) && r.fuelFraction > 0) {
    const vol = asset.annualVolume * (1 - r.effFraction) * r.fuelFraction;
    d += vol * acts.fuelSwitch.altFuelPricePerUnit - vol * resolvePrice(asset).pricePerUnit;
  }
```

Replace the payback at `:103` — `simplePayback` no longer exists:

```ts
      paybackYears: annualOpexDelta != null && budget > 0
        ? (leverMetrics(
            buildLeverSeries({ id: ref, capex: Math.round(budget), opexParts: [{ label: "net", amount: annualOpexDelta, kind: "fuel" }], fullAbatementT: 1, startYear: goal.baseYear + 1, rampYears: 1, assetLifeYears: 10 }, goal.baseYear, financeAssumptionsFrom(undefined)),
            Math.round(budget),
          ).paybackYears ?? undefined)
        : undefined,
```

- [ ] **Step 4: Run the test, then the suite**

Run: `npx vitest run lib/finance/__tests__/goals-wiring.test.ts` → PASS, 3 tests.
Then `npm test`, applying Task 6 Step 8's rule.

- [ ] **Step 5: Record the killing mutation**

Restore the literal `0.2 * 0.65`. The EV-ratio test must fail. Record, revert.

- [ ] **Step 6: Gates and commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add -A lib/goals lib/finance
git commit -m "fix(finance): goals initiatives use the shared engine (F11)

Deletes the third copy of the price divide and the hardcoded 0.2 x 0.65,
which were maintenanceShareOfSpendPct and evMaintenanceRatioPct inlined
as literals — so editing either assumption had no effect here."
```

---

## Task 9: Export the assumptions actually used, and the price basis

**Files:**
- Modify: `lib/export.ts:9` (import) and `:69` (the stale assumption row, inside `factorsSheet`), plus `inputsSheet` / `scenarioSheet` for the price-basis column
- Test: `lib/finance/__tests__/export-assumptions.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_FINANCE_ASSUMPTIONS`, `financeAssumptionsFrom`, `S1_LIFETIME_YEARS`, `resolvePrice`.
- Produces: no signature change; new rows and one new column.

- [ ] **Step 1: Write the failing test**

```ts
// lib/finance/__tests__/export-assumptions.test.ts
import { describe, expect, it } from "vitest";
import { factorsSheet, inputsSheet, scenarioSheet } from "@/lib/export";
import { seedScope1 } from "./seed-fixture";

const flat = (rows: unknown[][]) => rows.map((r) => r.join("|")).join("\n");

describe("export states the assumptions the engine actually used", () => {
  it("F7: the stale flat-10-year CAPEX annualization row is gone", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const text = flat(factorsSheet(settings).rows);
    expect(text).not.toMatch(/CAPEX annualization\|.*\|10\|years/);
  });

  it("prints the discount rate, every escalation rate and the per-lever lifetimes", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const text = flat(factorsSheet(settings).rows);
    for (const label of ["Discount rate", "Fuel escalation", "Electricity escalation", "Maintenance share"]) {
      expect(text).toContain(label);
    }
    for (const [family, years] of Object.entries({ efficiency: 7, electrification: 10, fuelSwitch: 15, refrigerant: 12 })) {
      expect(text).toMatch(new RegExp(`${family}[^\\n]*${years}`, "i"));
    }
  });

  it("names every source priced by assumption rather than by measurement", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    // The per-source price basis belongs on a SOURCE sheet, not the factors
    // sheet. Read lib/export.ts to see which of inputsSheet / scenarioSheet
    // carries one row per combustion source, and put the column there.
    const text = flat(scenarioSheet(settings, combustion, systems).rows);
    expect(text).toContain("reference");   // all seven seeded sources
    expect(text).toContain("DG Set");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/finance/__tests__/export-assumptions.test.ts`
Expected: FAIL — the stale row is present, the new labels are absent.

- [ ] **Step 3: Implement**

Delete the `CAPEX_LIFETIME` import and its row. Add:

```ts
  const fa = financeAssumptionsFrom(settings.assumptions);
  rows.push(["Assumption", "Discount rate (WACC)", "Value", fa.discountRatePct, "%/yr"]);
  rows.push(["Assumption", "Fuel escalation", "Value", fa.fuelEscalationPct, "%/yr"]);
  rows.push(["Assumption", "Electricity escalation", "Value", fa.elecEscalationPct, "%/yr"]);
  rows.push(["Assumption", "Other escalation", "Value", fa.otherEscalationPct, "%/yr"]);
  rows.push(["Assumption", "Maintenance share of spend", "Value", fa.maintenanceShareOfSpendPct, "%"]);
  rows.push(["Assumption", "EV maintenance retained", "Value", fa.evMaintenanceRatioPct, "%"]);
  rows.push(["Assumption", "Heat-pump maintenance retained", "Value", fa.heatPumpMaintenanceRatioPct, "%"]);
  for (const [family, years] of Object.entries(S1_LIFETIME_YEARS)) {
    rows.push(["Assumption", `Asset life — ${family}`, "Value", years, "years"]);
  }
  rows.push(["Assumption", "Cost basis", "Value", "levelised cost of abatement over each lever's asset life", ""]);
```

Add a `Price basis` column to the per-source rows, from `resolvePrice(a).basis`, so a reader can see which figures rest on an assumed price.

- [ ] **Step 4: Run the test, then the suite**

Run: `npx vitest run lib/finance/__tests__/export-assumptions.test.ts` → PASS, 3 tests.
Then `npm test`.

- [ ] **Step 5: Gates and commit**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git add -A lib/export.ts lib/finance
git commit -m "fix(export): print the assumptions the engine uses (F7, F8)

The export claimed a flat 10-year CAPEX annualization while the engine
used per-lever lifetimes and a discount rate, so nobody could reconcile
it by hand. Adds a price-basis column naming sources priced by
assumption."
```

---

## Task 10: Reconciliation, tonnage guard, and delete the old cashflow

**Files:**
- Delete: `lib/model/cashflow.ts`, `lib/model/__tests__/cashflow.test.ts`
- Test: `lib/finance/__tests__/reconciliation.test.ts`

**Interfaces:**
- Consumes: `compute`, `computeScope2`, `autoInitiatives`, `@/lib/finance`.
- Produces: nothing. This task makes the plan's central claim falsifiable.

- [ ] **Step 1: Confirm the pre-change snapshot exists and is not zero**

```bash
grep -n "PRE_CHANGE_BASE_TOTAL_T\|PRE_CHANGE_TOTAL_ABATEMENT_T" lib/finance/__tests__/seed-fixture.ts
```

Both constants must be present and non-zero. They were captured in **Task 1
Step 5, before the engine changed** — which is the only ordering in which they
function as a guard. If either is `0`, stop: Task 1 was not completed, and
capturing them now would merely rubber-stamp whatever the reworked engine
produces.

- [ ] **Step 2: Write the reconciliation test**

```ts
// lib/finance/__tests__/reconciliation.test.ts
import { describe, expect, it } from "vitest";
import { compute } from "@/lib/model";
import { buildLeverSeries, financeAssumptionsFrom, leverMetrics, programmeMetrics, S1_LIFETIME_YEARS } from "@/lib/finance";
import { seedScope1 } from "./seed-fixture";

describe("one engine, one answer", () => {
  it("the model's ₹/t equals the engine's, recomputed independently from the same inputs", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    const fa = financeAssumptionsFrom(settings.assumptions);

    const rebuilt = r.levers
      .filter((l) => l.capex > 0 || l.opexParts.some((p) => p.amount !== 0))
      .map((l) => buildLeverSeries(
        { id: l.id, capex: l.capex, opexParts: l.opexParts, fullAbatementT: l.abatementT, startYear: l.startYear, rampYears: l.rampYears, assetLifeYears: S1_LIFETIME_YEARS[l.id] },
        baseYear, fa,
      ));

    expect(programmeMetrics(rebuilt).levelisedCostPerTonne).toBeCloseTo(r.kpis.costPerTonne, 6);
  });

  it("each lever's own ₹/t and payback agree with its series", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    for (const l of r.levers) {
      if (l.capex === 0 && l.opexParts.every((p) => p.amount === 0)) continue;
      const m = leverMetrics(l.series, l.capex);
      expect(l.levelisedCostPerTonne).toBeCloseTo(m.levelisedCostPerTonne, 6);
      expect(l.paybackYears).toBe(m.paybackYears);
      expect(l.paybackKind).toBe(m.paybackKind);
    }
  });

  it("TONNAGE GUARD: the finance rework changed no physics", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    expect(r.baseTotalT).toBeCloseTo(PRE_CHANGE_BASE_TOTAL_T, 6);
    expect(r.levers.reduce((s, l) => s + l.abatementT, 0)).toBeCloseTo(PRE_CHANGE_TOTAL_ABATEMENT_T, 6);
  });
});
```

Import the two constants from `./seed-fixture`. They were captured in Task 1
Step 5 against the unmodified engine, which is what makes this a guard rather
than a tautology. If this test fails, the finance work moved physics — that is a
stop-and-report, not an expectation to update.

- [ ] **Step 3: Run it**

Run: `npx vitest run lib/finance/__tests__/reconciliation.test.ts`
Expected: PASS, 3 tests. If the first two fail, a consumer is still doing its own arithmetic — find it rather than loosening the tolerance.

- [ ] **Step 4: Delete the superseded helpers and the old cashflow module**

Per **Ruling B**, the four deletions deferred from Task 6 Step 6 happen here,
now that Tasks 6-9 have removed every caller:

- from `lib/model/finance.ts`: `weightedCostPerTonne`, `simplePayback`, `annualizedCapex` (keep `crf`, `annuity`, `yearsToTarget`)
- from `lib/model/index.ts`: `CAPEX_LIFETIME`
- from `lib/scope2/model/index.ts`: `CAPEX_LIFETIME`, `DISCOUNT_RATE_PCT` and the local `S2_LIFETIME_YEARS`, if Task 7 left any behind

In `lib/model/__tests__/finance.test.ts`, delete exactly the cases covering the
three removed functions. Leave every case for `crf`, `annuity` and
`yearsToTarget` untouched — do not rewrite their assertions.

Then the cashflow module:

```bash
git rm lib/model/cashflow.ts lib/model/__tests__/cashflow.test.ts
grep -rn "cashflow" --include=*.ts --include=*.tsx lib/ components/ | grep -v lib/finance
```

**There is a real consumer:** `components/tabs/CfoFinanceTab.tsx` imports
`buildCashflow` and `DEFAULT_CASHFLOW_ASSUMPTIONS` at line 6, calls
`buildCashflow(active, baseYear, 2040, {...})` at line 20, and prints the
escalation rates in a subtitle at line 90. Rewire it:

- the per-lever series is already on the compute result — use `result.levers[].series`
- programme NPV and funding come from `kpis.npv` / `kpis.peakFunding`
- the subtitle's rates come from `financeAssumptionsFrom(settings.assumptions)`, so the tab now prints the rates actually in force rather than module defaults

This tab is the one screen whose whole purpose is the money view; treat a
regression here as Critical, not cosmetic.

- [ ] **Step 5: Prove the duplication is gone**

```bash
grep -rn "opex / .*annualVolume\|annualVolume > 0 ? .*opex" --include=*.ts lib/ | grep -v lib/finance
grep -rn "CAPEX_LIFETIME\|DISCOUNT_RATE_PCT\|weightedCostPerTonne\|simplePayback\|annualizedCapex" --include=*.ts --include=*.tsx lib/ components/
```

Both must return **nothing**. Paste the empty output into the task report — this is the evidence for the "one engine" claim.

- [ ] **Step 6: Full gates from clean**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
git diff --stat main...HEAD -- components/tabs/__tests__/activity-data.test.tsx components/tabs/__tests__/empty-field-guards.test.tsx
```

The last command must print nothing. Record all four gate outputs.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(finance): reconcile all consumers, guard tonnage, delete old cashflow

Asserts Scope 1's reported cost-per-tonne equals the engine's when
recomputed independently, that every lever agrees with its own series,
and that abatement tonnage is unchanged — the finance rework must not
have touched physics. Greps prove no price divide or legacy finance
constant survives outside lib/finance."
```

---

## Task 11: Browser verification

**Files:** none — this task produces evidence.

The equipment branch's Task 8 is the precedent: four green gates and 600 passing tests did not surface a defect that thirty seconds of clicking did. Nothing here may be inferred from a passing suite.

- [ ] **Step 1: Run the app on the seeded company**

`npm run dev`, clear `localStorage`, load. Walk: Balance to target → Scope 1 → Stationary → DG Set → Action plan.

- [ ] **Step 2: Record these seven observations with a screenshot each**

1. **Balance to target** — "Cost / t" is a plausible rupee figure, and the Active levers list shows **Fuel switch as a saving**, not "+₹8.53 Cr/yr".
2. **A source with no typed spend is visibly marked as reference-priced.** If the UI shows no marking, that is a finding — the basis reaches the model but not the screen.
3. **DG Set entry screen** — typing a real annual spend flips the basis to measured and the Action plan figures move.
4. **Refrigerant lever** — payback reads "immediate — no capital" or similar, **not** "0.0 yr".
5. **A lever with a negative ₹/t renders correctly** on the MACC chart. `MaccChart.tsx:31` already branches on `costPerTonne >= 0`, so this should hold — confirm it does, and check the axis floor and the sort order too.
6. **Action plan** — total CAPEX, annual OPEX Δ and ₹/t reconcile with each other by hand for one lever. Do the arithmetic on paper.
7. **Scope 2 tab** — changing the discount rate in settings moves Scope 2's ₹/t. It previously could not.

- [ ] **Step 3: Export and reconcile**

Download the export. Confirm the assumption rows match what the UI used, that no "CAPEX annualization / 10 years" row remains, and that the price-basis column reads `reference` for all seven seeded sources.

- [ ] **Step 4: Report**

Write findings into `.superpowers/sdd/2026-08-25-finance-engine/progress.md`. A step that behaved differently **is the finding** — record it rather than adjusting the expectation.

---

## Notes for the executor

**The seed is the fixture, not a bug.** `lib/company/seed.ts` has `opex: 0` on all seven sources. That is the shape real user data arrives in and the only fixture that exercises the reference-price path. Editing it to make numbers appear destroys the regression test and is explicitly forbidden by the Global Constraints.

**Expect existing money tests to fail in Tasks 6-8.** That is the intended consequence of changing the cost basis, not a signal you broke something. But triage each one individually and record why its number moved. Bulk-updating expectations is how a real regression hides inside an expected diff.

**`?? ` not `|| ` for every assumption default.** A user who sets the discount rate or an escalation rate to 0 means 0. `||` silently replaces it with the default, and the resulting bug looks like a UI that ignores input.

**Do not add residual value or reinvestment.** Spec §5 makes them identically zero under the chosen window, and §7 forbids adding the horizon mode they belong to. If you find yourself needing them, the window has been changed and that is a spec deviation to report, not to implement.

**If a task's premise turns out to be false, stop and say so.** Task 1 exists precisely so the premises are checked before any code is written. If a witness does not reproduce, the spec is wrong and the owner needs to know before Task 6 rewrites the engine around it.
