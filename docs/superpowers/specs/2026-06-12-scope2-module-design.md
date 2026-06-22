# Scope 2 Decarbonization Module — Design

**Date:** 2026-06-12
**Source spec:** `OSH Scope 2 Decarbonization Module Specification.docx` (extracted to `../../../scope2_docx_extract.txt` in the workspace root)
**Status:** Approved by user 2026-06-12

## Goal

Add a Scope 2 (purchased electricity) decarbonization planner to the existing dashboard,
as a peer of the Scope 1 module. It models three intervention pillars from the spec —
Energy Efficiency, On-site Generation, and Renewable Procurement — and reports both
**location-based** and **market-based** Scope 2 emissions.

## Decisions made during brainstorming

1. **Navigation: scope switcher.** An S1/S2 segmented control at the top of the sidebar
   swaps the visible tab set. Scope 2 tabs: Data input, Scenario modeller, Action plan,
   Compare & track (no Refrigerant-advisor analogue).
2. **Data unit: facility list.** Data input holds a list of facilities per FY, mirroring
   Scope 1's asset list. Efficiency and generation levers are per facility; procurement
   levers are portfolio-wide.
3. **Architecture: parallel module.** New pure model layer in `lib/scope2/model/`, its own
   `Scope2Provider` store, new tab components under `components/scope2/`. Scope 1 code is
   untouched except `Shell.tsx`, `Sidebar.tsx`, and `Topbar.tsx` (scope awareness only).

## Data model (`lib/scope2/model/types.ts`)

### Facility (baseline, per FY)

```
Facility {
  id: string            // persists across FYs — same rule as Scope 1 asset ids:
                        // copy-year keeps ids so scenario plans follow facilities
  name: string
  annualLoadKwh: number // total grid draw for the FY
  tariffPerKwh: number  // currency/kWh
  loadSplit: { lightingPct; motorPct; hvacPct }  // each 0..100, sum ≤ 100;
                        // remainder is the implicit "other" load
  roofSpaceM2: number   // physical cap for solar sizing
  peakLoadKw: number    // context for battery sizing (display guardrail, not computed)
  gridEf: number        // location-based grid factor, kgCO2e/kWh
  irradiance: number    // kWh/kWp/yr — geography-specific solar yield
  isolated: boolean     // captive/island grid — excluded from procurement,
                        // drives the RE100 footnote
  year?: number
}
FacilitiesByYear = Record<number, Facility[]>   // FY_YEARS 2021..2027, shared with Scope 1
```

### Levers (the scenario)

Per facility:

```
EfficiencyAction {
  enabled: boolean
  ledPct: number        // 0..100 deployment slider
  motorPct: number      // 0..100
  bmsPct: number        // 0..100
  ledCapex: number      // full-deployment cost; scaled by slider
  motorCapex: number
  bmsCapex: number
  startYear: number; targetYear: number
}

GenerationAction {
  enabled: boolean
  solarKwp: number      // slider, hard-capped at roofSpaceM2 / 5.5
  batteryKwh: number    // slider
  exportMode: "netMetering" | "zeroExport"
  solarCapexPerKw: number
  batteryCapexPerKwh: number
  subsidyPct: number    // 0..100, deducted from generation CAPEX
  startYear: number; targetYear: number
}
```

Portfolio-wide:

```
ProcurementSettings {
  enabled: boolean
  ppaPct: number        // 0..100 of addressable load
  greenTariffPct: number
  recPct: number        // ppaPct + greenTariffPct + recPct clamped to ≤ 100
  ppaStrikeDeltaPerKwh: number   // negative = cheaper than grid (savings)
  greenTariffPremiumPerKwh: number
  recPricePerKwh: number
  re100Exclusion: boolean        // deduct isolated load from the denominator
  startYear: number; targetYear: number
}

Scope2Levers {
  byFacility: Record<string, { efficiency: EfficiencyAction; generation: GenerationAction }>
  procurement: ProcurementSettings
}
```

## Compute engine (pure functions, no React)

Levers compound in physical order per facility:

### 1. Efficiency (`efficiency.ts`)

Background reduction constants (spec midpoints):
- LED cuts the **lighting** share by **55%** × deployment slider
- Motor/VFD upgrades cut the **motor** share by **12.5%** × slider
- BMS cuts the **HVAC + other** share by **17.5%** × slider

```
savedKwh = load × share × constant × slider/100      (per lever, summed)
residualLoad = annualLoadKwh − Σ savedKwh
leverCapex   = fullCapex × slider/100
leverOpexSaving = savedKwh × tariffPerKwh
```

### 2. Generation (`generation.ts`)

```
effectiveKwp = min(solarKwp, roofSpaceM2 / 5.5)
solarGen     = effectiveKwp × irradiance
dailySolar   = solarGen / 365
batteryFactor   = min(1, batteryKwh / (0.5 × dailySolar))   // battery ≥ half a day's
                                                            // generation captures spill
spillFraction   = 0.5 × min(1, solarGen / residualLoad) × (1 − batteryFactor)
selfConsumption = 1 − spillFraction                          // 0.5 → 1.0
usedOnSite   = min(residualLoad, solarGen × selfConsumption)
exported     = solarGen − usedOnSite
gridDraw     = residualLoad − usedOnSite
capex        = (effectiveKwp × solarCapexPerKw + batteryKwh × batteryCapexPerKwh)
               × (1 − subsidyPct/100)
opexSaving   = usedOnSite × tariff  +  (netMetering ? exported × tariff : 0)
               // zeroExport: spill is curtailed — no value, no emission credit
```

The self-consumption curve is a deliberate simplification: solar-only at array-size-equal-
to-load self-consumes ~50%; a battery sized to half a day's generation lifts it to 100%.
Documented here so auditors can challenge the curve, not the code.

### 3. Procurement (`procurement.ts`)

```
portfolioGridDraw = Σ gridDraw over all facilities
isolatedDraw      = Σ gridDraw over isolated facilities
addressable       = portfolioGridDraw − (re100Exclusion ? isolatedDraw : 0)
coveredKwh        = addressable × (ppaPct + greenTariffPct + recPct)/100   (sum ≤ 100)
```

Procurement is allocated proportionally across **non-isolated** facilities' grid draw.
Costs: `ppaKwh × strikeDelta` (negative = profit) + `gtKwh × premium` + `recKwh × recPrice`.
When `re100Exclusion` is on, the module emits a report footnote and KPIs track the
**Addressable Target** instead of the global target.

### 4. Dual accounting (`baseline.ts` / `finance.ts`)

- **Location-based** = Σ facility `gridDraw × gridEf`. Procurement does NOT change it.
- **Market-based** = Σ (`gridDraw − procuredKwh`) × gridEf. On-site solar reduces both.
- Finance: per-lever CAPEX, annual OPEX delta, simple payback, abatement cost
  (currency / tCO2e, market-based) feeding the MACC.

### 5. Trajectory (`trajectory.ts`)

Reuses the existing `Wedge` shape (`scope: 2`) and ramp logic: one wedge per enabled
lever group per facility plus one procurement wedge, ramping linearly from `startYear`
to `targetYear`. Outputs BAU vs net for the wedge chart, with separate location-based
and market-based net lines for the Compare tab.

### Validation (`validate.ts`)

- loadSplit sum ≤ 100; sliders 0–100; procurement sliders' sum clamped to 100
- solarKwp clamped to roof cap; warnings list (non-blocking) mirrors Scope 1's validate
- isolated facilities receive no procurement allocation

### Defaults (`defaults.ts`)

Seeded demo facilities with realistic values (e.g. India plant gridEf ≈ 0.71 /
irradiance ≈ 1500; UK office ≈ 0.21 / 950; island resort flagged isolated) so the
module renders meaningfully on first load. Constants table (LED 0.55, motor 0.125,
BMS 0.175, 5.5 m²/kW, battery half-day rule) lives here, not in components.

## UI

- **`components/Sidebar.tsx`** — S1/S2 segmented control above the nav; tab set swaps by
  scope. Mobile nav gains the same switcher.
- **`components/scope2/DataInputTab.tsx`** — facility table per FY: add / edit / delete /
  copy-year (ids preserved), isolated-grid badge, load-split mini bar.
- **`components/scope2/BuilderTab.tsx`** — facility picker; three pillar cards
  (Efficiency / Generation / Procurement — procurement card is portfolio-level and
  pinned regardless of facility); KPI cards: location-based tCO2e, market-based tCO2e,
  OPEX delta, total CAPEX; wedge chart + location-vs-market bar.
- **`components/scope2/ActionPlanTab.tsx`** — per-lever table (CAPEX, annual saving,
  payback, abatement cost) + MACC scatter; reuses `MaccScatter`/`Card`/`KpiCard`.
- **`components/scope2/CompareTab.tsx`** — save/duplicate/compare scenarios, same
  pattern as Scope 1's CompareTab, plus the location-vs-market trajectory overlay.
- **`components/Topbar.tsx`** — scope-aware: in Scope 2, export calls
  `lib/scope2/export.ts` (dynamic exceljs import) emitting baseline, scenario,
  and dual-accounting sheets, including the RE100 footnote when active.

## State (`lib/scope2/store.tsx`)

`Scope2Provider` + `useScope2()`, mounted in `Shell` alongside `ScenarioProvider`.
Holds `FacilitiesByYear`, `Scope2Levers`, saved scenarios, selected FY. Persists to
localStorage under a distinct key with a schema version + migrate hook (pattern from
Scope 1). Avoid the ref-handoff pattern flagged as fragile in `lib/store.tsx`.

## Testing

Vitest unit tests per model file, mirroring `lib/model/__tests__/`:
- compounding order (efficiency before solar before procurement)
- roof-space cap, battery self-consumption curve endpoints (0.5 / 1.0)
- zero-export curtailment vs net-metering credit
- procurement cap at 100% of addressable; RE100 denominator switch
- location-based unaffected by procurement; market-based reaches 0 at full coverage
- finance: payback and abatement-cost arithmetic; trajectory ramp shape
- store migrate round-trip

## Out of scope (explicit)

- Cross-scope combined dashboard / totals (the `Wedge.scope` field keeps the seam open)
- Hour-by-hour solar/battery dispatch simulation (annual curve approximation instead)
- Linking Scope 1 electrification spillover into the Scope 2 baseline (future pass)
