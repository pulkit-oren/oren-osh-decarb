# Goals module v2 — design spec

Date: 2026-06-30
Supersedes the v1 Goals module (`2026-06-30-goals-and-targets-module-design.md`).

## Purpose

Turn the Goals module from a manual goal/initiative tracker into a guided,
data-driven one:
- Pre-configured goal **catalog** split into Emissions and Energy categories,
  plus a Custom option.
- A 3-step creation flow: pick category → pick goal template → enter details.
- Baselines **auto-pulled from Data Input**, with a calculation-transparency panel.
- Initiatives **auto-suggested from the user's data** (editable), built on the
  existing suggestion engine + computed levers.
- Goals/initiatives **assignable to the 4 built-in personas**.
- Dashboard restructured to a **box-per-goal grid**; clicking a box expands to
  that goal's charts.

## Decisions (from brainstorming)

- Emissions templates: Absolute (SBTi), Net-zero, Carbon neutral, Intensity.
- Energy templates: RE100, Renewable %, Energy efficiency, On-site solar.
- Initiatives: auto-suggested from data, editable (auto vs manual tagged).
- Assignment: the 4 personas (Amit/ESG, Raghav/CEO, Priya/Plant, Neha/CFO).
- Creation: 3-step picker. Dashboard: box grid, click-to-expand charts.

## Goal catalog — `lib/goals/catalog.ts`

```ts
type GoalCategory = "emissions" | "energy";
type GoalMetric   = "emissions_t" | "energy_kwh" | "renewable_pct" | "solar_kwp";
type GoalTemplateId =
  | "abs_sbti" | "netzero" | "carbon_neutral" | "intensity"
  | "re100" | "renewable_pct" | "energy_efficiency" | "solar" | "custom";

interface GoalTemplate {
  id: GoalTemplateId; category: GoalCategory; metric: GoalMetric;
  title: string; blurb: string; icon: string;        // lucide name
  defaultScope: GoalScope; defaultTargetYear: number;
  defaultTargetPct?: number; defaultResidualPct?: number; defaultOffsetPct?: number;
  defaultMilestones?: { year: number; reductionPct: number }[];
  direction: "reduce" | "increase";                  // reduce emissions/energy vs increase renewable/solar
}
```

Templates carry framework presets (SBTi 42%/2030; RE100 100%/2030 with
60/2030 + 90/2040 milestones; etc.).

## Data model — `lib/goals/types.ts` (extends v1)

```ts
interface Goal {
  id; name; category: GoalCategory; templateId: GoalTemplateId; metric: GoalMetric;
  scope: GoalScope; baseYear; targetYear;
  targetPct?;        // reduction % (emissions/energy/intensity) OR target renewable %
  residualPct?;      // net-zero
  offsetPct?;        // carbon neutral
  targetAbsolute?;   // solar kWp / kWh
  intensityUnit?;
  milestones: Milestone[];
  assignee?: Persona;
  createdAt;
}
interface Initiative {
  id; goalId; name; owner; assignee?: Persona; scope; status;
  startYear; targetYear; budget; note?; progressPct?;
  metricImpact: number;   // in the goal's unit (t, kWh, pct points, kWp)
  expectedAbatementT;      // kept for emissions back-compat
  auto: boolean;           // generated vs hand-added
  sourceRef?: string;      // originating asset/facility id
}
```

## Engine — `lib/goals/select.ts` (generalized per metric)

Per metric, provide baseline / actuals / target / forecast / verdict:
- `emissions_t`: sum baselineScope1.totalT + baselineScope2.totalLocationT (by scope).
- `energy_kwh`: Scope 1 fuel energy (combustionEnergyKJ → kWh) + Scope 2 annualLoadKwh.
- `renewable_pct`: renewable kWh ÷ total load (Scope 2 existing renewable coverage + solar).
- `solar_kwp`: installed kWp (Scope 2 existingSolarKwp); target absolute.

`direction: "reduce"` → progress = cut below base; `"increase"` → progress toward
a higher target value. Forecast = baseline adjusted by cumulative initiative
`metricImpact` (ramped, on-hold excluded). Verdict thresholds reuse v1 logic.

## Calculation transparency — `components/tabs/goals/CalcPanel.tsx`

Per goal, a collapsible "How this is calculated" panel sourced from Data Input:
emissions → per-fuel/per-facility rows (volume → EF → tCO₂e); energy → per-facility
kWh + fuel energy; renewable → renewable vs total kWh. Plus the target math.

## Auto-initiatives — `lib/goals/initiatives-auto.ts`

Pure function: given inventories + scenario/scope2 levers + a goal, return
suggested `Initiative[]` with real metricImpact + budget tied to assets:
- Emissions/energy-reduction: per Scope 1 asset via `suggestForAsset` + computed
  segment tonnes; Scope 2 efficiency/solar/procurement levers.
- Renewable %/solar: Scope 2 solar generation + procurement (renewable kWh added).
Merged with stored initiatives by `sourceRef` so user edits survive a refresh.

## Components

```
components/tabs/GoalsTab.tsx               Dashboard | Set up goals toggle (unchanged shell)
components/tabs/goals/GoalsSetup.tsx       3-step picker (category → template → detail)
components/tabs/goals/CategoryPicker.tsx   two category boxes
components/tabs/goals/TemplatePicker.tsx   template cards + custom + search
components/tabs/goals/GoalEditor.tsx       detail form + milestones + assignee + CalcPanel + initiatives
components/tabs/goals/CalcPanel.tsx        calculation breakdown
components/tabs/goals/InitiativeRow.tsx    auto/manual initiative, assignable
components/tabs/goals/GoalsDashboard.tsx   portfolio KPIs + box grid
components/tabs/goals/GoalBox.tsx          compact goal box (click to expand)
components/tabs/goals/GoalDetail.tsx       expanded charts + breakdown + initiatives
components/charts/GoalTrajectoryChart.tsx  generalized to any metric/unit
components/tabs/goals/AssigneePicker.tsx   persona selector
```

## Testing

Unit tests for the generalized selectors per metric, the catalog presets, and
the auto-initiatives generator (fixtures). Render smoke tests for the picker,
editor, and dashboard. Topbar/persona wiring unchanged from v1 (already tested).

## Build order

1. Catalog + data model + generalized selectors (+ unit tests).
2. Creation picker (category → template → detail).
3. CalcPanel + auto-initiatives engine.
4. Dashboard box grid + per-goal detail.
5. Persona assignment throughout.

## Out of scope (YAGNI)

Real user accounts/auth, Scope 3, offset marketplace, PDF export.
