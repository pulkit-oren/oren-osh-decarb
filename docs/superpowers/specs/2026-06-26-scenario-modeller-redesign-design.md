# Scenario Modeller — Data-Input design language (Scope 1)

- **Date:** 2026-06-26
- **Status:** Draft for review
- **Scope:** Scope 1 Scenario Modeller (`components/tabs/BuilderTab.tsx`) only. Scope 2 (`Scope2BuilderTab`) is Phase B, mirrored after approval.

## Goal

Make the Scope 1 Scenario Modeller look and feel like the Data Input tab: a **home with gradient segment cards + a results side-panel**, then drill into a segment whose asset/lever cards use the same themed gradient headers, `DetailCard` containers, and `fields.tsx` primitives (SliderField, Stepper, ToggleSwitch, Segmented, NumField). The live what-if workflow is preserved — results stay visible while you tweak levers. No change to the scenario math, the store, or any lever behavior.

## Decisions (from brainstorming)

1. **Restyle in place + new home** (not a one-asset-per-screen drill-down). Levers stay editable with the live result visible.
2. **Scope 1 first**; Scope 2 mirrored later.
3. Preserve every existing lever, field, handler, warning, save/scenario, and assumptions — visual/navigation change only.

## Reused building blocks (already in the codebase)

- `components/tabs/activity/fields.tsx`: `DetailCard`, `SliderField`, `Stepper`, `ToggleSwitch`, `Segmented`, `NumField`, `SelectField`, `FieldLabel`.
- `components/tabs/activity/shared.tsx`: `GRAD`, `ICON_COLOR`, `CAT_ICON` (and the gradient-header pattern).
- `components/tabs/activity/Collapsible.tsx`.
- Existing model/store: `useScenario` (settings, byAsset, bySystem, assumptions, updateAction, updateSystemAction, updateAssumptions, saveScenario, deleteScenario, setSettings, resetSettings, result), `applyAssetActions`, `applyRefrigerant`, `defaultActions`, `defaultSystemActions`, `flexFuelCapable`, `endUseProfile`, `groupByBu`. **All unchanged.**

## Navigation (local state in BuilderTab)

`view: "home" | Seg` where `Seg = "mobile" | "stationary" | "refrigerant"`. Default `"home"`. (Mirrors `ActivityDataTab`'s nav state pattern.)

### Home (`ModellerHome`)
Two-column layout like `HomeScreen` (`lg:grid-cols-[1.85fr_1fr]`):
- **Left — segment cards** (one per Seg): a gradient card (family color) with an icon tile (Truck / Factory / Snowflake), the label + sub, `#assets` and `#active levers`, the segment's **abatement (tCO₂e removed)** on the right, and a chevron. Hover lift like the activity category cards. Click → `view = seg`.
- **Right — results side-panel** (brand-gradient aside, like the footprint panel): live KPIs from `result.kpis` — **Reduction 2030 (%)**, **Net 2030 (t)**, **Cost / t**, **Years to target**, and the **On track / Behind** pill. Below a divider: the **Save scenario** name input + Save button, the **saved-scenario chips** (Load / Delete), and a **Reset all to default** link. (These move here from the old standalone cards.)

### Segment view (`SegmentScreen`)
- Back button "← All segments" (like "All activity data").
- **Themed gradient header** for the segment: icon tile + label + sub + segment abatement and `#active` on the right (same structure as the category-screen header).
- A **compact sticky live bar** (the existing `LiveResult`, kept) so the scenario KPIs stay visible while editing.
- Body:
  - mobile / stationary → `groupByBu(segAssets)` → `Collapsible` per BU → restyled asset cards.
  - refrigerant → restyled `RefrigerantControls` (presets + per-system cards).
- **Global assumptions** (`AssumptionsCard`) rendered at the bottom of the segment view, restyled as a `DetailCard`.

## Restyled asset card (`AssetActionCard`)

- Container: `DetailCard`-style (rounded-xl3, border, shadow) with a **themed header row**: a gradient/tinted icon tile (segment color), asset name, meta line (`N vehicles · volume/yr` or `1 unit · volume/yr`), excluded badge, and the existing `ImpactBar` (before→after) on the right.
- Levers keep the `ActionRow` shell but restyled to the activity language:
  - Toggle → activity `ToggleSwitch`.
  - Mobile "vehicles to convert" → `Stepper`; stationary capacity / blend / transition → `SliderField`; target/start years and numeric advanced fields → `NumField`; alt-fuel chooser → `Segmented` (or the existing chip row restyled).
  - "Advanced" stays a `Collapsible` (replace `AdvancedDrawer` with the shared `Collapsible`, or restyle it to match).
  - Keep the feasibility ⚠ hint (electrify) and lifespan warning, in the existing amber style.
- "Add plan" empty-state restyled to match (a clean `DetailCard` with a primary button).

## Restyled refrigerant card (`SystemActionCard`) + presets

- Same header/`DetailCard` treatment (Snowflake tile, system name, type · top-up · current gas · era badge, `ImpactBar`).
- `gasSwitch` (alt-refrigerant `SelectField`, transition `SliderField`, suggested-swap chip kept) and `leakFix` (`SliderField`) levers via `ToggleSwitch` + primitives. Presets row restyled as a compact `Segmented`/button group inside a `DetailCard`.

## Non-goals

- No change to scenario **math** (`applyAssetActions`, `applyRefrigerant`, KPIs) or the store API.
- No Scope 2 work this phase.
- No change to Action plan / Compare / Data input.
- Do not drop any field, lever, warning, or the save/scenario/assumptions functionality.

## Testing

- Existing scenario/model tests stay green (math/store untouched).
- `builder-grouping.test.tsx` currently renders `BuilderTab` and checks BU grouping + the electrify feasibility hint — update its navigation if needed (it may need to enter a segment first) and keep its assertions meaningful.
- Add a light test: the Modeller **home** shows the three segment cards and the results panel; clicking a segment reveals its asset cards; the feasibility ⚠ hint still renders for a hard-to-electrify asset.
- `npx tsc --noEmit` clean; `npm run build` clean.

## Files touched

- `components/tabs/BuilderTab.tsx` — add `view` nav + `ModellerHome` + `SegmentScreen`; restyle `AssetActionCard`, `SystemActionCard`, `RefrigerantControls`, `AssumptionsCard`, save panel; swap bespoke field helpers for `fields.tsx` primitives where it matches.
- Possibly a small new file `components/tabs/builder/ModellerHome.tsx` (+ segment header) if BuilderTab grows too large — split by responsibility.
- `components/tabs/__tests__/builder-grouping.test.tsx` — update navigation; add home/segment assertions.
