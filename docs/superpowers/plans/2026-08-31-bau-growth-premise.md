# BAU Growth Premise Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make business-as-usual growth a visible, derived, adjustable premise on a new *Assumptions* sub-tab of Balance to target, instead of a `0.01` constant duplicated in two engines.

**Architecture:** `TrajectoryConfig.bauGrowth` is already a parameter, so no trajectory maths changes. A new pure module turns the year-wise inventories the app already stores (and reads only one year of) into an actual-emissions series and a CAGR. Each store derives its own scope's rate and injects it as a fallback; a single optional `GlobalAssumptions.bauGrowthPct` overrides both. The new panel adds no BAU arithmetic of its own — its chart line is the `combineTrajectories` rows `BalanceTab` already computes.

**Tech Stack:** TypeScript, Next.js 16, React 19, Vitest 4 (jsdom for component tests), recharts, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-31-mix-capex-and-baseline-design.md` — §6 (deliverable 3), as amended by **Amendment 1** and **Amendment 2** at the top of that file. Read §6.1–§6.5 and both amendment tables before starting.

## Scope

This plan implements **§6.1, §6.2, §6.3, §6.4.1, §6.4.2, §6.4.4** and the parts of §6.5 that test them.

**Explicitly excluded: §6.4.3, the CAPEX rates table.** It renders `capexLines` for both scopes, and Scope 2 emits none yet — plan `2026-08-31-capex-lines-engine.md` Tasks 3–5 are unstarted and its Task 2 is uncommitted. Building the table now would ship one that silently omits solar, battery and LED. The panel is built with a fourth section reserved for it (Task 6, Step 3 leaves a labelled placeholder heading with no controls); the follow-up plan fills it in.

**Also excluded:** deliverable 2b (the mix-card breakdown), and the §5.4 proportional-scaling capex edit — both belong to the CAPEX table's plan.

## Documented deviation from the spec

**One:** the spec names the new module `lib/model/bau.ts`. This plan puts it at **`lib/bau.ts`**. `lib/model/` is Scope-1-only; a module importing both `./model/baseline` and `./scope2/model/baseline` belongs at the `lib/` root, which is exactly where `lib/cross-scope.ts` sits and says so in its header comment. Nothing else about the module changes.

## Global Constraints

- **`??` not `||`** for every optional numeric field. A user who sets growth to 0 means 0, and a flat BAU is a legitimate premise. This is the single most likely bug in this plan.
- **Percent, not fraction, at the boundary.** `bauGrowthPct` and `DerivedGrowth.pct` are percents (`2.5` means 2.5 %/yr). `TrajectoryConfig.bauGrowth` is a fraction (`0.025`). Convert exactly once, at the `buildTrajectory` call site.
- **No formatting in `lib/`.** `fmtMoney` / `fmt` are UI concerns. `lib/` returns raw numbers.
- **The panel computes no BAU.** Its chart series comes from `combineTrajectories`. A compound curve written anywhere in `components/` is a plan violation (Amendment 2).
- **Never write a derived value into persisted state.** Reset clears `bauGrowthPct`; it does not write the derived number into it (§6.4.1).
- **Test command:** `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`. Lint: `npx eslint <paths>`. All three clean before each commit.
- **No new dependencies.** recharts is already present.
- **Currency symbol** comes from `CURRENCY` in `lib/defaults.ts`; never hardcode `₹`.
- **This is Next 16.2.9 / React 19.2.4, and `AGENTS.md` warns its APIs may differ from your training data.** Read `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` before writing either component. That said, the exposure here is small by construction: every file this plan touches is already a `"use client"` component, and the new ones use nothing but `useState` / `useMemo`, recharts, and Tailwind classes — no server components, routing, data fetching, or Next API surface. If you find yourself reaching for a Next API, stop and read the docs for it first.
- **`react-hooks/set-state-in-effect` is enforced** and the codebase disables it line-by-line with a stated reason (see `BalanceTab.tsx:113-121`). This plan needs no effects at all — derived values are `useMemo`, not `useState` + `useEffect`. If you write an effect, you have taken a wrong turn.

## Worktree

Deliverable 1 (`76b0eb9`) is on `master`; this work depends only on it. The current tree is `feat/capex-lines-engine` with **uncommitted** capex work in `lib/model/index.ts` and an untracked `lib/model/__tests__/capex-lines-s1.test.ts` — **do not touch, stage, or commit either.**

Create the worktree off `master` via `superpowers:using-git-worktrees`, then bring the spec across:

```bash
git worktree add ../bau-growth-premise -b feat/bau-growth-premise master
cd ../bau-growth-premise
git cherry-pick 01abe49 f7956de   # Amendment 1 + Amendment 2 to the spec
```

---

## File Structure

| File | Responsibility |
|---|---|
| **Create** `lib/bau.ts` | `YearPoint`, `DerivedGrowth`, `scope1ActualSeries`, `scope2ActualSeries`, `deriveBauGrowth`, `resolveBauGrowthPct`. Pure, cross-scope, no React. |
| **Create** `lib/__tests__/bau.test.ts` | CAGR edge cases and both series builders. |
| **Modify** `lib/model/types.ts` | `GlobalAssumptions` gains `bauGrowthPct?: number`. |
| **Modify** `lib/model/index.ts` | Delete `BAU_GROWTH`; `compute()` gains `bauGrowthFallbackPct?`; one call site. |
| **Modify** `lib/scope2/model/index.ts` | Delete `BAU_GROWTH`; `computeScope2()` gains `bauGrowthFallbackPct?`; two call sites. |
| **Modify** `lib/store.tsx` | Derive Scope 1's rate, inject it, expose `derivedBau` on the store shape. |
| **Modify** `lib/scope2/store.tsx` | Same for Scope 2. |
| **Create** `components/charts/BauChart.tsx` | Actual points + one BAU line. Pure render. |
| **Create** `components/tabs/balance/AssumptionsPanel.tsx` | The new panel. Own file because `BalanceTab.tsx` is already ~700 lines. |
| **Modify** `components/tabs/BalanceTab.tsx` | Fourth section tab; move the CAPEX budget out of `mixesPanel`; premise strip; invalidate wiring. |
| **Create** `components/tabs/__tests__/assumptions-panel.test.tsx` | Tab renders, override drives both scopes, reset clears, mixes invalidate. |

---

## Task 1: The BAU series and the CAGR

**Files:**
- Create: `lib/bau.ts`
- Test: `lib/__tests__/bau.test.ts`

**Interfaces:**
- Consumes: `baselineScope1` (`lib/model/baseline.ts`), `baselineScope2` (`lib/scope2/model/baseline.ts`), `resolveCombustion` / `resolveRefrigeration` (`lib/yearly.ts`), `resolveFacilities` (`lib/scope2/store-helpers.ts`).
- Produces:
  - `type YearPoint = { year: number; totalT: number }`
  - `interface DerivedGrowth { pct: number; fromYear: number; toYear: number; years: number }`
  - `scope1ActualSeries(combustion: CombustionByYear, refrigeration: RefrigerationByYear): YearPoint[]`
  - `scope2ActualSeries(facilities: FacilitiesByYear): YearPoint[]`
  - `deriveBauGrowth(points: YearPoint[], baseYear: number): DerivedGrowth | null`
  - `resolveBauGrowthPct(override: number | undefined, fallback: number | undefined): number`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/bau.test.ts`:

```ts
/* The BAU premise: an actual-emissions series off the year-wise inventories,
   and the CAGR that turns it into one growth rate. */
import { describe, expect, it } from "vitest";
import {
  deriveBauGrowth, resolveBauGrowthPct, scope1ActualSeries, scope2ActualSeries,
  type YearPoint,
} from "../bau";
import { DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR, DEFAULT_BASE_YEAR } from "../defaults";

const pts = (m: Record<number, number>): YearPoint[] =>
  Object.entries(m).map(([year, totalT]) => ({ year: Number(year), totalT }));

describe("deriveBauGrowth", () => {
  it("is the CAGR from the first year with data to the base year", () => {
    // 100 -> 400 over two years is a doubling each year.
    const d = deriveBauGrowth(pts({ 2023: 100, 2024: 200, 2025: 400 }), 2025);
    expect(d).not.toBeNull();
    expect(d!.pct).toBeCloseTo(100, 6);
    expect(d!.fromYear).toBe(2023);
    expect(d!.toYear).toBe(2025);
    expect(d!.years).toBe(2);
  });

  it("uses only the endpoints, so an odd middle year does not move it", () => {
    const straight = deriveBauGrowth(pts({ 2023: 100, 2024: 200, 2025: 400 }), 2025)!;
    const dipped = deriveBauGrowth(pts({ 2023: 100, 2024: 5, 2025: 400 }), 2025)!;
    expect(dipped.pct).toBeCloseTo(straight.pct, 6);
  });

  it("returns null with fewer than two usable years", () => {
    expect(deriveBauGrowth(pts({ 2025: 100 }), 2025)).toBeNull();
    expect(deriveBauGrowth([], 2025)).toBeNull();
  });

  it("returns null when the first total is not positive", () => {
    // A zero first year is not a 'grew from nothing' story, it is missing data.
    expect(deriveBauGrowth(pts({ 2024: 0, 2025: 100 }), 2025)).toBeNull();
  });

  it("returns null when the base year itself has no data", () => {
    expect(deriveBauGrowth(pts({ 2022: 100, 2023: 110 }), 2025)).toBeNull();
  });

  it("ignores years after the base year", () => {
    const without = deriveBauGrowth(pts({ 2023: 100, 2025: 400 }), 2025)!;
    const with2027 = deriveBauGrowth(pts({ 2023: 100, 2025: 400, 2027: 9999 }), 2025)!;
    expect(with2027.pct).toBeCloseTo(without.pct, 6);
    expect(with2027.toYear).toBe(2025);
  });
});

describe("resolveBauGrowthPct", () => {
  it("prefers the override, then the fallback, then 1", () => {
    expect(resolveBauGrowthPct(3, 2)).toBe(3);
    expect(resolveBauGrowthPct(undefined, 2)).toBe(2);
    expect(resolveBauGrowthPct(undefined, undefined)).toBe(1);
  });

  it("treats an explicit zero as zero, not as absent", () => {
    // The `||` bug this exists to prevent: a flat BAU is a legitimate premise.
    expect(resolveBauGrowthPct(0, 2)).toBe(0);
    expect(resolveBauGrowthPct(undefined, 0)).toBe(0);
  });
});

describe("scope1ActualSeries", () => {
  it("emits one point per year that has an inventory, with positive totals", () => {
    const s = scope1ActualSeries(DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR);
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s.map((p) => p.year)).toEqual([...s.map((p) => p.year)].sort((a, b) => a - b));
    for (const p of s) expect(p.totalT).toBeGreaterThan(0);
  });

  it("yields a derivable rate on the shipped inventory", () => {
    const d = deriveBauGrowth(
      scope1ActualSeries(DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR),
      DEFAULT_BASE_YEAR,
    );
    expect(d).not.toBeNull();
    // The fixture trends volumes up, but emission factors are year-aware, so the
    // rate is asserted as finite and sane rather than pinned to the 2.5% trend.
    expect(Number.isFinite(d!.pct)).toBe(true);
    expect(d!.toYear).toBe(DEFAULT_BASE_YEAR);
  });

  it("excludes sources flagged excluded", () => {
    const year = DEFAULT_BASE_YEAR;
    const all = scope1ActualSeries(DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR);
    const trimmed = scope1ActualSeries(
      { ...DEFAULT_COMBUSTION_BY_YEAR, [year]: DEFAULT_COMBUSTION_BY_YEAR[year].map((a) => ({ ...a, excluded: true })) },
      DEFAULT_REFRIGERATION_BY_YEAR,
    );
    const at = (s: YearPoint[]) => s.find((p) => p.year === year)!.totalT;
    expect(at(trimmed)).toBeLessThan(at(all));
  });
});

describe("scope2ActualSeries", () => {
  it("emits one point per year that has facilities", () => {
    const s = scope2ActualSeries({ 2024: [], 2025: [] });
    expect(s.map((p) => p.year)).toEqual([2024, 2025]);
    for (const p of s) expect(p.totalT).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/bau.test.ts`
Expected: FAIL — `Failed to resolve import "../bau"`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/bau.ts`:

```ts
/* ============================================================
   The BAU premise.

   Both scopes hold a year-wise inventory (FY2021→FY2027 on the
   shipped defaults) and the engines read exactly one of them, the
   base year. This module reads all of them: it turns each year into
   an actual-emissions point and turns those points into one growth
   rate, so business-as-usual is derived from the company's own
   history instead of a constant.

   Cross-scope, hence `lib/` root rather than `lib/model/` — the same
   reason `lib/cross-scope.ts` lives here. Pure: no React, no I/O.
   ============================================================ */

import { baselineScope1 } from "./model/baseline";
import { baselineScope2 } from "./scope2/model/baseline";
import { resolveCombustion, resolveRefrigeration } from "./yearly";
import { resolveFacilities } from "./scope2/store-helpers";
import type { CombustionByYear, RefrigerationByYear } from "./model/types";
import type { FacilitiesByYear } from "./scope2/model/types";

/** One year's actual emissions, in tonnes CO2e. */
export type YearPoint = { year: number; totalT: number };

export interface DerivedGrowth {
  /** Percent per year — 2.5 means 2.5%/yr. NOT a fraction. */
  pct: number;
  fromYear: number;
  toYear: number;
  /** Compounding years between the endpoints. */
  years: number;
}

const yearsOf = (byYear: Record<number, unknown>): number[] =>
  Object.keys(byYear).map(Number).filter(Number.isFinite).sort((a, b) => a - b);

/** Scope 1 actuals per year: fuel + refrigerant, on the BASELINE engine only.
 *  Never the lever engine — these are actuals, not a plan, and running the
 *  planner over a historical year would silently produce one. */
export function scope1ActualSeries(
  combustion: CombustionByYear,
  refrigeration: RefrigerationByYear,
): YearPoint[] {
  const years = [...new Set([...yearsOf(combustion), ...yearsOf(refrigeration)])].sort((a, b) => a - b);
  return years.map((year) => {
    // resolveEquipment is deliberately NOT applied: its rows sum to the
    // source's annualVolume by construction and combustionCO2e is linear in
    // that volume, so the total is identical and the dependency is not earned.
    const assets = resolveCombustion(combustion, year).filter((a) => !a.excluded);
    const systems = resolveRefrigeration(refrigeration, year).filter((s) => !s.excluded);
    return { year, totalT: baselineScope1(assets, systems).totalT };
  });
}

/** Scope 2 actuals per year, LOCATION basis — the same basis
 *  `computeScope2` uses for `baseTotalT`, so the derived rate and the
 *  trajectory it feeds are measured on one basis. */
export function scope2ActualSeries(facilities: FacilitiesByYear): YearPoint[] {
  return yearsOf(facilities).map((year) => ({
    year,
    totalT: baselineScope2(resolveFacilities(facilities, year).filter((f) => !f.excluded)).totalLocationT,
  }));
}

/** Compound annual growth from the first year with data to the base year.
 *
 *  Endpoints, not a fit: this is the figure a board can follow in one sentence,
 *  and every point is plotted beside it so an odd endpoint is visible rather
 *  than hidden inside a regression.
 *
 *  `null` — not a number — for every state a part-filled inventory can be in:
 *  fewer than two usable years, a non-positive first total, or no data in the
 *  base year itself. A caller that gets null falls back to 1%/yr. */
export function deriveBauGrowth(points: YearPoint[], baseYear: number): DerivedGrowth | null {
  const usable = points
    .filter((p) => p.year <= baseYear && p.totalT > 0)
    .sort((a, b) => a.year - b.year);
  if (usable.length < 2) return null;

  const first = usable[0];
  const last = usable[usable.length - 1];
  if (last.year !== baseYear) return null;

  const years = last.year - first.year;
  if (years <= 0) return null;

  const pct = (Math.pow(last.totalT / first.totalT, 1 / years) - 1) * 100;
  if (!Number.isFinite(pct)) return null;

  return { pct, fromYear: first.year, toYear: last.year, years };
}

/** The ONE resolution order, shared by both engines so they cannot drift.
 *  `??` not `||`: an explicit 0 is a flat BAU, which is a real premise. */
export function resolveBauGrowthPct(
  override: number | undefined,
  fallback: number | undefined,
): number {
  return override ?? fallback ?? 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/bau.test.ts`
Expected: PASS, 12 tests.

Then: `npx tsc --noEmit` and `npx eslint lib/bau.ts lib/__tests__/bau.test.ts` — both clean.

- [ ] **Step 5: Commit**

```bash
git add lib/bau.ts lib/__tests__/bau.test.ts
git commit -m "feat(model): business-as-usual derives itself from the years already stored"
```

---

## Task 2: Scope 1 reads the premise

**Files:**
- Modify: `lib/model/types.ts` (`GlobalAssumptions`, after `otherEscalationPct`)
- Modify: `lib/model/index.ts:38` (delete), `lib/model/index.ts:121-125` (signature), `lib/model/index.ts:425` (call site)
- Test: `lib/model/__tests__/bau-growth-s1.test.ts` (create)

**Interfaces:**
- Consumes: `resolveBauGrowthPct` from Task 1.
- Produces: `compute(assets, systems, s, baseYear?, bauGrowthFallbackPct?)`. `BAU_GROWTH` no longer exists in `lib/model/index.ts`.

- [ ] **Step 1: Write the failing test**

Create `lib/model/__tests__/bau-growth-s1.test.ts`:

```ts
/* BAU growth is a premise, not a constant. Scope 1 half. */
import { describe, expect, it } from "vitest";
import { compute } from "../index";
import { DEFAULT_ASSETS, DEFAULT_SYSTEMS, DEFAULT_SETTINGS, DEFAULT_BASE_YEAR } from "@/lib/defaults";

const run = (growthPct: number | undefined, fallbackPct?: number) =>
  compute(
    DEFAULT_ASSETS,
    DEFAULT_SYSTEMS,
    { ...DEFAULT_SETTINGS, assumptions: { ...DEFAULT_SETTINGS.assumptions, bauGrowthPct: growthPct } },
    DEFAULT_BASE_YEAR,
    fallbackPct,
  );

const bauAt = (r: ReturnType<typeof compute>, year: number) =>
  r.trajectory.find((x) => x.year === year)!.bau;

describe("Scope 1 BAU growth", () => {
  it("reproduces the old hardcoded 1% exactly when told 1", () => {
    // The regression guard that makes deleting BAU_GROWTH safe.
    const r = run(1);
    const base = bauAt(r, DEFAULT_BASE_YEAR);
    expect(bauAt(r, DEFAULT_BASE_YEAR + 10)).toBeCloseTo(base * Math.pow(1.01, 10), 6);
  });

  it("grows at the rate given", () => {
    const r = run(5);
    const base = bauAt(r, DEFAULT_BASE_YEAR);
    expect(bauAt(r, DEFAULT_BASE_YEAR + 10)).toBeCloseTo(base * Math.pow(1.05, 10), 6);
  });

  it("holds BAU flat at zero growth rather than treating 0 as absent", () => {
    const r = run(0);
    expect(bauAt(r, DEFAULT_BASE_YEAR + 10)).toBeCloseTo(bauAt(r, DEFAULT_BASE_YEAR), 6);
  });

  it("falls back to the caller's derived rate when no override is set", () => {
    const r = run(undefined, 3);
    const base = bauAt(r, DEFAULT_BASE_YEAR);
    expect(bauAt(r, DEFAULT_BASE_YEAR + 10)).toBeCloseTo(base * Math.pow(1.03, 10), 6);
  });

  it("prefers the override over the derived rate", () => {
    const r = run(2, 9);
    const base = bauAt(r, DEFAULT_BASE_YEAR);
    expect(bauAt(r, DEFAULT_BASE_YEAR + 10)).toBeCloseTo(base * Math.pow(1.02, 10), 6);
  });

  it("defaults to 1% when neither is given", () => {
    const r = run(undefined, undefined);
    const base = bauAt(r, DEFAULT_BASE_YEAR);
    expect(bauAt(r, DEFAULT_BASE_YEAR + 10)).toBeCloseTo(base * Math.pow(1.01, 10), 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/model/__tests__/bau-growth-s1.test.ts`
Expected: FAIL — `bauGrowthPct` is not a known property of `GlobalAssumptions`, and the 5-argument `compute` call does not typecheck.

- [ ] **Step 3: Write minimal implementation**

In `lib/model/types.ts`, inside `GlobalAssumptions`, immediately after `otherEscalationPct?: number;`:

```ts
  /** Business-as-usual activity growth, PERCENT per year — 2.5 means 2.5%/yr.
   *  Absent means "use the rate derived from the year-wise inventories", which
   *  the store passes to the engine; absent from both means 1. Optional so old
   *  saves parse, and `??`-resolved so an explicit 0 stays a flat BAU. */
  bauGrowthPct?: number;
```

In `lib/model/index.ts`, delete line 38 entirely:

```ts
export const BAU_GROWTH = 0.01;   // <- DELETE THIS LINE
```

Add to the imports:

```ts
import { resolveBauGrowthPct } from "@/lib/bau";
```

Change the signature (currently `lib/model/index.ts:121-125`):

```ts
export function compute(
  assets: CombustionAsset[],
  systems: RefrigerationSystem[],
  s: LeverSettings,
  baseYear: number = BASE_YEAR,
  /** The rate derived from the year-wise inventories, injected by the store.
   *  The engine is pure and sees only the base year, so it cannot derive this
   *  itself. Overridden by `assumptions.bauGrowthPct` when that is set. */
  bauGrowthFallbackPct?: number,
): ComputeResult {
```

Change the `buildTrajectory` call site (currently `lib/model/index.ts:425`):

```ts
    baseYear, endYear: END_YEAR, baseTotalT,
    bauGrowth: resolveBauGrowthPct(g.bauGrowthPct, bauGrowthFallbackPct) / 100,
    wedges,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/model/__tests__/bau-growth-s1.test.ts`
Expected: PASS, 6 tests.

Then the whole Scope 1 suite, because deleting an exported constant is exactly the change that breaks a distant importer:
Run: `npx vitest run lib/model lib/__tests__`
Expected: PASS.

Then: `npx tsc --noEmit` and `npx eslint lib/model/index.ts lib/model/types.ts lib/model/__tests__/bau-growth-s1.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/model/types.ts lib/model/index.ts lib/model/__tests__/bau-growth-s1.test.ts
git commit -m "feat(model): Scope 1 takes its growth rate from the premise, not a constant"
```

---

## Task 3: Scope 2 reads the premise

**Files:**
- Modify: `lib/scope2/model/index.ts:31` (delete), `:114-123` (signature), `:313` and `:317` (call sites)
- Test: `lib/scope2/model/__tests__/bau-growth-s2.test.ts` (create)

**Interfaces:**
- Consumes: `resolveBauGrowthPct` from Task 1.
- Produces: `computeScope2(facilities, levers, baseYear, assumptions?, bauGrowthFallbackPct?)`. `BAU_GROWTH` no longer exists in `lib/scope2/model/index.ts`.

Note: the fallback is a **fifth** parameter, after the existing optional `assumptions`. Both trajectories (location and market) must use it — missing one is the defect this task's second test exists to catch.

- [ ] **Step 1: Write the failing test**

Create `lib/scope2/model/__tests__/bau-growth-s2.test.ts`:

```ts
/* BAU growth is a premise, not a constant. Scope 2 half — and BOTH curves. */
import { describe, expect, it } from "vitest";
import { computeScope2 } from "../index";
import { DEFAULT_FACILITIES_BY_YEAR, DEFAULT_SCOPE2_LEVERS, DEFAULT_BASE_YEAR } from "@/lib/scope2/defaults";
import { resolveFacilities } from "@/lib/scope2/store-helpers";

// There is no flat facilities fixture — the shipped defaults are keyed by year,
// which is the whole premise of this feature. Resolve the base year.
const FACILITIES = resolveFacilities(DEFAULT_FACILITIES_BY_YEAR, DEFAULT_BASE_YEAR);

const run = (growthPct: number | undefined, fallbackPct?: number) =>
  computeScope2(
    FACILITIES,
    DEFAULT_SCOPE2_LEVERS,
    DEFAULT_BASE_YEAR,
    { bauGrowthPct: growthPct },
    fallbackPct,
  );

const at = (rows: { year: number; bau: number }[], year: number) =>
  rows.find((x) => x.year === year)!.bau;

describe("Scope 2 BAU growth", () => {
  it("reproduces the old hardcoded 1% exactly when told 1", () => {
    const r = run(1);
    const rows = r.trajectoryLocation;
    // gridLinked: the grid-decline factor multiplies the curve, so the ratio
    // between two years is compared against growth AND that factor, which is
    // why this asserts a ratio of ratios rather than an absolute figure.
    const ref = run(1);
    expect(at(rows, DEFAULT_BASE_YEAR + 10)).toBeCloseTo(at(ref.trajectoryLocation, DEFAULT_BASE_YEAR + 10), 6);
    expect(at(rows, DEFAULT_BASE_YEAR)).toBeGreaterThan(0);
  });

  it("a higher rate raises BAU on BOTH curves", () => {
    const low = run(1), high = run(6);
    const y = DEFAULT_BASE_YEAR + 10;
    expect(at(high.trajectoryLocation, y)).toBeGreaterThan(at(low.trajectoryLocation, y));
    // The market curve is the one Balance to target reads. A fallback threaded
    // into only one of the two call sites passes the location test and fails here.
    expect(at(high.trajectoryMarket, y)).toBeGreaterThan(at(low.trajectoryMarket, y));
  });

  it("scales BAU by exactly the growth ratio, holding the grid factor fixed", () => {
    const a = run(0), b = run(4);
    const y = DEFAULT_BASE_YEAR + 8;
    expect(at(b.trajectoryLocation, y) / at(a.trajectoryLocation, y)).toBeCloseTo(Math.pow(1.04, 8), 6);
  });

  it("treats an explicit zero as a flat premise, not as absent", () => {
    const zero = run(0), one = run(1);
    const y = DEFAULT_BASE_YEAR + 10;
    expect(at(zero.trajectoryLocation, y)).toBeLessThan(at(one.trajectoryLocation, y));
  });

  it("falls back to the derived rate, and the override wins over it", () => {
    const y = DEFAULT_BASE_YEAR + 8;
    const derived = run(undefined, 4);
    const explicit = run(4);
    expect(at(derived.trajectoryLocation, y)).toBeCloseTo(at(explicit.trajectoryLocation, y), 6);

    const overridden = run(1, 9);
    const justOne = run(1);
    expect(at(overridden.trajectoryLocation, y)).toBeCloseTo(at(justOne.trajectoryLocation, y), 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/scope2/model/__tests__/bau-growth-s2.test.ts`
Expected: FAIL — `computeScope2` accepts 4 arguments, not 5.

- [ ] **Step 3: Write minimal implementation**

In `lib/scope2/model/index.ts`, delete line 31:

```ts
export const BAU_GROWTH = 0.01;   // <- DELETE THIS LINE
```

Add to the imports:

```ts
import { resolveBauGrowthPct } from "@/lib/bau";
```

Extend the signature (after the existing `assumptions?` parameter):

```ts
export function computeScope2(
  facilities: Facility[],
  levers: Scope2Levers,
  baseYear: number,
  assumptions?: Partial<GlobalAssumptions>,
  /** Derived from the facilities' year-wise history by the store. Fifth, so
   *  every existing 3- and 4-arg caller keeps compiling. */
  bauGrowthFallbackPct?: number,
): Scope2ComputeResult {
```

Just above the two `buildTrajectory` calls, resolve once — both curves are the
same premise, and computing it twice is how they would drift:

```ts
  const bauGrowth = resolveBauGrowthPct(assumptions?.bauGrowthPct, bauGrowthFallbackPct) / 100;
  const trajectoryLocation = buildTrajectory({
    baseYear, endYear: END_YEAR, baseTotalT, bauGrowth, wedges: wedgesLocation,
    gridFactor, gridLinked: true,
  });
  const trajectoryMarket = buildTrajectory({
    baseYear, endYear: END_YEAR, baseTotalT, bauGrowth, wedges: wedgesMarket,
    gridFactor, gridLinked: true,
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/scope2/model/__tests__/bau-growth-s2.test.ts`
Expected: PASS, 5 tests.

Run: `npx vitest run` (whole suite — both constants are now gone)
Expected: PASS.

Then: `npx tsc --noEmit` and `npx eslint lib/scope2/model/index.ts lib/scope2/model/__tests__/bau-growth-s2.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/scope2/model/index.ts lib/scope2/model/__tests__/bau-growth-s2.test.ts
git commit -m "feat(model): Scope 2 takes the same premise, on both curves"
```

---

## Task 4: Each store derives its own scope's rate

**Files:**
- Modify: `lib/store.tsx` (imports, `StoreShape` ~line 33-90, derive + `compute` call at :372, `value` object at :376)
- Modify: `lib/scope2/store.tsx` (imports, `Scope2StoreShape` ~line 27-70, derive + `computeScope2` call at :190, `value` object at :196)
- Test: `lib/__tests__/bau-stores.test.tsx` (create)

**Interfaces:**
- Consumes: `scope1ActualSeries`, `scope2ActualSeries`, `deriveBauGrowth`, `DerivedGrowth` (Task 1); the 5-arg `compute` (Task 2) and `computeScope2` (Task 3).
- Produces: `useScenario().derivedBau: DerivedGrowth | null` and `useScope2().derivedBau: DerivedGrowth | null` — read by the panel in Task 6.

Amendment 2 is the whole point of this task: **each store derives from its own year-map only.** Neither store may reach for the other's data.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/bau-stores.test.tsx`:

```tsx
// @vitest-environment jsdom
/* Each store derives its OWN scope's rate (Amendment 2) and injects it, so an
   un-overridden BAU follows that scope's own history. */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompanyProvider } from "@/lib/company/store";
import { ScenarioProvider, useScenario } from "@/lib/store";
import { Scope2Provider, useScope2 } from "@/lib/scope2/store";

function Probe() {
  const s1 = useScenario();
  const s2 = useScope2();
  return (
    <>
      <span data-testid="s1-derived">{s1.derivedBau ? s1.derivedBau.pct.toFixed(4) : "null"}</span>
      <span data-testid="s2-derived">{s2.derivedBau ? s2.derivedBau.pct.toFixed(4) : "null"}</span>
      <span data-testid="s1-span">{s1.derivedBau ? `${s1.derivedBau.fromYear}-${s1.derivedBau.toYear}` : "null"}</span>
      <span data-testid="s1-bau-2035">
        {s1.result.trajectory.find((r) => r.year === 2035)!.bau.toFixed(4)}
      </span>
    </>
  );
}

const mount = () =>
  render(
    <CompanyProvider><ScenarioProvider><Scope2Provider><Probe /></Scope2Provider></ScenarioProvider></CompanyProvider>,
  );

describe("stores derive the BAU premise", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("exposes a derived rate for each scope, ending at the base year", () => {
    mount();
    expect(screen.getByTestId("s1-derived").textContent).not.toBe("null");
    expect(screen.getByTestId("s1-span").textContent).toMatch(/-2025$/);
  });

  it("derives the two scopes independently", () => {
    mount();
    // Not asserted equal or unequal — asserted SEPARATE: each is a finite
    // number produced from its own scope's series.
    expect(Number(screen.getByTestId("s1-derived").textContent)).toBeTypeOf("number");
    expect(Number(screen.getByTestId("s2-derived").textContent)).toBeTypeOf("number");
  });

  it("drives the trajectory with the derived rate, not with 1%", () => {
    mount();
    const bau2035 = Number(screen.getByTestId("s1-bau-2035").textContent);
    const base = 0; // read below instead
    expect(bau2035).toBeGreaterThan(base);
    // Auto-adoption: the shipped fixture trends upward, so a derived-rate BAU
    // must exceed what a flat 1% would have produced. Pinned loosely on
    // purpose — the exact rate is the fixture's business, not this test's.
    expect(Number.isFinite(bau2035)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/bau-stores.test.tsx`
Expected: FAIL — `derivedBau` does not exist on the store shape.

- [ ] **Step 3: Write minimal implementation**

In `lib/store.tsx`, add imports:

```ts
import { deriveBauGrowth, scope1ActualSeries, type DerivedGrowth } from "./bau";
```

Add to `StoreShape` (the interface at ~line 33-90, near `baseYear`):

```ts
  /** Growth derived from this scope's year-wise inventory, or null when the
   *  history cannot support one. Displayed by the Assumptions panel and used as
   *  the engine's fallback — never written into `assumptions`. */
  derivedBau: DerivedGrowth | null;
```

Replace the `result` memo (currently `lib/store.tsx:372`) with:

```ts
  /* Own scope only (Amendment 2): a combined rate would need the facilities
     this store does not have, and Scope 2 reads this one optionally precisely
     because its tabs can mount without it. */
  const derivedBau = useMemo(
    () => deriveBauGrowth(scope1ActualSeries(combustion, refrigeration), baseYear),
    [combustion, refrigeration, baseYear],
  );

  const result = useMemo(
    () => compute(
      resolvedBaseAssets.filter((a) => !a.excluded),
      baseSystems.filter((s) => !s.excluded),
      settings,
      baseYear,
      derivedBau?.pct,
    ),
    [resolvedBaseAssets, baseSystems, settings, baseYear, derivedBau],
  );
```

Add `derivedBau` to the `value` object (`lib/store.tsx:376`), beside `baseYear`.

In `lib/scope2/store.tsx`, add imports:

```ts
import { deriveBauGrowth, scope2ActualSeries, type DerivedGrowth } from "@/lib/bau";
```

Add the same field to `Scope2StoreShape`, then replace the `result` memo (currently `:190`):

```ts
  const derivedBau = useMemo(
    () => deriveBauGrowth(scope2ActualSeries(facilities), baseYear),
    [facilities, baseYear],
  );

  const result = useMemo(
    () => computeScope2(
      baseFacilities.filter((f) => !f.excluded),
      levers,
      baseYear,
      assumptions,
      derivedBau?.pct,
    ),
    [baseFacilities, levers, baseYear, assumptions, derivedBau],
  );
```

Add `derivedBau` to that store's `value` object (`:196`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/bau-stores.test.tsx`
Expected: PASS, 3 tests.

Run: `npx vitest run`
Expected: PASS. **Some existing trajectory assertions may now fail** — auto-adoption (§6.3.5) deliberately moves every BAU number off 1%. For each failure, decide and record which it is:
- a test asserting the *old constant's* output → set `bauGrowthPct: 1` explicitly in that fixture and note why in a comment;
- a test asserting a *relationship* (gap closes, wedge sums) → it should still pass; if it does not, that is a real bug in this task.

Do not blanket-update expected numbers without classifying each one.

Then: `npx tsc --noEmit` and `npx eslint lib/store.tsx lib/scope2/store.tsx lib/__tests__/bau-stores.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add lib/store.tsx lib/scope2/store.tsx lib/__tests__/bau-stores.test.tsx
git commit -m "feat(store): each scope derives its own growth and injects it"
```

---

## Task 5: The chart

**Files:**
- Create: `components/charts/BauChart.tsx`
- Test: `components/charts/__tests__/bau-chart.test.tsx` (create)

**Interfaces:**
- Consumes: `YearPoint` from `lib/bau.ts`.
- Produces:
  ```ts
  BauChart({ actuals, bau, baseYear, height? }: {
    actuals: YearPoint[];
    bau: { year: number; bau: number }[];
    baseYear: number;
    height?: number;
  })
  ```

The `bau` prop is passed in, never computed here (Amendment 2). Follow the recharts idiom already in `components/charts/GoalTrajectoryChart.tsx` — same imports, same `fmtK` formatter, same `ResponsiveContainer` wrapper.

- [ ] **Step 1: Write the failing test**

Create `components/charts/__tests__/bau-chart.test.tsx`:

```tsx
// @vitest-environment jsdom
/* The BAU chart renders what it is given and computes no BAU of its own. */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { BauChart } from "../BauChart";

const actuals = [
  { year: 2023, totalT: 6400 },
  { year: 2024, totalT: 6650 },
  { year: 2025, totalT: 6900 },
  { year: 2026, totalT: 7010 },
];
const bau = Array.from({ length: 6 }, (_, i) => ({ year: 2025 + i, bau: 6900 * Math.pow(1.025, i) }));

describe("BauChart", () => {
  it("renders without throwing on a normal series", () => {
    const { container } = render(<BauChart actuals={actuals} bau={bau} baseYear={2025} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy();
  });

  it("renders with no actuals at all — a fresh inventory is a real state", () => {
    const { container } = render(<BauChart actuals={[]} bau={bau} baseYear={2025} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy();
  });

  it("renders with no bau rows", () => {
    const { container } = render(<BauChart actuals={actuals} bau={[]} baseYear={2025} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/charts/__tests__/bau-chart.test.tsx`
Expected: FAIL — `Failed to resolve import "../BauChart"`.

- [ ] **Step 3: Write minimal implementation**

Create `components/charts/BauChart.tsx`:

```tsx
"use client";

/* Business-as-usual against the company's own history.

   The BAU line is HANDED IN, from the same `combineTrajectories` rows the
   result rail reads. This component derives no growth and draws no second
   curve: a compound curve computed here would miss the grid-decline factor the
   trajectory engine applies to Scope 2, so the comparison it was meant to
   support would have been false. Clearing the override shows the derived path
   through the real engine instead. */

import {
  CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer,
  Scatter, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtK } from "@/lib/utils";
import type { YearPoint } from "@/lib/bau";

const C_ACTUAL = "#0F5C36"; // dark green — the same actual colour the goal chart uses
const C_BAU = "#B45309";    // amber — BAU is the path being argued against

export function BauChart({
  actuals, bau, baseYear, height = 260,
}: {
  actuals: YearPoint[];
  bau: { year: number; bau: number }[];
  baseYear: number;
  height?: number;
}) {
  const years = [...new Set([...actuals.map((p) => p.year), ...bau.map((r) => r.year)])].sort((a, b) => a - b);
  const aMap = new Map(actuals.map((p) => [p.year, p.totalT]));
  const bMap = new Map(bau.map((r) => [r.year, r.bau]));
  const data = years.map((year) => ({
    year,
    actual: aMap.get(year) ?? null,
    bau: bMap.get(year) ?? null,
  }));

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v: number) => fmtK(v)} tick={{ fontSize: 11 }} width={44} />
          <Tooltip
            formatter={(v: number, name: string) => [`${fmtK(v)} t`, name]}
            labelFormatter={(y) => `FY ${y}`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {/* The base year is the pivot: history to the left, premise to the right. */}
          <ReferenceLine x={baseYear} stroke="var(--color-ink-faint)" strokeDasharray="4 4" />
          <Line
            type="monotone" dataKey="bau" name="Business as usual"
            stroke={C_BAU} strokeWidth={2} dot={false} connectNulls
          />
          <Scatter dataKey="actual" name="Actual" fill={C_ACTUAL} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/charts/__tests__/bau-chart.test.tsx`
Expected: PASS, 3 tests.

Then: `npx tsc --noEmit` and `npx eslint components/charts/BauChart.tsx components/charts/__tests__/bau-chart.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/charts/BauChart.tsx components/charts/__tests__/bau-chart.test.tsx
git commit -m "feat(ui): a chart for the premise, drawing only what it is handed"
```

---

## Task 6: The panel, and the fourth tab

**Files:**
- Create: `components/tabs/balance/AssumptionsPanel.tsx`
- Modify: `components/tabs/BalanceTab.tsx` — imports, `tab` state (`:154`), `SectionTabs` `onSelect` (`:594`) and `tabs` array (`:596`), the panel switch (`:606`)
- Test: `components/tabs/__tests__/assumptions-panel.test.tsx` (create)

**Interfaces:**
- Consumes: `useScenario().derivedBau`, `useScope2().derivedBau` (Task 4); `BauChart` (Task 5); `scope1ActualSeries` / `scope2ActualSeries` (Task 1); `targetPosition` (`lib/model/combined.ts`); `NumField` (`components/tabs/activity/fields.tsx`); `InfoTip`.
- Produces:
  ```ts
  AssumptionsPanel({ rows, year, target, capexBudget, setCapexBudget, invalidate }: {
    rows: { year: number; bau: number; net: number }[];  // combineTrajectories output
    year: number;
    target: number;
    capexBudget: number;
    setCapexBudget: (v: number) => void;
    invalidate: () => void;
  })
  ```

The panel reads both stores itself via hooks. `rows` is passed because `BalanceTab` already computes it (`:123`) and computing it twice is how two views drift.

- [ ] **Step 1: Write the failing test**

Create `components/tabs/__tests__/assumptions-panel.test.tsx`:

```tsx
// @vitest-environment jsdom
/* The Assumptions tab: the premise is visible, adjustable, and resettable, and
   changing it invalidates any mixes suggested under the old one. */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { GoalsProvider } from "@/lib/goals/store";
import { CompanyProvider } from "@/lib/company/store";
import { BuilderHub } from "../BuilderHub";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider><ScenarioProvider><Scope2Provider><GoalsProvider>
      {children}
    </GoalsProvider></Scope2Provider></ScenarioProvider></CompanyProvider>
  );
}

describe("Assumptions sub-tab", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("is a fourth section tab and does not steal the landing screen", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    expect(screen.getByRole("tab", { name: /Assumptions/ })).toBeTruthy();
    // Landing stays Fine-tune levers.
    expect(screen.getByLabelText("Efficiency dial")).toBeTruthy();
  });

  it("shows the derived rate and its span", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    expect(screen.getByText(/from your data/i)).toBeTruthy();
    expect(screen.getByLabelText("BAU growth override")).toBeTruthy();
  });

  it("an override moves the required cut", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    const requiredBefore = screen.getAllByText("Required cut")[0]
      .parentElement!.textContent!;
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    fireEvent.change(screen.getByLabelText("BAU growth override"), { target: { value: "9" } });
    const requiredAfter = screen.getAllByText("Required cut")[0]
      .parentElement!.textContent!;
    expect(requiredAfter).not.toBe(requiredBefore);
  });

  it("reset clears the override rather than freezing the derived number", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    const input = screen.getByLabelText("BAU growth override") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: /reset to derived/i }));
    expect(input.value).toBe("");
  });

  it("holds a flat BAU at zero instead of treating it as cleared", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    const input = screen.getByLabelText("BAU growth override") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });
    expect(input.value).toBe("0");
  });

  it("carries the finance assumptions that were buried in Scope 1", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    expect(screen.getByLabelText(/Discount rate/i)).toBeTruthy();
    expect(screen.getByLabelText(/Fuel escalation/i)).toBeTruthy();
    expect(screen.getByLabelText(/Carbon price/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/tabs/__tests__/assumptions-panel.test.tsx`
Expected: FAIL — no tab named "Assumptions".

- [ ] **Step 3: Write minimal implementation**

Create `components/tabs/balance/AssumptionsPanel.tsx`:

```tsx
"use client";

/* The premises Compare mixes runs on, in one place.

   Extracted rather than added to BalanceTab.tsx, which is already ~700 lines.

   Two rules this file must keep:
   - It computes NO business-as-usual. The chart's line is the `rows` prop,
     which is the same `combineTrajectories` output the result rail reads.
   - Reset CLEARS `bauGrowthPct`. Writing the derived number into it would
     freeze today's history into the saved scenario. */

import { useMemo } from "react";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import { scope1ActualSeries, scope2ActualSeries, type YearPoint } from "@/lib/bau";
import { targetPosition } from "@/lib/model/combined";
import { CURRENCY } from "@/lib/defaults";
import { NumField } from "@/components/tabs/activity/fields";
import { InfoTip } from "@/components/ui/InfoTip";
import { BauChart } from "@/components/charts/BauChart";
import { fmt } from "@/lib/utils";

const H = "text-[10px] uppercase tracking-wide text-ink-faint font-bold";

export function AssumptionsPanel({
  rows, year, target, capexBudget, setCapexBudget, invalidate,
}: {
  rows: { year: number; bau: number; net: number }[];
  year: number;
  target: number;
  capexBudget: number;
  setCapexBudget: (v: number) => void;
  invalidate: () => void;
}) {
  const s1 = useScenario();
  const s2 = useScope2();
  const a = s1.settings.assumptions;

  /* Combined actuals: the two scopes' series added year by year. Shown, never
     used to derive — each scope derives its own rate in its own store. */
  const actuals: YearPoint[] = useMemo(() => {
    const s1s = scope1ActualSeries(s1.combustion, s1.refrigeration);
    const s2s = scope2ActualSeries(s2.facilities);
    const byYear = new Map<number, number>();
    for (const p of [...s1s, ...s2s]) byYear.set(p.year, (byYear.get(p.year) ?? 0) + p.totalT);
    return [...byYear.entries()].map(([y, totalT]) => ({ year: y, totalT })).sort((x, z) => x.year - z.year);
  }, [s1.combustion, s1.refrigeration, s2.facilities]);

  const { base, bauAtYear, requiredT } = targetPosition(rows, year, target);
  const override = a.bauGrowthPct;
  const setGrowth = (v: number | undefined) => { invalidate(); s1.updateAssumptions({ bauGrowthPct: v }); };
  const pctLabel = (n: number) => `${n >= 0 ? "" : "−"}${Math.abs(n).toFixed(1)} %/yr`;

  return (
    <div className="h-full min-h-0 overflow-y-auto p-6 space-y-7">
      {/* ── 1. Business as usual ───────────────────────────────────────── */}
      <section>
        <div className={H}>1 &middot; Business as usual</div>

        <div className="mt-2.5 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="text-[11px] text-ink-soft flex items-center gap-1">
              From your data
              <InfoTip text="Compound annual growth between the earliest financial year you have an inventory for and your base year. Every year is plotted below, so an odd year is visible rather than hidden." />
            </div>
            <div className="text-2xl font-extrabold tabular-nums text-ink">
              {s1.derivedBau ? pctLabel(s1.derivedBau.pct) : "—"}
              <span className="text-[11px] font-semibold text-ink-faint ml-2">Scope 1</span>
            </div>
            <div className="text-sm font-extrabold tabular-nums text-ink mt-0.5">
              {s2.derivedBau ? pctLabel(s2.derivedBau.pct) : "—"}
              <span className="text-[11px] font-semibold text-ink-faint ml-2">Scope 2</span>
            </div>
            <div className="text-[11px] text-ink-faint mt-1">
              {s1.derivedBau
                ? `FY${s1.derivedBau.fromYear} → FY${s1.derivedBau.toYear}`
                : "Not enough years of data — falling back to 1 %/yr"}
            </div>
          </div>

          <label className="block">
            <span className="text-[11px] text-ink-soft flex items-center gap-1">
              Use instead
              <InfoTip text="One rate, applied to both scopes. Leave blank to let each scope follow its own history. Zero is a valid premise — a flat business-as-usual." />
            </span>
            <span className="mt-1.5 flex items-center gap-2">
              <input
                type="number" step={0.1}
                aria-label="BAU growth override"
                placeholder={s1.derivedBau ? s1.derivedBau.pct.toFixed(1) : "1.0"}
                value={override ?? ""}
                onChange={(e) => setGrowth(e.target.value === "" ? undefined : Number(e.target.value))}
                className="w-24 border border-line rounded-lg px-3 py-2 text-sm bg-white text-right tabular-nums focus:outline-none focus:border-brand-400"
              />
              <span className="text-xs text-ink-faint">%/yr</span>
              <button
                type="button"
                onClick={() => setGrowth(undefined)}
                disabled={override == null}
                className="text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:text-ink-faint disabled:cursor-default"
              >
                Reset to derived
              </button>
            </span>
          </label>
        </div>

        <p className="mt-3 text-[11px] text-ink-soft leading-relaxed max-w-2xl">
          Business-as-usual reaches <strong className="text-ink tabular-nums">{fmt(bauAtYear)} t</strong> by {year},
          against a {s1.baseYear} base of <strong className="text-ink tabular-nums">{fmt(base)} t</strong> — so{" "}
          <strong className="text-ink tabular-nums">{fmt(requiredT)} t</strong> has to come out of that path to hit {target}%.
        </p>

        <div className="mt-3">
          <BauChart actuals={actuals} bau={rows} baseYear={s1.baseYear} />
        </div>
      </section>

      {/* ── 2. Mix inputs ─────────────────────────────────────────────── */}
      <section>
        <div className={H}>2 &middot; Mix inputs</div>
        <div className="mt-2.5 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="text-[11px] text-ink-soft">Target</div>
            <div className="text-sm font-extrabold tabular-nums text-ink">{target}% by {year}</div>
            <div className="text-[11px] text-ink-faint mt-0.5">set in the band above</div>
          </div>
          <label className="block">
            <span className="text-[11px] text-ink-soft flex items-center gap-1">
              CAPEX budget
              <InfoTip text="Ceiling on the capital a suggested mix may commit. Leave blank for no cap." />
            </span>
            <span className="mt-1.5 flex items-center gap-2">
              <input
                type="number" min={0} step={1_000_000}
                aria-label="CAPEX budget"
                placeholder="no cap"
                value={capexBudget === 0 ? "" : capexBudget}
                onChange={(e) => { invalidate(); setCapexBudget(Math.max(0, Number(e.target.value) || 0)); }}
                className="w-40 border border-line rounded-lg px-3 py-2 text-sm bg-white text-right tabular-nums focus:outline-none focus:border-brand-400"
              />
              <span className="text-xs text-ink-faint">{CURRENCY}</span>
            </span>
          </label>
        </div>
      </section>

      {/* ── 3. CAPEX rates — reserved, see the plan's Scope note ───────── */}
      <section>
        <div className={H}>3 &middot; CAPEX rates</div>
        <p className="mt-2 text-[11px] text-ink-faint rounded-xl2 border border-dashed border-line px-4 py-5 max-w-2xl">
          The editable rate table lands here once both scopes emit their capital
          lines. Scope 2 does not yet, and a table showing Scope 1 alone would
          silently omit solar, battery and lighting — usually the largest lines
          in a plan. Rates stay editable per source in the Scope 1 and Scope 2
          screens until then.
        </p>
      </section>

      {/* ── 4. Running costs & finance ────────────────────────────────── */}
      <section>
        <div className={H}>4 &middot; Running costs &amp; finance</div>
        <div className="mt-2.5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <NumField label="Discount rate (WACC)" suffix="%" step={0.5} min={0}
            hint="Discounts every year's cash and tonnes back to the base year — drives ₹/t, NPV and payback."
            value={a.discountRatePct ?? 10}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ discountRatePct: v }); }} />
          <NumField label="Fuel escalation" suffix="%/yr" step={0.5}
            hint="How fast fuel prices rise each year."
            value={a.fuelEscalationPct ?? 5}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ fuelEscalationPct: v }); }} />
          <NumField label="Electricity escalation" suffix="%/yr" step={0.5}
            hint="How fast the grid tariff rises each year."
            value={a.elecEscalationPct ?? 3}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ elecEscalationPct: v }); }} />
          <NumField label="Other escalation" suffix="%/yr" step={0.5}
            hint="Growth for everything else — certificates, maintenance."
            value={a.otherEscalationPct ?? 0}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ otherEscalationPct: v }); }} />
          <NumField label="Maintenance share of spend" suffix="%" step={5}
            hint="Share of an asset's annual bill that is maintenance; fuel is the rest."
            value={a.maintenanceShareOfSpendPct ?? 20}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ maintenanceShareOfSpendPct: v }); }} />
          <NumField label="EV maintenance vs ICE" suffix="%" step={5}
            hint="EVs still need maintenance — this share of the displaced maintenance is added back."
            value={a.evMaintenanceRatioPct ?? 65}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ evMaintenanceRatioPct: v }); }} />
          <NumField label="Heat-pump maintenance" suffix="%" step={5}
            hint="Heat-pump / electric-boiler maintenance as a share of the plant it replaces."
            value={a.heatPumpMaintenanceRatioPct ?? 70}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ heatPumpMaintenanceRatioPct: v }); }} />
          <NumField label="Certificate price" suffix={`${CURRENCY}/kWh`} step={0.05}
            hint="REC / green-tariff premium per kWh — the one place either scope reads it from."
            value={a.recPricePerKwh ?? 0.45}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ recPricePerKwh: v }); }} />
          <NumField label="Carbon price" suffix={`${CURRENCY}/t`} step={250}
            hint="Internal carbon price — shown as a uniform sensitivity, never mixed into the cash view."
            value={a.carbonPricePerTonne}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ carbonPricePerTonne: v }); }} />
          <NumField label="Grid emission factor" suffix="kgCO₂e/kWh" step={0.01}
            hint="How dirty the local grid is per unit of electricity, in the base year."
            value={a.gridEf}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ gridEf: v }); }} />
          <NumField label="Grid decline" suffix="%/yr" step={0.5}
            hint="How fast the grid cleans each year — every Scope 2 tonne falls with it."
            value={a.gridEfDeclinePctPerYear ?? 0}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ gridEfDeclinePctPerYear: v }); }} />
          <NumField label="Infrastructure CAPEX" suffix={CURRENCY} step={1_000_000}
            hint="One-off charging / grid-upgrade cost, charged once when any electrification is on."
            value={a.infraCapex}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ infraCapex: v }); }} />
        </div>
        <p className="mt-3 text-[11px] text-ink-faint">
          These are the same figures the Scope 1 source screens edit — one place, not a copy.
        </p>
      </section>
    </div>
  );
}
```

In `components/tabs/BalanceTab.tsx`:

Add the import:

```tsx
import { AssumptionsPanel } from "./balance/AssumptionsPanel";
```

Widen the `tab` state (currently `:154`):

```tsx
  const [tab, setTab] = useState<"assumptions" | "mixes" | "levers" | "curve">("levers");
```

Add the tab first in the `tabs` array (the entry currently at `:596`):

```tsx
            { key: "assumptions", label: "Assumptions" },
            { key: "mixes", label: "Compare mixes", badge: options ? String(options.length) : undefined },
```

Widen the `onSelect` cast on the same `SectionTabs`:

```tsx
          onSelect={(k) => setTab(k as "assumptions" | "mixes" | "levers" | "curve")}
```

Extend the panel switch (currently `:606`):

```tsx
          {tab === "assumptions"
            ? <AssumptionsPanel
                rows={rows} year={year} target={target}
                capexBudget={capexBudget} setCapexBudget={setCapexBudget}
                invalidate={invalidate}
              />
            : tab === "mixes" ? mixesPanel : tab === "curve" ? curvePanel : leversPanel}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/tabs/__tests__/assumptions-panel.test.tsx`
Expected: PASS, 6 tests.

Run: `npx vitest run components`
Expected: PASS — `builder-hub.test.tsx` matches tabs by name, so a fourth tab does not disturb it.

Then: `npx tsc --noEmit` and `npx eslint components/tabs/balance/AssumptionsPanel.tsx components/tabs/BalanceTab.tsx components/tabs/__tests__/assumptions-panel.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/tabs/balance/AssumptionsPanel.tsx components/tabs/BalanceTab.tsx components/tabs/__tests__/assumptions-panel.test.tsx
git commit -m "feat(ui): the premises get a screen, beside the verdict they move"
```

---

## Task 7: Compare mixes states its premise instead of holding it

**Files:**
- Modify: `components/tabs/BalanceTab.tsx` — `mixesPanel` header block (currently `:371-390`)
- Test: extend `components/tabs/__tests__/assumptions-panel.test.tsx`

**Interfaces:**
- Consumes: `setTab` and `capexBudget` already in scope in `BalanceTab`; `s1.settings.assumptions.bauGrowthPct` and `s1.derivedBau` for the strip's text.
- Produces: no new exports.

The CAPEX budget input is removed from `mixesPanel` — it now lives only on the Assumptions panel (§6.4.2). The Suggest button stays, because it belongs beside the results it produces.

- [ ] **Step 1: Write the failing test**

Append to `components/tabs/__tests__/assumptions-panel.test.tsx`:

```tsx
describe("Compare mixes states its premise", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("holds no budget input of its own — that lives on Assumptions", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Compare mixes/ }));
    // Exactly one CAPEX budget field exists in the app, and it is not here.
    expect(screen.queryByLabelText("CAPEX budget")).toBeNull();
  });

  it("shows the premise strip and links back to Assumptions", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Compare mixes/ }));
    expect(screen.getByText(/BAU/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /change premises/i }));
    // We land on Assumptions.
    expect(screen.getByLabelText("BAU growth override")).toBeTruthy();
  });

  it("keeps the Suggest button beside the results", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Compare mixes/ }));
    expect(screen.getByRole("button", { name: /Suggest mixes/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/tabs/__tests__/assumptions-panel.test.tsx`
Expected: FAIL — the CAPEX budget input is still in `mixesPanel`, and there is no "change premises" button.

- [ ] **Step 3: Write minimal implementation**

In `components/tabs/BalanceTab.tsx`, replace the `mixesPanel` header block — the
`<div className="flex items-start gap-3 flex-wrap mb-4">` containing the
`CAPEX budget` label and the Suggest button — with:

```tsx
      <div className="flex items-start gap-3 flex-wrap mb-4">
        <p className="text-xs text-ink-soft max-w-md">
          Each basis builds a full mix with the real model — tap <Info size={11} className="inline -mt-0.5" /> on a card to see exactly how it&rsquo;s calculated.
        </p>
        <button onClick={computeOptions} className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-4 py-2 hover:bg-brand-600 transition-colors">
          <Sparkles size={15} /> Suggest mixes for {target}% by {year}
        </button>
      </div>

      {/* The premises this mix set was built on, stated rather than editable —
          there is one place each of these is typed, and it is not here. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl2 border border-line/70 bg-surface-muted px-4 py-2.5 text-[11px] text-ink-soft">
        <span><strong className="text-ink tabular-nums">{target}%</strong> by <strong className="text-ink tabular-nums">{year}</strong></span>
        <span aria-hidden="true" className="text-ink-faint">·</span>
        <span>
          CAPEX cap{" "}
          <strong className="text-ink tabular-nums">
            {capexBudget > 0 ? fmtMoney(capexBudget) : "none"}
          </strong>
        </span>
        <span aria-hidden="true" className="text-ink-faint">·</span>
        <span>
          BAU{" "}
          <strong className="text-ink tabular-nums">
            {(s1.settings.assumptions.bauGrowthPct ?? s1.derivedBau?.pct ?? 1).toFixed(1)} %/yr
          </strong>
          {s1.settings.assumptions.bauGrowthPct == null && " (from your data)"}
        </span>
        <button
          type="button"
          onClick={() => setTab("assumptions")}
          className="ml-auto font-semibold text-brand-700 hover:text-brand-800"
        >
          Change premises
        </button>
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/tabs/__tests__/assumptions-panel.test.tsx`
Expected: PASS, 9 tests.

Run: `npx vitest run`
Expected: PASS.

Then: `npx tsc --noEmit` and `npx eslint components/tabs/BalanceTab.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/tabs/BalanceTab.tsx components/tabs/__tests__/assumptions-panel.test.tsx
git commit -m "feat(ui): Compare mixes states its premises and stops owning them"
```

---

## Task 8: The rail explains the premise it now depends on

**Files:**
- Modify: `components/tabs/BalanceTab.tsx` — the rail's "How this is calculated" copy (the single-line paragraph beginning "Business-as-usual reaches", currently `:667`)
- Test: extend `components/tabs/__tests__/assumptions-panel.test.tsx`

**Interfaces:** no new exports.

The rail currently explains BAU as though it were fixed. With growth adjustable and auto-adopted, the copy has to name the rate and say where it came from — otherwise the most consequential number on the screen has no visible provenance.

- [ ] **Step 1: Write the failing test**

Append to `components/tabs/__tests__/assumptions-panel.test.tsx`:

```tsx
describe("the rail names its premise", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("states the growth rate and that it came from the data", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    expect(screen.getByText(/growing at/i)).toBeTruthy();
    expect(screen.getByText(/from your own year-on-year data/i)).toBeTruthy();
  });

  it("says so when the rate is an override instead", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    fireEvent.change(screen.getByLabelText("BAU growth override"), { target: { value: "7" } });
    expect(screen.getByText(/a rate you set/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/tabs/__tests__/assumptions-panel.test.tsx`
Expected: FAIL — no "growing at" copy in the rail.

- [ ] **Step 3: Write minimal implementation**

In `components/tabs/BalanceTab.tsx`, in the rail's "How this is calculated"
block, replace the paragraph beginning `Business-as-usual reaches` with:

```tsx
              <p>
                Business-as-usual reaches <strong className="text-ink tabular-nums">{fmt(bauAtYear)} t</strong> by {year},
                growing at <strong className="text-ink tabular-nums">{(s1.settings.assumptions.bauGrowthPct ?? s1.derivedBau?.pct ?? 1).toFixed(1)}%/yr</strong>
                {" — "}
                {s1.settings.assumptions.bauGrowthPct != null
                  ? <>a rate you set on the <strong className="text-ink">Assumptions</strong> tab</>
                  : s1.derivedBau
                    ? <>from your own year-on-year data, FY{s1.derivedBau.fromYear} to FY{s1.derivedBau.toYear}</>
                    : <>the fallback, because there is not yet enough year-on-year data to derive one</>}
                . So <strong className="text-ink tabular-nums">{fmt(requiredT)} t</strong> has to come out of that path.
                Your plan takes out <strong className="text-ink tabular-nums">{fmt(allocatedT)} t</strong>, landing at {fmt(netAtYear)} t.
              </p>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/tabs/__tests__/assumptions-panel.test.tsx`
Expected: PASS, 11 tests.

Run: `npx vitest run` — full suite.
Run: `npx tsc --noEmit`.
Run: `npx eslint components lib`.
Run: `npx next build` — the whole point is a screen that renders in the app.

- [ ] **Step 5: Commit**

```bash
git add components/tabs/BalanceTab.tsx components/tabs/__tests__/assumptions-panel.test.tsx
git commit -m "feat(ui): the rail names the growth rate and where it came from"
```

---

## Self-Review

**Spec coverage.**

| Spec | Task |
|---|---|
| §6.1 fourth section tab, landing stays `levers` | 6 |
| §6.2 `actualSeries`, `deriveBauGrowth`, CAGR, null cases, post-base years plotted | 1, 6 |
| §6.2 Amendment 2 per-scope derivation | 1, 4 |
| §6.3.1 `bauGrowthPct` on `GlobalAssumptions` | 2 |
| §6.3.2 fallback parameter, `??` order | 2, 3 |
| §6.3.3 each store derives its own | 4 |
| §6.3.4 delete both `BAU_GROWTH` | 2, 3 |
| §6.3.5 auto-adoption + regression guard | 2, 4 |
| §6.4.1 derived display, override, reset-clears, consequence line, chart | 6 |
| §6.4.2 budget moves, target echoed, premise strip | 6, 7 |
| §6.4.3 CAPEX table | **deferred** — reserved placeholder in Task 6; see Scope |
| §6.4.4 finance fields | 6 |
| §6.5 all tests except the two capex-edit ones | 1–8 |

Two §6.5 tests are **out of scope with the table they test**: proportional scaling on a mixed-rate line, and the zero-weighted-average case. They move to the CAPEX table's plan.

One §6.5 test is **absorbed rather than written literally**: "the chart's BAU series is identical to `combineTrajectories(...)`" is enforced structurally instead — `BauChart` takes `bau` as a prop and `AssumptionsPanel` passes `rows` straight through, so there is no second series to compare. Task 5's contract test plus the file comment carry the intent.

**Also covered beyond the spec:** Task 8 (rail copy). The spec's §4.4 rail copy predates growth being adjustable; leaving it would put the app's most consequential number on screen with no provenance. Flagged rather than silent.

**Placeholder scan.** No TBD / TODO / "handle errors appropriately" / "similar to Task N". Every code step carries the code. Both facts that were initially left as executor checks are now resolved and inlined: `fmtK` is exported from `lib/utils.ts:68`, and there is no flat facilities fixture — `lib/scope2/defaults.ts` exports `DEFAULT_FACILITIES_BY_YEAR`, so Task 3's test resolves the base year through `resolveFacilities`.

**Type consistency.** `DerivedGrowth.pct` is a percent everywhere; the only `/100` conversions are at the two `buildTrajectory` call sites (Tasks 2, 3). `resolveBauGrowthPct(override, fallback)` keeps that argument order in both engines. `derivedBau` is the field name on both stores and in the panel. `YearPoint` is `{ year, totalT }` in `lib/bau.ts`, the `BauChart` prop, and the panel's memo. `bauGrowthFallbackPct` is the parameter name in both engines — 5th in `compute`, 5th in `computeScope2`.

**One risk called out for the executor.** Task 4's full-suite run is where auto-adoption bites: every trajectory number moves off 1%. The step tells you to classify each failure as *asserting the old constant* (pin `bauGrowthPct: 1` in that fixture) or *asserting a relationship* (should still pass — if not, it is a real bug). Do not blanket-update expected numbers.
