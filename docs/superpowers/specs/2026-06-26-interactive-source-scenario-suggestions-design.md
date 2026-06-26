# Interactive, fuel-tailored source scenario screen + suggestions (Scope 1)

- **Date:** 2026-06-26
- **Status:** Draft for review
- **Scope:** Scope 1 per-source scenario screen — combustion (mobile + stationary fuels) and refrigerant. Electricity (Scope 2) is a later phase.

## Goal

When the operator opens a single source's scenario screen, it should feel **interactive and guided**: a tailored **suggestion** up top (apply-able), each lever carries a **fuel-specific tip/benchmark**, and a **live impact readout** updates the instant a lever moves (emissions now→after, tonnes cut, % cut, and CAPEX committed). Same workflow as today — just smarter and more alive. Suggestions are **derived from the existing end-use / equipment-class profiles** (Phases 1 & 3), not hand-authored per source. No change to the scenario math/store.

## Decisions (from brainstorming)

1. Live feedback = **live numbers + animated now→after bar + CAPEX committed**. No per-source payback/running-cost (the cost engine is scenario-wide; surfacing per-source payback would need new math and risk inconsistency — out of scope; Action plan already shows scenario cost/payback).
2. Suggestions **derived** from `endUseProfile` / `refrigClassProfile` + fuel/alt-fuel/refrigerant data.
3. **Fuels + refrigerant first**; electricity later.

## Component 1 — Suggestion engine (`lib/model/suggestions.ts`, new)

Pure functions, no React/store:

```ts
export type LeverKind = "electrify" | "fuelSwitch" | "flexFuel" | "gasSwitch" | "leakFix";
export interface SuggestedAction { lever: LeverKind; patch: Record<string, number | string | boolean>; }
export interface Suggestion {
  headline: string;            // e.g. "Electrify 50% of vehicles by 2030"
  why: string;                 // one-line rationale
  actions: SuggestedAction[];  // patches to apply (each lever set + enabled:true)
  altHeadline?: string;        // e.g. "Or run B20 biodiesel now (drop-in)"
  altActions?: SuggestedAction[];
}
export function suggestForAsset(asset: CombustionAsset): Suggestion;
export function suggestForSystem(system: RefrigerationSystem): Suggestion;
```

Derivation rules:
- **Combustion, electrify-feasible** end-use (`endUseProfile(asset).electrify.feasible` ∈ {easy, yes}): primary = `electrify` enabled — mobile `unitsToConvert = round(unitCount × 0.5)`, stationary `capacityPct = profile.electrify.capacityHint ?? 60`; `cop = profile.electrify.cop`, `assetCapex = profile.electrify.capexPerUnit ?? <base>`, `targetYear = 2030`. `why = profile.electrify.note ?? "EVs/heat-pumps are the primary lever for this equipment."` headline reflects units/% + 2030. Alternative = `fuelSwitch` at the max drop-in blend if a compatible bio fuel exists.
- **Combustion, hard/no electrify** (kiln, heavy off-road) OR no end-use: primary = `fuelSwitch` to the max drop-in blend (`altFuel = profile?.fuelSwitch.preferred ?? defaultAltFuelFor(fuelType)`, `blendPct = maxBlendPctFor(category, altFuel)`, `targetYear = 2030`) when a compatible bio fuel exists; `why = profile?.fuelSwitch.note ?? "Bio-blend is the near-term lever; electrification is limited here."` Alternative = `electrify` (long-term) when the profile allows. If **no** compatible bio fuel, primary = `electrify` with a note to consider CNG/biomass.
- **Refrigerant**: primary = `gasSwitch` (`altRefrigerant = refrigClassProfile(system)?.recommendedAlt ?? RECOMMENDED_ALT_BY_SYSTEM[systemType]`, `transitionPct = 60`, `targetYear = 2030`) **+** `leakFix` (`leakImprovementPct = 50`); `why = refrigClassProfile(system)?.note ?? "Low-GWP swap plus leak reduction is the standard refrigerant pathway."` Alternative = `leakFix` only ("Start with leak reduction — cheapest win").

Each `SuggestedAction.patch` includes `enabled: true` and the field values above.

## Component 2 — Per-lever tips (`leverTip(...)` in `suggestions.ts`)

Short, fuel-specific strings, computed from existing data (reusing the notes already in the code where present):
- electrify (mobile): "EVs suit depot / return-to-base routes; an EV uses ≈⅓ the energy (COP ~3)."
- electrify (stationary): "Heat pump COP ≈3; electric boiler =1. High-temp processes are hard to electrify."
- fuelSwitch: `"${altLabel} drop-in limit is ${maxBlend}% on existing ${category} equipment."` (reuse existing `blendNote`).
- flexFuel: "Flex-fuel vehicles run high blends (E85/B100) beyond the drop-in limit — counted per vehicle."
- gasSwitch: `"${altLabel} · GWP ${gwp}. Naturals (R-290/R-717/R-744) need less charge but have charge/safety limits."` (reuse `alt.note`).
- leakFix: "Maintenance & monitoring — usually the cheapest first win."

## Component 3 — Live impact (`SourceImpact` + `capexFor`)

`capexFor(asset, acts)` / `capexForSystem(system, acts)` — per-source committed CAPEX from enabled levers, mirroring `index.ts` exactly:
- electrify: `assetCapex × (mobile ? unitsToConvert : 1)`
- fuelSwitch: `retrofitCapex`; flexFuel: `vehicleCapex × unitsToConvert`; gasSwitch: `retrofitCapex`.
- (Scenario-wide `infraCapex` is shared, NOT attributed per source.)

`SourceImpact` component (prominent, sticky strip at the top of the source scenario screen): an **animated now→after bar**, `now t → after t`, `−X t/yr`, `% cut`, and `CAPEX ₹…`. It recomputes on every render (lever changes already re-render via the store), so it updates live. The small inline `ImpactBar` currently in the `AssetActionCard`/`SystemActionCard` header is removed (its info now lives in `SourceImpact`, avoiding duplication).

## Component 4 — Screen layout (`SourceScenarioScreen` in `BuilderTab.tsx`)

Order: back button → **`SuggestionCard`** (headline + why + Apply, and the alternative as a secondary Apply) → **`SourceImpact`** (sticky) → the existing `AssetActionCard`/`SystemActionCard` levers (now with inline `leverTip`s, header ImpactBar removed) → `AssumptionsCard`.

`SuggestionCard` "Apply" loops the suggestion's `actions` and calls `updateAction(asset.id, lever, patch)` (combustion) / `updateSystemAction(system.id, lever, patch)` (refrigerant); the alternative applies `altActions`. After applying, the levers + `SourceImpact` reflect it immediately.

## Non-goals

- No change to scenario math, KPIs, store handlers, or the home/segment/box navigation.
- No per-source payback/running-cost (CAPEX only).
- No electricity (Scope 2) this phase.
- Suggestions are starting points — they only set lever values; the operator still owns the final numbers.

## Testing

- `suggestForAsset`: a `truck` end-use → primary `electrify`, enabled, `unitsToConvert ≈ unitCount/2`, targetYear 2030, with a fuel-switch alternative; a `furnaceKiln` end-use → primary `fuelSwitch` at the drop-in cap, electrify as alternative; an asset with no compatible bio fuel and no electrify → sensible fallback (no crash).
- `suggestForSystem`: → primary actions include `gasSwitch` (altRefrigerant = class recommendation, 60%, 2030) and `leakFix` (50%); alternative = leakFix only.
- `capexFor`: electrify mobile = `assetCapex × unitsToConvert`; stationary = `assetCapex`; fuelSwitch = retrofit; flexFuel = `vehicleCapex × units`; matches `index.ts` attribution.
- UI: the source scenario screen renders the SuggestionCard with a headline + Apply; clicking **Apply** enables the recommended lever and sets its values (assert against the store-backed render); `SourceImpact` shows the now→after numbers; a lever's tip text is present.
- Existing scenario/model tests stay green; `tsc` + `npm test` + `build` clean.

## Files touched

- `lib/model/suggestions.ts` — **new**: `suggestForAsset`, `suggestForSystem`, `leverTip`, `capexFor`/`capexForSystem`, types.
- `lib/model/__tests__/suggestions.test.ts` — **new**.
- `components/tabs/BuilderTab.tsx` — add `SuggestionCard` + `SourceImpact`; wire into `SourceScenarioScreen`; add per-lever tips in the lever controls; remove the inline header `ImpactBar` from `AssetActionCard`/`SystemActionCard`.
- `components/tabs/__tests__/builder-grouping.test.tsx` — add suggestion/apply + impact assertions.
