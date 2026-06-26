# Scenario Modeller — per-source drill-down (Scope 1)

- **Date:** 2026-06-26
- **Status:** Draft for review
- **Scope:** Scope 1 Scenario Modeller (`components/tabs/BuilderTab.tsx`). Scope 2 unchanged.

## Goal

Make the Modeller a true drill-down like Data Input: clicking a segment shows a **list of source "boxes"** (not the expanded levers); clicking a box opens that **single source's full scenario** (its levers + assumptions). The source's **end-use type from Data Input** (vehicle type for mobile, equipment class for refrigerant) is shown on the box and the source screen, and continues to drive the lever defaults (already wired via `endUseProfile`/`refrigClassProfile`). No scenario math/store change.

## Decisions (from brainstorming)

1. Boxes **grouped by business unit** (Collapsible per BU), like Data Input.
2. Global assumptions live **on each source scenario screen** (by the levers).
3. End-use / vehicle type shown on box sublabel and the source header.

## Navigation (BuilderTab local state)

`view: "home" | Seg | { seg: Seg; sourceId: string }` (default `"home"`).
Routing in `BuilderTab`:
- `view === "home"` → `ModellerHome` (unchanged), `onOpen={(s) => setView(s)}`.
- `typeof view === "string"` (a `Seg`) → `SegmentScreen seg={view} onBack={() => setView("home")} onOpenSource={(id) => setView({ seg: view, sourceId: id })}`.
- otherwise (object) → `SourceScenarioScreen seg={view.seg} sourceId={view.sourceId} onBack={() => setView(view.seg)}`.

## SegmentScreen (changed → boxes)

Keeps: back button, themed gradient header, the `LiveResult` sticky bar. For refrigerant, keep the presets row (`DetailCard title="Presets · all systems"`, applies to all systems). Then, instead of rendering `AssetActionCard`/`SystemActionCard` inline, render **source boxes** grouped by BU:
- `groupByBu(segAssets)` (combustion) or `groupByBu(baseSystems)` (refrigerant) → `Collapsible` per BU → one `SourceBox` per source.
- Remove `AssumptionsCard` from the segment screen (moves to the source screen).
- Empty-state ("No … assets yet — add them in Data input") preserved.

### SourceBox (new component)
A clickable summary card (`button`, `rounded-xl3 border bg-surface shadow-card hover:-translate-y-0.5`) showing:
- **Name** (asset/system name).
- **Sublabel:** `fuel/system-type · BU · end-use` — combustion: `${FUELS[a.fuelType].label} · ${a.category}${endUse ? " · " + endUse.label : ""}`; refrigerant: `${SYSTEM_TYPE_LABELS[sys.systemType]}${cls ? " · " + cls.label : ""}` (BU is the Collapsible group, so optional in the sublabel).
- **Abatement** (−X t) on the right, computed via `applyAssetActions(a, acts, assumptions)` (`scope1AbatementT + fuelAbatementT`) or `refrigerantCO2e − applyRefrigerant(...)` — reuse the same logic already in `segStats`; show `—` / `No plan yet` when `acts` is absent.
- **Active levers** count (e.g. "1 lever on") and a chevron.
- Excluded badge when `excluded`.
- `endUse = endUseProfile(a)`, `cls = refrigClassProfile(sys)`.

## SourceScenarioScreen (new component)

Renders ONE source's full scenario:
- Back button "← Back to {segment label}".
- Combustion: `<AssetActionCard asset={a} />`; refrigerant: `<SystemActionCard system={sys} />` (these already contain the themed-ish header + all levers + warnings — unchanged except the header tweak below). If `sourceId` no longer resolves to an asset/system, fall back to `onBack()`.
- `<AssumptionsCard seg={seg} />` below the card.

### Header tweak — surface the end-use
- `AssetActionCard`: append the end-use to its meta line — after `${asset.unitCount} vehicles · volume/yr`, add ` · ${endUseProfile(asset)?.label}` when present, so the vehicle/equipment type from Data Input is visible on the scenario screen. (The lever defaults already come from this end-use.)
- `SystemActionCard`: append `${refrigClassProfile(system)?.label}` to its meta line when present.
- (Import `refrigClassProfile` from `@/lib/model/refrigerant-class`; `endUseProfile` is already imported.)

## Non-goals

- No change to scenario math/store, lever behavior, KPIs, save/scenario, or the home/results panel.
- Scope 1 only; Scope 2, Action plan, Compare, Data input untouched.
- No change to how end-use feeds defaults (already done) — this only *surfaces* it.

## Testing

- Existing model/scenario tests stay green.
- Update `components/tabs/__tests__/builder-grouping.test.tsx`: after clicking a segment, the screen now shows **source boxes** (not expanded levers); the BU-group assertions still hold (boxes are grouped by BU); to reach the lever cards / the electrify feasibility ⚠ hint, the test must now also click the source box to open its scenario screen, then assert. Keep the home assertions.
- Add a light assertion: a mobile source box shows its end-use label (e.g. "Truck") when set; clicking it opens the scenario with the levers.

## Files touched

- `components/tabs/BuilderTab.tsx` — extend `view` nav; rewrite `SegmentScreen` to render `SourceBox` list; add `SourceBox` + `SourceScenarioScreen`; append end-use/equipment-class to `AssetActionCard`/`SystemActionCard` meta; import `refrigClassProfile`.
- `components/tabs/__tests__/builder-grouping.test.tsx` — update navigation (segment → box → scenario) + add end-use box assertion.
