# Scope 1 Planner — Full Improvement Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the planner's data-integrity bugs and close its spec gaps — export workbook, biogenic split, target tracking, lifespan guardrails, financial depth — then polish UX.

**Architecture:** All emissions/finance math stays in the pure model layer (`lib/model/*`); new export shaping lives in pure `lib/export.ts`; the only DOM-touching additions are a thin download helper and React components. UI never computes emissions.

**Tech Stack:** Next.js 16.2.9 (App Router), React 19, TypeScript 5, Tailwind 4, Recharts 3, Vitest 4, exceljs (new dependency).

**Working directory for every command:** `C:\Users\rakes\Documents\Dashboard Module\scenario\scope1-decarb` (a git repo on branch `scope1-planner`). Shell is PowerShell.

**Spec:** `docs/superpowers/specs/2026-06-10-scope1-improvement-pass-design.md`

**Caution:** This project pins Next.js 16.2.9, which has breaking changes vs older Next.js. None of these tasks touch framework-level code (routing, config, server components), so no Next-specific care is needed — but if you do end up editing `next.config.ts` or `app/`, read `node_modules/next/dist/docs/` first (per `AGENTS.md`).

**Conventions seen in this codebase (follow them):**
- Model files start with a `/* ==== ... ==== */` banner comment describing the module.
- Tests use vitest `describe/it/expect`, no mocks, real default data from `lib/defaults.ts`.
- Components are function components with Tailwind classes; shared atoms in `components/ui/`.
- Numbers display via `fmt`/`fmtNum`/`pct`/`fmtK` from `lib/utils.ts`; currency symbol is `CURRENCY` from `lib/defaults.ts`.

---

### Task 1: `simplePayback` finance helper

**Files:**
- Modify: `lib/model/finance.ts`
- Test: `lib/model/__tests__/finance.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/model/__tests__/finance.test.ts` inside the existing `describe("finance", ...)` block (add `simplePayback` to the import from `../finance`):

```ts
  it("simplePayback = capex ÷ annual saving", () => {
    expect(simplePayback(1000, 250)).toBeCloseTo(4, 5);
  });

  it("simplePayback is null when there is no saving", () => {
    expect(simplePayback(1000, 0)).toBeNull();
    expect(simplePayback(1000, -50)).toBeNull();
  });

  it("simplePayback is 0 when there is nothing to pay back", () => {
    expect(simplePayback(0, 100)).toBe(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/model/__tests__/finance.test.ts`
Expected: FAIL — `simplePayback` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/model/finance.ts`:

```ts
/** Years to recover a CAPEX from a positive annual saving; null when it never pays back. */
export function simplePayback(capex: number, annualSaving: number): number | null {
  if (capex <= 0) return 0;
  if (annualSaving <= 0) return null;
  return capex / annualSaving;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/model/__tests__/finance.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```powershell
git add lib/model/finance.ts lib/model/__tests__/finance.test.ts
git commit -m "feat(model): add simplePayback finance helper"
```

---

### Task 2: OPEX component breakdown + payback in `compute()`

Extends `LeverSummary` with `opexParts` (the named cost/saving components that sum to `annualOpexDelta`) and `paybackYears`, and adds a scenario-level `kpis.paybackYears`. Pure model change — no UI yet.

**Files:**
- Modify: `lib/model/index.ts`
- Test: `lib/model/__tests__/compute.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `lib/model/__tests__/compute.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { compute } from "../index";
import { DEFAULT_ASSETS, DEFAULT_SETTINGS, DEFAULT_SYSTEMS } from "../../defaults";
import type { CombustionAsset, LeverSettings } from "../types";

/** Single diesel asset, fuel switch to free biodiesel at 50% blend: known saving. */
const asset: CombustionAsset = {
  id: "a1", name: "Test genset", category: "stationary", fuelType: "diesel",
  unit: "L", annualVolume: 10_000, opex: 1_000_000, remainingLife: 10, unitCount: 1,
};
const settings: LeverSettings = {
  assumptions: { gridEf: 0.71, renewableSourcingPct: 100, recCostPerTonne: 0, carbonPricePerTonne: 0, infraCapex: 0 },
  refrigerant: { enabled: false, transitionPct: 0, altRefrigerant: "R290", leakImprovementPct: 0, retrofitCapex: 0, startYear: 2026, rampYears: 4 },
  byAsset: {
    a1: {
      electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 0, startYear: 2026, targetYear: 2032 },
      fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 50, efficiencyPenaltyPct: 0, altFuelPricePerUnit: 0, retrofitCapex: 1_000_000, startYear: 2026, targetYear: 2030 },
    },
  },
};

describe("compute — opex parts and payback", () => {
  it("each lever's opexParts sum to its annualOpexDelta (default scenario)", () => {
    const r = compute(DEFAULT_ASSETS, DEFAULT_SYSTEMS, DEFAULT_SETTINGS, 2025);
    for (const l of r.levers) {
      const sum = l.opexParts.reduce((s, p) => s + p.amount, 0);
      expect(sum).toBeCloseTo(l.annualOpexDelta, 4);
    }
  });

  it("fuel switch to a free fuel pays back: 1M capex ÷ 500k/yr saving = 2 yrs", () => {
    // Displaced fossil spend = 10,000 L × 50% × (1,000,000 ÷ 10,000)/L = 500,000/yr.
    const r = compute([asset], [], settings, 2025);
    const fuel = r.levers.find((l) => l.id === "fuelSwitch")!;
    expect(fuel.annualOpexDelta).toBeCloseTo(-500_000, 0);
    expect(fuel.paybackYears).toBeCloseTo(2, 3);
    expect(r.kpis.paybackYears).toBeCloseTo(2, 3); // only active lever
  });

  it("payback is null when the lever costs money to run", () => {
    const r = compute(DEFAULT_ASSETS, DEFAULT_SYSTEMS, DEFAULT_SETTINGS, 2025);
    for (const l of r.levers.filter((x) => x.enabled && x.annualOpexDelta > 0)) {
      expect(l.paybackYears).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/model/__tests__/compute.test.ts`
Expected: FAIL — `opexParts` / `paybackYears` do not exist (TypeScript error or undefined).

- [ ] **Step 3: Implement in `lib/model/index.ts`**

3a. Add to the imports from `./finance`:

```ts
import { weightedCostPerTonne, yearsToTarget, annualizedCapex, simplePayback } from "./finance";
```

3b. Add the `OpexPart` interface and extend `LeverSummary` (currently at `lib/model/index.ts:27-38`):

```ts
/** One named running-cost component. Positive = cost, negative = saving. */
export interface OpexPart {
  label: string;
  amount: number;
}

export interface LeverSummary {
  id: "electrification" | "fuelSwitch" | "refrigerant";
  label: string;
  colorIdx: number;
  scope: 1 | 2;
  enabled: boolean;
  abatementT: number; // full-ramp Scope 1 tonnes/yr
  capex: number;
  annualOpexDelta: number;
  annualCost: number; // annualized capex + opex delta
  costPerTonne: number;
  opexParts: OpexPart[]; // components summing to annualOpexDelta
  paybackYears: number | null; // capex ÷ annual saving, null if never
}
```

3c. In `compute()`, just after the line `const elecCapexTotal = elecCapex + (anyElec ? g.infraCapex : 0);` (around line 149), build the parts:

```ts
  const elecParts: OpexPart[] = [
    { label: "New electricity cost", amount: elecEnergyCost },
    { label: "REC cost on added Scope 2", amount: scope2SpillFullT * g.recCostPerTonne },
    { label: "Displaced fuel & maintenance", amount: -elecDispOpex },
  ];
  const fuelParts: OpexPart[] = [
    { label: "Alt-fuel spend", amount: fuelNewSpend },
    { label: "Displaced fossil fuel spend", amount: -fuelDispSpend },
  ];
  const refParts: OpexPart[] = [
    { label: "Gas top-up savings", amount: -refGasSavingOpex },
    { label: "Carbon-price value of abatement", amount: -refCarbonValue },
  ];
```

3d. Extend the `mk` helper to accept and emit the new fields (replace the whole `mk` definition at lines 151-162):

```ts
  const mk = (
    id: LeverSummary["id"], label: string, colorIdx: number, abatementT: number,
    capex: number, opexDelta: number, ramp: { startYear: number; rampYears: number },
    opexParts: OpexPart[],
  ): LeverSummary & { startYear: number; rampYears: number } => {
    const annualCost = annualizedCapex(capex, CAPEX_LIFETIME) + opexDelta;
    return {
      id, label, colorIdx, scope: 1, enabled: abatementT > 0,
      abatementT: Math.max(0, abatementT), capex, annualOpexDelta: opexDelta, annualCost,
      costPerTonne: abatementT > 0 ? annualCost / abatementT : 0,
      opexParts,
      paybackYears: simplePayback(capex, -opexDelta),
      ...ramp,
    };
  };

  const leverRows = [
    mk("electrification", "Electrification", 5, elecAbate, elecCapexTotal, elecOpexDelta, elecR, elecParts),
    mk("fuelSwitch", "Fuel switch", 2, fuelAbate, fuelCapex, fuelOpexDelta, fuelR, fuelParts),
    mk("refrigerant", "Refrigerant", 1, refAbate, refCapex, refOpexDelta, { startYear: s.refrigerant.startYear, rampYears: s.refrigerant.rampYears }, refParts),
  ];
```

3e. Add the scenario payback to the KPIs. After `const totalCapex = ...` (around line 193) add:

```ts
  const totalOpexDelta = activeLevers.reduce((s2, l) => s2 + l.annualOpexDelta, 0);
```

and inside the returned `kpis` object add the field (and add `paybackYears: number | null;` to the `kpis` type in `ComputeResult`):

```ts
      paybackYears: simplePayback(totalCapex, -totalOpexDelta),
```

- [ ] **Step 4: Run the full model test suite**

Run: `npx vitest run`
Expected: PASS — new tests green, all existing tests untouched and green.

- [ ] **Step 5: Commit**

```powershell
git add lib/model/index.ts lib/model/__tests__/compute.test.ts
git commit -m "feat(model): opex component breakdown and payback per lever + scenario payback KPI"
```

---

### Task 3: Asset-lifespan validation helper

**Files:**
- Create: `lib/model/validate.ts`
- Test: `lib/model/__tests__/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/model/__tests__/validate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { outlivesAsset, retirementYear } from "../validate";
import type { CombustionAsset } from "../types";

const asset = (remainingLife: number): CombustionAsset => ({
  id: "a", name: "Genset", category: "stationary", fuelType: "diesel",
  unit: "L", annualVolume: 1000, opex: 100, remainingLife, unitCount: 1,
});

describe("lifespan validation", () => {
  it("retirementYear = base year + remaining life", () => {
    expect(retirementYear(asset(6), 2025)).toBe(2031);
  });

  it("action completing at or before retirement is fine", () => {
    expect(outlivesAsset(asset(6), 2025, 2031)).toBe(false);
    expect(outlivesAsset(asset(6), 2025, 2028)).toBe(false);
  });

  it("action completing after retirement is flagged", () => {
    expect(outlivesAsset(asset(6), 2025, 2032)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/model/__tests__/validate.test.ts`
Expected: FAIL — module `../validate` not found.

- [ ] **Step 3: Implement**

Create `lib/model/validate.ts`:

```ts
/* ============================================================
   Scenario sanity checks — pure advisory validation. Spec §5:
   don't plan a retrofit on an asset that retires first.
   ============================================================ */

import type { CombustionAsset } from "./types";

/** FY in which the asset retires: base year + remaining useful life. */
export function retirementYear(asset: CombustionAsset, baseYear: number): number {
  return baseYear + asset.remainingLife;
}

/** True when an action completing in `targetYear` outlives the asset. */
export function outlivesAsset(asset: CombustionAsset, baseYear: number, targetYear: number): boolean {
  return targetYear > retirementYear(asset, baseYear);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/model/__tests__/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/model/validate.ts lib/model/__tests__/validate.test.ts
git commit -m "feat(model): asset lifespan validation helpers"
```

---

### Task 4: Store fixes — collision-proof ids + real scenario timestamps

The id generator (`let idSeq = 0` at `lib/store.tsx:82`) resets each page load while localStorage holds previously minted ids (`c-0`, `r-0`, `sc-0`…), so a new asset can collide with a persisted one. Fix with a pure `uniqueId` that scans current ids. Also `saveScenario` writes `savedAt: 0` — use `Date.now()` and show the date.

**Files:**
- Create: `lib/store-helpers.ts`
- Modify: `lib/store.tsx`
- Modify: `components/tabs/BuilderTab.tsx` (saved-scenario date display)
- Test: `lib/__tests__/store-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/store-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { allIds, uniqueId } from "../store-helpers";

describe("uniqueId", () => {
  it("starts at prefix-0 when nothing is taken", () => {
    expect(uniqueId("c", [])).toBe("c-0");
  });

  it("skips ids already in use (the post-reload collision case)", () => {
    expect(uniqueId("c", ["c-0", "c-1"])).toBe("c-2");
  });

  it("fills gaps and ignores other prefixes", () => {
    expect(uniqueId("c", ["c-0", "c-2", "r-1"])).toBe("c-1");
  });
});

describe("allIds", () => {
  it("flattens every year's rows to their ids", () => {
    const byYear = {
      2024: [{ id: "c-0" }, { id: "c-1" }],
      2025: [{ id: "c-0" }],
    };
    expect(allIds(byYear).sort()).toEqual(["c-0", "c-0", "c-1"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/store-helpers.test.ts`
Expected: FAIL — module `../store-helpers` not found.

- [ ] **Step 3: Implement the helpers**

Create `lib/store-helpers.ts`:

```ts
/* ============================================================
   Pure store helpers. uniqueId never collides with ids already
   persisted in localStorage — the old module-level counter reset
   to 0 on every page load and could mint duplicates.
   ============================================================ */

/** First unused `prefix-N`, scanning the ids currently in state. */
export function uniqueId(prefix: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  let i = 0;
  while (taken.has(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}

/** All ids across every year of a by-year record. */
export function allIds(byYear: Record<number, { id: string }[]>): string[] {
  return Object.values(byYear).flat().map((x) => x.id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/store-helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into the store**

In `lib/store.tsx`:

5a. Add the import:

```ts
import { allIds, uniqueId } from "./store-helpers";
```

5b. Delete the old generator (lines 82-83):

```ts
let idSeq = 0;
const nextId = (p: string) => `${p}-${idSeq++}`;
```

5c. In `addCombustion`, replace `const id = nextId("c");` with:

```ts
    const id = uniqueId("c", allIds(combustion));
```

5d. In `addRefrigeration`, replace `const id = nextId("r");` with:

```ts
    const id = uniqueId("r", allIds(refrigeration));
```

5e. Replace `saveScenario` (line 163) with:

```ts
  const saveScenario = (name: string) =>
    setScenarios((prev) => [
      ...prev,
      { id: uniqueId("sc", prev.map((s) => s.id)), name, settings, savedAt: Date.now() },
    ]);
```

- [ ] **Step 6: Show the saved date in the Builder's scenario list**

In `components/tabs/BuilderTab.tsx`, in the saved-scenarios list (around line 136), inside the row `div` right after `<span className="font-medium text-ink flex-1 truncate">{s.name}</span>`, add:

```tsx
                {s.savedAt > 0 && (
                  <span className="text-[11px] text-ink-faint tabular-nums shrink-0">
                    {new Date(s.savedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                )}
```

(Scenarios persisted before this fix have `savedAt: 0` and simply show no date — no migration.)

- [ ] **Step 7: Run all tests + lint**

Run: `npx vitest run` then `npm run lint`
Expected: all PASS, no new lint errors.

- [ ] **Step 8: Commit**

```powershell
git add lib/store-helpers.ts lib/store.tsx lib/__tests__/store-helpers.test.ts components/tabs/BuilderTab.tsx
git commit -m "fix(store): collision-proof id generation and real scenario timestamps"
```

---

### Task 5: Silence Recharts zero-size container warnings

`dev.log` shows repeated `The width(-1) and height(-1) of chart should be greater than 0` — `ResponsiveContainer` measures before first layout. Give each container an `initialDimension` so the first render has a sane size.

**Files:**
- Modify: `components/charts/WedgeChart.tsx:68`
- Modify: `components/charts/ScopeDonut.tsx:26`
- Modify: `components/charts/MaccScatter.tsx:38`

- [ ] **Step 1: Add `initialDimension` to each ResponsiveContainer**

In `WedgeChart.tsx` (line 68):

```tsx
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 340 }}>
```

In `ScopeDonut.tsx` (line 26):

```tsx
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 150, height: 150 }}>
```

In `MaccScatter.tsx` (line 38):

```tsx
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 230 }}>
```

- [ ] **Step 2: Verify**

With the dev server running (`npm run dev` if not already; it normally runs on http://localhost:3000), open the app, visit Action plan and Compare tabs, then check the log:

Run: `Get-Content dev.log -Tail 40`
Expected: no NEW `width(-1) and height(-1)` warnings after your reload (old lines higher up in the file are fine). If warnings persist, additionally wrap the offending chart's parent in `min-w-0` and re-check.

Also run: `npm run lint` — expected clean (recharts 3 types include `initialDimension`).

- [ ] **Step 3: Commit**

```powershell
git add components/charts/WedgeChart.tsx components/charts/ScopeDonut.tsx components/charts/MaccScatter.tsx
git commit -m "fix(charts): give ResponsiveContainers an initial dimension to stop zero-size warnings"
```

---

### Task 6: Export shaping module (pure, tested)

Five sheet builders + CSV serializer. No exceljs here — plain row arrays.

**Files:**
- Create: `lib/export.ts`
- Test: `lib/__tests__/export.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/export.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  factorsSheet, inputsSheet, kpiFinanceSheet, scenarioSheet, toCsv, trajectorySheet,
} from "../export";
import { compute } from "../model";
import {
  DEFAULT_ASSETS, DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR,
  DEFAULT_SETTINGS, DEFAULT_SYSTEMS,
} from "../defaults";

const result = compute(DEFAULT_ASSETS, DEFAULT_SYSTEMS, DEFAULT_SETTINGS, 2025);

describe("export sheets", () => {
  it("inputs sheet has one row per asset/system per FY plus a header", () => {
    const s = inputsSheet(DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR);
    const expected =
      1 +
      Object.values(DEFAULT_COMBUSTION_BY_YEAR).reduce((n, rows) => n + rows.length, 0) +
      Object.values(DEFAULT_REFRIGERATION_BY_YEAR).reduce((n, rows) => n + rows.length, 0);
    expect(s.rows.length).toBe(expected);
    expect(s.rows[0][0]).toBe("FY");
  });

  it("factors sheet carries the DEFRA 2025 diesel EF actually used", () => {
    const s = factorsSheet(DEFAULT_SETTINGS);
    expect(s.rows.some((r) => r[1] === "Diesel" && r[2] === "EF 2025" && r[3] === 2.57082)).toBe(true);
    expect(s.rows.some((r) => r[0] === "Assumption" && r[1] === "Grid emission factor")).toBe(true);
  });

  it("scenario sheet records per-asset lever settings", () => {
    const s = scenarioSheet(DEFAULT_SETTINGS, DEFAULT_ASSETS);
    expect(s.rows.some((r) => r[0] === "Diesel fleet" && r[1] === "Electrify" && r[2] === "Units to convert" && r[3] === 3)).toBe(true);
  });

  it("trajectory sheet covers base year to 2050 with a ramped biogenic column", () => {
    const s = trajectorySheet(result);
    expect(s.rows.length).toBe(1 + result.trajectory.length); // header + 2025..2050
    const header = s.rows[0];
    const bioIdx = header.indexOf("Biogenic CO2 t");
    expect(bioIdx).toBeGreaterThan(-1);
    const first = s.rows[1][bioIdx] as number;
    const last = s.rows[s.rows.length - 1][bioIdx] as number;
    expect(first).toBeLessThanOrEqual(last);
    expect(last).toBeCloseTo(Math.round(result.biogenicT * 10) / 10, 1);
  });

  it("kpi & finance sheet has the KPI block and a row per active lever", () => {
    const s = kpiFinanceSheet(result);
    expect(s.rows.some((r) => r[0] === "Reduction by 2030 (%)")).toBe(true);
    const leverHeaderIdx = s.rows.findIndex((r) => r[0] === "Lever");
    expect(leverHeaderIdx).toBeGreaterThan(0);
  });
});

describe("toCsv", () => {
  it("escapes quotes, commas and newlines", () => {
    const csv = toCsv({ name: "T", rows: [["a,b", 'say "hi"', 3]] });
    expect(csv).toBe('"a,b","say ""hi""",3');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/export.test.ts`
Expected: FAIL — module `../export` not found.

- [ ] **Step 3: Implement**

Create `lib/export.ts`:

```ts
/* ============================================================
   Export shaping — pure functions that turn store state + the
   compute result into row arrays for the assurance-ready Excel
   workbook and CSV download (spec step 7). No DOM, no exceljs
   here: everything is unit-testable.
   ============================================================ */

import { ALT_FUELS, DEFRA_YEARS, FUELS, REFRIGERANTS } from "./model/factors";
import { rampFraction } from "./model/trajectory";
import { FY_YEARS, fyLabel } from "./model/types";
import type {
  CombustionAsset, CombustionByYear, LeverSettings, RefrigerationByYear,
} from "./model/types";
import type { ComputeResult } from "./model";

export interface SheetSpec {
  name: string;
  rows: (string | number)[][];
}

const CAPEX_LIFETIME_YEARS = 10; // keep in sync with CAPEX_LIFETIME in lib/model/index.ts

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function inputsSheet(
  combustion: CombustionByYear,
  refrigeration: RefrigerationByYear,
): SheetSpec {
  const rows: (string | number)[][] = [[
    "FY", "Kind", "Name", "Category / system", "Fuel / refrigerant", "Unit",
    "Annual volume / charge (kg)", "Leak rate %/yr", "OPEX / gas cost per kg", "Remaining life (yrs)", "Unit count",
  ]];
  for (const y of FY_YEARS) {
    for (const a of combustion[y] ?? []) {
      rows.push([fyLabel(y), "Combustion", a.name, a.category, FUELS[a.fuelType].label, a.unit, a.annualVolume, "", a.opex, a.remainingLife, a.unitCount]);
    }
    for (const s of refrigeration[y] ?? []) {
      rows.push([fyLabel(y), "Refrigeration", s.name, s.systemType, REFRIGERANTS[s.refrigerant].label, "kg", s.chargeKg, s.leakRatePct, s.gasCostPerKg, "", ""]);
    }
  }
  return { name: "Inputs", rows };
}

export function factorsSheet(settings: LeverSettings): SheetSpec {
  const rows: (string | number)[][] = [["Section", "Item", "Field", "Value", "Unit"]];
  for (const f of Object.values(FUELS)) {
    rows.push(["Fuel", f.label, "Density", f.densityKgPerUnit, `kg/${f.unit}`]);
    rows.push(["Fuel", f.label, "Calorific value", f.cvKJperKg, "kJ/kg"]);
    for (const y of DEFRA_YEARS) {
      rows.push(["Fuel", f.label, `EF ${y}`, f.co2eByYear[y] ?? f.co2eFactor, `kgCO2e/${f.unit}`]);
    }
  }
  for (const f of Object.values(ALT_FUELS)) {
    rows.push(["Alt fuel", f.label, "Density", f.densityKgPerUnit, `kg/${f.unit}`]);
    rows.push(["Alt fuel", f.label, "Calorific value", f.cvKJperKg, "kJ/kg"]);
    rows.push(["Alt fuel", f.label, "Total combustion CO2e", f.co2eTotalPerUnit, `kg/${f.unit}`]);
    rows.push(["Alt fuel", f.label, "Biogenic fraction", f.biogenicFraction, ""]);
  }
  for (const r of Object.values(REFRIGERANTS)) {
    rows.push(["Refrigerant", r.label, "GWP (AR5 100-yr)", r.gwp, "kgCO2e/kg"]);
    rows.push(["Refrigerant", r.label, "Charge adjustment", r.volAdj, "ratio"]);
    rows.push(["Refrigerant", r.label, "Era", r.era, ""]);
  }
  const g = settings.assumptions;
  rows.push(["Assumption", "Grid emission factor", "Value", g.gridEf, "kgCO2e/kWh"]);
  rows.push(["Assumption", "Renewable sourcing", "Value", g.renewableSourcingPct, "%"]);
  rows.push(["Assumption", "REC cost", "Value", g.recCostPerTonne, "per tCO2e"]);
  rows.push(["Assumption", "Carbon price", "Value", g.carbonPricePerTonne, "per tCO2e"]);
  rows.push(["Assumption", "Infrastructure CAPEX", "Value", g.infraCapex, "currency"]);
  rows.push(["Assumption", "CAPEX annualization", "Value", CAPEX_LIFETIME_YEARS, "years"]);
  return { name: "Factors", rows };
}

export function scenarioSheet(settings: LeverSettings, assets: CombustionAsset[]): SheetSpec {
  const rows: (string | number)[][] = [["Asset", "Lever", "Field", "Value"]];
  const name = (id: string) => assets.find((a) => a.id === id)?.name ?? id;
  for (const [id, acts] of Object.entries(settings.byAsset)) {
    const e = acts.electrify;
    rows.push([name(id), "Electrify", "Enabled", e.enabled ? "yes" : "no"]);
    rows.push([name(id), "Electrify", "Units to convert", e.unitsToConvert]);
    rows.push([name(id), "Electrify", "Capacity %", e.capacityPct]);
    rows.push([name(id), "Electrify", "COP / EV efficiency", e.cop]);
    rows.push([name(id), "Electrify", "Tariff per kWh", e.tariffPerKwh]);
    rows.push([name(id), "Electrify", "Asset CAPEX", e.assetCapex]);
    rows.push([name(id), "Electrify", "Start year", e.startYear]);
    rows.push([name(id), "Electrify", "Target year", e.targetYear]);
    const f = acts.fuelSwitch;
    rows.push([name(id), "Fuel switch", "Enabled", f.enabled ? "yes" : "no"]);
    rows.push([name(id), "Fuel switch", "Alt fuel", f.altFuel]);
    rows.push([name(id), "Fuel switch", "Blend %", f.blendPct]);
    rows.push([name(id), "Fuel switch", "Efficiency penalty %", f.efficiencyPenaltyPct]);
    rows.push([name(id), "Fuel switch", "Alt-fuel price per unit", f.altFuelPricePerUnit]);
    rows.push([name(id), "Fuel switch", "Retrofit CAPEX", f.retrofitCapex]);
    rows.push([name(id), "Fuel switch", "Start year", f.startYear]);
    rows.push([name(id), "Fuel switch", "Target year", f.targetYear]);
  }
  const r = settings.refrigerant;
  rows.push(["All cooling systems", "Refrigerant", "Enabled", r.enabled ? "yes" : "no"]);
  rows.push(["All cooling systems", "Refrigerant", "Transition %", r.transitionPct]);
  rows.push(["All cooling systems", "Refrigerant", "Alternative gas", r.altRefrigerant]);
  rows.push(["All cooling systems", "Refrigerant", "Leak improvement %", r.leakImprovementPct]);
  rows.push(["All cooling systems", "Refrigerant", "Retrofit CAPEX", r.retrofitCapex]);
  rows.push(["All cooling systems", "Refrigerant", "Start year", r.startYear]);
  rows.push(["All cooling systems", "Refrigerant", "Ramp years", r.rampYears]);
  return { name: "Scenario", rows };
}

export function trajectorySheet(result: ComputeResult): SheetSpec {
  const fuelWedge = result.wedges.find((w) => w.id === "fuelSwitch");
  const rows: (string | number)[][] = [[
    "Year", "BAU tCO2e", "Target tCO2e",
    ...result.wedges.map((w) => `${w.label} abatement t`),
    "Scope 2 spill t", "Net Scope 1 t", "Biogenic CO2 t", "On track",
  ]];
  for (const r of result.trajectory) {
    const biogenic = fuelWedge
      ? result.biogenicT * rampFraction(r.year, fuelWedge.startYear, fuelWedge.rampYears)
      : 0;
    rows.push([
      r.year, round1(r.bau), round1(r.target),
      ...result.wedges.map((w) => round1(r.wedges[w.id] ?? 0)),
      round1(r.scope2Spill), round1(r.net), round1(biogenic), r.onTrack ? "yes" : "no",
    ]);
  }
  return { name: "Trajectory", rows };
}

export function kpiFinanceSheet(result: ComputeResult): SheetSpec {
  const k = result.kpis;
  const rows: (string | number)[][] = [
    ["KPI", "Value"],
    ["Reduction by 2030 (%)", round1(k.reduction2030 * 100)],
    ["Reduction by 2050 (%)", round1(k.reduction2050 * 100)],
    ["Weighted cost per tonne", Math.round(k.costPerTonne)],
    ["Total CAPEX", k.totalCapex],
    ["Years to target", k.yearsToTarget ?? "off track"],
    ["Scenario payback (yrs)", k.paybackYears != null ? round1(k.paybackYears) : "no payback"],
    ["Scope 2 spillover t (full ramp)", round1(result.scope2SpillFullT)],
    ["Biogenic CO2 t (full ramp)", round1(result.biogenicT)],
    [],
    ["Lever", "Abatement t/yr", "CAPEX", "Annual OPEX delta", "Annualized cost", "Cost per tonne", "Payback (yrs)"],
  ];
  for (const l of result.levers.filter((x) => x.enabled)) {
    rows.push([
      l.label, round1(l.abatementT), l.capex, Math.round(l.annualOpexDelta),
      Math.round(l.annualCost), Math.round(l.costPerTonne),
      l.paybackYears != null ? round1(l.paybackYears) : "no payback",
    ]);
    for (const p of l.opexParts) {
      rows.push([`  ${l.label} — ${p.label}`, "", "", Math.round(p.amount), "", "", ""]);
    }
  }
  return { name: "KPIs & Finance", rows };
}

export function buildWorkbookSheets(args: {
  combustion: CombustionByYear;
  refrigeration: RefrigerationByYear;
  settings: LeverSettings;
  assets: CombustionAsset[];
  result: ComputeResult;
}): SheetSpec[] {
  return [
    inputsSheet(args.combustion, args.refrigeration),
    factorsSheet(args.settings),
    scenarioSheet(args.settings, args.assets),
    trajectorySheet(args.result),
    kpiFinanceSheet(args.result),
  ];
}

export function toCsv(sheet: SheetSpec): string {
  const esc = (v: string | number): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return sheet.rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/export.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/export.ts lib/__tests__/export.test.ts
git commit -m "feat(export): pure sheet-shaping module for workbook + CSV"
```

---

### Task 7: exceljs download + Export buttons in the Topbar

**Files:**
- Create: `lib/export-download.ts`
- Modify: `components/Topbar.tsx`
- Modify: `package.json` (new dependency)

- [ ] **Step 1: Install exceljs**

Run: `npm install exceljs`
Expected: added to `dependencies` in `package.json`.

- [ ] **Step 2: Create the download helper**

Create `lib/export-download.ts`:

```ts
/* ============================================================
   Browser-only download helpers. exceljs is imported dynamically
   so it never lands in the initial bundle.
   ============================================================ */

import { toCsv, type SheetSpec } from "./export";

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadWorkbook(sheets: SheetSpec[], filename: string): Promise<void> {
  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    ws.addRows(s.rows);
    ws.getRow(1).font = { bold: true };
  }
  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename,
  );
}

export function downloadCsv(sheet: SheetSpec, filename: string): void {
  triggerDownload(new Blob([toCsv(sheet)], { type: "text/csv;charset=utf-8" }), filename);
}
```

- [ ] **Step 3: Rewrite the Topbar with Export actions (and fix the hardcoded base year)**

Replace the full contents of `components/Topbar.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { Bell, ChevronDown, Download, FileSpreadsheet, Search } from "lucide-react";
import { useScenario } from "@/lib/store";
import { buildWorkbookSheets, trajectorySheet } from "@/lib/export";
import { downloadCsv, downloadWorkbook } from "@/lib/export-download";
import { fyLabel } from "@/lib/model/types";
import type { TabKey } from "./Sidebar";

const TITLES: Record<TabKey, { eyebrow: string; title: string }> = {
  data: { eyebrow: "Step 1 · Baseline", title: "Scope 1 data input" },
  builder: { eyebrow: "Step 2", title: "Decarbonization Scenario Modeller" },
  action: { eyebrow: "Step 3", title: "Action plan" },
  refrigerant: { eyebrow: "Advisory", title: "Refrigerant advisor" },
  compare: { eyebrow: "Step 4", title: "Compare & track to target" },
};

export function Topbar({ tab }: { tab: TabKey }) {
  const t = TITLES[tab];
  const { combustion, refrigeration, settings, result, baseAssets, baseYear } = useScenario();
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    setBusy(true);
    try {
      const sheets = buildWorkbookSheets({ combustion, refrigeration, settings, assets: baseAssets, result });
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadWorkbook(sheets, `scope1-scenario-FY${baseYear}-${stamp}.xlsx`);
    } finally {
      setBusy(false);
    }
  };
  const onCsv = () => downloadCsv(trajectorySheet(result), `scope1-trajectory-FY${baseYear}.csv`);

  return (
    <header className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p className="text-xs uppercase tracking-wider text-brand-600 font-bold">{t.eyebrow}</p>
        <h1 className="text-xl md:text-2xl font-extrabold text-ink leading-tight mt-0.5">{t.title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onExport}
          disabled={busy}
          title="Export the full scenario workbook (inputs, factors, scenario, trajectory, finance)"
          className="rounded-full bg-brand-500 text-white px-3.5 py-2 text-sm font-medium flex items-center gap-2 hover:bg-brand-600 transition-colors disabled:opacity-50"
        >
          <FileSpreadsheet size={15} /> {busy ? "Exporting…" : "Export"}
        </button>
        <button
          onClick={onCsv}
          aria-label="Download trajectory CSV"
          title="Download the year-by-year trajectory as CSV"
          className="w-9 h-9 rounded-full bg-surface-muted border border-line/60 grid place-items-center text-ink-soft hover:bg-line/40"
        >
          <Download size={16} />
        </button>
        <button className="rounded-full bg-surface-muted border border-line/60 px-3.5 py-2 text-sm flex items-center gap-2 hover:bg-line/40 transition-colors">
          <span className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">Client</span>
          <span className="font-medium">Acme Industries Ltd</span>
          <ChevronDown size={14} className="text-ink-faint" />
        </button>
        <div className="rounded-full bg-surface-muted border border-line/60 px-3.5 py-2 text-sm flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">Base year</span>
          <span className="font-semibold tabular-nums">{fyLabel(baseYear)}</span>
        </div>
        <button className="w-9 h-9 rounded-full bg-surface-muted border border-line/60 grid place-items-center text-ink-soft hover:bg-line/40" aria-label="Search">
          <Search size={16} />
        </button>
        <button className="w-9 h-9 rounded-full bg-surface-muted border border-line/60 grid place-items-center text-ink-soft hover:bg-line/40" aria-label="Notifications">
          <Bell size={16} />
        </button>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white text-sm font-bold">
          A
        </div>
      </div>
    </header>
  );
}
```

(Note: `Topbar` is rendered inside `ScenarioProvider` in `components/Shell.tsx`, so `useScenario()` is safe.)

- [ ] **Step 4: Verify**

Run: `npm run lint` — expected clean.
Manual: in the running app click **Export** — a 5-sheet `.xlsx` downloads and opens with populated Inputs / Factors / Scenario / Trajectory / KPIs & Finance sheets. Click the CSV button — a trajectory CSV downloads. The base-year chip now tracks the Data-input base year.

- [ ] **Step 5: Commit**

```powershell
git add lib/export-download.ts components/Topbar.tsx package.json package-lock.json
git commit -m "feat(export): xlsx workbook + trajectory CSV download from the Topbar"
```

---

### Task 8: Surface biogenic CO₂ on the Action plan

**Files:**
- Modify: `components/tabs/ActionPlanTab.tsx`

- [ ] **Step 1: Add the biogenic strip**

In `components/tabs/ActionPlanTab.tsx`:

1a. Add `InfoTip` to the imports from `../ui/InfoTip`:

```tsx
import { InfoTip } from "../ui/InfoTip";
```

1b. Directly after the closing `</div>` of the KPI row (`{/* KPI row */}` block, after line 148), insert:

```tsx
      {/* biogenic CO2 — reported separately under BRSR/GRI */}
      {result.biogenicT > 0 && (
        <Card tone="muted">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-8 h-8 rounded-lg bg-brand-50 grid place-items-center text-brand-600 shrink-0">
              <Leaf size={16} />
            </div>
            <span className="text-sm font-semibold text-ink">Biogenic CO₂ — reported separately</span>
            <InfoTip text="CO₂ from the renewable share of biofuels is biogenic: BRSR and GRI report it outside Scope 1. Only the CH₄/N₂O remainder stays in Scope 1 — already reflected in the wedges." />
            <span className="text-sm font-bold tabular-nums ml-auto">
              {fmt(result.biogenicT)} <span className="text-ink-faint font-normal text-xs">tCO₂e/yr at full ramp</span>
            </span>
          </div>
        </Card>
      )}
```

(`Leaf`, `Card`, `fmt` are already imported in this file.)

- [ ] **Step 2: Verify and commit**

Run: `npm run lint` — clean. Manual: Action plan shows the biogenic strip (the default scenario has fuel switching active, so `biogenicT > 0`).

```powershell
git add components/tabs/ActionPlanTab.tsx
git commit -m "feat(ui): surface biogenic CO2 split on the action plan"
```

---

### Task 9: Target-tracking section in Compare & Track

**Files:**
- Modify: `components/tabs/CompareTab.tsx`

- [ ] **Step 1: Add the TargetTracking component**

In `components/tabs/CompareTab.tsx`, append this component at the end of the file:

```tsx
/** Year-over-year net vs the SBTi line for the live scenario (spec step 6). */
function TargetTracking({ result }: { result: ComputeResult }) {
  const first = result.kpis.yearsToTarget;
  const milestones = [2027, 2030, 2035, 2040, 2045, 2050];
  const rowFor = (y: number) => result.trajectory.find((r) => r.year === y);
  return (
    <Card>
      <CardHeader
        title="Target tracking — year over year"
        subtitle="Net Scope 1 vs the SBTi 1.5°C line for the live scenario. Green years sit at or below the target."
        right={first ? (
          <span className="text-[11px] font-semibold text-brand-600">on track from {first}</span>
        ) : (
          <span className="text-[11px] font-semibold text-amber-600">not on track by 2050</span>
        )}
      />
      <div className="flex gap-[3px]" role="img" aria-label="On-track status for each year to 2050">
        {result.trajectory.map((r) => (
          <div
            key={r.year}
            title={`${r.year} — net ${fmt(r.net)} t · target ${fmt(r.target)} t`}
            className="flex-1 h-9 rounded-sm"
            style={{
              background: r.onTrack ? "#1F9E5A" : "#E8A33D",
              opacity: 0.85,
              outline: r.year === first ? "2px solid #14503D" : undefined,
              outlineOffset: r.year === first ? 1 : undefined,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-ink-faint tabular-nums mt-1 mb-4">
        <span>{result.trajectory[0]?.year}</span>
        {first && <span className="font-semibold text-brand-700">first on-track year: {first}</span>}
        <span>2050</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
            <th className="font-semibold text-left py-1.5 px-2">Milestone</th>
            <th className="font-semibold text-right py-1.5 px-2">Net</th>
            <th className="font-semibold text-right py-1.5 px-2">Target</th>
            <th className="font-semibold text-right py-1.5 px-2">Gap</th>
            <th className="font-semibold text-right py-1.5 px-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {milestones.map((y) => {
            const r = rowFor(y);
            if (!r) return null;
            const gap = r.net - r.target;
            return (
              <tr key={y} className="border-t border-line/60">
                <td className="py-2 px-2 font-medium tabular-nums">{y}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt(r.net)} t</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt(r.target)} t</td>
                <td className={cn("py-2 px-2 text-right tabular-nums font-semibold", gap <= 0 ? "text-brand-600" : "text-amber-600")}>
                  {gap <= 0 ? "−" : "+"}{fmt(Math.abs(gap))} t
                </td>
                <td className="py-2 px-2 text-right">
                  {r.onTrack ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600"><Check size={12} /> on track</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600"><X size={12} /> above target</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
```

(`Card`, `CardHeader`, `cn`, `fmt`, `Check`, `X`, `ComputeResult` are already imported in this file.)

- [ ] **Step 2: Render it**

In the `CompareTab` return, between the comparison-table `</Card>` and the `{/* net-vs-target small multiples + progress */}` grid, insert:

```tsx
      {/* year-over-year target tracking (live scenario) */}
      <TargetTracking result={result} />
```

- [ ] **Step 3: Verify and commit**

Run: `npm run lint` — clean. Manual: Compare tab shows the year strip (amber → green around the early 2030s on the default scenario), the first on-track year outlined, and the milestone table; moving a Builder slider changes it live.

```powershell
git add components/tabs/CompareTab.tsx
git commit -m "feat(ui): year-over-year target tracking section in Compare & Track"
```

---

### Task 10: Lifespan guardrail warnings in the Builder

**Files:**
- Modify: `components/tabs/BuilderTab.tsx`

- [ ] **Step 1: Imports**

In `components/tabs/BuilderTab.tsx` add `AlertTriangle` to the lucide-react import list, and add:

```tsx
import { outlivesAsset, retirementYear } from "@/lib/model/validate";
```

- [ ] **Step 2: Warning component**

Append at the end of the file:

```tsx
/** Amber advisory when an action's target year is past the asset's retirement. */
function LifespanWarning({ asset, baseYear }: { asset: CombustionAsset; baseYear: number }) {
  const retire = retirementYear(asset, baseYear);
  return (
    <p className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
      <AlertTriangle size={14} className="shrink-0" />
      {asset.name} retires in FY{retire} — before this action completes. Bring the target year forward, or plan a like-for-like low-carbon replacement at retirement instead.
    </p>
  );
}
```

- [ ] **Step 3: Wire into both action rows**

In `AssetActionCard`, pull `baseYear` from the store (extend the existing destructure):

```tsx
  const { settings, setSettings, updateAction, baseYear } = useScenario();
```

Inside the **electrify** `<ActionRow …>` children, after the closing `</AdvancedDrawer>`, add:

```tsx
        {e.enabled && outlivesAsset(asset, baseYear, e.targetYear) && (
          <LifespanWarning asset={asset} baseYear={baseYear} />
        )}
```

Inside the **fuel-switch** `<ActionRow …>` children, after its closing `</AdvancedDrawer>`, add:

```tsx
        {f.enabled && outlivesAsset(asset, baseYear, f.targetYear) && (
          <LifespanWarning asset={asset} baseYear={baseYear} />
        )}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint` — clean. Manual: in the Builder, "Petrol LCVs" (remaining life 5, base 2025 → retires FY2030) with electrify target year 2032 shows the amber warning; setting target year ≤ 2030 hides it.

```powershell
git add components/tabs/BuilderTab.tsx
git commit -m "feat(ui): asset lifespan guardrail warnings in the scenario modeller"
```

---

### Task 11: Lever economics drill-down on the Action plan

**Files:**
- Modify: `components/tabs/ActionPlanTab.tsx`

- [ ] **Step 1: Imports**

In `components/tabs/ActionPlanTab.tsx`:
- change the react import to `import { Fragment, useState } from "react";`
- add `ChevronDown` to the lucide-react import list
- add `fmtNum` to the `@/lib/utils` import: `import { cn, fmt, fmtNum, pct } from "@/lib/utils";`
- add the result type import: `import type { ComputeResult } from "@/lib/model";`

- [ ] **Step 2: Add the LeverEconomics component**

Append at the end of the file:

```tsx
/** Per-lever CAPEX / OPEX / payback with an expandable component breakdown. */
function LeverEconomics({ levers }: { levers: ComputeResult["levers"] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (levers.length === 0) return <p className="text-sm text-ink-faint">No active levers.</p>;
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
            <th className="font-semibold text-left py-2 px-2">Lever</th>
            <th className="font-semibold text-right py-2 px-2">Abatement t/yr</th>
            <th className="font-semibold text-right py-2 px-2">CAPEX</th>
            <th className="font-semibold text-right py-2 px-2">OPEX Δ / yr</th>
            <th className="font-semibold text-right py-2 px-2">Cost / t</th>
            <th className="font-semibold text-right py-2 px-2">Payback</th>
          </tr>
        </thead>
        <tbody>
          {levers.map((l) => (
            <Fragment key={l.id}>
              <tr
                className="border-t border-line/60 cursor-pointer hover:bg-surface-muted/60"
                onClick={() => setOpen(open === l.id ? null : l.id)}
              >
                <td className="py-2.5 px-2">
                  <span className="flex items-center gap-2 font-medium text-ink">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: FAMILY_COLORS[l.colorIdx] }} />
                    {l.label}
                    <ChevronDown size={13} className={cn("text-ink-faint transition-transform", open === l.id && "rotate-180")} />
                  </span>
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">{fmt(l.abatementT)}</td>
                <td className="py-2.5 px-2 text-right tabular-nums">{fmtMoney(l.capex)}</td>
                <td className={cn("py-2.5 px-2 text-right tabular-nums", l.annualOpexDelta < 0 && "text-brand-600 font-semibold")}>
                  {l.annualOpexDelta < 0 ? "−" : "+"}{fmtMoney(Math.abs(l.annualOpexDelta))}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">{CURRENCY}{fmt(Math.max(0, l.costPerTonne))}</td>
                <td className="py-2.5 px-2 text-right tabular-nums">{l.paybackYears != null ? `${fmtNum(l.paybackYears, 1)} yrs` : "—"}</td>
              </tr>
              {open === l.id && (
                <tr className="bg-surface-muted/50">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      {l.opexParts.map((p) => (
                        <div key={p.label} className="flex items-center justify-between gap-2 rounded-lg bg-white border border-line/60 px-3 py-2">
                          <span className="text-ink-soft">{p.label}</span>
                          <span className={cn("font-semibold tabular-nums", p.amount < 0 ? "text-brand-600" : "text-ink")}>
                            {p.amount < 0 ? "−" : "+"}{fmtMoney(Math.abs(p.amount))}/yr
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-ink-faint mt-2">
                      Negative = saving. Annualized cost = CAPEX ÷ 10 yrs + OPEX Δ. Payback = CAPEX ÷ annual saving.
                    </p>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

(`ComputeResult` needs importing if not present: it is already imported indirectly — add `import type { ComputeResult } from "@/lib/model";` if TypeScript complains. `fmtMoney` is the file-local helper at the top of this file.)

- [ ] **Step 3: Render it**

In the `ActionPlanTab` return, after the MACC `</Card>` (the last card), add:

```tsx
      {/* per-lever finance drill-down */}
      <Card>
        <CardHeader title="Lever economics" subtitle="CAPEX, running-cost change and payback per lever — click a row for the component breakdown." />
        <LeverEconomics levers={result.levers.filter((l) => l.enabled)} />
      </Card>
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint` — clean. Manual: Action plan shows the economics table; clicking a row expands its OPEX components; the parts visibly sum to the OPEX Δ column.

```powershell
git add components/tabs/ActionPlanTab.tsx
git commit -m "feat(ui): lever economics drill-down with opex components and payback"
```

---

### Task 12: Comparison depth — payback, biogenic, per-lever cost, saved dates

**Files:**
- Modify: `components/tabs/CompareTab.tsx`

- [ ] **Step 1: New comparison rows**

In `components/tabs/CompareTab.tsx`:

1a. Add `fmtNum` to the utils import: `import { cn, fmt, fmtK, fmtNum, pct } from "@/lib/utils";`

1b. In the `rows` array (line 34), after the `"Total CAPEX"` row, insert:

```ts
    { label: "Payback", render: (c) => (c.result.kpis.paybackYears != null ? `${fmtNum(c.result.kpis.paybackYears, 1)} yrs` : "—"), best: "min" },
```

and after the `"Scope 2 spillover"` row append:

```ts
    { label: "Biogenic CO₂", render: (c) => `${fmt(c.result.biogenicT)} t` },
```

1c. In `valueFor` (line 134), add the matching entries to the map:

```ts
    "Payback": c.result.kpis.paybackYears ?? 9999,
    "Biogenic CO₂": c.result.biogenicT,
```

- [ ] **Step 2: Saved dates + newest-first ordering**

Replace the `cols` construction (line 29) with:

```tsx
  const cols: Col[] = [
    { id: "__current", name: "Current (live)", result, current: true },
    ...[...scenarios]
      .sort((a, b) => b.savedAt - a.savedAt)
      .map((s) => ({
        id: s.id,
        name: s.name,
        savedAt: s.savedAt,
        result: compute(baseAssets, baseSystems, s.settings, baseYear),
      })),
  ];
```

Add `savedAt?: number;` to the `Col` interface. In the table header cell (inside the `cols.map` at line 74), under the name/delete row, add:

```tsx
                    {!c.current && !!c.savedAt && (
                      <div className="text-[10px] text-ink-faint font-normal tabular-nums">
                        {new Date(c.savedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </div>
                    )}
```

- [ ] **Step 3: Per-lever cost mini-table on each scenario card**

In the small-multiples grid (line 115), inside each `<Card>` after `<Progress result={c.result} />`, add:

```tsx
            <div className="mt-3 pt-3 border-t border-line/60 space-y-1">
              {c.result.levers.filter((l) => l.enabled).map((l) => (
                <div key={l.id} className="flex items-center justify-between text-xs">
                  <span className="text-ink-soft">{l.label}</span>
                  <span className="tabular-nums font-semibold text-ink">{CURRENCY}{fmt(Math.max(0, l.costPerTonne))}/t</span>
                </div>
              ))}
            </div>
```

- [ ] **Step 4: Empty-state hint**

After the save `</Card>` (line 63), add:

```tsx
      {scenarios.length === 0 && (
        <p className="text-sm text-ink-faint">
          Nothing saved yet — tune the plan in the <strong>Scenario Modeller</strong>, then save it here to compare options side by side.
        </p>
      )}
```

- [ ] **Step 5: Verify and commit**

Run: `npm run lint` — clean. Manual: save two scenarios with different settings; the table gains Payback and Biogenic rows with best-value ticks, columns are newest-first with dates, each card lists per-lever cost/t.

```powershell
git add components/tabs/CompareTab.tsx
git commit -m "feat(ui): payback, biogenic and per-lever cost depth in scenario comparison"
```

---

### Task 13: UX polish — shared fmtMoney, empty-state CTAs, chart/cell accessibility

**Files:**
- Modify: `lib/utils.ts`
- Modify: `components/tabs/ActionPlanTab.tsx` (remove local fmtMoney)
- Modify: `components/tabs/CompareTab.tsx` (remove local fmtMoney)
- Modify: `components/tabs/DataInputTab.tsx` (empty-state CTAs + cell labels)
- Modify: `components/charts/WedgeChart.tsx`, `components/charts/MaccScatter.tsx` (aria labels)

- [ ] **Step 1: Consolidate fmtMoney into utils**

Append to `lib/utils.ts`:

```ts
import { CURRENCY } from "./defaults";

/** Compact Indian currency: ₹1.25 Cr / ₹3.4 L / ₹12,345 (sign preserved). */
export function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${CURRENCY}${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${CURRENCY}${(n / 1e5).toFixed(1)} L`;
  return `${CURRENCY}${fmt(n)}`;
}
```

(Move the `import` to the top of the file with the other imports. `lib/defaults.ts` does not import `lib/utils.ts`, so there is no cycle.)

Then in **both** `components/tabs/ActionPlanTab.tsx` and `components/tabs/CompareTab.tsx`: delete the local `fmtMoney` function and add `fmtMoney` to each file's `@/lib/utils` import.

- [ ] **Step 2: Empty states get a primary CTA**

In `components/tabs/DataInputTab.tsx`, replace the `EmptyState` component (line 280) with:

```tsx
function EmptyState({ label, hint, action }: {
  label: string;
  hint: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border border-dashed border-line py-10 text-center">
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="text-xs text-ink-faint mt-1">{hint}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium rounded-lg bg-brand-500 text-white px-4 py-2 hover:bg-brand-600 transition-colors"
        >
          <Plus size={15} /> {action.label}
        </button>
      )}
    </div>
  );
}
```

Update the two usages:

```tsx
          <EmptyState
            label={`No combustion fuels in ${fyLabel(selectedYear)}`}
            hint="Add a fuel, or copy another year's list above."
            action={{ label: "Add your first fuel", onClick: () => addCombustion(selectedYear) }}
          />
```

```tsx
          <EmptyState
            label={`No cooling systems in ${fyLabel(selectedYear)}`}
            hint="Add a system, or copy another year's list above."
            action={{ label: "Add your first system", onClick: () => addRefrigeration(selectedYear) }}
          />
```

- [ ] **Step 3: Label the editable table cells**

In `components/tabs/DataInputTab.tsx`, give the three cell components an optional `label` that becomes `aria-label`:

```tsx
function TextCell({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={FIELD} />;
}
function NumCell({ value, onChange, label }: { value: number; onChange: (v: number) => void; label?: string }) {
  return <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className={`${FIELD} text-right tabular-nums`} />;
}
function SelectCell({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: [string, string][]; label?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={FIELD}>
      {options.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
    </select>
  );
}
```

Then pass labels at the call sites in the combustion table:

```tsx
<TextCell … label={`${a.name} name`} />
<SelectCell … label={`${a.name} category`} … />
<NumCell … label={`${a.name} unit count`} />
<SelectCell … label={`${a.name} fuel type`} … />
<NumCell … label={`${a.name} annual volume`} />
<NumCell … label={`${a.name} annual OPEX`} />
<NumCell … label={`${a.name} remaining life`} />
```

and in the refrigeration table:

```tsx
<TextCell … label={`${s.name} name`} />
<SelectCell … label={`${s.name} system type`} … />
<NumCell … label={`${s.name} charge kg`} />
<NumCell … label={`${s.name} leak rate`} />
<NumCell … label={`${s.name} gas cost`} />
```

(Also add `aria-label={`${s.name} refrigerant`}` to the `<select>` inside `RefrigerantSelect` — give the component an optional `label` prop the same way.)

- [ ] **Step 4: Chart aria labels**

In `components/charts/WedgeChart.tsx`, change the chart wrapper div (line 64) to:

```tsx
      <div className="w-full h-[340px]" role="img" aria-label="Emissions pathway to 2050: business-as-usual, SBTi target line, abatement wedges and the net emissions line">
```

In `components/charts/MaccScatter.tsx`, change the wrapper div (line 37) to:

```tsx
    <div className="w-full h-[230px]" role="img" aria-label="Marginal abatement scatter: cost per tonne versus tonnes abated in 2030, dot size showing ambition">
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run` and `npm run lint` — all green.
Manual: delete all fuels in an FY → the empty state shows an "Add your first fuel" button that works; money formats unchanged everywhere.

```powershell
git add lib/utils.ts components/tabs/ActionPlanTab.tsx components/tabs/CompareTab.tsx components/tabs/DataInputTab.tsx components/charts/WedgeChart.tsx components/charts/MaccScatter.tsx
git commit -m "polish(ui): shared fmtMoney, empty-state CTAs, a11y labels for cells and charts"
```

---

### Task 14: Final verification

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: ALL tests pass (existing 7 model suites + finance additions + compute, validate, store-helpers, export).

- [ ] **Step 2: Lint and production build**

Run: `npm run lint` then `npm run build`
Expected: lint clean; build succeeds with no type errors.

- [ ] **Step 3: Manual acceptance sweep (app on http://localhost:3000)**

- All five tabs render; no `width(-1)` recharts warnings in `dev.log` after visiting every tab.
- **Export** downloads a 5-sheet workbook; CSV button downloads the trajectory; numbers match the on-screen KPIs.
- Action plan: biogenic strip visible; Lever economics table expands with OPEX parts; KPIs live-update.
- Builder: Petrol LCVs with electrify target 2032 shows the retirement warning; saved scenarios show dates.
- Compare: Payback and Biogenic rows present; target-tracking strip + milestone table react to slider changes.
- Data input: emptying a year shows the CTA empty state; localStorage from a previous session still loads (no id collisions: add a fuel after a hard reload, confirm it gets a fresh id and no other row's plan changes).
- Mobile: at ~380px width the grids stack to one column, charts keep their min-heights, and the Builder's sticky live-projection bar wraps without overflow.

- [ ] **Step 4: Commit any stragglers and report**

```powershell
git status
git add -A
git commit -m "chore: final verification fixes for improvement pass" # only if there are changes
```

Report results against the spec's acceptance criteria (§8 of the design doc).
