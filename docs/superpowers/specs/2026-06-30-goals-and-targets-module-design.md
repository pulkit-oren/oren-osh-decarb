# Goals & Targets module — design spec

Date: 2026-06-30
App: `osh-decarbonization-dashboard-master` (Next.js 16, React 19, Tailwind 4, Recharts)

## 1. Purpose

Add a top-level **Goals & Targets** tab that lets a company set board-level
decarbonization commitments and track strategic initiatives against them.
The app already has a *target* (hardcoded SBTi line) and *interventions*
(per-asset levers). This module adds the missing layer: user-defined goals
and a manually-managed initiative portfolio, with a tracking dashboard.

Two sub-views, toggled by a `PillNav`:
- **Dashboard** — read-only tracking view.
- **Set up goals** — create/edit goals and their initiatives.

## 2. Key decisions (from brainstorming)

- **Initiatives are a standalone strategic layer** — manually entered (name,
  owner, status, timeline, expected abatement, budget). NOT wired to the
  Scenario-Modeller asset levers. A goal can exist before any asset modelling.
- **Target types supported:** absolute reduction %, net-zero/year (with
  residual %), interim milestones, and intensity (needs an output denominator).
- **Scope:** each goal targets `s1`, `s2`, or `s1s2` (combined). Default `s1s2`.
- **Progress logic:** plot actual emissions from entered FY data, then project
  forward with the sum of committed initiatives' abatement, both vs the target.
- **Placement:** sidebar position #2 (after Overview). Visible to ESG, CEO, CFO
  personas — not Plant Head.
- Each **initiative belongs to exactly one goal**.

## 3. Data model — `lib/goals/types.ts`

```ts
export type GoalScope = "s1" | "s2" | "s1s2";
export type TargetKind = "absolute" | "netzero" | "intensity";
export type InitiativeStatus = "planned" | "in_progress" | "completed" | "on_hold";

export interface Milestone { id: string; year: number; reductionPct: number; } // % below base year
export interface Goal {
  id: string; name: string; scope: GoalScope; kind: TargetKind;
  baseYear: number; targetYear: number;
  reductionPct?: number;   // absolute: target reduction at targetYear
  residualPct?: number;    // netzero: allowed residual emissions
  intensityUnit?: string;  // intensity: denominator label
  milestones: Milestone[]; createdAt: number;
}
export interface Initiative {
  id: string; goalId: string; name: string; owner: string; scope: GoalScope;
  status: InitiativeStatus; startYear: number; targetYear: number;
  expectedAbatementT: number;  // tCO2e/yr at full ramp
  budget: number;              // CAPEX (₹)
  progressPct?: number;        // manual % complete
  note?: string;
}
export interface GoalsState {
  goals: Goal[]; initiatives: Initiative[];
  output?: Record<number, number>; // year -> revenue/production, for intensity goals only
}
```

## 4. State — `lib/goals/store.tsx`

`GoalsProvider` mirrors `ScenarioProvider`: hydrate-once from `localStorage`
key `osh-goals-v1::${companyId}`, persist on change, remounted per-company via
React key. Mounted in `Shell` alongside S1/S2 providers. Exposes CRUD:
`addGoal/updateGoal/deleteGoal`, `addInitiative/updateInitiative/deleteInitiative`,
`setOutput`, plus the raw `GoalsState`.

## 5. Pure selectors — `lib/goals/select.ts` (no React; unit-tested)

- `actualsSeries(scope, combustionByYear, s2FacilitiesByYear)` → real emissions
  per FY from entered data, reusing `baselineScope1` / scope2 baseline across
  `FY_YEARS`; combined scope sums S1+S2. Only years with data.
- `targetSeries(goal, baseTotal)` → per-year target line through milestones to
  the target year (milestone-driven generalization of the existing `targetLine`).
- `forecastSeries(goal, latestActual, initiatives)` → latest actual minus
  cumulative ramped initiative abatement, weighted by status (completed=100%,
  in_progress=`progressPct`, planned=ramp only, on_hold=0).
- `goalStatus(goal, actuals, forecast, target)` →
  `{ verdict: "on-track"|"at-risk"|"off-track", gapT, gapPct, committedT, neededT }`.
- `initiativeRollup(goalId, initiatives)` → counts by status, Σ committed
  abatement, Σ budget.

## 6. Components

```
components/tabs/GoalsTab.tsx              container + Dashboard|Setup PillNav
components/tabs/goals/GoalsDashboard.tsx  hero verdict, KPI cards, chart, goal cards
components/tabs/goals/GoalsSetup.tsx      goal list + editors + initiatives
components/tabs/goals/GoalCard.tsx        one goal's progress summary (dashboard)
components/tabs/goals/GoalEditor.tsx      goal form + milestone editor
components/tabs/goals/InitiativeRow.tsx   inline initiative create/edit/status
components/charts/GoalTrajectoryChart.tsx Recharts: actuals (solid) + forecast (dashed) + target (dashed) + milestone dots
```

Dashboard layout: hero (primary-goal progress %, gap-to-target, on/off-track
verdict via the green/amber `Card border-l-4` pattern) → KPI cards (target year,
committed vs needed abatement, total initiative budget, initiative-status
breakdown) → trajectory chart → per-goal cards → initiative status summary.
Empty state when no goals exist: a prompt to create the first goal.

## 7. Wiring (edits to existing files)

- `components/Sidebar.tsx` — add `"goals"` to `TabKey`, NAV entry (lucide
  `Target`) after Overview.
- `lib/persona.ts` — add `"goals"` to `esg`, `ceo`, `cfo` lenses.
- `components/Shell.tsx` — wrap in `GoalsProvider`; render
  `{tab === "goals" && <GoalsTab />}`. Goals is NOT dual-scope (scope is
  per-goal), so excluded from the in-page `ScopeToggle`.

## 8. Out of scope (YAGNI)

No offset/credit engine beyond residual %, no approval workflow, no
notifications, no initiative↔lever linking, no PDF export.

## 9. Testing

Vitest unit tests in `lib/goals/__tests__/` for every selector (actuals from
fixture inventories, milestone interpolation, forecast ramp per status,
verdict thresholds). A render smoke test for `GoalsTab` following the existing
`components/tabs/__tests__/render.test.tsx` pattern.

## 10. Delivery workflow

Build locally → run `npm run dev`, user reviews on localhost → push to Vercel
only after user approval.
