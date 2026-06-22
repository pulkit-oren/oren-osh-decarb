# Per-System Refrigerant Modeller (Design)

**Date:** 2026-06-11
**Goal:** Bring the refrigerant lever to parity with the per-asset Mobile/Stationary modellers: each cooling system gets its own card with two independently planned actions (Switch gas | Fix leaks), an impact bar, GWP context, and inline advice — replacing the single global refrigerant config.
**App:** `scope1-decarb` (Next.js 16.2.9, React 19, Tailwind 4, Vitest). All work on `master`.

## Non-goals

- No change to the leak/fugitive physics in `applyRefrigerant` (lib/model/levers.ts).
- No pricing of the *new* gas's top-ups: gas savings continue to come only from leak improvement at the system's current `gasCostPerKg`.
- No per-action wedges in the wedge chart — the trajectory keeps one "Refrigerant" wedge.
- The Refrigerant Advisor tab is untouched (it remains the deep-dive reference).

## 1. Data model (lib/model/types.ts)

Remove `RefrigerantCfg`. Add:

```ts
export interface GasSwitchAction {
  enabled: boolean;
  transitionPct: number;        // 0..100, share of this system's charge moved
  altRefrigerant: RefrigerantId;
  retrofitCapex: number;
  startYear: number;
  targetYear: number;
}

export interface LeakFixAction {
  enabled: boolean;
  leakImprovementPct: number;   // 0..80, reduction in leak rate
  startYear: number;
  targetYear: number;
}

export interface SystemActions {
  gasSwitch: GasSwitchAction;
  leakFix: LeakFixAction;
}
```

`LeverSettings` becomes:

```ts
export interface LeverSettings {
  byAsset: Record<string, AssetActions>;
  bySystem: Record<string, SystemActions>;  // keyed by RefrigerationSystem id
  assumptions: GlobalAssumptions;
}
```

System ids persist across fiscal years (same rule as combustion assets), so a plan follows its system.

## 2. Factor library additions (lib/model/factors.ts)

```ts
/** Sensible low-GWP swap per system type, surfaced as a one-click suggestion. */
export const RECOMMENDED_ALT_BY_SYSTEM: Record<RefrigerationSystem["systemType"], RefrigerantId> = {
  industrialColdStorage: "R717", // ammonia — best efficiency, industrial-only
  commercialHVAC: "R454B",       // leading R-410A replacement, A2L
  retailRefrigeration: "R290",   // propane — charge limits suit small systems
};
```

## 3. Defaults (lib/model/segments.ts + lib/defaults.ts)

- `defaultSystemActions(sys: RefrigerationSystem): SystemActions` — both actions disabled; `altRefrigerant` defaults to `RECOMMENDED_ALT_BY_SYSTEM[sys.systemType]`; gasSwitch 2026→2030, leakFix 2026→2028; transition 60, leak improvement 50, capex 0. (Mirrors `defaultActions` for combustion.)
- `DEFAULT_SETTINGS.bySystem` replaces `DEFAULT_SETTINGS.refrigerant`, preserving the old default story (60% transition, 50% leak improvement, ₹12M total capex):
  - `cold` (Cold storage plant, R-404A): gasSwitch enabled → R717, 60%, capex ₹8M, 2026→2029; leakFix enabled, 50%, 2026→2028.
  - `hvac` (Office HVAC, R-410A): gasSwitch enabled → R454B, 60%, capex ₹4M, 2026→2029; leakFix enabled, 50%, 2026→2028.

## 4. Compute (lib/model/index.ts)

Replace the global refrigerant block with a per-system loop. For each system with actions:

- Effective config for `applyRefrigerant`: `transitionPct = gasSwitch.enabled ? value : 0`; `leakImprovementPct = leakFix.enabled ? value : 0`.
- **Attribution** (leak-fix first — operational before capital, per the spec's stacking philosophy):
  - `abateLeak = base − fugitive(leakOnly)`
  - `abateGas  = fugitive(leakOnly) − fugitive(both)`  (the increment)
- Accumulate: `refAbateLeak`, `refAbateGas`, `refCapex` (Σ gasSwitch.retrofitCapex of enabled switches), `refGasSavingOpex` (leak savings at each system's `gasCostPerKg`), and ramp bounds `refStart = min(startYear)`, `refEnd = max(targetYear)` over enabled actions (fallback `mkRamp` default when none).
- The lever roll-up keeps ONE "refrigerant" `LeverSummary` and ONE wedge with the aggregated abatement and the min→max ramp (same pattern as electrification's roll-up). `opexParts` unchanged in shape: gas top-up savings + carbon-price value.
- **Segments** split: `{ key: "ref-leak", label: "Refrigerant · Leak fix" }` and `{ key: "ref-gas", label: "Refrigerant · Gas switch" }` (colour indices 1 and 0), each filtered out when zero.

`ComputeResult` shape is otherwise unchanged.

## 5. Migration (lib/store-helpers.ts)

Pure, tested `migrateSettings(raw: unknown, systems: RefrigerationSystem[]): LeverSettings`:

- If the object already has `bySystem`, pass through (filling any missing system ids with `defaultSystemActions`).
- If it has the legacy `refrigerant` global config: build `bySystem` by giving every system the global `transitionPct`, `altRefrigerant`, `leakImprovementPct`; both actions `enabled = legacy.enabled`; `startYear = legacy.startYear`; `targetYear = legacy.startYear + max(0, legacy.rampYears − 1)`; `retrofitCapex` split across systems **pro-rata by chargeKg** (last system takes the rounding remainder).
- Applied in `load()` to the persisted settings AND to every saved scenario's settings. localStorage key stays `osh-scope1-planner-v4`; the migrated shape is written back on the next persist.

## 6. Store (lib/store.tsx)

- `addRefrigeration` seeds `settings.bySystem[id] = defaultSystemActions(line)` (same ref-handoff pattern as `addCombustion`).
- `copyRefrigeration` seeds missing `bySystem` entries for copied systems.
- New `updateSystemAction(systemId, lever: "gasSwitch" | "leakFix", patch)` mirroring `updateAction`.
- `resetSettings` resets to the new defaults.

## 7. Builder UI (components/tabs/BuilderTab.tsx)

The refrigerant segment renders the preset row (now applying to **all** systems) followed by one `SystemActionCard` per system in the base year:

- **Header**: Snowflake icon, system name, type label, `chargeKg` kg charge, current gas chip "R-404A · GWP 3,922" with an **era badge** (legacy = amber, current = neutral, future = green), and the same `ImpactBar` (baseline `refrigerantCO2e(sys)` → after both actions).
- **Two columns via the existing `ActionRow` layout** (Switch gas | Fix leaks, vertical divider, stacking below `lg`):
  - **Switch gas**: alternative-gas `<select>` (grouped by era, GWP in label); a live **GWP-delta pill** ("−99.9% GWP vs R-404A"); the factor's `note` as a one-line safety hint under the select; a **"Suggested: R-717" chip** (from `RECOMMENDED_ALT_BY_SYSTEM`) that applies it on click, hidden when already selected; transition % slider; target year. Advanced: retrofit CAPEX, start year.
  - **Fix leaks**: leak-improvement slider with computed readout "15%/yr → 7.5%/yr"; annual gas-top-up saving in ₹ (`leakedNow − leakedAfter` × gasCostPerKg, via `fmtMoney`); target year. Advanced: start year. Amber advisory (same style as `LifespanWarning`) when improvement > 70%: "Very ambitious — sustained leak reduction above 70% needs continuous monitoring and rapid repair."
- Presets map to per-system patches: *Leak fix only* (gasSwitch off, leakFix on 40%), *Balanced* (60% / 50%), *Full retrofit* (100% / 70%).
- The segment chip count (`activeCount("refrigerant")`) becomes the number of systems with either action enabled.
- The carbon-price note and `AssumptionsCard` behaviour are unchanged.

## 8. Action plan (components/tabs/ActionPlanTab.tsx)

"What this plan does" lists exactly one line per system that has at least one enabled action, e.g. "Cold storage plant — 60% → R-717, leak −50%". The detail text is composed from whichever actions are enabled (gas-switch part, leak part, or both joined with ", "); the tonnes figure is that system's total abatement (both actions combined).

## 9. Export (lib/export.ts)

`scenarioSheet(settings, assets, systems)` — signature gains `systems`. The 7 legacy global refrigerant rows are replaced by per-system rows:

- `[systemName, "Switch gas", field, value]` for: Enabled, Transition %, Alternative gas (label), Retrofit CAPEX, Start year, Target year
- `[systemName, "Fix leaks", field, value]` for: Enabled, Leak improvement %, Start year, Target year

`buildWorkbookSheets` args gain `systems`; the Topbar passes `baseSystems`. Trajectory/KPIs sheets are unchanged (they read `ComputeResult`).

## 10. Testing

- `compute`: leak-first attribution (leak-only, gas-only, both — increments sum to total); capex aggregation only from enabled switches; segments split; ramp bounds = min start/max target; defaults parity (total refrigerant abatement with new defaults ≈ old default story).
- `migrateSettings`: legacy shape → per-system (values copied, capex pro-rata by charge, target year from rampYears); already-new shape passes through; missing systems get defaults.
- `export`: scenario sheet contains per-system Switch gas / Fix leaks rows.
- All existing suites stay green (those referencing `settings.refrigerant` are updated to the new shape).
- Manual: presets fan out to all systems; GWP pill and suggestion chip react to the select; saved pre-migration scenarios still load and compare.

## 11. Build order

1. Types + factors + defaults + `defaultSystemActions` (compile-breaking core, fixed forward).
2. Compute per-system loop + attribution + segments (tests).
3. Migration helper (tests) + store wiring.
4. Builder UI per-system cards.
5. Action plan lines + export scenario sheet (tests).
6. Verification pass (vitest, lint, build, browser screenshots).
