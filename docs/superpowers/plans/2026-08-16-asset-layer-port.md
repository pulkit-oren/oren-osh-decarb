# Asset Layer — Port to oren-osh-decarb — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put real assets beneath the Scope 1 fuel entry in this app, so scenario levers can act per asset instead of on a homogeneous block — and ship it usable, with an asset editor, rather than as a hidden mode.

**Architecture:** An entry's `annualVolume` is distributed across assets in a registry; a resolver expands one entry into one row per allocated asset plus a remainder row, so the rows always sum back to the entry and reported emissions never move. Resolved rows carry `sourceEntryId` from the first commit so per-entry consumers keep working.

**Tech Stack:** Next.js 16.2.9, React 19.2.4, TypeScript 5, Vitest 4.1.8, Tailwind 4.

## Provenance

This is a port. Slice 1 was built and merged in a *different* repo (`scope1-decarb`, `Documents/Dashboard Module/scenario/scope1-decarb`) against an architecture this repo does not share — that app had a `total | byBU` allocation map and a `CombustionEditor`; this one tags each entry with a single `bu?: string` and edits entries through `components/tabs/activity/`.

Already done here, in commit `94d1980`: `lib/assets/types.ts`, `helpers.ts` and `allocate.ts` with 45 tests, ported verbatim. They depend on nothing architectural. **Do not rewrite them.** They carry numeric hardening that took two review rounds to get right there:

- weights coerced to finite non-negative before summing, and a `default` branch in `weightFor` so an out-of-union `WeightAttribute` from persisted JSON cannot make the sum `NaN` (a `NaN` sum passes a `sum <= 0` guard, because every comparison with `NaN` is false);
- `total` sanitised before rounding, so a non-numeric persisted `annualVolume` cannot `NaN` the whole company;
- the distributed remainder clamped at 0, because earlier elements rounding up made the last one negative (`distribute(0.05, [1×10, 0])` returned `-0.05`);
- `distribute` sums to the total **rounded to 2dp**, and its docstring says exactly that rather than claiming an exactness the clamp breaks.

`resolve.ts` was deliberately NOT ported — it emits rows in a `byBU` shape this repo has no concept of.

## Global Constraints

- **Test command `npm test`.** Baseline entering this plan: **511 passed / 1 skipped across 91 files** (466/89 before the core port). The total GROWS as tasks add suites — never treat any absolute total as the expected number. The invariant is that all pre-existing tests stay green.
- **Zero edits to any pre-existing test file.** A test authored by an earlier task in THIS plan is yours to adjust; anything that existed before is frozen.
- **Lint has 3 pre-existing errors and 22 warnings** (`Shell.tsx` setState-in-effect ×2, an `any` in `lib/model/__tests__/suggestions.test.ts`). They reproduce on a clean checkout. Do not fix them, and do not let the count grow.
- **Verification gates for every task:** `npx tsc --noEmit` (must produce NO output), `npm test`, `npm run lint`, and `npm run build` for any task touching the app tree. A green suite does NOT imply a clean typecheck — vitest transpiles without typechecking.
- **Do not change any storage key.** `osh-scope1-planner-v4`, `osh-companies-v1`, `osh-goals-v1`, `osh-esg-v1`, `osh-scope2-planner-v1`. The loader returns `null` for an unrecognised key, so bumping one discards user data.
- `lib/assets/` must not import from `lib/scope2`, `lib/goals` or `lib/esg`. Importing `CombustionAsset` as a type from `lib/model/types` and `uniqueId` from `lib/store-helpers` is expected.

## Consumer inventory — the real size of this job

In the source repo these were missed until the final review and caused silently wrong per-entry numbers while headline totals stayed correct. An exhaustive grep here (`perCombustion|baseAssets|selectedAssets`, production code only) finds **10 consumer files, ~51 references**, plus the two producers:

| File | Refs | Treatment |
|---|---|---|
| `components/tabs/BuilderTab.tsx` | 21 | **mixed** — `segStats`, `buildPathways`, `suggestAllSettings` compute levers → RESOLVED; name lookups and the editor at :519-541 → RAW |
| `components/tabs/DataInputTab.tsx` | 8 | **mixed** — the `co2eOf` lookup at :48 → roll up by `sourceEntryId`; the editable row list → RAW |
| `components/tabs/ActivityDataTab.tsx` | 7 | **RAW** — counts, per-source cards and `combById` are entry-level; a user counts entries, not assets |
| `components/tabs/CeoOverviewTab.tsx` | 3 | **roll up** — `perCombustion.find(p => p.id === a.id)` feeds a grade, so a wrong value is invisible |
| `components/tabs/ScenarioCalcPanel.tsx` | 3 | **RESOLVED** — shows the engine's own working, so it must match the engine |
| `components/tabs/ActionPlanTab.tsx` | 2 | **RESOLVED** — computes per-asset abatement and attributes it by `bu` |
| `components/tabs/CompareTab.tsx` | 2 | **RESOLVED** — compares saved scenarios against live; mixing lists makes the table non-comparable |
| `components/tabs/CombinedCompare.tsx` | 2 | **RESOLVED** — same reason |
| `components/tabs/activity/ScopeScreen.tsx` | 2 | **RAW** — lists entries for editing |
| `components/tabs/BalanceTab.tsx` | 1 | **RESOLVED** — an energy balance that must agree with the engine |
| `lib/model/baseline.ts` | 4 | producer — gains `sourceEntryId` (Task 5) |
| `lib/store.tsx` | 7 | producer — gains the resolved memos (Task 4) |

**The classification rule.** Three categories, and picking wrongly is silent either way:

1. **Computes levers or emissions** → must consume the SAME list the engine consumes (`resolvedBaseAssets` / `resolvedSelectedAssets`). Anything else diverges from the dashboard, by up to 2× where a lever applies to a full volume instead of a share.
2. **Looks up one entry's emissions** → must sum ALL resolved rows whose `sourceEntryId` matches, never `.find()` by id. Resolution re-keys rows to asset ids, so a `.find()` silently returns one share or nothing.
3. **Displays, counts or edits entries** → must stay on RAW entries. The user edits and counts what they typed; showing them asset rows here would be a different bug.

A file having no diff is evidence it was not updated, not evidence it did not need to be. Task 5 begins by re-running the grep and recording a decision for every reference, so none is skipped by omission.

---

## Task 1 — `resolve.ts`, re-derived for this repo

**Files:** create `lib/assets/resolve.ts`, `lib/assets/__tests__/resolve.test.ts`

**Interfaces produced:** `UNALLOCATED_SUFFIX`, `isUnallocatedId(id)`, `resolveAssets(entries: CombustionAsset[], registry: AssetRegistry): CombustionAsset[]`

Simpler than the original, because this repo has no allocation map. For a `byAsset` entry, emit one row per allocated asset:

- `id` = the ASSET id (this is what re-keys levers)
- `sourceEntryId` = the parent entry's id — **on every emitted row, including the remainder**
- `name` from the asset; `fuelType`, `unit`, `year`, `category` carried down from the entry
- `bu` = the asset's `buId` when set, else the entry's own `bu` (do not invent a value)
- `annualVolume` = that asset's clamped share
- `opex`, `unitCount`, `remainingLife` from the asset, where the asset has them

Order of operations, so the invariant holds by construction rather than by assumption:

1. build the known-asset map first, filtering to registry-present ids and skipping `electrical` assets;
2. sanitise each volume to finite and non-negative;
3. run it through `clampAllocation(entry.annualVolume, known)` — import it, do not re-implement;
4. emit rows from the CLAMPED values, and compute the remainder from the same clamped map.

Entries whose mode is not `byAsset` pass through by reference (`out.push(e)`), which is what preserves existing behaviour exactly.

Scale the entry's `opex` onto the remainder row by the remainder's share of `annualVolume`, guarding division by zero — otherwise total spend double-counts.

- [ ] **Step 1: write the failing test** covering, at minimum: full / partial / zero allocation; an id absent from the registry; an `electrical` asset; over-allocation; `NaN`, negative and non-numeric volumes; `annualVolume: 0`. Every case asserts the emitted rows sum to exactly the entry's `annualVolume`. Also assert `sourceEntryId` is present on every row including the remainder, and that a non-`byAsset` entry is returned by reference.
- [ ] **Step 2: run it and watch it fail** — `npx vitest run lib/assets/__tests__/resolve.test.ts`
- [ ] **Step 3: implement** per the contract above.
- [ ] **Step 4: run the gates** — `npx tsc --noEmit`, the file's suite, `npm test`. Paste real output into the report.
- [ ] **Step 5: commit.**

---

## Task 2 — entry fields and migration

**Files:** modify `lib/model/types.ts`, `lib/store-helpers.ts`; create `lib/assets/__tests__/migrate-assets.test.ts`

Add to `CombustionAsset`, all OPTIONAL so no existing construction site breaks:
`allocationMode?: "entry" | "byAsset"`, `assetAllocations?: Record<string, { volume: number }>`, `allocationBasis?`, `weightAttribute?` (the last two referenced via inline `import("@/lib/assets/types").X` so this widely-imported file gains no load-order dependency), and `sourceEntryId?: string`.

Add `migrateAssets(combustion, existing): AssetRegistry` to `lib/store-helpers.ts`, mirroring the idempotent style of the migrations already in that file. It mints one asset per entry **reusing the entry's id**, which is what keeps saved scenario levers resolving with no lever migration.

It runs on every hydration against unvalidated `localStorage`, so it must never throw. Guard all of: a registry whose `assets` is not an array; a year value that is not an array; a `null` or non-object entry; an entry with no usable string id (skip it — do NOT mint a fresh id, which would silently break the id-reuse guarantee); and missing `name`/`category`.

- [ ] **Step 1: write the failing test** — id reuse, first-occurrence-wins dedupe across years, idempotence, user edits surviving re-migration, entries never mutated, and each malformed shape above handled without throwing.
- [ ] **Step 2: run it and watch it fail.**
- [ ] **Step 3: implement.**
- [ ] **Step 4: gates.** The full suite must stay green with no existing test edited — proof the change is additive.
- [ ] **Step 5: commit.**

---

## Task 3 — registry store and provider

**Files:** create `lib/assets/store.tsx`

`AssetProvider` / `useAssets` / `useAssetsOptional`, modelled on this repo's existing provider pattern — read `lib/goals/store.tsx` first and follow it.

- Per-company `storageKey`; hydrate once on mount; persist on change behind a `hydrated` flag so the persist effect cannot overwrite a real registry with the pre-hydration default.
- `useAssetsOptional()` returns a **module-level constant** empty registry when there is no provider — a fresh object literal per call defeats every downstream memo.
- **`removeUnit` must validate BEFORE entering the state updater.** Throwing from inside a `setState` updater does not reach the caller's `try/catch` — React's eager-reducer path swallows it and re-raises during render. This was confirmed empirically in the source repo (a probe logged `ESCAPED-TO-RENDER`). Keep the pure helper's guard as defence in depth.

- [ ] **Step 1: write the failing test** — mount the provider, `removeUnit` on a referenced asset is caught synchronously by the caller and removes nothing; the unreferenced case removes and throws nothing.
- [ ] **Step 2: run it and watch it fail.**
- [ ] **Step 3: implement.**
- [ ] **Step 4: gates**, including `npm run lint` since this is a hooks file.
- [ ] **Step 5: commit.**

---

## Task 4 — wire resolution into the store and mount the provider

**Files:** modify `lib/store.tsx`, `components/Shell.tsx`

- Add `resolvedBaseAssets` / `resolvedSelectedAssets` memos built from `resolveAssets` and a registry memo from `useAssetsOptional()`. Expose both on `StoreShape`.
- Switch the `compute(...)` and `baselineScope1(...)` memos to the resolved lists, updating dependency arrays. Leave `baseAssets` / `selectedAssets` unchanged — editors bind to raw entries so the user keeps editing what they typed; only the engine sees resolved rows.
- Mint default lever actions for newly resolved asset ids, skipping `isUnallocatedId` pseudo-assets — a remainder row must never get a lever.
- Mount `AssetProvider` in `Shell.tsx` **wrapping `ScenarioProvider`**, keyed per company exactly like its siblings (`key={`assets-${activeId}`}`). The React key is load-bearing: hydration is `[]`-dep while persist depends on `storageKey`, so without a changing key a company switch writes the previous company's registry into the new company's slot.

`ScenarioProvider` must use `useAssetsOptional()`, not `useAssets()` — any pre-existing test that mounts it standalone would otherwise throw, and those tests are frozen.

- [ ] **Step 1: check how many existing tests mount `ScenarioProvider` without an AssetProvider** — `grep -rl "ScenarioProvider" --include=*.test.tsx` — and record the number in the report; it justifies the optional accessor.
- [ ] **Step 2: implement the store memos and the Shell mount.**
- [ ] **Step 3: add a wiring test** asserting an allocated entry's total emissions equal the same entry unallocated, that rows are keyed by asset id, and that a `byAsset` entry resolves to MORE than one row — the last assertion is what a regression reverting to raw entries could never satisfy.
- [ ] **Step 4: gates** including `npm run build`.
- [ ] **Step 5: commit.**

---

## Task 5 — `sourceEntryId` on `perCombustion`, and the roll-up consumers

**Files:** modify `lib/model/baseline.ts`, `components/tabs/DataInputTab.tsx`, `components/tabs/CeoOverviewTab.tsx`

`perCombustion` is built in `lib/model/baseline.ts`, so it must carry `sourceEntryId` for consumers to key off. Add it with an `?? a.id` fallback, which reproduces today's `.find(p => p.id === a.id)` semantics exactly for any row that never passed through the resolver — that fallback is what keeps every existing test and direct caller correct.

Then fix the two category-2 consumers: replace `.find()` by entry id with a sum over all rows whose `sourceEntryId` matches.

- [ ] **Step 1: re-run the inventory** — `grep -rn "perCombustion\|baseAssets\|selectedAssets" --include=*.tsx --include=*.ts lib components app | grep -v __tests__` — and record in the report a category (1 resolved / 2 roll-up / 3 raw) for EVERY reference, against the plan's table. Report any reference the table does not cover; do not silently absorb it.
- [ ] **Step 2: write the failing test** — a part-allocated entry's per-entry roll-up equals its full unallocated emissions.
- [ ] **Step 3: add `sourceEntryId` to `perCombustion` with the `?? a.id` fallback.**
- [ ] **Step 4: rewire `DataInputTab.tsx:48` and `CeoOverviewTab.tsx:20`.**
- [ ] **Step 5: gates** including build. **Step 6: commit.**

---

## Task 6 — point the lever-computing consumers at resolved rows

**Files:** modify `components/tabs/ActionPlanTab.tsx`, `CompareTab.tsx`, `CombinedCompare.tsx`, `BalanceTab.tsx`, `ScenarioCalcPanel.tsx`

All category 1. Each currently destructures `baseAssets` from `useScenario()` and computes levers or an energy balance on it, while the dashboard's `result` uses the resolved list — so they disagree with the dashboard by up to 2× wherever a lever applies to a full volume rather than a share. `CompareTab` is the worst case, because it puts the live column and saved-scenario columns in one table.

Switch each to `resolvedBaseAssets`. Read each file first and change only the asset-list argument — do not restructure.

- [ ] **Step 1: for each file, quote in the report the line you changed and confirm no other `baseAssets` reference remains** that should have been switched.
- [ ] **Step 2: implement.**
- [ ] **Step 3: gates** including build. **Step 4: commit.**

---

## Task 7 — BuilderTab

**Files:** modify `components/tabs/BuilderTab.tsx`

Its own task because it holds 21 of the ~51 references and is genuinely mixed. `segStats`, `buildPathways` and `suggestAllSettings` compute levers and must take resolved rows; the name lookup at :247 and the source editor at :519-541 operate on entries the user edits and must stay raw.

- [ ] **Step 1: list all 21 references in the report** with a category for each BEFORE changing anything, and flag any you are unsure about rather than guessing.
- [ ] **Step 2: implement**, category 1 references only.
- [ ] **Step 3: gates** including build. **Step 4: commit.**

---

## Task 8 — asset registry editor

**Files:** create `components/assets/AssetRegistryEditor.tsx` and its test

This task exists because of a phasing mistake in the source repo: the allocation UI shipped in one slice and the editor that makes it usable in the next, so the mode was selectable but unusable and its only multi-asset path crossed levers between entries. **A slice either owns the whole user path or hides the door.**

Add / edit / remove assets, following whatever drawer or panel convention this repo already uses (read `components/tabs/activity/SourceListScreen.tsx` first). Deleting an asset referenced by any entry's `assetAllocations` must be blocked with a visible inline message — which is what Task 3's synchronous-throw fix makes possible.

- [ ] **Step 1: write the failing test** — lists assets, adds one, blocks a referenced delete with a visible error, and shows edit controls for a selected asset.
- [ ] **Step 2–4: run, implement, gates.** **Step 5: commit.**

---

## Task 9 — the allocation panel and its entry point

**Files:** create `components/assets/AssetAllocationPanel.tsx`; modify the entry editor under `components/tabs/activity/`

The panel takes primitives — `total`, `unit`, `assets`, `allocations`, `basis`, `weightAttribute`, `previous`, `onChange` — so it stays presentational and testable. Requirements learned the hard way:

- **Filter the asset list** to non-`electrical` assets in the entry's business unit. An unfiltered list lets a user allocate onto assets the resolver silently drops, so the panel says "Unallocated 0" while the engine reports the volume as unallocated.
- **`carryForward` must actually receive `previous`.** Without it, `computeAllocation` falls back to even weighting and the option silently produces byte-identical output to "Even" — a control that lies. The prior-year figures must be looked up by whichever component already holds the store, and passed in as a prop; do not reach into the store from the panel.
- **Clamp and warn.** Over-allocation is rescaled proportionally by `clampAllocation`; the UI must say so rather than silently rewriting every other row.
- **Give the user a way to recompute.** A computed basis goes stale when the entry total changes, and re-selecting an already-selected `<option>` fires no `onChange` — so add an explicit "Redistribute" action.
- Format volumes with whatever helper the rest of this app uses, so the unallocated readout matches its neighbours.
- Partial allocation must never block saving.

- [ ] **Step 1: write the failing test** — unallocated readout for empty and partial states; a weighted split computes correctly; the weight selector appears only for the weighted basis; `carryForward` with `previous` reproduces prior PROPORTIONS against a different total; `even` splits per UNIT (assert with differing `unitCount`, so it cannot pass under an equal-per-asset implementation).
- [ ] **Step 2–4: run, implement, gates** including build. **Step 5: commit.**

---

## Definition of done

- `npx tsc --noEmit`, `npm test`, `npm run lint` (still 3 errors / 22 warnings, no more), `npm run build` all clean.
- Zero pre-existing test files edited.
- A user can create an asset, allocate a fuel entry across assets, and see per-asset rows reach the engine.
- Reported emissions for a partially allocated entry equal those of the same entry unallocated — asserted by test, not by inspection.
- Every consumer in the table above reads the same list the engine reads.
- Saved scenarios still resolve their levers, because migration reuses entry ids.

## Explicitly out of scope

Tiered asset questions and the readiness score; electricity/Scope 2 allocation; splitting a fleet asset into individuals; pruning orphaned `settings.byAsset` entries; asset rename/delete propagation back to entries. The carried-findings record from the source repo (`docs/superpowers/specs/2026-08-13-asset-layer-carried-findings.md` in `scope1-decarb`) lists these with reasoning and should be read before planning a follow-up.
