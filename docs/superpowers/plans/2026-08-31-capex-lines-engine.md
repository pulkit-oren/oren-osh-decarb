# CAPEX Lines Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both scope models emit an itemised, editable-addressable CAPEX breakdown, carry it on every suggested mix, and ration the CAPEX budget on peak single-year spend.

**Architecture:** Each model already computes every capex figure inside its existing per-source loops. Those loops gain one `push` of a flat `CapexContribution` record; a single pure `groupCapexLines` function then aggregates contributions into display-ready `CapexLine`s, handling quantity-weighted rate averaging and mixed-rate detection. Nothing recomputes capex — the line total and the lever total come from the same additions, and a test asserts they agree. No UI in this plan.

**Tech Stack:** TypeScript, Next.js 16, Vitest 4. Pure functions only (`lib/`), no React.

**Spec:** `docs/superpowers/specs/2026-08-31-mix-capex-and-baseline-design.md` — §5 (deliverable 2). Read §5.1 (the fifteen drivers), §5.3 (total rows) and §5.7 (tests) before starting.

**Scope note:** This is plan **2a of 2** for spec deliverable 2. Plan 2b (the card UI: breakdown table, in-place editing, provenance markers, re-suggest notice, per-source expander, rail unreachability) consumes the types produced here and is written after this lands.

## Global Constraints

- **Deliverable 1 is already shipped** (commit `76b0eb9`). Targets are on the LEVEL basis: `reductionOf` returns `(base − net) / base`, and `targetPosition` in `lib/model/combined.ts` owns the rail's four numbers. Do not reintroduce avoided-tonnes arithmetic.
- **Never recompute a capex figure.** Every contribution must be pushed from the same expression that already accumulates into `effCapex` / `elecCapex` / `fuelCapex` / `refCapex` / the Scope 2 action capex. A second expression computing the same rupees is the drift this codebase's finance module exists to end.
- **A lever that spends money is reported even at zero tonnes.** This is defect F4 in `docs/superpowers/specs/2026-08-25-finance-engine-design.md`; filtering capex by abatement has been re-introduced twice already.
- **Currency and units:** rupees, undiscounted, as raw numbers. No formatting in `lib/` — `fmtMoney` is a UI concern.
- **`?? `not `||`** for every optional numeric field: a user who sets a rate to 0 means 0.
- **Test command:** `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`. Lint: `npx eslint <paths>`. All three must be clean before each commit.
- **No new dependencies.**

---

## File Structure

| File | Responsibility |
|---|---|
| **Create** `lib/model/capex.ts` | `CapexDriverId` union, the `CAPEX_DRIVERS` metadata table (label, lever, unit/rate labels, edit target), `CapexContribution`, `CapexLine`, `groupCapexLines`, `sumCapexLines`. Shared by both scopes — one driver registry, not two. |
| **Modify** `lib/model/index.ts` | Push Scope 1 contributions inside the existing asset and system loops; return `capexLines` on `ComputeResult`. |
| **Modify** `lib/scope2/model/index.ts` | Push Scope 2 contributions; return `capexLines` on `Scope2ComputeResult`. |
| **Modify** `lib/scope2/model/efficiency.ts` (`applyEfficiency` / `EfficiencyResult`), `lib/scope2/model/generation.ts` (`applyGeneration` / `GenerationResult`) | Return the per-driver split alongside the existing `capex`, so `index.ts` can push without re-deriving. |
| **Modify** `lib/finance/types.ts`, `lib/finance/metrics.ts` | `LeverMetrics` gains `maxAnnualCapex` and `totalCostOfOwnership`. |
| **Modify** `lib/combined-balance.ts` | `MixKpis` gains `maxAnnualCapex` + `costToOwn`; `MixOption` gains `capexLines`; the budget gate compares peak annual capex. |
| **Create** `lib/model/__tests__/capex.test.ts` | `groupCapexLines` unit tests (pure, no model runs). |
| **Create** `lib/model/__tests__/capex-lines-s1.test.ts` | Scope 1: lines sum to lever capex, on a fixture exercising every S1 driver. |
| **Create** `lib/scope2/model/__tests__/capex-lines-s2.test.ts` | Scope 2: lines sum to lever capex, subsidy is negative, procurement is a zero-capex line. |
| **Modify** `lib/__tests__/combined-balance.test.ts` | The cross-cutting invariant: `sumCapexLines(o.capexLines) === o.kpis.totalCapex` for every mix. |

---

## Task 1: The driver registry and `groupCapexLines`

**Files:**
- Create: `lib/model/capex.ts`
- Test: `lib/model/__tests__/capex.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type CapexDriverId`, `CAPEX_DRIVERS`, `interface CapexContribution`, `interface CapexLine`, `function groupCapexLines(contribs: CapexContribution[]): CapexLine[]`, `function sumCapexLines(lines: CapexLine[]): number`. Tasks 2–5 all depend on these exact names.

- [ ] **Step 1: Write the failing test**

Create `lib/model/__tests__/capex.test.ts`:

```typescript
/* groupCapexLines — the one place per-source capex contributions become the
   display-ready lines the mix card shows. Pure arithmetic: no model runs. */

import { describe, expect, it } from "vitest";
import { CAPEX_DRIVERS, groupCapexLines, sumCapexLines, type CapexContribution } from "../capex";

const c = (over: Partial<CapexContribution> & Pick<CapexContribution, "driverId" | "sourceId" | "amount">): CapexContribution =>
  ({ quantity: undefined, rate: undefined, ...over });

describe("groupCapexLines", () => {
  it("aggregates one driver across sources into a single line", () => {
    const lines = groupCapexLines([
      c({ driverId: "s2-led", sourceId: "f1", amount: 100 }),
      c({ driverId: "s2-led", sourceId: "f2", amount: 250 }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].driverId).toBe("s2-led");
    expect(lines[0].amount).toBe(350);
    expect(lines[0].sourceIds).toEqual(["f1", "f2"]);
    expect(lines[0].label).toBe(CAPEX_DRIVERS["s2-led"].label);
  });

  it("drops drivers that spent nothing, and keeps ones flagged alwaysShow", () => {
    const lines = groupCapexLines([
      c({ driverId: "s2-led", sourceId: "f1", amount: 0 }),
      c({ driverId: "s2-procurement", sourceId: "portfolio", amount: 0 }),
    ]);
    // A zero-spend equipment line is noise; the zero-CAPEX procurement line is
    // the on-screen answer to "why is the Lowest CAPEX plan so cheap", so it
    // stays. See spec section 5.2.
    expect(lines.map((l) => l.driverId)).toEqual(["s2-procurement"]);
  });

  it("carries quantity x rate when every source agrees on the rate", () => {
    const lines = groupCapexLines([
      c({ driverId: "s2-solar", sourceId: "f1", amount: 200, quantity: 4, rate: 50 }),
      c({ driverId: "s2-solar", sourceId: "f2", amount: 300, quantity: 6, rate: 50 }),
    ]);
    expect(lines[0].unit).toEqual({ quantity: 10, rate: 50, unitLabel: "kW", rateLabel: "per kW" });
    expect(lines[0].mixed).toBe(false);
  });

  /* Weighted by the quantity the rate multiplies (kW here), never by anything
     else — a plain mean would misreport a 1 kW site and a 999 kW site. */
  it("reports a quantity-weighted rate and flags it mixed when sources differ", () => {
    const lines = groupCapexLines([
      c({ driverId: "s2-solar", sourceId: "f1", amount: 100, quantity: 10, rate: 10 }),
      c({ driverId: "s2-solar", sourceId: "f2", amount: 900, quantity: 30, rate: 30 }),
    ]);
    expect(lines[0].mixed).toBe(true);
    expect(lines[0].unit!.quantity).toBe(40);
    expect(lines[0].unit!.rate).toBeCloseTo(1_000 / 40, 9); // 25, not (10+30)/2
  });

  it("omits the unit block entirely for a lump-sum driver", () => {
    const lines = groupCapexLines([c({ driverId: "s1-ldar", sourceId: "sys1", amount: 100 })]);
    expect(lines[0].unit).toBeUndefined();
  });

  it("orders lines by the registry, so the card reads the same way every time", () => {
    const lines = groupCapexLines([
      c({ driverId: "s2-procurement", sourceId: "portfolio", amount: 0 }),
      c({ driverId: "s1-ldar", sourceId: "sys1", amount: 5 }),
      c({ driverId: "s2-led", sourceId: "f1", amount: 5 }),
    ]);
    const order = Object.keys(CAPEX_DRIVERS);
    const got = lines.map((l) => order.indexOf(l.driverId));
    expect(got).toEqual([...got].sort((a, b) => a - b));
  });

  it("sumCapexLines totals every line including negative ones", () => {
    const lines = groupCapexLines([
      c({ driverId: "s2-solar", sourceId: "f1", amount: 1_000 }),
      c({ driverId: "s2-solar-subsidy", sourceId: "f1", amount: -300 }),
    ]);
    expect(sumCapexLines(lines)).toBe(700);
  });
});

describe("CAPEX_DRIVERS", () => {
  it("gives every driver a label, a lever and an edit target or an explicit null", () => {
    for (const [id, d] of Object.entries(CAPEX_DRIVERS)) {
      expect(d.label, id).toBeTruthy();
      expect(d.leverId, id).toBeTruthy();
      expect(d.scope === 1 || d.scope === 2, id).toBe(true);
      expect(d.edit !== undefined, `${id} must state its edit target or null`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/model/__tests__/capex.test.ts`
Expected: FAIL — `Failed to resolve import "../capex"`. Create the file empty and re-run; then expect `groupCapexLines is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/model/capex.ts`:

```typescript
/* ============================================================
   CAPEX line registry — the fifteen things in this model that
   consume capital, plus the one procurement line that consumes
   none and has to say so.

   Models push flat CapexContribution records from the SAME
   expressions that already accumulate their lever capex, so the
   breakdown and the total are one set of additions. groupCapexLines
   holds the only interesting logic: quantity-weighted rate
   averaging and mixed-rate detection. Pure: no React, no I/O.
   ============================================================ */

/** Where a rate is stored, so the UI knows what a line-level edit writes to.
 *  `null` means the driver has no editable rate (procurement is priced per kWh
 *  in the procurement action, not as capital). */
export type CapexEditTarget =
  | { kind: "s1-asset"; action: "efficiency"; field: "capex" }
  | { kind: "s1-asset"; action: "electrify"; field: "assetCapex" }
  | { kind: "s1-asset"; action: "fuelSwitch"; field: "retrofitCapex" }
  | { kind: "s1-asset"; action: "flexFuel"; field: "vehicleCapex" }
  | { kind: "s1-system"; action: "leakFix"; field: "capex" }
  | { kind: "s1-system"; action: "chargeReduction"; field: "capex" }
  | { kind: "s1-system"; action: "gasSwitch"; field: "retrofitCapex" }
  | { kind: "s1-assumption"; field: "infraCapex" }
  | { kind: "s2-facility"; action: "efficiency"; field: "ledCapex" | "motorCapex" | "bmsCapex" }
  | { kind: "s2-facility"; action: "generation"; field: "solarCapexPerKw" | "batteryCapexPerKwh" | "subsidyPct" };

interface DriverMeta {
  label: string;
  scope: 1 | 2;
  /** The LeverSummary id this driver's spend rolls up into. */
  leverId: string;
  unitLabel?: string;
  rateLabel?: string;
  /** Keep the line even at zero — see spec 5.2. */
  alwaysShow?: boolean;
  edit: CapexEditTarget | null;
}

/* Declaration order IS display order. */
export const CAPEX_DRIVERS = {
  "s2-led":            { label: "LED lighting",                  scope: 2, leverId: "efficiency",      edit: { kind: "s2-facility", action: "efficiency", field: "ledCapex" } },
  "s2-motor":          { label: "Motors / VFD",                   scope: 2, leverId: "efficiency",      edit: { kind: "s2-facility", action: "efficiency", field: "motorCapex" } },
  "s2-bms":            { label: "Building management system",     scope: 2, leverId: "efficiency",      edit: { kind: "s2-facility", action: "efficiency", field: "bmsCapex" } },
  "s2-solar":          { label: "Rooftop solar",                  scope: 2, leverId: "solar", unitLabel: "kW",  rateLabel: "per kW",   edit: { kind: "s2-facility", action: "generation", field: "solarCapexPerKw" } },
  "s2-battery":        { label: "Battery",                        scope: 2, leverId: "solar", unitLabel: "kWh", rateLabel: "per kWh",  edit: { kind: "s2-facility", action: "generation", field: "batteryCapexPerKwh" } },
  "s2-solar-subsidy":  { label: "Solar subsidy",                  scope: 2, leverId: "solar",           edit: { kind: "s2-facility", action: "generation", field: "subsidyPct" } },
  "s2-procurement":    { label: "Green electricity",              scope: 2, leverId: "procurement", alwaysShow: true, edit: null },
  "s1-efficiency":     { label: "Efficiency package",             scope: 1, leverId: "efficiency",      edit: { kind: "s1-asset", action: "efficiency", field: "capex" } },
  "s1-ev":             { label: "Electric vehicles",              scope: 1, leverId: "electrification", unitLabel: "vehicles", rateLabel: "per vehicle", edit: { kind: "s1-asset", action: "electrify", field: "assetCapex" } },
  "s1-heatpump":       { label: "Heat pumps / electric boilers",  scope: 1, leverId: "electrification", edit: { kind: "s1-asset", action: "electrify", field: "assetCapex" } },
  "s1-charging-infra": { label: "Charging + grid upgrade",        scope: 1, leverId: "electrification", edit: { kind: "s1-assumption", field: "infraCapex" } },
  "s1-fuel-retrofit":  { label: "Fuel-switch retrofit",           scope: 1, leverId: "fuelSwitch",      edit: { kind: "s1-asset", action: "fuelSwitch", field: "retrofitCapex" } },
  "s1-flexfuel":       { label: "Flex-fuel conversion",           scope: 1, leverId: "fuelSwitch", unitLabel: "vehicles", rateLabel: "per vehicle", edit: { kind: "s1-asset", action: "flexFuel", field: "vehicleCapex" } },
  "s1-ldar":           { label: "Leak-fix / LDAR programme",      scope: 1, leverId: "refrigerant",     edit: { kind: "s1-system", action: "leakFix", field: "capex" } },
  "s1-charge-cut":     { label: "Charge reduction",               scope: 1, leverId: "refrigerant",     edit: { kind: "s1-system", action: "chargeReduction", field: "capex" } },
  "s1-gas-retrofit":   { label: "Gas-switch retrofit",            scope: 1, leverId: "refrigerant",     edit: { kind: "s1-system", action: "gasSwitch", field: "retrofitCapex" } },
} as const satisfies Record<string, DriverMeta>;

export type CapexDriverId = keyof typeof CAPEX_DRIVERS;

/** One source's spend on one driver, pushed by the model. */
export interface CapexContribution {
  driverId: CapexDriverId;
  /** Asset / system / facility id, or "portfolio" for a company-wide lump. */
  sourceId: string;
  amount: number;
  /** Only when the driver genuinely decomposes: quantity x rate == amount. */
  quantity?: number;
  rate?: number;
}

export interface CapexLine {
  driverId: CapexDriverId;
  label: string;
  scope: 1 | 2;
  leverId: string;
  amount: number;
  sourceIds: string[];
  edit: CapexEditTarget | null;
  /** Present only for drivers that decompose. */
  unit?: { quantity: number; rate: number; unitLabel: string; rateLabel: string };
  /** Sources disagree about the rate, so `unit.rate` is a weighted average and
   *  a line-level edit would flatten them. */
  mixed: boolean;
}

const ORDER = Object.keys(CAPEX_DRIVERS) as CapexDriverId[];

export function groupCapexLines(contribs: CapexContribution[]): CapexLine[] {
  const lines: CapexLine[] = [];

  for (const driverId of ORDER) {
    const mine = contribs.filter((x) => x.driverId === driverId);
    if (mine.length === 0) continue;

    const meta = CAPEX_DRIVERS[driverId] as DriverMeta;
    const amount = mine.reduce((s, x) => s + x.amount, 0);
    if (amount === 0 && !meta.alwaysShow) continue;

    const priced = mine.filter((x) => x.quantity !== undefined && x.rate !== undefined);
    let unit: CapexLine["unit"];
    let mixed = false;
    if (priced.length > 0 && meta.unitLabel && meta.rateLabel) {
      const quantity = priced.reduce((s, x) => s + x.quantity!, 0);
      // Weighted by the quantity the rate multiplies. A plain mean would give a
      // 1 kW site the same say as a 999 kW one.
      const weighted = priced.reduce((s, x) => s + x.rate! * x.quantity!, 0);
      unit = {
        quantity,
        rate: quantity > 0 ? weighted / quantity : (priced[0].rate ?? 0),
        unitLabel: meta.unitLabel,
        rateLabel: meta.rateLabel,
      };
      mixed = priced.some((x) => Math.abs(x.rate! - priced[0].rate!) > 1e-9);
    }

    lines.push({
      driverId, label: meta.label, scope: meta.scope, leverId: meta.leverId,
      amount, sourceIds: mine.map((x) => x.sourceId), edit: meta.edit, unit, mixed,
    });
  }
  return lines;
}

export const sumCapexLines = (lines: CapexLine[]): number =>
  lines.reduce((s, l) => s + l.amount, 0);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/model/__tests__/capex.test.ts`
Expected: PASS, 8 tests.

Then: `npx tsc --noEmit` and `npx eslint lib/model/capex.ts lib/model/__tests__/capex.test.ts` — both clean.

- [ ] **Step 5: Commit**

```bash
git add lib/model/capex.ts lib/model/__tests__/capex.test.ts
git commit -m "Add the CAPEX driver registry and line grouping

Fifteen drivers consume capital in this model plus one procurement line that
consumes none and has to say so, or the Lowest CAPEX plan's price is
unexplainable. Declaration order is display order. groupCapexLines holds the
only real logic: a quantity-weighted rate (a plain mean would give a 1 kW site
the same say as a 999 kW one) and a mixed flag warning that a line-level edit
would flatten sources that genuinely differ."
```

---

## Task 2: Scope 1 emits its capex lines

**Files:**
- Modify: `lib/model/index.ts` (asset loop ~lines 150–220, system loop ~lines 222–275, `elecCapexTotal` ~line 301, `ComputeResult` ~line 85, return object)
- Test: `lib/model/__tests__/capex-lines-s1.test.ts`

**Interfaces:**
- Consumes: `CapexContribution`, `CapexDriverId`, `groupCapexLines`, `sumCapexLines` from Task 1.
- Produces: `ComputeResult.capexLines: CapexLine[]`.

- [ ] **Step 1: Write the failing test**

Create `lib/model/__tests__/capex-lines-s1.test.ts`:

```typescript
/* Scope 1 CAPEX lines. The load-bearing assertion is that the lines sum to the
   lever capex the finance engine reports — if those two ever diverge, the card
   shows a breakdown that does not add up to its own total. */

import { describe, expect, it } from "vitest";
import { compute } from "../index";
import { sumCapexLines } from "../capex";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { CombustionAsset, LeverSettings, RefrigerationSystem } from "../types";

const assets: CombustionAsset[] = [
  { id: "boiler", name: "Boiler", category: "stationary", fuelType: "diesel", unit: "L", annualVolume: 60_000, opex: 5_000_000, remainingLife: 12, unitCount: 1 },
  { id: "fleet", name: "Fleet", category: "mobile", fuelType: "diesel", unit: "L", annualVolume: 100_000, opex: 9_000_000, remainingLife: 8, unitCount: 10 },
];
const systems: RefrigerationSystem[] = [
  { id: "hvac", name: "HVAC", systemType: "commercialHVAC", refrigerant: "R404A", toppedUpKg: 25, gasCostPerKg: 400 },
];

/** Every Scope 1 capex driver switched on at once, so the sum-invariant is
 *  actually exercised rather than passing on a mostly-empty plan. */
const allOn: LeverSettings = {
  assumptions: { ...DEFAULT_SETTINGS.assumptions, infraCapex: 15_000_000 },
  byAsset: {
    boiler: {
      efficiency: { enabled: true, savingPct: 10, capex: 400_000, startYear: 2026, targetYear: 2030 },
      electrify: { enabled: true, unitsToConvert: 0, capacityPct: 60, cop: 3, tariffPerKwh: 9, assetCapex: 3_000_000, purchaseTiming: "early", startYear: 2026, targetYear: 2030 },
      fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 0, altFuelPricePerUnit: 95, retrofitCapex: 250_000, startYear: 2026, targetYear: 2030 },
    },
    fleet: {
      efficiency: { enabled: true, savingPct: 5, capex: 100_000, startYear: 2026, targetYear: 2030 },
      electrify: { enabled: true, unitsToConvert: 4, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 2_500_000, purchaseTiming: "replacement", replacementPremiumPct: 40, startYear: 2026, targetYear: 2030 },
      fuelSwitch: { enabled: false, altFuel: "biodiesel", blendPct: 0, efficiencyPenaltyPct: 0, altFuelPricePerUnit: 95, retrofitCapex: 0, startYear: 2026, targetYear: 2030 },
      flexFuel: { enabled: true, unitsToConvert: 3, altFuel: "biodiesel", highBlendPct: 85, vehicleCapex: 150_000, startYear: 2026, targetYear: 2030 },
    },
  },
  bySystem: {
    hvac: {
      leakFix: { enabled: true, leakImprovementPct: 60, capex: 120_000, startYear: 2026, targetYear: 2030 },
      chargeReduction: { enabled: true, reductionPct: 15, capex: 80_000, startYear: 2026, targetYear: 2030 },
      gasSwitch: { enabled: true, transitionPct: 50, altRefrigerant: "R32", retrofitCapex: 300_000, startYear: 2026, targetYear: 2030 },
    },
  },
} as LeverSettings;

describe("Scope 1 capexLines", () => {
  const r = compute(assets, systems, allOn, 2025);

  it("sums to the same capital the levers report", () => {
    const leverTotal = r.levers.reduce((s, l) => s + l.capex, 0);
    expect(sumCapexLines(r.capexLines)).toBeCloseTo(leverTotal, 6);
  });

  it("sums to each lever's own capex, driver by driver", () => {
    for (const lever of r.levers) {
      const mine = r.capexLines.filter((l) => l.leverId === lever.id);
      expect(sumCapexLines(mine), lever.id).toBeCloseTo(lever.capex, 6);
    }
  });

  it("gives the charging / grid lump its own line, charged once for the company", () => {
    const infra = r.capexLines.filter((l) => l.driverId === "s1-charging-infra");
    expect(infra).toHaveLength(1);
    expect(infra[0].amount).toBeCloseTo(15_000_000, 6);
    expect(infra[0].sourceIds).toEqual(["portfolio"]);
  });

  it("omits the charging lump entirely when nothing is electrified", () => {
    const noElec: LeverSettings = {
      ...allOn,
      byAsset: Object.fromEntries(Object.entries(allOn.byAsset).map(([k, a]) => [
        k, { ...a, electrify: { ...a.electrify, enabled: false } },
      ])),
    };
    const out = compute(assets, systems, noElec, 2025);
    expect(out.capexLines.some((l) => l.driverId === "s1-charging-infra")).toBe(false);
  });

  it("separates vehicles from stationary electrification, and prices vehicles per unit", () => {
    const ev = r.capexLines.find((l) => l.driverId === "s1-ev")!;
    // 4 vehicles at 2,500,000 x 40% premium = 4,000,000
    expect(ev.unit).toMatchObject({ quantity: 4, unitLabel: "vehicles" });
    expect(ev.amount).toBeCloseTo(4_000_000, 6);
    const hp = r.capexLines.find((l) => l.driverId === "s1-heatpump")!;
    expect(hp.amount).toBeCloseTo(3_000_000, 6);
    expect(hp.unit).toBeUndefined();
  });

  it("reports all three refrigerant drivers separately", () => {
    const ids = r.capexLines.filter((l) => l.leverId === "refrigerant").map((l) => l.driverId);
    expect(ids).toEqual(expect.arrayContaining(["s1-ldar", "s1-charge-cut", "s1-gas-retrofit"]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/model/__tests__/capex-lines-s1.test.ts`
Expected: FAIL — `r.capexLines is undefined` (TypeScript will also flag the missing property).

- [ ] **Step 3: Write minimal implementation**

In `lib/model/index.ts`:

1. Add the import:

```typescript
import { groupCapexLines, type CapexContribution } from "./capex";
```

2. Declare the accumulator beside the existing capex accumulators (near `let effMobileT = 0, effStationaryT = 0, effCapex = 0, ...`):

```typescript
/* Pushed from the SAME expressions that accumulate the totals above, so the
   breakdown and the lever total are one set of additions rather than two. */
const capex: CapexContribution[] = [];
```

3. In the asset loop, beside each existing accumulation:

```typescript
// beside: effCapex += acts.efficiency.capex;
capex.push({ driverId: "s1-efficiency", sourceId: a.id, amount: acts.efficiency.capex });

// beside: elecCapex += electrifyCapexFor(a, acts.electrify);
const thisElecCapex = electrifyCapexFor(a, acts.electrify);
elecCapex += thisElecCapex;
if (a.category === "mobile") {
  const e = acts.electrify;
  const perUnit = (e.purchaseTiming ?? "replacement") === "replacement"
    ? e.assetCapex * ((e.replacementPremiumPct ?? 40) / 100)
    : e.assetCapex;
  capex.push({ driverId: "s1-ev", sourceId: a.id, amount: thisElecCapex, quantity: e.unitsToConvert, rate: perUnit });
} else {
  capex.push({ driverId: "s1-heatpump", sourceId: a.id, amount: thisElecCapex });
}

// beside the fuelCapex accumulation, split into its two drivers:
capex.push({ driverId: "s1-fuel-retrofit", sourceId: a.id, amount: fuelOn ? acts.fuelSwitch.retrofitCapex : 0 });
if (flexOn) {
  capex.push({
    driverId: "s1-flexfuel", sourceId: a.id,
    amount: acts.flexFuel!.unitsToConvert * acts.flexFuel!.vehicleCapex,
    quantity: acts.flexFuel!.unitsToConvert, rate: acts.flexFuel!.vehicleCapex,
  });
}
```

**Note on `s1-ev`:** `amount` is `electrifyCapexFor`'s own return value, not `quantity * rate` recomputed. They are equal by construction; using the function's output is what guarantees they stay equal if `electrifyCapexFor` changes.

4. In the system loop:

```typescript
// beside: refCapex += acts.leakFix.capex ?? 0;
capex.push({ driverId: "s1-ldar", sourceId: sys.id, amount: acts.leakFix.capex ?? 0 });

// beside: refCapex += chargeCut!.capex;
capex.push({ driverId: "s1-charge-cut", sourceId: sys.id, amount: chargeCut!.capex });

// beside: refCapex += acts.gasSwitch.retrofitCapex;
capex.push({ driverId: "s1-gas-retrofit", sourceId: sys.id, amount: acts.gasSwitch.retrofitCapex });
```

5. Beside `const elecCapexTotal = elecCapex + (anyElec ? g.infraCapex : 0);`:

```typescript
if (anyElec && g.infraCapex !== 0) {
  // One lump for the whole company, not a share of any asset — which is why it
  // needs its own row rather than hiding inside Electrification (defect B4).
  capex.push({ driverId: "s1-charging-infra", sourceId: "portfolio", amount: g.infraCapex });
}
```

6. Add to `ComputeResult` after `levers`:

```typescript
  /** Itemised capital, one line per driver. Sums to the levers' total capex. */
  capexLines: CapexLine[];
```

with `import type { CapexLine } from "./capex";`, and add `capexLines: groupCapexLines(capex),` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/model/__tests__/capex-lines-s1.test.ts` — PASS, 6 tests.
Then the whole suite: `npx vitest run` — nothing else may break.
Then `npx tsc --noEmit` and `npx eslint lib/model/index.ts lib/model/__tests__/capex-lines-s1.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/model/index.ts lib/model/__tests__/capex-lines-s1.test.ts
git commit -m "Scope 1 emits itemised capex lines

Nine drivers, pushed from the same expressions that already accumulate
effCapex / elecCapex / fuelCapex / refCapex, so the breakdown and the lever
total are one set of additions. Tested by asserting the lines sum to each
lever's own capex on a fixture with every driver switched on.

Vehicles and stationary electrification split into separate lines - a per-unit
EV premium and a heat-pump lump sum are different purchases - and the
charging / grid-upgrade lump gets its own row instead of hiding inside
Electrification (B4)."
```

---

## Task 3: `maxAnnualCapex` and `totalCostOfOwnership`

**Files:**
- Modify: `lib/finance/types.ts` (`LeverMetrics`), `lib/finance/metrics.ts` (`leverMetrics`, `programmeMetrics`)
- Test: `lib/finance/__tests__/metrics-annual.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `LeverMetrics.maxAnnualCapex: number`, `LeverMetrics.totalCostOfOwnership: number`.

- [ ] **Step 1: Write the failing test**

Create `lib/finance/__tests__/metrics-annual.test.ts`:

```typescript
/* Two figures a capital committee reads that the engine did not expose:
   the biggest cheque in any one year, and what the plan costs to own. */

import { describe, expect, it } from "vitest";
import { leverMetrics, programmeMetrics } from "../metrics";
import type { SeriesRow } from "../types";

const row = (year: number, capex: number, opexDelta: number): SeriesRow =>
  ({ year, capex, opexDelta, net: capex + opexDelta, tonnes: 10, discount: 1 });

describe("maxAnnualCapex", () => {
  it("is the largest single year's capex, not the total", () => {
    const rows = [row(2026, 100, 0), row(2027, 400, 0), row(2028, 250, 0)];
    const m = leverMetrics(rows, 750);
    expect(m.maxAnnualCapex).toBe(400);
    expect(m.totalCapex).toBe(750);
  });

  it("is zero for a plan with no capital at all", () => {
    expect(leverMetrics([row(2026, 0, -50)], 0).maxAnnualCapex).toBe(0);
  });

  /* The programme figure must come from the MERGED by-year series: two levers
     each spending 300 in 2027 need one cheque of 600 that year. Reading the max
     off the flattened rows would report 300 and understate the envelope. */
  it("adds concurrent levers within a year before taking the max", () => {
    const a = [row(2026, 100, 0), row(2027, 300, 0)];
    const b = [row(2027, 300, 0), row(2028, 50, 0)];
    expect(programmeMetrics([a, b]).maxAnnualCapex).toBe(600);
  });
});

describe("totalCostOfOwnership", () => {
  it("is undiscounted capex plus every running-cost change over the life", () => {
    const rows = [row(2026, 1_000, 0), row(2027, 0, -200), row(2028, 0, -200)];
    expect(leverMetrics(rows, 1_000).totalCostOfOwnership).toBe(600);
  });

  it("goes negative when a plan more than pays for itself", () => {
    const rows = [row(2026, 100, 0), row(2027, 0, -300)];
    expect(leverMetrics(rows, 100).totalCostOfOwnership).toBe(-200);
  });

  it("totals across levers at programme level", () => {
    const a = [row(2026, 100, 0)];
    const b = [row(2026, 0, -30)];
    expect(programmeMetrics([a, b]).totalCostOfOwnership).toBe(70);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/finance/__tests__/metrics-annual.test.ts`
Expected: FAIL — `expected undefined to be 400`.

- [ ] **Step 3: Write minimal implementation**

In `lib/finance/types.ts`, add to `LeverMetrics`:

```typescript
  /** Largest single year's capex — what a capital committee rations, as opposed
   *  to `totalCapex`, which is the whole programme's lifetime spend. Distinct
   *  from `peakFunding`: that is peak CUMULATIVE net cash (a financing need,
   *  net of savings), this is one year's outgoing capital. */
  maxAnnualCapex: number;
  /** Undiscounted capex plus every running-cost change across the life.
   *  Negative when the plan more than pays for itself. */
  totalCostOfOwnership: number;
```

In `lib/finance/metrics.ts`, inside `leverMetrics`'s returned object:

```typescript
    maxAnnualCapex: rows.reduce((mx, r) => Math.max(mx, r.capex), 0),
    totalCostOfOwnership: sum(rows, (r) => r.net),
```

In `programmeMetrics`'s return, override `maxAnnualCapex` from the merged series:

```typescript
  return {
    ...m,
    totalCapex: capex,
    paybackYears: pbSource.paybackYears,
    paybackKind: pbSource.paybackKind,
    peakFunding: pbSource.peakFunding,
    // From the MERGED series: two levers spending in the same year need one
    // cheque that year. `m` is built from the flattened rows, where the same
    // year appears once per lever, so its max understates the envelope.
    maxAnnualCapex: pbSource.maxAnnualCapex,
  };
```

`totalCostOfOwnership` needs no override — summing `net` over the flattened rows and over the merged rows give the same number.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/finance/__tests__/metrics-annual.test.ts` — PASS, 6 tests.
Then `npx vitest run` (full suite), `npx tsc --noEmit`, `npx eslint lib/finance/`.

- [ ] **Step 5: Commit**

```bash
git add lib/finance/types.ts lib/finance/metrics.ts lib/finance/__tests__/metrics-annual.test.ts
git commit -m "Expose max annual capex and cost to own

A capital committee rations the biggest cheque in any one year, not the
programme's lifetime total, and asks what the plan costs to own. Neither figure
was exposed. peakFunding is not the first of them - that is peak CUMULATIVE net
cash, a financing requirement net of savings.

The programme figure is read off the MERGED by-year series: two levers each
spending in 2027 need one cheque that year, and the flattened rows carry that
year once per lever."
```

---

## Task 4: Scope 2 emits its capex lines

**Files:**
- Modify: `lib/scope2/model/efficiency.ts` (`EfficiencyResult`, return the three-way split), `lib/scope2/model/generation.ts` (`GenerationResult`, return the gross split and subsidy), `lib/scope2/model/index.ts:139-140` (push contributions), `lib/scope2/model/index.ts:75` (`Scope2ComputeResult` gains `capexLines`)
- Test: `lib/scope2/model/__tests__/capex-lines-s2.test.ts`

**Interfaces:**
- Consumes: `CapexContribution`, `groupCapexLines`, `sumCapexLines` from Task 1.
- Produces: `Scope2ComputeResult.capexLines: CapexLine[]`; `EfficiencyResult` (`lib/scope2/model/efficiency.ts:7`) gains `capexParts: { led: number; motor: number; bms: number }`; `GenerationResult` (`lib/scope2/model/generation.ts:8`) gains `capexParts: { solarGross: number; batteryGross: number; subsidy: number }` (`subsidy` is negative or zero). `GenerationResult.effectiveKwp` already exists — do not duplicate it into `capexParts`.

- [ ] **Step 1: Write the failing test**

Create `lib/scope2/model/__tests__/capex-lines-s2.test.ts`:

```typescript
/* Scope 2 CAPEX lines. Same load-bearing invariant as Scope 1 — lines sum to
   lever capex — plus two Scope 2 specifics: the subsidy is a negative line, and
   green procurement is a line with no capital that must still appear. */

import { describe, expect, it } from "vitest";
import { computeScope2 } from "../index";
import { sumCapexLines } from "@/lib/model/capex";
import { DEFAULT_FINANCE_ASSUMPTIONS } from "@/lib/finance/assumptions";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { Facility, Scope2Levers } from "../types";

const facilities: Facility[] = [
  { id: "p1", name: "Plant 1", annualLoadKwh: 4_000_000, tariffPerKwh: 9, loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 }, roofSpaceM2: 11_000, peakLoadKw: 0, gridEf: 0.71, irradiance: 1400, isolated: false, existingSolarKwp: 0, existingRenewablePct: 0 },
  { id: "p2", name: "Plant 2", annualLoadKwh: 2_000_000, tariffPerKwh: 8, loadSplit: { lightingPct: 20, motorPct: 30, hvacPct: 30 }, roofSpaceM2: 5_500, peakLoadKw: 0, gridEf: 0.71, irradiance: 1400, isolated: false, existingSolarKwp: 0, existingRenewablePct: 0 },
];

const eff = (over: Partial<Scope2Levers["byFacility"][string]["efficiency"]> = {}) => ({
  enabled: true, ledPct: 100, motorPct: 50, bmsPct: 0,
  ledCapex: 1_000_000, motorCapex: 2_000_000, bmsCapex: 500_000,
  startYear: 2026, targetYear: 2030, ...over,
});
const gen = (over: Partial<Scope2Levers["byFacility"][string]["generation"]> = {}) => ({
  enabled: true, solarKwp: 500, batteryKwh: 200, exportMode: "netMetering" as const,
  solarCapexPerKw: 45_000, batteryCapexPerKwh: 28_000, subsidyPct: 20,
  startYear: 2026, targetYear: 2030, ...over,
});

const levers: Scope2Levers = {
  byFacility: {
    p1: { efficiency: eff(), generation: gen() },
    // A different solar rate, so the mixed-rate path is exercised.
    p2: { efficiency: eff({ ledCapex: 400_000 }), generation: gen({ solarKwp: 300, solarCapexPerKw: 38_000 }) },
  },
  procurement: {
    enabled: true, ppaPct: 30, greenTariffPct: 0, recPct: 0,
    ppaStrikeDeltaPerKwh: 0.4, greenTariffPremiumPerKwh: 0, recPricePerKwh: 0.45,
    re100Exclusion: false, startYear: 2026, targetYear: 2030,
  },
};

describe("Scope 2 capexLines", () => {
  const r = computeScope2(facilities, levers, 2025, DEFAULT_SETTINGS.assumptions);

  it("sums to the same capital the levers report", () => {
    const leverTotal = r.levers.reduce((s, l) => s + l.capex, 0);
    expect(sumCapexLines(r.capexLines)).toBeCloseTo(leverTotal, 6);
  });

  it("sums to each lever's own capex", () => {
    for (const lever of r.levers) {
      const mine = r.capexLines.filter((l) => l.leverId === lever.id);
      expect(sumCapexLines(mine), lever.id).toBeCloseTo(lever.capex, 6);
    }
  });

  it("splits efficiency into LED, motors and BMS, scaled by their own sliders", () => {
    const led = r.capexLines.find((l) => l.driverId === "s2-led")!;
    // p1 1,000,000 x 100% + p2 400,000 x 100%
    expect(led.amount).toBeCloseTo(1_400_000, 6);
    const motor = r.capexLines.find((l) => l.driverId === "s2-motor")!;
    // both at 50% of 2,000,000
    expect(motor.amount).toBeCloseTo(2_000_000, 6);
    // bmsPct is 0 on both, so the line is dropped rather than shown as zero
    expect(r.capexLines.some((l) => l.driverId === "s2-bms")).toBe(false);
  });

  it("reports the solar subsidy as a negative line", () => {
    const subsidy = r.capexLines.find((l) => l.driverId === "s2-solar-subsidy")!;
    expect(subsidy.amount).toBeLessThan(0);
    const solar = r.capexLines.find((l) => l.driverId === "s2-solar")!;
    const battery = r.capexLines.find((l) => l.driverId === "s2-battery")!;
    // gross x (1 - 20%) == the net figure generation.ts computes
    expect(solar.amount + battery.amount + subsidy.amount)
      .toBeCloseTo((solar.amount + battery.amount) * 0.8, 6);
  });

  it("flags the solar rate as mixed and weights it by kW", () => {
    const solar = r.capexLines.find((l) => l.driverId === "s2-solar")!;
    expect(solar.mixed).toBe(true);
    expect(solar.unit!.unitLabel).toBe("kW");
    expect(solar.unit!.rate).toBeGreaterThan(38_000);
    expect(solar.unit!.rate).toBeLessThan(45_000);
  });

  it("keeps green procurement as a line with no capital", () => {
    const proc = r.capexLines.find((l) => l.driverId === "s2-procurement")!;
    expect(proc.amount).toBe(0);
    expect(proc.edit).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/scope2/model/__tests__/capex-lines-s2.test.ts`
Expected: FAIL — `r.capexLines is undefined`.

- [ ] **Step 3: Write minimal implementation**

In `lib/scope2/model/efficiency.ts`, add to the returned object beside the existing `capex`:

```typescript
    // The same three products the capex line above sums, kept separately so
    // index.ts can report them without re-deriving.
    capexParts: {
      led: a.ledCapex * (a.ledPct / 100),
      motor: a.motorCapex * (a.motorPct / 100),
      bms: a.bmsCapex * (a.bmsPct / 100),
    },
```

In `lib/scope2/model/generation.ts`, beside the existing `capex`:

```typescript
    capexParts: {
      solarGross: effectiveKwp * a.solarCapexPerKw,
      batteryGross: a.batteryKwh * a.batteryCapexPerKwh,
      // Negative: a deduction, so the three parts sum to `capex` above.
      subsidy: -(effectiveKwp * a.solarCapexPerKw + a.batteryKwh * a.batteryCapexPerKwh) * (a.subsidyPct / 100),
    },
```

In `lib/scope2/model/index.ts`: import `groupCapexLines`, `type CapexContribution`, `type CapexLine` from `@/lib/model/capex`; declare `const capex: CapexContribution[] = [];`; and inside the per-facility loop, where the efficiency and generation impacts are already computed:

```typescript
capex.push(
  { driverId: "s2-led", sourceId: f.id, amount: eff.capexParts.led },
  { driverId: "s2-motor", sourceId: f.id, amount: eff.capexParts.motor },
  { driverId: "s2-bms", sourceId: f.id, amount: eff.capexParts.bms },
  { driverId: "s2-solar", sourceId: f.id, amount: gen.capexParts.solarGross,
    quantity: gen.effectiveKwp, rate: acts.generation.solarCapexPerKw },
  { driverId: "s2-battery", sourceId: f.id, amount: gen.capexParts.batteryGross,
    quantity: acts.generation.batteryKwh, rate: acts.generation.batteryCapexPerKwh },
  { driverId: "s2-solar-subsidy", sourceId: f.id, amount: gen.capexParts.subsidy },
);
```

`eff` and `gen` are the existing locals at `lib/scope2/model/index.ts:139-140`:

```typescript
const eff = applyEfficiency(f, acts.efficiency);
const gen = applyGeneration(f, acts.generation, eff.residualLoadKwh);
```

Push inside that same loop iteration. Do **not** call `applyEfficiency` or `applyGeneration` a second time — a second call is a second expression computing the same rupees.

After the loop, one portfolio-level line:

```typescript
// No capital at all — a per-kWh premium instead. It earns a row because it is
// the on-screen answer to why the Lowest CAPEX mix is so cheap (spec 5.2).
capex.push({ driverId: "s2-procurement", sourceId: "portfolio", amount: 0 });
```

Add `capexLines: CapexLine[]` to `Scope2ComputeResult` and `capexLines: groupCapexLines(capex),` to the return.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/scope2/model/__tests__/capex-lines-s2.test.ts` — PASS, 6 tests.
Then `npx vitest run`, `npx tsc --noEmit`, `npx eslint lib/scope2/`.

- [ ] **Step 5: Commit**

```bash
git add lib/scope2/model/ lib/scope2/model/__tests__/capex-lines-s2.test.ts
git commit -m "Scope 2 emits itemised capex lines

Six drivers plus the zero-capital procurement row. efficiencyImpact and
generationImpact now return the parts they already multiply, so index.ts reports
them without a second expression computing the same rupees.

The solar subsidy is a negative line rather than a hidden multiplier, so the
three solar rows visibly sum to the net figure. Green procurement is a line with
no capital and an explicit null edit target - omitting zero-capex lines is how
the Lowest CAPEX plan's price became unexplainable."
```

---

## Task 5: Mixes carry their lines, and the budget rations peak-year capital

**Files:**
- Modify: `lib/combined-balance.ts` (`MixKpis`, `MixOption`, `kpisOf`, `measure`, the gate)
- Test: `lib/__tests__/combined-balance.test.ts` (append)

**Interfaces:**
- Consumes: `ComputeResult.capexLines` (Task 2), `Scope2ComputeResult.capexLines` (Task 4), `LeverMetrics.maxAnnualCapex` / `.totalCostOfOwnership` (Task 3), `sumCapexLines` (Task 1).
- Produces: `MixKpis.maxAnnualCapex`, `MixKpis.costToOwn`, `MixOption.capexLines`. Plan 2b's UI reads exactly these.

- [ ] **Step 1: Write the failing test**

Append to `lib/__tests__/combined-balance.test.ts`:

```typescript
/* ── Deliverable 2a: every mix carries its own itemised capital ───────────── */
describe("mix capex lines and the peak-year budget", () => {
  const options = suggestMixOptions(inp, 0.5);

  /* THE invariant. A breakdown that does not add up to the total printed beside
     it is worse than no breakdown, and the two are computed in different files. */
  it("the lines add up to the total the card shows", () => {
    for (const o of options) {
      expect(sumCapexLines(o.capexLines), o.objective).toBeCloseTo(o.kpis.totalCapex, 4);
    }
  });

  it("carries both scopes' lines on one mix", () => {
    const scopes = new Set(options.flatMap((o) => o.capexLines.map((l) => l.scope)));
    expect(scopes.has(1) || scopes.has(2)).toBe(true);
    for (const o of options) {
      for (const l of o.capexLines) expect(["efficiency", "solar", "procurement", "electrification", "fuelSwitch", "refrigerant"]).toContain(l.leverId);
    }
  });

  it("reports peak-year capital no greater than the lifetime total", () => {
    for (const o of options) {
      expect(o.kpis.maxAnnualCapex, o.objective).toBeLessThanOrEqual(o.kpis.totalCapex + 1e-6);
      expect(o.kpis.maxAnnualCapex, o.objective).toBeGreaterThanOrEqual(0);
    }
  });

  it("reports a cost to own that differs from the capital alone", () => {
    // Cost to own folds in the running-cost change, so a saving-heavy mix owns
    // for less than it costs to buy.
    const saver = options.find((o) => o.kpis.annualOpexDelta < 0);
    if (saver) expect(saver.kpis.costToOwn).toBeLessThan(saver.kpis.totalCapex);
  });

  /* B5: the cap used to bound LIFETIME capital, which makes a ten-year staged
     programme at 5 Cr/yr look unaffordable beside a one-shot purchase of the
     same annual cost. Companies approve an annual envelope. */
  it("rations the budget on peak-year capital, not the lifetime total", () => {
    for (const capexBudget of [5_000_000, 50_000_000]) {
      for (const o of suggestMixOptions(inp, 0.5, { capexBudget })) {
        if (o.budgetLimited) continue; // the unavoidable-floor case
        expect(o.kpis.maxAnnualCapex, `${o.objective} @ ${capexBudget}`)
          .toBeLessThanOrEqual(capexBudget + 1e-6);
      }
    }
  });

  it("admits a staged plan the lifetime basis would have refused", () => {
    // A budget below total capital but above any single year must now be
    // satisfiable, where the old lifetime gate would have rejected it.
    const uncapped = suggestMixOptions(inp, 0.5)[0];
    const perYear = uncapped.kpis.maxAnnualCapex;
    if (perYear <= 0 || perYear >= uncapped.kpis.totalCapex) return; // no staging in this fixture
    const staged = suggestMixOptions(inp, 0.5, { capexBudget: perYear })[0];
    expect(staged.kpis.maxAnnualCapex).toBeLessThanOrEqual(perYear + 1e-6);
    expect(staged.kpis.totalCapex).toBeGreaterThan(perYear);
  });
});
```

Add `import { sumCapexLines } from "@/lib/model/capex";` to the file's imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/combined-balance.test.ts`
Expected: FAIL — `o.capexLines is undefined`, and `maxAnnualCapex` / `costToOwn` undefined.

- [ ] **Step 3: Write minimal implementation**

In `lib/combined-balance.ts`:

1. `MixKpis` gains:

```typescript
  /** Biggest single year's capital — what the CAPEX budget rations. */
  maxAnnualCapex: number;
  /** Undiscounted capex plus running-cost change over the life. Negative when
   *  the mix more than pays for itself. */
  costToOwn: number;
```

2. `MixOption` gains:

```typescript
  /** Itemised capital, one line per driver. Sums to `kpis.totalCapex`. */
  capexLines: CapexLine[];
```

with `import { sumCapexLines, type CapexLine } from "@/lib/model/capex";` (`sumCapexLines` is used by the assertion in step 4's note only if you add one — otherwise import just the type).

3. `kpisOf` returns the two new fields from the same `programme` it already computes:

```typescript
    maxAnnualCapex: programme.maxAnnualCapex,
    costToOwn: programme.totalCostOfOwnership,
```

4. `measure`'s capex switches basis — this is the whole of B5:

```typescript
  const measure = (d: CombinedDials) => {
    const { r1, r2 } = results(inp, d, true);
    // PEAK-YEAR capital, not the lifetime total: a capital committee approves an
    // annual envelope. Same function the card's "Biggest single year" row shows,
    // so the gate and the KPI cannot disagree.
    return { reduction: reductionOf(r1, r2, inp.targetYear), capex: maxAnnualCapexOf(r1, r2) };
  };
```

5. Add the helper beside `totalCapexOf`:

```typescript
/** The programme's biggest single year of capital, on exactly the basis the
 *  option card shows. Same shared `costedLevers` as `totalCapexOf` — see the
 *  note there about why the gate must not compute its own. */
function maxAnnualCapexOf(r1: ReturnType<typeof compute>, r2: ReturnType<typeof computeScope2>): number {
  return programmeMetrics(costedLevers(r1, r2).map((l) => l.series)).maxAnnualCapex;
}
```

6. In `suggestMixOptions`, add `capexLines: [...r1.capexLines, ...r2.capexLines],` to the returned option.

7. Update the doc comment on `MixOption.budgetLimited` and the header block: the cap is now peak-year, and the "unavoidable floor" it mentions is now a floor on peak-year capital.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/combined-balance.test.ts` — PASS.
Then `npx vitest run` — the pre-existing budget test `"a CAPEX budget caps EVERY basis"` asserts `kpis.totalCapex <= capexBudget`. That assertion belonged to the lifetime basis and is now wrong; change it to `kpis.maxAnnualCapex` and add a comment saying the basis changed in B5, not the behaviour. Do not weaken it to a tolerance.
Then `npx tsc --noEmit`, `npx eslint lib/combined-balance.ts lib/__tests__/combined-balance.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/combined-balance.ts lib/__tests__/combined-balance.test.ts
git commit -m "Mixes carry itemised capital, and the budget rations peak-year spend

Every MixOption now carries capexLines from both scopes, with a test asserting
they sum to the totalCapex printed beside them - the two are computed in
different files, so the invariant needs pinning.

The CAPEX budget now bounds the BIGGEST SINGLE YEAR rather than lifetime total
(B5). A capital committee approves an annual envelope; the old basis made a
ten-year staged programme at 5 Cr/yr look unaffordable beside a one-shot
purchase of the same annual cost. The gate reads the same maxAnnualCapexOf the
card's Biggest single year row shows.

Cost to own joins the KPIs, so the mix that spends 27 Cr can finally explain
itself against the one that spends 1 L."
```

---

## Self-Review

**Spec coverage (§5):**

| Spec requirement | Task |
|---|---|
| §5.1 all fifteen drivers + procurement | 1 (registry), 2 (S1's nine), 4 (S2's seven) |
| §5.2 quantity × rate only where real | 1 (`unit` omitted for lump sums), tested |
| §5.2 procurement row despite ₹0 | 1 (`alwaysShow`), 4 (pushed), tested |
| §5.2 `infraCapex` own row (B4) | 2, tested both present and absent |
| §5.2 quantity-weighted mixed rate | 1, tested; exercised end-to-end in 4 |
| §5.3 Total capital | already exists |
| §5.3 Biggest single year | 3 (metric), 5 (KPI) |
| §5.3 Cost to own, undiscounted | 3 (metric), 5 (KPI) |
| §5.3 Running cost change | already exists |
| §5.6 B5 budget on peak-year | 5 |
| §5.7 lines sum to total | 2, 4 (per scope), 5 (per mix) |
| §5.4 edit behaviour | **Plan 2b** — this plan produces `CapexEditTarget` addresses only |
| §5.5 layout | **Plan 2b** |
| §5.6 B7 unreachability, B3 card sentence | **Plan 2b** |

No §5 engine requirement is unassigned. The four UI items are explicitly deferred to 2b, which is this plan's stated scope boundary.

**Placeholder scan:** none — every code step carries real code; no "add error handling" or "similar to Task N".

**Type consistency:** `CapexLine`, `CapexContribution`, `CapexDriverId`, `CAPEX_DRIVERS`, `groupCapexLines`, `sumCapexLines` are defined in Task 1 and used under those exact names in 2, 4, 5. `maxAnnualCapex` and `totalCostOfOwnership` are defined in Task 3 and consumed in Task 5 — note the KPI is renamed to `costToOwn` on `MixKpis` deliberately (a card-facing name), and Task 5 step 3 shows the mapping explicitly. `capexParts` field names (`led`/`motor`/`bms`, `solarGross`/`batteryGross`/`subsidy`/`effectiveKwp`) are declared in Task 4's Interfaces block and used in the same task.

**Two notes for the executor:**

1. **Task 2's `s1-ev` line.** `amount` must be `electrifyCapexFor`'s return value, never `quantity * rate` recomputed. They are equal today by construction; using the function's output is what keeps them equal if `electrifyCapexFor`'s premium logic changes. The same rule applies to `s2-solar`, where `amount` is `gen.capexParts.solarGross` rather than `effectiveKwp * rate` written out again.

2. **Task 5 changes an existing assertion.** `"a CAPEX budget caps EVERY basis"` currently asserts `kpis.totalCapex <= capexBudget`. Under B5 the cap bounds peak-year capital, so that assertion becomes false for any staged plan — it must move to `kpis.maxAnnualCapex`, with a comment recording that the basis changed, not the guarantee. If it is instead loosened to a tolerance or deleted, B5 ships untested.
