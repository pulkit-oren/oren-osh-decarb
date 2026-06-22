# Scope 2 Decarbonization Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Scope 2 (purchased electricity) decarbonization planner — facilities, efficiency/solar/procurement levers, dual location/market accounting — behind a sidebar scope switcher, mirroring the Scope 1 module.

**Architecture:** Parallel module: pure engine in `lib/scope2/model/`, `Scope2Provider` store in `lib/scope2/store.tsx`, tabs in `components/scope2/`. Reuses Scope 1's pure helpers (`buildTrajectory`, finance math, `Wedge` type) and UI primitives (`Card`, `KpiCard`, `Slider`, charts). Scope 1 files touched: `Shell.tsx`, `Sidebar.tsx`, `Topbar.tsx` only.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Tailwind 4 / Recharts 3 / Vitest / exceljs (dynamic import).

**Spec:** `docs/superpowers/specs/2026-06-12-scope2-module-design.md` — formulas and constants there are normative.

**Working conventions for every task:** run tests with `npx vitest run <file>` from `scope1-decarb/`. Commit after each task. The dev server is already running on localhost:3000 (`dev.log`) — do not restart it. Read `AGENTS.md` note: check `node_modules/next/dist/docs/` before using unfamiliar Next.js APIs (none expected — all client components).

---

### Task 1: Types, constants, defaults

**Files:**
- Create: `lib/scope2/model/types.ts`
- Create: `lib/scope2/model/constants.ts`
- Create: `lib/scope2/defaults.ts`
- Test: `lib/scope2/model/__tests__/defaults.test.ts`

- [ ] **Step 1: Write `types.ts`** — exactly the interfaces from the spec "Data model" section: `Facility`, `FacilitiesByYear`, `EfficiencyAction`, `GenerationAction`, `ProcurementSettings`, `FacilityActions { efficiency; generation }`, `Scope2Levers { byFacility: Record<string, FacilityActions>; procurement: ProcurementSettings }`, `Scope2Scenario { id; name; levers: Scope2Levers; savedAt: number }`. Re-export `FY_YEARS` and `fyLabel` from `@/lib/model/types` (do not duplicate).

- [ ] **Step 2: Write `constants.ts`**

```ts
/* Background engine constants — spec midpoints. Documented in the design spec. */
export const LED_REDUCTION = 0.55;    // LED cuts lighting load 50-60%
export const MOTOR_REDUCTION = 0.125; // IE4/VFD cuts motor load 10-15%
export const BMS_REDUCTION = 0.175;   // BMS cuts HVAC + other load 15-20%
export const M2_PER_KW = 5.5;         // roof space needed per kW of solar
/* Battery sized to half a day's average generation captures all spill. */
export const BATTERY_FULL_CAPTURE_DAYS = 0.5;
export const SOLAR_ONLY_SPILL = 0.5;  // max spill fraction with no battery
```

- [ ] **Step 3: Write `defaults.ts`** — `DEFAULT_FACILITIES_BY_YEAR` seeded for FY 2025 with three demo facilities (ids `f1`/`f2`/`f3`): Pune Plant (4.2 GWh, tariff 8.5, split 15/55/20, 9000 m², 1200 kW peak, EF 0.71, irradiance 1500, not isolated), London Office (0.8 GWh, tariff 14, split 25/10/40, 1200 m², 350 kW, EF 0.21, irradiance 950, not isolated), Island Resort (1.1 GWh, tariff 22, split 20/15/45, 2500 m², 600 kW, EF 0.65, irradiance 1700, **isolated: true**). `DEFAULT_BASE_YEAR = 2025` (import from `@/lib/defaults` if exported there, else define). `defaultFacilityActions(f: Facility): FacilityActions` — both levers `enabled: false`, sliders 0, `startYear: 2026, targetYear: 2030`, CAPEX heuristics: `ledCapex = round(annualLoadKwh * 0.4)`, `motorCapex = round(annualLoadKwh * 0.9)`, `bmsCapex = round(annualLoadKwh * 0.5)`, `solarCapexPerKw = 45000`, `batteryCapexPerKwh = 28000`, `subsidyPct = 0`, `exportMode: "netMetering"`. `DEFAULT_PROCUREMENT: ProcurementSettings` — disabled, sliders 0, `ppaStrikeDeltaPerKwh: -0.5`, `greenTariffPremiumPerKwh: 0.8`, `recPricePerKwh: 0.45`, `re100Exclusion: false`, years 2026→2030. `DEFAULT_SCOPE2_LEVERS` builds `byFacility` from the seeded facilities.

- [ ] **Step 4: Write the defaults test** — assert: 3 facilities in FY2025; ids unique; every facility has a `byFacility` entry; load splits sum ≤ 100; all sliders within 0–100.

- [ ] **Step 5: Run** `npx vitest run lib/scope2/model/__tests__/defaults.test.ts` → PASS. Commit: `feat(scope2): domain types, constants, seeded defaults`.

---

### Task 2: Efficiency engine

**Files:**
- Create: `lib/scope2/model/efficiency.ts`
- Test: `lib/scope2/model/__tests__/efficiency.test.ts`

- [ ] **Step 1: Failing tests** — facility load 1,000,000 kWh, split 20/50/20 (other = 10), tariff 10:
  - disabled → `savedKwh 0`, `residualLoadKwh 1_000_000`, `capex 0`, `opexSaving 0`
  - LED 100% → `ledKwh = 1_000_000 × 0.20 × 0.55 = 110_000`
  - motors 100% → `motorKwh = 62_500`; BMS 100% → `bmsKwh = 1_000_000 × 0.30 × 0.175 = 52_500` (HVAC 20 + other 10)
  - all three at 50% → savings halve and sum; `residual = load − saved`; `capex = 0.5 × (led+motor+bms CAPEX)`; `opexSaving = savedKwh × 10`

- [ ] **Step 2: Run → FAIL (module not found). Step 3: Implement**

```ts
import { BMS_REDUCTION, LED_REDUCTION, MOTOR_REDUCTION } from "./constants";
import type { EfficiencyAction, Facility } from "./types";

export interface EfficiencyResult {
  ledKwh: number; motorKwh: number; bmsKwh: number;
  savedKwh: number; residualLoadKwh: number;
  capex: number; opexSaving: number;
}

export function applyEfficiency(f: Facility, a: EfficiencyAction): EfficiencyResult {
  const zero = { ledKwh: 0, motorKwh: 0, bmsKwh: 0, savedKwh: 0, residualLoadKwh: f.annualLoadKwh, capex: 0, opexSaving: 0 };
  if (!a.enabled) return zero;
  const { lightingPct, motorPct, hvacPct } = f.loadSplit;
  const otherPct = Math.max(0, 100 - lightingPct - motorPct - hvacPct);
  const ledKwh = f.annualLoadKwh * (lightingPct / 100) * LED_REDUCTION * (a.ledPct / 100);
  const motorKwh = f.annualLoadKwh * (motorPct / 100) * MOTOR_REDUCTION * (a.motorPct / 100);
  const bmsKwh = f.annualLoadKwh * ((hvacPct + otherPct) / 100) * BMS_REDUCTION * (a.bmsPct / 100);
  const savedKwh = ledKwh + motorKwh + bmsKwh;
  return {
    ledKwh, motorKwh, bmsKwh, savedKwh,
    residualLoadKwh: f.annualLoadKwh - savedKwh,
    capex: a.ledCapex * (a.ledPct / 100) + a.motorCapex * (a.motorPct / 100) + a.bmsCapex * (a.bmsPct / 100),
    opexSaving: savedKwh * f.tariffPerKwh,
  };
}
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(scope2): efficiency engine`.

---

### Task 3: Generation engine

**Files:**
- Create: `lib/scope2/model/generation.ts`
- Test: `lib/scope2/model/__tests__/generation.test.ts`

- [ ] **Step 1: Failing tests** — facility roof 5500 m², irradiance 1500, tariff 10; residual load 1,500,000:
  - disabled → `gridDrawKwh = residual`, everything else 0
  - roof cap: `solarKwp 2000` → `effectiveKwp = 1000` (5500/5.5)
  - solar-only sized at exactly residual: solarGen = 1000×1500 = 1_500_000 → `selfConsumption = 0.5`, `usedOnSite = 750_000`, `exported = 750_000`, `gridDraw = 750_000`
  - battery at half-day of generation (`0.5 × solarGen/365 ≈ 2054.79`) → `selfConsumption = 1`, `usedOnSite = 1_500_000`, `gridDraw = 0`
  - zero-export: opexSaving counts only `usedOnSite × tariff`; netMetering adds `exported × tariff`
  - subsidy 30% → capex × 0.7
  - residual 0 → `usedOnSite 0`, `gridDraw 0`, `exported = solarGen`

- [ ] **Step 2: Run → FAIL. Step 3: Implement**

```ts
import { BATTERY_FULL_CAPTURE_DAYS, M2_PER_KW, SOLAR_ONLY_SPILL } from "./constants";
import type { Facility, GenerationAction } from "./types";

export interface GenerationResult {
  effectiveKwp: number; solarGenKwh: number; selfConsumption: number;
  usedOnSiteKwh: number; exportedKwh: number; gridDrawKwh: number;
  capex: number; opexSaving: number;
}

export function applyGeneration(f: Facility, a: GenerationAction, residualLoadKwh: number): GenerationResult {
  const zero = { effectiveKwp: 0, solarGenKwh: 0, selfConsumption: 1, usedOnSiteKwh: 0, exportedKwh: 0, gridDrawKwh: residualLoadKwh, capex: 0, opexSaving: 0 };
  if (!a.enabled || a.solarKwp <= 0) return zero;
  const effectiveKwp = Math.min(a.solarKwp, f.roofSpaceM2 / M2_PER_KW);
  const solarGenKwh = effectiveKwp * f.irradiance;
  const dailySolar = solarGenKwh / 365;
  const batteryFactor = dailySolar > 0 ? Math.min(1, a.batteryKwh / (BATTERY_FULL_CAPTURE_DAYS * dailySolar)) : 0;
  const loadRatio = residualLoadKwh > 0 ? Math.min(1, solarGenKwh / residualLoadKwh) : 1;
  const spill = SOLAR_ONLY_SPILL * loadRatio * (1 - batteryFactor);
  const selfConsumption = 1 - spill;
  const usedOnSiteKwh = Math.min(Math.max(0, residualLoadKwh), solarGenKwh * selfConsumption);
  const exportedKwh = solarGenKwh - usedOnSiteKwh;
  return {
    effectiveKwp, solarGenKwh, selfConsumption, usedOnSiteKwh, exportedKwh,
    gridDrawKwh: residualLoadKwh - usedOnSiteKwh,
    capex: (effectiveKwp * a.solarCapexPerKw + a.batteryKwh * a.batteryCapexPerKwh) * (1 - a.subsidyPct / 100),
    opexSaving: usedOnSiteKwh * f.tariffPerKwh + (a.exportMode === "netMetering" ? exportedKwh * f.tariffPerKwh : 0),
  };
}
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(scope2): solar + battery generation engine`.

---

### Task 4: Procurement engine

**Files:**
- Create: `lib/scope2/model/procurement.ts`
- Test: `lib/scope2/model/__tests__/procurement.test.ts`

- [ ] **Step 1: Failing tests** — draws: A 600k (EF .7), B 300k (EF .2), C-isolated 100k (EF .65); prices: PPA −0.5, GT +0.8, REC +0.45:
  - disabled → covered 0, costs 0
  - exclusion OFF, PPA 50/GT 0/REC 0 → addressable 1,000,000, covered 500,000 — but allocation only to A+B (900k), proportional: A 333,333.3, B 166,666.7; C gets 0
  - exclusion ON → addressable 900,000, covered 450,000, `footnote: true`
  - sliders summing >100 are scaled proportionally to 100 (PPA 80 + GT 40 → effective 66.67/33.33)
  - covered kWh never exceeds non-isolated draw
  - costs: `ppaKwh × −0.5` is negative (saving); GT and REC positive

- [ ] **Step 2: Run → FAIL. Step 3: Implement**

```ts
import type { ProcurementSettings } from "./types";

export interface FacilityDraw { id: string; gridDrawKwh: number; gridEf: number; isolated: boolean }

export interface ProcurementResult {
  addressableKwh: number; coveredKwh: number; coveragePct: number;
  ppaKwh: number; greenTariffKwh: number; recKwh: number;
  procuredByFacility: Record<string, number>;
  annualCost: number;
  costParts: { ppa: number; greenTariff: number; rec: number };
  footnote: boolean;
}

export function applyProcurement(draws: FacilityDraw[], p: ProcurementSettings): ProcurementResult {
  const totalDraw = draws.reduce((s, d) => s + d.gridDrawKwh, 0);
  const isolatedDraw = draws.filter((d) => d.isolated).reduce((s, d) => s + d.gridDrawKwh, 0);
  const nonIsolatedDraw = totalDraw - isolatedDraw;
  const addressableKwh = p.re100Exclusion ? nonIsolatedDraw : totalDraw;
  const zero: ProcurementResult = {
    addressableKwh, coveredKwh: 0, coveragePct: 0, ppaKwh: 0, greenTariffKwh: 0, recKwh: 0,
    procuredByFacility: Object.fromEntries(draws.map((d) => [d.id, 0])),
    annualCost: 0, costParts: { ppa: 0, greenTariff: 0, rec: 0 },
    footnote: p.re100Exclusion && isolatedDraw > 0,
  };
  if (!p.enabled) return zero;
  const rawSum = p.ppaPct + p.greenTariffPct + p.recPct;
  if (rawSum <= 0) return zero;
  const scale = rawSum > 100 ? 100 / rawSum : 1;
  const coveredKwh = Math.min(addressableKwh * (rawSum * scale) / 100, nonIsolatedDraw);
  const ratio = (x: number) => (x * scale) / (rawSum * scale);
  const ppaKwh = coveredKwh * ratio(p.ppaPct);
  const greenTariffKwh = coveredKwh * ratio(p.greenTariffPct);
  const recKwh = coveredKwh * ratio(p.recPct);
  const procuredByFacility = Object.fromEntries(
    draws.map((d) => [d.id, d.isolated || nonIsolatedDraw <= 0 ? 0 : (d.gridDrawKwh / nonIsolatedDraw) * coveredKwh]),
  );
  const costParts = {
    ppa: ppaKwh * p.ppaStrikeDeltaPerKwh,
    greenTariff: greenTariffKwh * p.greenTariffPremiumPerKwh,
    rec: recKwh * p.recPricePerKwh,
  };
  return {
    addressableKwh, coveredKwh,
    coveragePct: addressableKwh > 0 ? (coveredKwh / addressableKwh) * 100 : 0,
    ppaKwh, greenTariffKwh, recKwh, procuredByFacility,
    annualCost: costParts.ppa + costParts.greenTariff + costParts.rec, costParts,
    footnote: p.re100Exclusion && isolatedDraw > 0,
  };
}
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(scope2): portfolio procurement engine`.

---

### Task 5: Baseline + validation

**Files:**
- Create: `lib/scope2/model/baseline.ts`
- Create: `lib/scope2/model/validate.ts`
- Test: `lib/scope2/model/__tests__/baseline.test.ts`, `lib/scope2/model/__tests__/validate.test.ts`

- [ ] **Step 1: Failing tests** — baseline: per-facility and total `loadKwh`, `costPerYear = load × tariff`, `locationT = load × gridEf / 1000`; isolated load reported separately. Validate: warnings for split sum > 100, solarKwp above roof cap, procurement sliders summing > 100, negative loads; clean inputs → empty list.

- [ ] **Step 2–3: Implement.** `baselineScope2(facilities: Facility[]): Scope2Baseline` returning `{ perFacility: { id, name, loadKwh, costPerYear, locationT, isolated }[], totalLoadKwh, totalCost, totalLocationT, isolatedLoadKwh }`. `validateScope2(facilities, levers): string[]` returning human-readable warnings (non-blocking, mirrors `lib/model/validate.ts` style — read it first).

- [ ] **Step 4: Run both → PASS. Step 5: Commit** `feat(scope2): baseline + validation`.

---

### Task 6: computeScope2 — engine entry point

**Files:**
- Create: `lib/scope2/model/index.ts`
- Test: `lib/scope2/model/__tests__/compute.test.ts`

Reuse from Scope 1 (imports, no copies): `buildTrajectory` from `@/lib/model/trajectory`, `annualizedCapex`, `simplePayback`, `weightedCostPerTonne` from `@/lib/model/finance`, `Wedge`/`TrajectoryRow` from `@/lib/model/types`, `CAPEX_LIFETIME`, `END_YEAR`, `BAU_GROWTH` from `@/lib/model` (re-export or redefine locally if importing `@/lib/model` creates a cycle — it won't, scope2 is a leaf).

- [ ] **Step 1: Failing tests** (the load-bearing ones):
  - compounding order: with all levers on, generation's `usedOnSite` is computed against the **efficiency-reduced** load, and procurement against the **post-solar** grid draw
  - location-based total is unchanged when only procurement is enabled; market-based drops
  - market-based reaches ≈0 when procurement covers 100% of addressable and no isolated load exists
  - `kpis.totalCapex` = Σ lever capex; payback uses net savings
  - wedge per enabled lever with `scope: 2`; trajectoryLocation excludes the procurement wedge, trajectoryMarket includes it

- [ ] **Step 2: Run → FAIL. Step 3: Implement** `computeScope2(facilities: Facility[], levers: Scope2Levers, baseYear: number): Scope2ComputeResult`:

```
For each facility f:
  acts = levers.byFacility[f.id] ?? defaultFacilityActions(f)   // lazy default — no store ref-handoff
  eff  = applyEfficiency(f, acts.efficiency)
  gen  = applyGeneration(f, acts.generation, eff.residualLoadKwh)
  draw = { id: f.id, gridDrawKwh: gen.gridDrawKwh, gridEf: f.gridEf, isolated: f.isolated }
proc = applyProcurement(draws, levers.procurement)
locationT = Σ gen.gridDrawKwh × f.gridEf / 1000
marketT   = Σ (gen.gridDrawKwh − proc.procuredByFacility[f.id]) × f.gridEf / 1000
Lever rows (shape mirrors LeverSummary in lib/model/index.ts, scope: 2):
  efficiency:  abatementT = Σ eff.savedKwh × gridEf/1000, capex = Σ eff.capex, opexDelta = −Σ eff.opexSaving
  generation:  abatementT = Σ gen.usedOnSiteKwh × gridEf/1000, capex = Σ gen.capex, opexDelta = −Σ gen.opexSaving
  procurement: abatementT = Σ procured × gridEf/1000 (market-based only), capex = 0, opexDelta = proc.annualCost
  start/target years: min start, max target across enabled per-facility actions (mkRamp pattern from lib/model/index.ts)
trajectoryLocation = buildTrajectory(base = baseline.totalLocationT, wedges = [eff, gen])
trajectoryMarket   = buildTrajectory(same + procurement wedge)
kpis: { locationNowT, marketNowT, baseLocationT, reduction2030 (market vs BAU), totalCapex,
        annualOpexDelta, paybackYears, coveragePct: proc.coveragePct, footnote: proc.footnote }
warnings = validateScope2(...)
```

- [ ] **Step 4: Run → PASS. Step 5: Run the whole suite** `npx vitest run` → all green (Scope 1 untouched). **Commit** `feat(scope2): computeScope2 entry point with dual accounting`.

---

### Task 7: Scope 2 store

**Files:**
- Create: `lib/scope2/store.tsx`
- Test: `lib/scope2/__tests__/store-helpers.test.ts` (pure helpers only)

- [ ] **Step 1–3:** Mirror `lib/store.tsx` exactly (read it first) with these deltas:
  - State: `facilities: FacilitiesByYear`, `levers: Scope2Levers`, `scenarios: Scope2Scenario[]`, `baseYear`, `selectedYear`, hydration flag. localStorage key `"osh-scope2-planner-v1"`.
  - CRUD: `addFacility(year)`, `delFacility(year, id)`, `updateFacility(year, id, patch)`, `copyFacilities(fromYear, toYear)` — **clone preserves ids** (same rule as Scope 1).
  - **No ref handoff** (the pattern flagged fragile in `lib/store.tsx`): `addFacility` only updates `facilities`; lever entries are created lazily — `updateFacilityAction(facilityId, lever, patch)` seeds from `defaultFacilityActions` when missing, and `computeScope2` already falls back to defaults.
  - `updateProcurement(patch)`, `resetLevers()`, `saveScenario(name)`, `deleteScenario(id)`.
  - Derived: `result = useMemo(() => computeScope2(baseFacilities, levers, baseYear), ...)`, `selectedFacilities`, `selectedBaseline = baselineScope2(selectedFacilities)`.
  - Pure helpers (`resolveFacilities` — nearest-year fallback like `lib/yearly.ts`, reuse its pattern; `migrateScope2` — fills missing lever entries) live outside the component and get unit tests: migrate fills missing `byFacility` entries and missing `procurement` keys; round-trips persisted JSON.
- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(scope2): Scope2Provider store with localStorage persistence`.

---

### Task 8: Shell, Sidebar scope switcher, Topbar

**Files:**
- Modify: `components/Sidebar.tsx`, `components/Shell.tsx`, `components/Topbar.tsx`

- [ ] **Step 1: Sidebar** — add `export type Scope = "s1" | "s2"` and `export type Scope2TabKey = "data2" | "builder2" | "action2" | "compare2"`. Add `NAV2` (icons: Database, Wand2, ClipboardList, GitCompare; labels "Data input", "Scenario modeller", "Action plan", "Compare & track"). Props become `{ scope, setScope, tab, setTab }` where `tab: TabKey | Scope2TabKey`. Render an S1/S2 segmented control (two stacked pill buttons styled like the existing nav buttons, labelled "S1"/"S2" with tooltips "Scope 1 · Combustion & refrigerants" / "Scope 2 · Purchased electricity") above the nav; render `NAV` or `NAV2` by scope. Same change in `MobileNav`.
- [ ] **Step 2: Shell** — hold `scope` state plus per-scope tab state (`tabS1`, `tabS2`) so switching scope remembers each side's tab. Wrap children in both providers: `<ScenarioProvider><Scope2Provider>…`. Render Scope 2 tab components when `scope === "s2"`. Default Scope 2 tab: `builder2`.
- [ ] **Step 3: Topbar** — accept `scope` + tab; add `TITLES2` (data2: "Step 1 · Baseline / Scope 2 data input", builder2: "Step 2 / Scope 2 Scenario Modeller", action2: "Step 3 / Scope 2 action plan", compare2: "Step 4 / Compare & track to target"). Export button: when `scope === "s2"` call the Scope 2 export (Task 12; until then disable with title "coming in this build"). Base-year chip reads from the matching store.
- [ ] **Step 4: Verify in browser** (server already on :3000): switcher renders, S1 tabs unchanged, S2 shows placeholder tabs without console errors. Lint: `npx next lint` clean for touched files.
- [ ] **Step 5: Commit** `feat(scope2): scope switcher in shell/sidebar/topbar`.

(Steps 2–3 may land as stubs importing not-yet-written tabs — create the four tab files as minimal `<Card>Scope 2 …</Card>` placeholders in this task so the build stays green, then fill them in Tasks 9–11.)

---

### Task 9: Data input tab

**Files:**
- Create: `components/scope2/DataInputTab.tsx` (replace placeholder)

- [ ] **Step 1:** Read `components/tabs/DataInputTab.tsx` first and mirror its structure/idioms (FY chips, add/copy-year controls, editable table rows, `InfoTip`s). Columns: name, annual load (kWh), tariff, load split (three small % inputs + computed "other"), roof m², peak kW, grid EF, irradiance, isolated toggle (renders a ⚠ "Isolated grid" badge), delete. Footer totals row (Σ load, weighted EF). Show `selectedBaseline` KPI cards: total load, location-based tCO₂e, annual electricity cost, isolated share. Copy-year button preserves ids (store handles it).
- [ ] **Step 2:** Browser-verify CRUD + copy-year + persistence (reload page). **Step 3:** Commit `feat(scope2): facility data input tab`.

---

### Task 10: Builder (Scenario modeller) tab

**Files:**
- Create: `components/scope2/BuilderTab.tsx` (replace placeholder)

- [ ] **Step 1:** Read `components/tabs/BuilderTab.tsx` first; mirror layout. Structure:
  - Facility picker (pill list) → two per-facility cards: **Efficiency** (enable toggle; LED/motor/BMS `Slider`s 0–100; CAPEX inputs; start/target year selects; live readout of saved kWh per lever) and **On-site generation** (enable; solar kWp slider capped at `roofSpaceM2/5.5` with cap hint; battery kWh slider; export-mode toggle; CAPEX + subsidy inputs; readout: generation, self-consumption %, grid draw after solar).
  - Pinned **Procurement** card (portfolio-wide, independent of picker): enable; PPA/GT/REC sliders with combined-≤100 clamp feedback; price inputs; RE100 exclusion toggle showing the footnote line and "Addressable target" KPI when on.
  - KPI row (`KpiCard`): Location-based tCO₂e, Market-based tCO₂e, Annual OPEX Δ, Total CAPEX.
  - Charts: `WedgeChart` fed with `trajectoryMarket` + wedges; alongside it a small location-vs-market grouped bar (Recharts `BarChart`, two bars per year for base year and 2030).
- [ ] **Step 2:** Browser-verify sliders update KPIs live; procurement does not move the location-based KPI. **Step 3:** Commit `feat(scope2): scenario modeller tab`.

---

### Task 11: Action plan + Compare tabs

**Files:**
- Create: `components/scope2/ActionPlanTab.tsx`, `components/scope2/CompareTab.tsx` (replace placeholders)

- [ ] **Step 1: ActionPlanTab** — read `components/tabs/ActionPlanTab.tsx` first. Per-lever table from `result.levers`: CAPEX, annual OPEX Δ (signed, savings green), simple payback, abatement (market-based t/yr), cost per tonne; `MaccScatter` reused for the MACC; RE100 footnote line when `kpis.footnote`.
- [ ] **Step 2: CompareTab** — read `components/tabs/CompareTab.tsx` first. Save current levers as named scenario, list/delete, select up to 3 to overlay: table of KPIs per scenario + trajectory overlay chart with **both** location and market lines per scenario (market dashed).
- [ ] **Step 3:** Browser-verify both. **Step 4:** Commit `feat(scope2): action plan + compare tabs`.

---

### Task 12: Excel export

**Files:**
- Create: `lib/scope2/export.ts`
- Modify: `components/Topbar.tsx` (wire the S2 export path)
- Test: `lib/scope2/__tests__/export.test.ts`

- [ ] **Step 1:** Read `lib/export.ts` + `lib/export-download.ts` first; reuse `downloadWorkbook`'s sheet shape. `buildScope2WorkbookSheets({ facilities, levers, result })` → sheets: **Facilities** (baseline per FY), **Scenario** (lever settings incl. procurement), **Dual accounting** (per facility: load, post-lever grid draw, procured, location t, market t; totals; RE100 footnote row when active), **Trajectory** (year, BAU, location net, market net). Pure shaping — testable without exceljs.
- [ ] **Step 2:** Tests: sheet names/headers; dual-accounting totals match `computeScope2`; footnote row present iff flag. Run → PASS.
- [ ] **Step 3:** Topbar: `scope === "s2"` → build Scope 2 sheets, filename `scope2-scenario-FY<baseYear>-<date>.xlsx`. Browser-verify download.
- [ ] **Step 4:** Commit `feat(scope2): excel export`.

---

### Task 13: Final verification

- [ ] **Step 1:** `npx vitest run` — entire suite green.
- [ ] **Step 2:** `npx next lint` (or `npm run lint`) — clean.
- [ ] **Step 3:** `npm run build` — compiles. (Dev server on :3000 keeps running; build uses a separate dir.)
- [ ] **Step 4:** Browser walkthrough on localhost:3000: S1 untouched (spot-check builder + export); S2: edit a facility → model levers → check dual KPIs → action plan → save/compare scenario → export workbook. Reload page → state persists.
- [ ] **Step 5:** Commit any fixes; final commit `feat: scope 2 decarbonization module complete`.

---

## Self-review notes

- **Spec coverage:** every spec section maps to a task — data model (T1), efficiency (T2), generation (T3), procurement + RE100 (T4), dual accounting + trajectory + finance (T6), validation (T5), store/persistence (T7), UI incl. switcher (T8–11), export (T12), testing (throughout + T13). Out-of-scope items in the spec stay out.
- **Type consistency:** names used across tasks — `applyEfficiency/applyGeneration/applyProcurement/computeScope2/baselineScope2/validateScope2/defaultFacilityActions`, result fields `residualLoadKwh/gridDrawKwh/procuredByFacility/coveragePct/footnote` — are defined where first introduced and referenced identically afterwards.
- **UI tasks reference real existing files** (read-before-write) rather than inventing idioms; model tasks carry complete code.
