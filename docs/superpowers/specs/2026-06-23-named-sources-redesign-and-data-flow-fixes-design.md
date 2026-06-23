# Named-source data-input redesign + data-flow correctness fixes

**Date:** 2026-06-23
**Status:** Approved (design)
**Area:** `components/tabs/activity/*`, `components/tabs/ActivityDataTab.tsx`, `components/tabs/BuilderTab.tsx`, `components/tabs/ActionPlanTab.tsx`, `components/tabs/RefrigerantTab.tsx`, `components/scope2/BuilderTab.tsx`, `components/scope2/CompareTab.tsx`, `lib/scope2/store.tsx` (read-paths only)

## Background

The Activity Data tab collects Scope 1 (`CombustionAsset`, `RefrigerationSystem`) and Scope 2 (`Facility`) baseline data, which feeds the scenario modeller (`lib/model/`, `lib/scope2/model/`) and the Builder / Action Plan / Refrigerant advisor / CEO / CFO / Compare tabs.

A field-usage audit (2026-06-23) established:
- **Used by the Scope 1 engine:** `fuelType`, `annualVolume`, `category` (stationary/mobile — routes wedges, fraction method, blend cap, electrification CAPEX), `unitCount` (mobile electrification fraction), `opex` (the only field driving fuel-switch/electrification cost savings), `year` (EF year), `id`, `excluded`. `remainingLife` is advisory (lifespan warning only). Refrigerants: `refrigerant`, `toppedUpKg`, `gasCostPerKg` (leak-fix saving), `systemType` (seeds suggested swap gas), `id`, `excluded`.
- **Display-only / dead (Scope 1):** `displayUnit`, `inputMode`, `site`, `bu` (the engine never reads `bu` — it iterates all non-excluded records).
- **Used by the Scope 2 engine:** `annualLoadKwh`, `gridEf`, `tariffPerKwh`, `loadSplit`, `roofSpaceM2`, `irradiance`, `isolated`, `existingSolarKwp`, `existingRenewablePct`, `excluded`. **Dead:** `peakLoadKw` (only sets a UI slider max), `bu`, `year`.
- **Bugs:** `excluded` is not filtered in `components/scope2/CompareTab.tsx` (saved-scenario columns), `components/tabs/ActionPlanTab.tsx` (plan-item + refrigerant loops), `components/tabs/RefrigerantTab.tsx`; both Builders show excluded records as silent dead lever cards.
- **Per-BU explosion:** per-(BU, fuel) records each render as their own lever card/row in the Scope 1 Builder (worst), Action Plan rows, Refrigerant advisor, and the Scope 2 Builder facility picker.
- **Electricity 4-box quirk:** the 4-records-per-BU electricity structure makes the Scope 2 Builder show efficiency/solar levers on the clean (gridEf 0) VPPA/Solar/I-REC facilities, and can inflate procurement coverage KPIs.
- **Empty-field traps:** `opex:0`/`roofSpaceM2:0`/`peakLoadKw:0`/`loadSplit` zeros silently make levers look free or sliders locked, with no warning.

## Goals

Make data entry an easy step-process for a non-expert ("a graduate"), and ensure the entered data is used correctly everywhere:

A. **Named-source flow** — within a category, the user adds named sources (only those appear); each source is tagged to one BU.
B. **Trimmed entry screen** — the details section shows only fields the modeller reads.
C. **Per-BU grouping** — group sources by BU in the Builder / Action Plan / Refrigerant advisor / Scope 2 picker.
D. **Excluded bug fixes** — respect `excluded` in every downstream tab.
E. **Two correctness/clarity enhancements** — restrict electricity efficiency/solar levers to the grid facility; add empty-field guards.

### Out of scope
- No change to the emission/abatement math or lever formulas. No new model fields (records already carry `bu`/`excluded`/`name`).
- No change to the Scope 1/2 trajectory, finance math, or the boardroom/compare logic beyond the `excluded` filter.

## Design

### A. Named-source data-input flow

**Concept:** A "source" is a real emitting thing the user names. It maps 1:1 to an existing record (`CombustionAsset` for fuels, `RefrigerationSystem` for refrigerants). No new record type; no data migration — existing records already have `name`, `bu?`, `excluded?`.

**The "central vs by-BU mode" is removed.** The BU config (`osh-bus-v3::<companyId>` localStorage: `{ mode, units }`) keeps `units` (the list of BUs) and drops `mode`. The Business Units screen becomes "manage your BUs" (add/remove only — no mode radio). `useBuConfig` drops `setMode`/`mode`; the BU list is what the Add-source BU dropdown reads. (Reading old persisted `{mode, units}` is harmless — `mode` is ignored.)

**Per Scope-1 category** (`liquid`/`gas`/`solid`/`biofuels`/`refrigerants`), the category screen becomes a **source list**:
- Header: category name + total emissions.
- **"+ Add a source"** opens an inline form:
  - **Name** (text, e.g. "Diesel gensets").
  - **Fuel** (for fuel categories): dropdown of that family's workbook fuels (`fuelsInExcelFamily(family)`). For refrigerants: **Refrigerant gas** (dropdown of `inExcel` gases).
  - **Type:** Stationary/Mobile (fuels) or **System type** (refrigerants: commercial HVAC / industrial cold storage / retail refrigeration). When **Mobile** is selected, the fuel dropdown filters to `FUELS_BY_CATEGORY.mobile` members of the family; **Stationary** → `FUELS_BY_CATEGORY.stationary` members.
  - **Business unit:** dropdown of `buReg.units` names + a "Company-wide" option (→ `bu: undefined`).
  - On submit: create the record (combustion via `addCombustionAsset`, refrigerant via `addRefrigerationSystem`) with `name`, `fuelType`/`refrigerant`, `category`/`systemType`, `bu`, sensible defaults (`annualVolume:0`/`toppedUpKg:0`, `opex:0`, `unitCount:1`, `remainingLife:10`, `gasCostPerKg:900`), `excluded:false`.
- **Source rows:** each shows name · `fuelLabel·type·BU` · emissions · the **central toggle** (`excluded`; ✓ = in central total) · delete · click row → entry screen. Filtered to the category's family via `fuelFamily`/`inExcel`.
- The old fuel-type-card grid, the per-type → per-BU navigation (`type` level), and the inline-per-BU-row screen for fuels/refrigerants are removed. (`Nav` `type` level retired for fuels/refrigerants.)

**Electricity is unchanged in structure** (BU-first 4-box). With `mode` gone, the electricity category lists a **"Company-wide"** row plus one row per BU (instead of branching on `mode`), each → the 4-box screen.

**Refrigerants** follow the same named-source model ("Add a cooling system": name + gas + system type + BU). The gas-type card grid built previously is removed; the advisor (Section C) groups by system.

### B. Trimmed entry screen

`EntryScreen` "Details for the scenario modeller" section is reduced to engine-read fields only:
- **Fuel:** Annual spend (`opex`), Number of units (`unitCount`), Remaining life (`remainingLife`). Remove the Stationary/Mobile control (set at the source step), the Site field, the metered/spend `inputMode` toggle. Keep the consumption input + display-unit picker at the top (unchanged).
  - Implementation: `CombustionDetails` (in `DataInputTab.tsx`) gains the ability to render only spend/units/remaining-life without the Source (category/fuel) block and without site/inputMode. Add `unitCount` editing there (it isn't currently editable on the entry screen). Existing legacy callers of `CombustionDetails` (the old `DataInputTab` table/side panel) keep their current behaviour via defaults.
- **Refrigerant:** System type, Gas cost (unchanged — both engine-read).
- **Electricity:** `FacilityDetailContent` minus `peakLoadKw` (remove the peak-load field; it's dead). Other fields unchanged.

### C. Per-BU grouping in downstream tabs

Group records by `bu` (treating `undefined` as "Company-wide") with a collapsible per-BU section, where records currently render one-per-row:
- **`components/tabs/BuilderTab.tsx`** (Scope 1): within each segment (mobile/stationary/refrigerant), group `segAssets`/systems by BU into collapsible accordions; expanding shows the existing `AssetActionCard`/`SystemActionCard`. A BU header shows the BU name + a roll-up (count, baseline t).
- **`components/tabs/ActionPlanTab.tsx`**: group the plan-item rows by BU.
- **`components/tabs/RefrigerantTab.tsx`**: group recommendation cards by BU (systems within a BU together).
- **`components/scope2/BuilderTab.tsx`**: group the facility picker chips by BU.
The grouping is presentational; the underlying lever lookups (`byAsset[id]`/`bySystem[id]`/`byFacility[id]`) are unchanged.

### D. Excluded bug fixes

- **`components/scope2/CompareTab.tsx`**: `computeScope2(baseFacilities.filter((f) => !f.excluded), sc.levers, baseYear)` for saved-scenario columns.
- **`components/tabs/ActionPlanTab.tsx`**: filter `baseAssets`/`baseSystems` to `!excluded` before building plan-item + refrigerant rows (so rows sum to the headline KPIs).
- **`components/tabs/RefrigerantTab.tsx`**: filter `baseSystems` to `!excluded` (excluded systems no longer shown).
- **Both Builders** (`components/tabs/BuilderTab.tsx`, `components/scope2/BuilderTab.tsx`): excluded records — show an "Excluded from totals" badge and visually mute the card; do not hide them entirely (the user may want to re-include). Keep them out of any inline roll-up totals.
- **`components/scope2/CeoOverviewTab.tsx`** (minor): the confidence gauge should use the `!excluded` facility list.

### E. Correctness/clarity enhancements

1. **Electricity clean-instrument levers.** In `components/scope2/BuilderTab.tsx`, only the **Purchased electricity** facility (the gridEf-bearing record, identified by `name === ELEC_TYPES grid label` or `gridEf > 0`) is eligible for the efficiency and on-site-generation levers. The VPPA / Solar onsite / I-REC facilities are excluded from the facility picker for those levers (they remain in the data and totals; procurement is portfolio-level and unchanged). This removes the meaningless/neutered sliders and the procurement-KPI inflation path.
2. **Empty-field guards.** Add small inline hints (not blocking) where a zero value silently misleads:
   - Entry screen, fuel: if `opex === 0`, hint under Annual spend: "Add annual spend to see cost savings in the modeller."
   - Entry screen, electricity (grid facility details): if `roofSpaceM2 === 0`, hint near Roof space: "Set roof space to size the on-site solar option."
   - Scope 1 Builder asset card: if `annualVolume === 0`, a muted "No consumption entered yet" note.
   These are advisory text only; no logic/validation gating.

## Data flow (after redesign)

```
Category screen ("Your sources")
  + Add a source → addCombustionAsset / addRefrigerationSystem
       { name, fuelType|refrigerant, category|systemType, bu, defaults, excluded:false }
  source row → central toggle flips `excluded`
             → click → EntryScreen (consumption + trimmed modeller details + calc dropdown)

Store (unchanged): selectedAssets/selectedSystems/selectedFacilities → filter(!excluded) → engine
  bu is NOT read by the engine; it is a grouping tag for the UI only.

Downstream tabs group by `bu`; all read-paths filter `!excluded`.
```

## Migration & compatibility

- No record-shape change. Existing `CombustionAsset`/`RefrigerationSystem`/`Facility` records (incl. the seed and any localStorage) are valid sources; untagged ones (`bu` absent) render as "Company-wide."
- BU config: `{ mode, units }` in `osh-bus-v3::<id>` → only `units` is used now; `mode` is read-tolerant and ignored. No data loss.
- `Nav`: the `type` level is no longer reached for fuels/refrigerants (electricity already uses `elecbu`); remove the fuel/refrigerant `type`-screen code. Keep `entry`/`elecbu`/`scope`/`cat`/`bus`/`home`.
- No FuelId/RefrigerantId/Facility-field type removed. `peakLoadKw` stays on the `Facility` type (still in the seed/model surface) but is dropped from the entry UI.

## Testing

- **Source flow (render):** category shows only added sources; "Add a source" creates a record with the chosen fuel/type/BU; Mobile filters the fuel dropdown; a source row's central toggle flips `excluded` and the total responds; clicking a source opens the entry screen.
- **Trimmed details:** the entry screen shows spend/units/remaining-life (fuel) and no Stationary/Mobile/Site control; electricity details have no peak-load field.
- **Grouping:** Builder/Action-Plan/Refrigerant/Scope2-picker render a BU header per distinct `bu` and the records nest under it; "Company-wide" groups untagged records.
- **Excluded fixes (unit/render):** an excluded asset produces no Action-Plan row and its tonnes are absent from the plan total; an excluded system is absent from the Refrigerant advisor; Scope 2 Compare saved columns exclude it; Builders show the "Excluded" badge.
- **E1:** the Scope 2 Builder facility picker for efficiency/generation lists only the grid facility for a BU (not VPPA/Solar/I-REC).
- **E2:** the zero-field hints render when the field is 0 and disappear when set.
- Full suite + `tsc --noEmit` clean after each task.

## Open details (low-risk, decide in implementation)

- Exact collapsible component for the BU groups (reuse `Collapsible` from `components/tabs/activity/`).
- Whether "Company-wide" sorts first or last in BU groupings (recommend first).
- The Add-source form's default Type for fuels (recommend Stationary) and default BU (recommend "Company-wide").
