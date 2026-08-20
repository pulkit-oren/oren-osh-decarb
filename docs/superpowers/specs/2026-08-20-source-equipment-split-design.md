# Source → equipment split — design

**Date:** 2026-08-20
**Status:** awaiting review
**Supersedes:** the asset layer shipped by `docs/superpowers/plans/2026-08-16-asset-layer-port.md`
(branch `asset-layer-port`, 25 commits, never merged, never deployed)

## 1. Why this replaces the shipped asset layer

The port delivered a working "Split across assets" panel against the wrong
model. `migrateAssets` (`lib/store-helpers.ts:145`) mints **one asset per
combustion entry**, reusing the entry's id, name, category, unit count and BU:

```ts
minted.push({ id: e.id, name: e.name, category: e.category, ... })
```

So the asset registry is a **mirror of the source list**. Seven combustion
entries produced exactly seven assets named "DG Set", "Biogas", "LPG", "Coal",
"Piped Natural Gas" and the two vehicle fleets. The registry carries no
information the source list does not already have.

Two consequences, both confirmed in the browser on 2026-08-20 (the first time
the port was ever run):

1. **A source can be split onto unrelated sources.** The panel's eligibility
   filter is `category !== "electrical" && buId === bu`
   (`AssetAllocationPanel.tsx:83`). Every asset carries `buId: ""`, so the BU
   half matches everything. Opening the DG Set **diesel** entry offered Coal,
   Piped Natural Gas, LPG and Biogas as split targets.
2. **The fuel travels with the entry, not the asset.** `resolve.ts:78` spreads
   `...e`, so allocating diesel to the "Coal" asset emits a *diesel* row
   wearing the name "Coal". `Asset` has no fuel field at all, so no filter
   predicate could have fixed this — the gap is in the data model.

Every gate passed: typecheck, 600 tests, clean build, flat lint, plus
direct-execution probes. The tests assert the filter does what it says, and it
does. The specification was wrong, not the implementation.

**The fix is not a filter.** It is to stop treating equipment as a
company-wide registry and make it what it should always have been: the
children of one source.

## 2. Decisions taken

Settled in brainstorming on 2026-08-20:

| # | Decision |
|---|----------|
| D1 | Equipment belongs to **one source**. It is created by hand inside that source's entry screen. The split only ever offers that source's own equipment. |
| D2 | Each equipment carries **name + rated capacity + annual running hours**. Fuel burn tracks capacity × hours, so this is the only physically honest computed split, and it is explainable in one checkable line. |
| D3 | **Equipment is the planning unit.** A lever applies to one machine — electrify Boiler 1, leave Boiler 2 on gas. The Builder, action plan and compare screens show equipment rows. |
| D4 | Remaining life and end-use **move down** from the source to the equipment. "Number of units" disappears: one equipment *is* one unit. |
| D5 | **Annual spend stays on the source** and is apportioned by volume share, as `resolve.ts:97` already does. |
| D6 | The **Add a source** form drops **End-use**, going from five fields to four: Name, Type, Fuel, Business unit. |
| D7 | Implementation follows **Approach A**: re-scope equipment onto the source entry and keep the resolution pipeline and every downstream consumer. |

### 2.1 The one decision D4 forces

D4 says attributes live on equipment. D1 says adding equipment is manual. Taken
literally together, a source with no equipment has nowhere to keep its
remaining life — and lever feasibility (`lib/model/alternatives.ts`, the
retrofit guardrail) reads `remainingLife` on every source, split or not.

**Resolution: every source always has at least one equipment.** Creating a
source mints exactly one equipment named after it, holding 100% of the volume.
Adding a second equipment is what "splitting" means. The unsplit case is
simply *one equipment holding everything*.

This makes D4 unconditional — there is exactly one place to look for remaining
life — and it makes resolution uniform, because every entry resolves to at
least one equipment row.

This is *not* the bug from §1. The failure there was a **company-wide** registry
mirroring the **source list**, so unrelated sources became split targets. Here
the minted equipment is scoped to its own source, is only ever offered to that
source, and is renameable. Nothing crosses a source boundary.

It also removes a defect the port left open: the ledger records that "Add plan"
is dead for every entry because Task 4's effect pre-writes a default lever for
every resolved asset. With equipment guaranteed to exist and levers keyed to
equipment ids from the start, that effect is deleted rather than worked around.

**This is the item most worth challenging in review** — it is adjacent to, not
identical to, what was approved in brainstorming. See §11.

## 3. Data model

### 3.1 New — `Equipment`

Lives in `lib/equipment/types.ts`.

```ts
export type CapacityUnit = "kW" | "kVA" | "TR" | "tph";

export interface Equipment {
  /** Stable across fiscal years — lever settings are keyed by this. */
  id: string;
  /** User-typed, required, non-empty. */
  name: string;
  /** Rated capacity. Absent ⇒ excluded from capacity/load bases. */
  capacity?: number;
  capacityUnit?: CapacityUnit;
  /** Running hours per year. Absent ⇒ excluded from the load basis. */
  operatingHours?: number;
  /** Remaining useful life, years. Retrofit guardrail — moved down from the
   *  source (D4), so a heat pump on Boiler 1 is checked against Boiler 1's
   *  own life, not a blended average. */
  remainingLife: number;
  /** Moved down from the source (D4). A boiler is process heat; a standby
   *  genset is backup power. Drives lever defaults and feasibility. */
  endUse?: EndUseId;
}
```

### 3.2 Changed — `CombustionAsset` (`lib/model/types.ts`)

**Added:**

```ts
/** This source's equipment. Always ≥1 (§2.1). Order is display order. */
equipment: Equipment[];
/** Per-equipment volume, keyed by Equipment.id. Sums to ≤ annualVolume. */
allocations?: Record<string, number>;
```

**Removed:** `remainingLife` and `endUse` move to `Equipment`. `unitCount` is
deleted outright rather than moved — one equipment *is* one unit (D4), so a
count on either side would be redundant.

**Removed** (superseded): `allocationMode`, `assetAllocations`, `weightAttribute`.
`allocationMode` is gone because equipment always exists — there is no
"unsplit" mode to flag, only a one-equipment list. `assetAllocations`'s
`{ volume: number }` wrapper is replaced by a flat `Record<string, number>`;
the shipped panel already worked flat internally and wrapped only at the
`onChange` boundary, so the wrapper bought nothing.

**Kept:** `opex` on the source (D5), `sourceEntryId` on emitted rows.

**Retyped:** `allocationBasis` now takes the §4 basis union.

### 3.3 Lever settings

`LeverSettings.byAsset` stays `Record<string, AssetActions>`, but the key is now
always an **equipment id**, never an entry id. Because the migration (§7) mints
each source's first equipment **reusing the source's own id**, every existing
lever key keeps working across the migration without a rewrite.

## 4. Allocation

### 4.1 Bases

| Basis | Weight per equipment | Available when |
|---|---|---|
| `load` | `capacity × operatingHours` | every equipment has both. **Default.** |
| `capacity` | `capacity` | every equipment has a capacity |
| `even` | `1` | always |
| `carryForward` | prior year's allocation for the same equipment id | prior year has a non-zero allocation |
| `manual` | — values typed by hand | always |

A basis whose precondition fails is shown disabled with the reason ("three
machines have no running hours"), not hidden. Silently falling back to `even`
is how the shipped version made a wrong split look computed.

### 4.2 Invariants

1. **Computed bases consume the whole total.** `load`, `capacity`, `even` and
   `carryForward` distribute `annualVolume` exactly; unallocated is 0 by
   construction. The shipped `distribute()` already guarantees this (last
   element absorbs rounding), and it is kept as-is.
2. **Only `manual` can leave a remainder.** An under-allocation emits a
   remainder row; the panel states the leftover explicitly.
3. **Nothing may over-allocate.** An overshoot is scaled back proportionally
   via the existing `clampAllocation` and announced through a `role="alert"`
   message. Verified working in the browser on 2026-08-20.
4. **Emissions are invariant to how the split falls.** A source's emissions are
   identical whether its volume sits on one equipment or is spread across five,
   and under any basis. (§2.1 means there is no truly "unsplit" state — the
   degenerate case is a one-equipment list.) Verified against the shipped
   build: DG Set held 24,610 tCO₂e and the company total held 40,935 tCO₂e
   across a split.
5. **Editing one row does not silently rewrite the others.** A manual edit
   switches the basis to `manual` and writes only that row, except when the
   clamp fires.

### 4.3 The "how is it done" explainer (D2)

The panel shows a `How this is split` block giving the formula and one worked
row with real numbers:

```
ⓘ How this is split
  Each equipment gets a share of 1,88,000 SCM in proportion to
  capacity × running hours.
  Boiler 1 = 2.0 × 6,000 = 12,000 of 23,000 total → 42.6% → 98,087 SCM
```

**Requirement: the explainer must not re-derive the arithmetic.** A single
exported `weightsFor(equipment, basis, previous?)` is consumed by both
`computeAllocation()` and `explainAllocation()`. A second implementation would
drift from the first, and an explainer that disagrees with the number beside it
is worse than no explainer.

(The mockup shown during brainstorming had inconsistent arithmetic — a 28,200
weight total that should have been 23,000, and a leftover shown under a
computed basis, which invariant 2 forbids. Corrected here.)

## 5. UI

### 5.1 Add a source — five fields to four (D6)

`components/tabs/activity/SourceListScreen.tsx`. Drop the **End-use** select
(lines ~380–390). Remaining: Name, Type, Fuel, Business unit. End-use is now
asked per equipment.

`handleAdd` stops seeding `remainingLife: 10`, `unitCount: 1` and `endUse`, and
instead mints the source's first equipment (§2.1) carrying `remainingLife: 10`.

### 5.2 Entry screen — the equipment section

`components/tabs/activity/EntryScreen.tsx`, replacing the shipped
`AssetAllocationPanel` mount.

```
PNG · piped natural gas · Pune plant · 1,88,000 SCM/yr
──────────────────────────────────────────────────────────
EQUIPMENT USING THIS FUEL                  + Add equipment

Split by:  [ Load (capacity × hours) ▾ ]    [ Redistribute ]

  Boiler 1        2.0 tph   6,000 h   12 yrs  →  98,087 SCM
  Boiler 2        1.0 tph   6,000 h   12 yrs  →  49,043 SCM
  Kitchen range   0.5 tph   4,000 h    8 yrs  →  16,348 SCM
  Water heater    0.5 tph   4,000 h    8 yrs  →  16,348 SCM
  Genset (standby) 1.0 tph  1,000 h   15 yrs  →   8,174 SCM

  Unallocated: 0 SCM

  ⓘ How this is split  ...
```

Each row is inline-editable: name, capacity + unit, running hours, remaining
life, end-use, volume. Volume edits switch the basis to `manual`.
`Redistribute` recomputes from the current basis; it is hidden under `manual`
(no formula to redistribute from) — the shipped panel got this right and the
behaviour is kept.

Deleting an equipment is blocked when it is the last one (§2.1) and warns when
it carries a lever.

Fields **removed** from this screen: `Number of units` (D4) and the
source-level `Remaining life` slider (`EntryScreen.tsx:259`), now per row.

### 5.3 Scenario modeller — equipment rows (D3)

`BuilderTab` and `SegmentScreen` already roll up over
`resolvedRowsForEntry()` (Task 9). Because resolution now always emits
equipment rows, the split-entry special-casing Task 9 added is deleted: the
`SuggestionCard` and `AssetActionCard` "disabled for split entries" branches go
away, since there is no longer an unsplit case to distinguish.

### 5.4 Navigation removals

The global registry disappears: the **Assets** button in the Energy & Emissions
header, the Assets tile on `HomeScreen`, and the `Nav` case in
`activity/shared.tsx`.

## 6. What is kept, changed and deleted

**Kept unchanged** — this is why Approach A was chosen:

- `lib/assets/allocate.ts` → moves to `lib/equipment/allocate.ts`.
  `distribute`, `clampAllocation`, `unallocated` are correct and well-tested;
  `computeAllocation` gains the §4.1 bases and loses `weightAttribute`.
- `resolveAssets`'s row-emission shape, including the `sourceEntryId` stamp and
  the `::unallocated` remainder convention.
- Every downstream consumer: `BuilderTab`, `CompareTab`, `CombinedCompare`,
  `SegmentScreen`, `CeoOverviewTab`, `BalanceTab`, `ActionPlanTab`,
  `ScenarioCalcPanel`, `lib/model/baseline.ts`. They read resolved rows and
  care only that resolution emits one row per planning unit.

**Changed:**

- `resolveAssets` reads `e.equipment` + `e.allocations` instead of a registry
  argument, and takes no registry parameter. A resolved row inherits the
  source's `fuelType`, `unit`, `year`, `bu`, `site` and its volume share of
  `opex`; it takes `name`, `remainingLife` and `endUse` from the equipment.
- `copyCombustion` (`lib/store.tsx:243`) already deep-`clone`s the entry list,
  so nested equipment carries to the next year with stable ids for free. It
  must additionally seed `byAsset` defaults for **equipment** ids, not entry
  ids.

**Deleted:**

- `migrateAssets` and `VALID_COMBUSTION_CATEGORIES` (`lib/store-helpers.ts`)
- `lib/assets/store.tsx` — the whole `AssetProvider`, `addUnit`, `upsertUnit`,
  `removeUnit`, `ensureAssetsFor`, `useAssetsOptional`
- the `AssetProvider` mount in `Shell.tsx`
- `components/tabs/activity/AssetRegistryScreen.tsx`
- `components/assets/AssetAllocationPanel.tsx` (replaced by §5.2)
- the `addUnit`/`upsertUnit` calls in `addCombustion`, `importCombustion`,
  `addCombustionAsset`
- the lever-minting effect for resolved assets (the cause of the dead
  "Add plan" button)
- `Asset`, `AssetRegistry`, `AssetCategory`, `WeightAttribute`

The `electrical` category disappears with `AssetCategory`. Electricity is a
separate Scope 2 module (`lib/scope2/`) and never fed this path; the category
existed only because the type was ported verbatim from a repo that had a
combined registry.

## 7. Migrating persisted state

Users have `localStorage` state from both `master` and the preview deployment.
On load, for each combustion entry in each year:

1. If `entry.equipment` is a non-empty array, leave it alone (idempotent).
2. Otherwise mint one equipment:
   - `id` = **the entry's own id** — this is what preserves existing
     `settings.byAsset` lever keys with no rewrite
   - `name` = entry name; `remainingLife` = `entry.remainingLife ?? 10`;
     `endUse` = `entry.endUse`; `capacity`/`operatingHours` absent
   - `allocations = { [entry.id]: entry.annualVolume }`
3. Drop `allocationMode`, `assetAllocations`, `weightAttribute`, `unitCount`.
   Any allocation the shipped port wrote is **discarded, not translated** — it
   points at company-wide asset ids that no longer exist, and translating a
   diesel-allocated-to-Coal split would carry the §1 defect forward.
4. Drop the persisted `assets` registry key entirely.

`unitCount` is not preserved. A source recorded as "30 units" becomes one
equipment; the user splits it into real machines when they want per-machine
planning. Carrying the number forward would imply a fidelity the data does not
have — thirty gensets were never thirty identities, just a count.

## 8. Testing

- **Frozen files stay untouched**: `activity-data.test.tsx` and
  `empty-field-guards.test.tsx`. Both were verified untouched across all 25
  commits of the port and must stay that way.
- Reuse the existing allocation suites — `distribute`/`clamp`/`unallocated`
  behaviour is unchanged, so those tests should pass as-is and are the
  regression net for the move to `lib/equipment/`.
- New coverage:
  - migration: idempotence; lever-key preservation; discarding a shipped
    `assetAllocations` map; a source that already has equipment
  - each basis, including a disabled basis with its stated reason
  - `explainAllocation` agrees with `computeAllocation` on the same input
    (the §4.3 single-source-of-truth requirement, asserted not assumed)
  - equipment cannot be deleted to zero
  - emissions invariance: split vs unsplit totals equal (invariant 4)
  - a lever on one equipment leaves its siblings unabated (D3)
- **Run it in a browser before claiming completion.** This spec exists because
  600 passing tests, a clean build and clean typecheck did not surface a defect
  that thirty seconds of clicking did.

## 9. Out of scope

- Refrigeration systems (`RefrigerationSystem`) — separate model, untouched.
- Scope 2 / electricity (`lib/scope2/`) — never used this path.
- Bulk equipment import. Hand entry only, per D1.
- Site/facility as a split dimension — considered and set aside; the source
  already carries `bu` and `site`.
- Per-equipment annual spend (D5 keeps spend on the source).

## 10. Sequencing

1. Types + migration + `lib/equipment/allocate.ts` — with tests, no UI.
2. `resolveAssets` rework against the new model; downstream consumers verified
   unchanged.
3. Delete the global layer (§6) — provider, registry screen, minting, nav.
4. Add-source form: five fields to four (D6).
5. Entry-screen equipment section (§5.2) including the explainer.
6. Scenario-modeller equipment rows; remove Task 9's split-entry branches.
7. Browser verification of the whole flow, then a preview deploy.

Steps 1–3 are the risky half and land behind tests before any UI moves.

## 11. Open questions

1. **§2.1 — every source always has one equipment.** This resolves the conflict
   between "attributes move down" (D4) and "splitting is optional" (D1), but it
   was not itself approved in brainstorming. If it is wrong, the alternative is
   to keep `remainingLife`/`endUse` on the source as defaults that equipment
   overrides — which is the option rejected during brainstorming, so the
   conflict would need a different resolution.
2. **D5 vs the mockup.** The chosen option's text said all four attributes move
   down; the mockup shown alongside it kept **Annual spend** on the source.
   This spec follows the mockup. Confirm.
3. **Capacity units across a split.** Mixing `tph` and `kW` within one source
   makes a capacity-weighted split meaningless. Proposal: the load and capacity
   bases require all equipment in a source to share one capacity unit, and are
   disabled with that reason otherwise. Not yet confirmed.
