# Compare & Track — Decision View + Scenario Management (Design)

**Date:** 2026-06-11
**Goal:** Make the Compare & Track tab answer "which plan should we pick?" directly — every scenario's pathway on one chart, a verdict strip naming the winners, and safe, complete scenario management (confirm-delete, rename, duplicate, load, what-differs-vs-live).
**App:** `scope1-decarb` (Next.js 16.2.9, React 19, Recharts 3, Vitest). All work on `master`.

## Non-goals (declined or deferred)

- No delta-valued table cells and no lever-mix stacked bars.
- Target tracking stays live-scenario-only.
- Export workbook unchanged.
- No scenario notes/description field.

## 1. New pure module: `lib/compare.ts`

All comparison logic lives here, unit-tested, zero React/DOM.

### 1.1 Verdict

```ts
export interface VerdictInput {
  id: string;
  name: string;
  kpis: { yearsToTarget: number | null; costPerTonne: number; totalCapex: number };
}

export interface Verdict {
  /** null when fewer than 2 columns (nothing to compare). */
  earliestToTarget: { name: string; year: number } | null; // lowest yearsToTarget; ties → lower costPerTonne
  cheapest: { name: string; costPerTonne: number };        // lowest costPerTonne
  lowestCapex: { name: string; totalCapex: number };       // lowest totalCapex
  /** true when NO column reaches the target by 2050; earliestToTarget is then null. */
  noneReachTarget: boolean;
}

export function buildVerdict(cols: VerdictInput[]): Verdict | null; // null when cols.length < 2
```

Rules: `earliestToTarget` considers only columns with `yearsToTarget !== null`; if none qualify, `noneReachTarget = true` and `earliestToTarget = null`. Ties on year break by lower `costPerTonne`; remaining ties keep the first column (stable). `cheapest`/`lowestCapex` consider all columns.

### 1.2 Settings diff

```ts
export interface SettingsDiff {
  label: string;   // "Diesel fleet · EVs", "Cold storage plant · Gas transition", "Grid emission factor"
  from: string;    // human-formatted live value, e.g. "3", "60%", "0.71"
  to: string;      // scenario value
  kind: "plain" | "money"; // "money" for CAPEX/tariff/price/REC/carbon fields — the UI applies fmtMoney to those
}

export function diffSettings(
  live: LeverSettings, other: LeverSettings,
  assets: CombustionAsset[], systems: RefrigerationSystem[],
): SettingsDiff[];
```

Coverage and formatting:

- **Per-asset (`byAsset`)** — for each asset id present in either side (named via the assets list, `"<id> [unresolved]"` fallback): electrify fields (`enabled` → "on"/"off", `unitsToConvert` → "EVs", `capacityPct` → "Electrify %", `cop`, `tariffPerKwh`, `assetCapex`, `startYear`, `targetYear`) and fuel-switch fields (`enabled`, `altFuel` (label), `blendPct` → "Blend %", `efficiencyPenaltyPct`, `altFuelPricePerUnit`, `retrofitCapex`, `startYear`, `targetYear`).
- **Per-system (`bySystem`)** — gasSwitch fields (`enabled`, `transitionPct` → "Gas transition %", `altRefrigerant` (label), `retrofitCapex`, `startYear`, `targetYear`) and leakFix fields (`enabled`, `leakImprovementPct` → "Leak improvement %", `startYear`, `targetYear`).
- **Assumptions** — all five `GlobalAssumptions` fields with friendly labels (Grid emission factor, Renewable sourcing %, REC cost, Carbon price, Infrastructure CAPEX).
- An entry missing on one side entirely is reported as a single diff `"<name> · plan"` from "—" to "added" (or vice versa) rather than field-by-field noise.
- Values formatted plainly (numbers via `String`, percent suffix where the label implies it); money fields carry `kind: "money"` with raw number strings so the UI can apply `fmtMoney` (see §4.4).
- Output order: assets (in `assets` order), then systems (in `systems` order), then assumptions. Deterministic.

## 2. Pathways overlay chart

New `components/charts/PathwayOverlay.tsx`:

- Recharts `LineChart` inside `ResponsiveContainer` (with `initialDimension`, `useMounted` skeleton — same conventions as `WedgeChart`).
- Props: `cols: { id: string; name: string; current?: boolean; trajectory: TrajectoryRow[] }[]`. The first col is always "Current (live)".
- Data rows merged by year: `{ year, bau, target, [colId]: net }` — `bau`/`target` taken from the live column (identical across columns by construction: same inventory + base year).
- Lines: BAU dashed `#9AA9A1` (1.6px), target dashed `#2E5E8C` (1.8px), live net solid `#1F9E5A` 3px, each saved scenario solid 2px from a scenario palette:

```ts
export const SCENARIO_COLORS = ["#2E5E8C", "#5C6BC0", "#D9774B", "#7FA05A", "#8E7CC3", "#0F7873"];
```

(cycled with modulo when more than 6 scenarios). No animation (`isAnimationActive={false}`), tooltip listing each column's net for the hovered year (scenario name + value via `fmt`), legend as a flat chip row under the chart (same pattern as WedgeChart's custom legend — name + line swatch).
- Wrapper div `h-[300px]`, `role="img"`, descriptive `aria-label`.
- Rendered in CompareTab inside a Card titled "Pathways compared" (subtitle "Every scenario's net Scope 1 line against BAU and the SBTi target"), placed between the side-by-side table Card and the TargetTracking section. Hidden when no saved scenarios exist (the live line alone adds nothing over the Action plan's wedge chart).

## 3. Verdict strip (CompareTab)

- Rendered directly under the save card when `scenarios.length >= 1` (i.e. `buildVerdict` returns non-null for live + saved columns).
- A slim Card with up to three inline chips:
  - **Earliest to target:** `{name} ({year})` — or, when `noneReachTarget`, the amber text "No scenario reaches the SBTi line by 2050".
  - **Cheapest:** `{name} ({CURRENCY}{fmt(costPerTonne)}/t)`
  - **Lowest CAPEX:** `{name} ({fmtMoney(totalCapex)})`
- Pure rendering of `buildVerdict` output — no math in the component. Trophy/medal-style small icons optional; text-first.

## 4. Scenario management

### 4.1 Store (`lib/store.tsx`)

```ts
renameScenario: (id: string, name: string) => void;   // trims; ignores empty
duplicateScenario: (id: string) => void;              // new uniqueId("sc"), name "<old> (copy)", savedAt Date.now(), deep-copied settings
```

Both added to `StoreShape` and the provider value. `deleteScenario` unchanged.

### 4.2 Compare column headers (CompareTab)

Saved-scenario header cells gain a small action row next to the name: **Load** (upload icon → `setSettings(() => s.settings)`, same semantics as the Builder's Load), **Rename** (pencil → name becomes an inline `<input>`; Enter/blur saves via `renameScenario`, Escape cancels), **Duplicate** (copy icon), **Delete** with inline two-step confirm: first click swaps the trash icon for "Delete?" + confirm (check) / cancel (x) buttons; any other interaction or pressing Escape cancels. No `window.confirm` (browser dialogs are banned in this app's automation environment).

### 4.3 Builder saved list (BuilderTab)

The same two-step delete confirm replaces the bare trash button there (extract a small shared `ConfirmDelete` component into `components/ui/ConfirmDelete.tsx` used by both tabs). Rename/duplicate stay Compare-only (YAGNI — the Builder list is a quick-access list).

### 4.4 "What differs vs live" (small-multiple cards)

Each saved scenario's card (below the progress bar / lever-cost list) shows a collapsed disclosure line: **"{n} changes vs live"** (or "identical to live" when the diff is empty). Expanding lists up to 8 `SettingsDiff` rows as "label: from → to" (rows with `kind: "money"` render both values through `fmtMoney`), with "+k more" when truncated. Keyboard-accessible disclosure (a real `<button>` with `aria-expanded`).

### 4.5 Small-multiple cards lose their sparkline

`Sparkline` is removed from the cards (and its dead code deleted) — the overlay chart replaces it. Cards keep: name + on-track badge, 2030 progress bar, per-lever cost list, and gain the diff disclosure.

## 5. Testing

- `lib/__tests__/compare.test.ts`: verdict — fewer than 2 cols → null; clear winner; tie on year broken by cost/t; none reach target → flag set and earliest null; cheapest/lowestCapex independent of target status. diffSettings — identical settings → empty; single field change formats "from → to" correctly for an asset, a system, and an assumption; entry added/removed → single "plan" diff; deterministic order; unresolved asset id falls back.
- Store: rename trims and ignores empty; duplicate creates a new id, "(copy)" name, fresh timestamp, and a deep copy (mutating the duplicate's settings must not touch the original).
- All existing suites stay green. Manual: overlay legend/tooltip with 2 saved scenarios; rename/duplicate/load/delete-confirm flows; diff disclosure content matches an intentional change.

## 6. Build order

1. `lib/compare.ts` (verdict + diff) with tests.
2. Store: rename/duplicate (+ tests via pure behaviors where practical).
3. `PathwayOverlay` chart + CompareTab placement; remove Sparkline.
4. Verdict strip.
5. Management UI: ConfirmDelete component, header actions, diff disclosure.
6. Verification: gates + browser pass (overlay with 2 scenarios, all management flows, a11y of disclosure/confirm).
