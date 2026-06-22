# Scope 1 Planner — Full Improvement Pass (Design)

**Date:** 2026-06-10
**Approach:** Improve in place (Approach A). Keep the 5-tab structure and the pure, tested model layer. Fix data-integrity bugs first, then close spec gaps, then polish UX.
**App:** `scope1-decarb` — Next.js 16.2.9, React 19, Recharts 3, Tailwind 4, Vitest.

## Goals

1. Fix the three known data-integrity / rendering bugs.
2. Close the gaps against the OSH Scope 1 Decarbonization Module specification: export (step 7), biogenic split reporting, year-over-year target tracking (step 6), asset-lifespan guardrails, financial depth, comparison depth.
3. Raise UX quality: empty states, number formatting, accessibility, mobile.

Non-goals (out of scope): navigation restructure around the 7-step workflow, a Scope 2 module, multi-client support, auth, server persistence.

## 1. Bug fixes

### 1.1 Scenario timestamps
`saveScenario` in `lib/store.tsx` currently writes `savedAt: 0`. Change to `savedAt: Date.now()`. Compare & Track shows the saved date next to each scenario name and lists scenarios sorted by `savedAt` descending. Existing persisted scenarios with `savedAt: 0` render without a date (no migration needed).

### 1.2 ID-generator collision after reload
(Corrected during planning.) Keeping the same asset id across fiscal years is intentional — `lib/model/types.ts` documents that a line persisting across years keeps its id so its scenario plan follows it. Copy-year therefore correctly preserves ids. The real bug: `lib/store.tsx` generates ids from a module-level counter (`let idSeq = 0`) that resets to 0 on every page load, while localStorage already holds assets with ids like `c-0`. Adding a fuel/system/scenario after a reload can mint a duplicate id, conflating two different assets' lever settings and breaking React keys. Fix: a pure `uniqueId(prefix, existingIds)` helper that scans the ids currently in state (all years + scenarios) and returns the first unused `prefix-N`. Unit-tested.

### 1.3 Recharts zero-size containers
dev.log shows repeated `width(-1) height(-1)` warnings: some `ResponsiveContainer`s mount inside parents that measure 0 on first paint. Audit every chart (`WedgeChart`, `ScopeDonut`, `MaccScatter`, `LeverBars`, sparklines in `CompareTab`) and guarantee each container parent has an explicit `min-h-*`/fixed height and `min-w-0` inside flex/grid rows. Acceptance: a fresh `npm run dev` session navigating all five tabs produces zero recharts size warnings.

## 2. Export (spec step 7 — "reproducible and assurance-ready")

### 2.1 Library and shape
Add `exceljs` as a dependency. New module `lib/export.ts` split in two layers:

- **Pure data shaping** — functions that take store state (`combustion`, `refrigeration`, `settings`, `scenarios`, `baseYear`) plus the `ComputeResult` and return plain row arrays per sheet. These are unit-tested with Vitest.
- **Workbook assembly** — a thin function that feeds the shaped rows into exceljs and triggers a browser download (`scope1-scenario-<baseYear>-<date>.xlsx`). Not unit-tested beyond smoke; runs client-side only.

### 2.2 Workbook sheets
1. **Inputs** — every combustion asset and refrigeration system for every FY entered: name, category, fuel/refrigerant, unit, annual volume / charge kg, leak rate, opex, remaining life, unit count.
2. **Factors** — emission factors and constants actually used: fuel EFs (kgCO2e/unit) and calorific values per fuel, refrigerant GWPs and volumetric adjustments, grid emission factor, REC cost, carbon price, efficiency penalty, biogenic splits, CAPEX annualization lifetime.
3. **Scenario** — per-asset lever settings (electrify: enabled, transition %, start/target year, tariff, asset CAPEX, units; fuel switch: enabled, alt fuel, blend %, price, retrofit CAPEX, start/target year), refrigerant lever settings, and global assumptions.
4. **Trajectory** — one row per year `baseYear..2050`: BAU, target, abatement per wedge (electrification / fuel switch / refrigerant), Scope 2 spill, net, biogenic CO2e, on/off-track flag.
5. **KPIs & Finance** — headline KPIs (reduction 2030/2050, cost/tonne, total CAPEX, years to target, net Scope 1) plus a per-lever finance table: CAPEX, annual OPEX delta, annualized cost, cost/tonne, simple payback.

### 2.3 Entry points
- **Export workbook** button in the Topbar (visible on every tab).
- **Download trajectory CSV** secondary action next to it (plain CSV of the Trajectory sheet, no dependency on exceljs at runtime beyond import splitting — CSV is hand-rolled).

## 3. Biogenic CO2 split

`compute()` already returns `biogenicT`. Surface it:

- Action Plan tab: a stat card/row "Biogenic CO2 (reported separately)" with an InfoTip explaining that biofuel CH4/N2O stays in Scope 1 while biogenic CO2 is reported outside scopes (BRSR/GRI treatment).
- Compare & Track: biogenic CO2e column per scenario.
- Included in the Trajectory export sheet (per-year, ramped with the fuel-switch wedge) and KPIs sheet (full-ramp value).

## 4. Target tracking (spec step 6)

New "Target tracking" section inside Compare & Track:

- **Year-over-year view**: per-year net vs target with on/off-track colouring (spring when net ≤ target, amber above), built from `trajectory` rows. Rendered as a compact bar/line combo plus a small table of milestone years (2027, 2030, 2035, 2040, 2045, 2050).
- **First on-track year** highlighted (from `yearsToTarget`).
- **2030 progress tracker**: percent of required 2030 abatement achieved = `(bau2030 − net2030) / (bau2030 − target2030)`, clamped 0–100%+, updating live with lever changes.

## 5. Asset lifespan guardrail

New pure helper in the model layer (e.g. `lib/model/validate.ts`): given an asset (`remainingLife`), the base year, and an action's `targetYear`, return a warning when `targetYear > baseYear + remainingLife`. Builder tab shows an amber inline warning on the affected action card: "This asset retires in FY20XX — before this action completes." No blocking; purely advisory. Unit-tested.

## 6. Financial depth

### 6.1 Payback
New `simplePayback(capex, annualNetSaving)` in `lib/model/finance.ts`: returns years (`capex / annualNetSaving`) when annual saving is positive, else null ("no payback"). Unit-tested.

### 6.2 Per-lever drill-down (Action Plan)
Each lever row expands (click/keyboard) to show: annualized CAPEX, OPEX delta components (electricity cost, displaced fuel opex, REC cost, gas top-up savings, carbon-price value of refrigerant abatement), cost/tonne, and payback. Data comes from extending `LeverSummary` with an opex-component breakdown — computed inside `compute()`, no UI math.

### 6.3 Comparison depth (Compare & Track)
Per-scenario columns gain: total CAPEX, weighted cost/tonne (already present), scenario payback (total CAPEX ÷ total annual net saving across levers; "—" when savings are non-positive), biogenic CO2e, and a per-lever cost/tonne mini-table per scenario.

## 7. UX and visual polish

- **Empty states**: Data Input (no fuels / no systems) and Compare (no saved scenarios) get a clear primary call-to-action button, not just a hint line.
- **Number formatting**: one formatter family in `lib/utils.ts` — full integers with locale separators in tables, abbreviated (`12.4k`) on chart axes, one decimal max elsewhere; currency consistently `₹` with Indian digit grouping. Audit all tabs for stray `toFixed`/raw numbers.
- **Accessibility**: every slider/input labelled (`label`/`aria-label`), tab strip keyboard-navigable with visible focus ring, charts get `aria-label` descriptions, warning states use icon + text not colour alone.
- **Mobile**: verify chart min-heights and the Builder sticky live-projection bar at 380px; grid stacks to one column without overflow.

## 8. Testing strategy

- Vitest, TDD per change: store fixes (ID regeneration seeds fresh actions; timestamps set), export data-shaping (sheet row counts, factor values match `factors.ts`, trajectory rows match `compute()`), lifespan validation, payback math, opex-component breakdown sums to existing `annualOpexDelta`.
- All existing model tests keep passing unchanged (the model's external behaviour is only extended, never altered).
- Manual acceptance: zero recharts warnings across tabs; export opens in Excel with five populated sheets; lever changes move the target tracker live.

## 9. Constraints and notes

- Model layer stays pure (same inputs → same output); UI never computes emissions.
- Next.js 16.2.9 has breaking changes vs training data — consult `node_modules/next/dist/docs/` before touching framework-level code (per `AGENTS.md`).
- `exceljs` is imported dynamically in the export handler so it stays out of the initial bundle.
- localStorage schema (`osh-scope1-planner-v4`) is unchanged except scenarios gaining real `savedAt` values — no version bump needed.

## 10. Build order

1. Bug fixes (1.1–1.3) — small, independently shippable.
2. Model extensions: opex breakdown, payback, lifespan validation, biogenic per-year (6.x, 5, 3 groundwork).
3. Export module + Topbar buttons (2).
4. UI features: biogenic surfacing, target tracking, lever drill-down, comparison depth (3, 4, 6).
5. UX polish pass (7).
