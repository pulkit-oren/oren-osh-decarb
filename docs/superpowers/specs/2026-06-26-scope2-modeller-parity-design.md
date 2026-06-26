# Scope 2 modeller parity (redesign + drill-down + suggestions + energy balance)

- **Date:** 2026-06-26
- **Status:** Draft for review
- **Scope:** The Scope 2 Scenario Modeller (`components/scope2/BuilderTab.tsx` = `Scope2BuilderTab`). Bring it to full parity with the redesigned Scope 1 modeller, adapted to Scope 2's facility/efficiency/solar/procurement model. Built as one push (sequential tasks, one deploy).

## Goal

Mirror the Scope 1 experience for Scope 2: a Data-Input-style home with **facility boxes** + a results side-panel, a per-**facility scenario screen** with restyled levers, **per-facility suggestions + live impact**, a portfolio **Procurement** screen, and a **Scope-2 energy balance**. Preserve the Scope 2 compute math, store, and all levers — this is the look/nav/suggestions/balance layer on top.

## Confirmed Scope 2 model (unchanged, consumed)

- `useScope2()` → `{ baseFacilities, levers (byFacility, procurement), result, updateFacilityAction(id, "efficiency"|"generation", patch), updateProcurement(patch), resetLevers, saveScenario, deleteScenario, scenarios, baseYear, setLevers? }`. (Confirm the exact apply-all setter name in the plan.)
- `computeScope2(facilities, levers, baseYear)` — pure; `result.kpis = { baseLocationT, marketBaselineT, locationNowT, marketNowT, reduction2030, totalCapex, annualOpexDelta, paybackYears, costPerTonne, coveragePct, target2030, onTrack2030 }`; `result.perFacility[id] = { eff, gen }`.
- `applyEfficiency(f, a) → { ledKwh, motorKwh, bmsKwh, savedKwh, residualLoadKwh, capex, opexSaving }` (pure); `applyGeneration(f, a, residualLoadKwh) → { usedOnSiteKwh, capex, ... }` (pure).
- `defaultFacilityActions(f)`; `DEFAULT_PROCUREMENT`.
- Facility baseline location emissions = `f.annualLoadKwh × f.gridEf / 1000`.
- `facilityTypeProfile(f)` (Phase 2) → `{ label, loadSplit, solar: { feasible, note } }`; `f.facilityType`, `f.loadSplit {lightingPct, motorPct, hvacPct}`, `f.roofSpaceM2`, `f.existingSolarKwp`, `M2_PER_KW`.
- Lever shapes: `EfficiencyAction {enabled, ledPct, motorPct, bmsPct, ledCapex, motorCapex, bmsCapex, startYear, targetYear}`, `GenerationAction {enabled, solarKwp, batteryKwh, exportMode, solarCapexPerKw, batteryCapexPerKwh, subsidyPct, startYear, targetYear}`, `ProcurementSettings {enabled, ppaPct, greenTariffPct, recPct, ppaStrikeDeltaPerKwh, greenTariffPremiumPerKwh, recPricePerKwh, re100Exclusion, startYear, targetYear}`.

## Navigation (`Scope2BuilderTab` local state)

`view: "home" | "procurement" | "balance" | { facilityId: string }` (default `"home"`). No segment layer (electricity is the only category).

## Components

### `Scope2ModellerHome`
Two-column, like Scope 1's `ModellerHome`:
- **Left:** facility **boxes grouped by BU** (`groupByBu(baseFacilities)`), each a `FacilityBox` (name, `facilityType label · BU`, abatement −t, #active levers, chevron) → opens `{facilityId}`. Below: a **Procurement** tile → `"procurement"`, and an **Energy balance** tile → `"balance"`.
- **Right:** brand-gradient results panel with Scope 2 KPIs (**market-based net** `marketNowT`, **reduction 2030** %, **OPEX Δ/yr**, **total CAPEX**), on-track pill, **Save scenario** input + saved chips + **Reset levers**.

### `FacilityScenarioScreen` (per facility)
Back → **`Scope2SuggestionCard`** → **`FacilityImpact`** (now→after location emissions + CAPEX, animated) → restyled **Efficiency** lever (LED/VFD/BMS sliders + ToggleSwitch + Advanced collapsible + tip) → restyled **Solar/battery** lever (solar kWp slider capped at roof headroom, battery, advanced + tip). (Tariff/grid-EF/load-split live on Data Input, not here.)

### `ProcurementScreen`
Restyled portfolio procurement: ToggleSwitch + PPA / green-tariff / REC `SliderField`s + Advanced (prices, RE100 exclusion, years) + the cost readout. Uses `updateProcurement`.

### Suggestions + impact engine (`lib/scope2/model/suggestions.ts`, new — pure)
- `suggestForFacility(f) → Scope2Suggestion { headline, why, actions: { lever: "efficiency"|"generation"; patch }[], altHeadline?, altActions? }`:
  - Efficiency: enable; set `ledPct/motorPct/bmsPct` from `f.loadSplit` (lighting→led, motor→motor, hvac→bms), targetYear 2030.
  - Solar: roof headroom `roofCap = max(0, roofSpaceM2/M2_PER_KW − existingSolarKwp)`; if `roofCap > 0` and the facility-type solar feasibility is strong/good → primary or alternative `generation` with `solarKwp = round(roofCap)`.
  - `why` from `facilityTypeProfile(f).solar.note` / load-split rationale; sensible fallbacks when no type.
- `capexForFacility(f, acts) → number` = `applyEfficiency(f, acts.efficiency).capex` (when enabled) + `applyGeneration(f, acts.generation, residual).capex` (when enabled), mirroring `index.ts`.
- `facilityImpact(f, acts) → { baseT, afterT }`: `baseT = annualLoadKwh×gridEf/1000`; `afterT = max(0, baseT − (eff.savedKwh + gen.usedOnSiteKwh)×gridEf/1000)` using `applyEfficiency`/`applyGeneration` (gen takes the post-efficiency residual load).
- Tip helpers: efficiency (`"Lighting-heavy load → LED is the quick win"` etc. keyed off the dominant load-split share), solar (`"Roof fits ~N kWp; covers ≈X% of load"`).

### Energy balance (`lib/scope2/model/energy-balance.ts`, new — pure)
- `BalanceDials2 { efficiencyPct, solarPct, procurementPct }`.
- `applyDials2(facilities, baseLevers, dials) → Scope2Levers`: efficiency dial → set each facility's LED/VFD/BMS to `efficiencyPct` (enable); solar dial → set each facility's `solarKwp = roofCap × solarPct/100` (enable when >0); procurement dial → set `procurement.enabled` + split `procurementPct` across ppa/greenTariff/rec (e.g. all into ppaPct, clamped ≤100). Pure, non-mutating.
- `energyMix2(facilities, levers) → { gridKwh, renewableKwh }`: from per-facility residual grid draw (after efficiency + on-site solar) and renewable = solar self-consumed + procured + existing-renewable.
- `suggestMix2(facilities, baseLevers, target, baseYear) → BalanceDials2`: stepwise (efficiency → solar → procurement) using `computeScope2(...).kpis.reduction2030`.

### `Scope2EnergyBalanceScreen`
Dials (Efficiency %, Solar %, Procurement clean %), a mix bar (grid vs renewable), result strip (`reduction2030`, `marketNowT`, `totalCapex`) vs an editable target, and a transparent **"suggest a mix"** button.

## Reuse

Activity primitives (`DetailCard`, `SliderField`, `Stepper`, `ToggleSwitch`, `Segmented`, `NumField`, `SelectField`), `Collapsible`, `groupByBu`, and the **Scope 1 components in `BuilderTab.tsx` as the visual pattern** (`ModellerHome`, `SourceBox`, `SuggestionCard`, `SourceImpact`, `EnergyBalanceScreen`) — mirror their structure with the Scope 2 levers/handlers.

## Non-goals

- No change to Scope 2 compute math, store handlers, or lever semantics.
- No change to Scope 1, Data input, Action plan, Compare.
- Procurement stays a single portfolio lever (not per-facility).
- The Scope-2 energy mix bar is an indicative visualization (documented).

## Testing

- `suggestForFacility` (lighting-heavy → LED-led efficiency; roof headroom → solar action; no roof → efficiency only), `capexForFacility`/`facilityImpact` mirror `index.ts` (per-facility), `applyDials2` non-mutating + cascades, `energyMix2` ≥0, `suggestMix2` raises dials toward target via pure compute.
- UI: home shows facility boxes + procurement/balance/save; clicking a facility opens its scenario with suggestion + impact + efficiency/solar levers; procurement screen renders the lever; balance screen renders dials + suggest. Existing Scope 2 tests stay green; tsc + build clean.

## Files

- `lib/scope2/model/suggestions.ts`, `lib/scope2/model/energy-balance.ts` — **new** (pure) + tests.
- `components/scope2/BuilderTab.tsx` — rebuilt into home + facility drill-down + scenario screen + procurement screen + balance screen, restyled on the activity primitives.
- Scope 2 tests updated.
