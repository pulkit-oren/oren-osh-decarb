# Source → equipment split — design

**Date:** 2026-08-20
**Status:** approved — the three open questions were resolved on 2026-08-24
(§11). Ready for an implementation plan.
**Supersedes:** the asset layer shipped by `docs/superpowers/plans/2026-08-16-asset-layer-port.md`
(branch `asset-layer-port`, 27 commits on top of `feature/goals-esg-scenario-modules`,
never merged, never deployed)

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
| D4 | Remaining life, end-use and **number of units** move down from the source to the equipment. *(Amended 2026-08-24 — the original clause had the number of units disappearing on the grounds that one equipment is one unit. It does not disappear; see D8.)* |
| D5 | **Annual spend stays on the source** and is apportioned to each equipment by volume share. *(Amended 2026-08-24 — the original clause claimed `resolve.ts:97` "already does" this. It does not; see §2.2.)* |
| D6 | The **Add a source** form drops **End-use**, going from five fields to four: Name, Type, Fuel, Business unit. |
| D7 | Implementation follows **Approach A**: re-scope equipment onto the source entry and keep the resolution pipeline and every downstream consumer. |

Settled on 2026-08-24, closing the three questions this spec was held on:

| # | Decision |
|---|----------|
| D8 | **Every source always holds at least one equipment**, minted on creation. An equipment may represent **several identical units** — it carries its own `unitCount`, defaulting to 1. A fleet of five vans is one equipment with `unitCount: 5` until the user chooses to split it. |
| D9 | **The capacity unit is declared once, on the source**, not per equipment. Mixed units within a source become unrepresentable rather than validated against. |
| D10 | A **`units` basis** joins the allocation bases, weighting by `unitCount`. |

### 2.1 The one decision D4 forces — resolved as D8

D4 says attributes live on equipment. D1 says adding equipment is manual. Taken
literally together, a source with no equipment has nowhere to keep its
remaining life — and lever feasibility (`lib/model/alternatives.ts`, the
retrofit guardrail) reads `remainingLife` on every source, split or not.
`lib/model/validate.ts:10` computes `baseYear + asset.remainingLife`, so an
absent value silently yields `NaN` and the guardrail stops guarding.

**Resolution (D8): every source always has at least one equipment.** Creating a
source mints exactly one equipment named after it, holding 100% of the volume.
Adding a second equipment is what "splitting" means. The unsplit case is
simply *one equipment holding everything*.

This makes D4 unconditional — there is exactly one place to look for remaining
life — and it makes resolution uniform, because every entry resolves to at
least one equipment row.

**What D8 does *not* mean: one equipment is not one unit.** The 2026-08-20 draft
inferred that from D4 and deleted `unitCount` outright. That inference was
wrong, and the cost of it was traced on 2026-08-24: unit counts are load-bearing
in nine places across four model files.

| Consumer | Reads |
|---|---|
| `lib/model/segments.ts:62-63,155-156` | `unitsToConvert / unitCount` — the electrified and flex-fuel fractions |
| `lib/model/segments.ts:75` | mobile electrify capex, `25,000 × max(1, unitCount)` |
| `lib/model/energy-balance.ts:36,109` | `unitsToConvert = round(unitCount × electrifyPct / 100)`, and its inverse |
| `lib/model/suggestions.ts:26,46` | `halfUnits`, and the copy "electrify 2 of 5 vehicles" |
| `lib/model/index.ts:152,170` | flex-fuel gating and `unitsToConvert × vehicleCapex` |
| `lib/export.ts:34` | the exported unit-count column |

Forcing `unitCount` to 1 would collapse electrify and flex-fuel to on/off per
machine, flatten mobile capex to a single unit's worth, and silently change the
meaning of live scenarios — the seeded company has a 30-unit DG Set and two
5-unit fleets carrying `unitsToConvert: 2` and `3`. Modelling "electrify 2 of 5
vans" would require hand-creating five equipment rows first.

So `unitCount` **moves down to equipment** rather than dying. Every consumer
above keeps working untouched, because resolution already stamps `unitCount`
onto each emitted row (`resolve.ts:72`).

### 2.2 D5's stated justification was false

D5 reads "as `resolve.ts:97` already does". Two things are wrong with that. The
line is `resolve.ts:87`, and it applies only to the **remainder** row:

```ts
// resolve.ts:87 — the remainder row, correct
opex: share * e.opex,

// resolve.ts:71 — every allocated row, wrong
opex: asset.opex,
```

An allocated row takes the registry asset's *whole* opex, and `migrateAssets`
(`store-helpers.ts:151`) copies the full entry spend onto every minted
self-asset. So in the shipped build, splitting a source **inflates** total
spend instead of dividing it, and `lib/model/index.ts:165` derives
`fossilUnitPrice = opex / annualVolume` from the inflated figure.

D5's conclusion stands — spend belongs on the source — but it describes work to
be done, not behaviour to be preserved. The fix is to make the allocated rows
use the same `share * e.opex` rule the remainder row already uses, and
§4.2 invariant 6 pins it.

This is *not* the bug from §1. The failure there was a **company-wide** registry
mirroring the **source list**, so unrelated sources became split targets. Here
the minted equipment is scoped to its own source, is only ever offered to that
source, and is renameable. Nothing crosses a source boundary.

It also removes a defect the port left open: the ledger records that "Add plan"
is dead for every entry because Task 4's effect pre-writes a default lever for
every resolved asset. With equipment guaranteed to exist and levers keyed to
equipment ids from the start, that effect is deleted rather than worked around.

This was the item flagged as most worth challenging, being adjacent to rather
than identical to what brainstorming approved. It was challenged on 2026-08-24
and **approved as D8**, with one correction: the `unitCount` deletion it carried
was reversed. See §11.

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
  /** Rated capacity, in the SOURCE's capacityUnit (D9). Absent ⇒ excluded
   *  from the capacity and load bases. */
  capacity?: number;
  /** Running hours per year. Absent ⇒ excluded from the load basis. */
  operatingHours?: number;
  /** Identical units this equipment stands for; one machine ⇒ 1 (D8).
   *  Moved down from the source, NOT deleted — see §2.1 for the nine
   *  consumers that depend on it. Weights the `units` basis (D10). */
  unitCount: number;
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
/** This source's equipment. Always ≥1 (D8). Order is display order. */
equipment: Equipment[];
/** Per-equipment volume, keyed by Equipment.id. Sums to ≤ annualVolume. */
allocations?: Record<string, number>;
/** The unit every equipment's `capacity` is expressed in (D9). Declared once
 *  here so a source cannot hold incommensurable capacities. Absent ⇒ no
 *  capacities recorded, and the capacity/load bases are unavailable. */
capacityUnit?: CapacityUnit;
```

**Moved to `Equipment`:** `remainingLife`, `endUse` and `unitCount`. All three
leave `CombustionAsset`; none is deleted. The 2026-08-20 draft deleted
`unitCount` on the reasoning that one equipment *is* one unit — reversed by D8
(§2.1).

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

This id reuse is load-bearing, not incidental: it is the only thing standing
between the migration and a silent loss of every saved lever. It is asserted in
§8, not assumed. A later change that mints a fresh id for the first equipment
must rewrite `byAsset` in the same step.

## 4. Allocation

### 4.1 Bases

| Basis | Weight per equipment | Available when |
|---|---|---|
| `load` | `capacity × operatingHours` | every equipment has both. **Default.** |
| `capacity` | `capacity` | every equipment has a capacity |
| `units` | `unitCount` | always (D10) |
| `even` | `1` | always |
| `carryForward` | prior year's allocation for the same equipment id | prior year has a non-zero allocation |
| `manual` | — values typed by hand | always |

A basis whose precondition fails is shown disabled with the reason ("three
machines have no running hours"), not hidden. Silently falling back to `even`
is how the shipped version made a wrong split look computed.

Because the capacity unit is a property of the source (D9), the only reason
`load` or `capacity` can be unavailable is a **missing value** — never a unit
mismatch. There is no unit-agreement check to write.

**Why `units` earns its place (D10).** It costs one line — the weight *is*
`unitCount` — and for a fleet it is the basis a user can actually answer.
"Five vans, two of them on the city route" is knowledge they have; rated
capacity × running hours per van is not. The superseded `WeightAttribute`
union carried exactly this option (`lib/assets/types.ts:9`), so dropping it
would have been a regression against the shipped port.

### 4.2 Invariants

1. **Computed bases consume the whole total.** `load`, `capacity`, `units`,
   `even` and `carryForward` distribute `annualVolume` exactly; unallocated is
   0 by construction. The shipped `distribute()` already guarantees this (last
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
6. **Total spend is invariant to the split.** The emitted rows' `opex` sums to
   the source's `opex`, under every basis and every number of equipment — the
   same guarantee invariant 4 gives emissions. The shipped build **fails this
   today** (§2.2), so it lands as a regression test, not a restatement.
7. **Unit counts are never auto-apportioned.** Splitting a source does not
   divide its `unitCount` across the new equipment; each equipment's count is
   user data, typed by hand. The entry screen shows the running total across
   equipment so that `2 + 3 = 5` is visible and `5 + 5` is obviously wrong.
   Without this the user cannot see that they have doubled `segments.ts:75`'s
   mobile capex. Deliberately advisory: a legitimate split may add machines
   that were never counted on the source.

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

`handleAdd` stops seeding `remainingLife`, `unitCount` and `endUse` on the
source and instead mints its first equipment (D8), carrying
`remainingLife: 10` and `unitCount: 1` — the same defaults, one level down.
`capacityUnit` is left unset on the source; the user picks it when they first
record a capacity.

### 5.2 Entry screen — the equipment section

`components/tabs/activity/EntryScreen.tsx`, replacing the shipped
`AssetAllocationPanel` mount.

```
PNG · piped natural gas · Pune plant · 1,88,000 SCM/yr
──────────────────────────────────────────────────────────
EQUIPMENT USING THIS FUEL                  + Add equipment

Capacity measured in [ tph ▾ ]            (applies to this source)
Split by:  [ Load (capacity × hours) ▾ ]    [ Redistribute ]

                    cap    hours   units   life
  Boiler 1          2.0    6,000     1    12 yrs  →  98,087 SCM
  Boiler 2          1.0    6,000     1    12 yrs  →  49,043 SCM
  Kitchen range     0.5    4,000     1     8 yrs  →  16,348 SCM
  Water heater      0.5    4,000     1     8 yrs  →  16,348 SCM
  Genset (standby)  1.0    1,000     1    15 yrs  →   8,174 SCM
                                    ───
                            5 units total

  Unallocated: 0 SCM

  ⓘ How this is split  ...
```

A fleet is the case D8 and D10 exist for — one equipment standing for several
identical machines, split by count rather than by a capacity nobody recorded:

```
Diesel fleet · diesel · 1,20,000 L/yr · ₹1,14,00,000/yr
──────────────────────────────────────────────────────────
Capacity measured in [ — ▾ ]
Split by:  [ Units ▾ ]                      [ Redistribute ]

                    cap    hours   units   life
  City vans          —       —       3     6 yrs  →  72,000 L
  Highway vans       —       —       2     6 yrs  →  48,000 L
                                    ───
                            5 units total

  ⓘ How this is split
    Each equipment gets a share of 1,20,000 L in proportion to
    number of units.
    City vans = 3 of 5 units → 60.0% → 72,000 L

  Spend follows the volume share (D5): ₹68,40,000 and ₹45,60,000.
```

Each row is inline-editable: name, capacity, running hours, unit count,
remaining life, end-use, volume. Volume edits switch the basis to `manual`.
`Redistribute` recomputes from the current basis; it is hidden under `manual`
(no formula to redistribute from) — the shipped panel got this right and the
behaviour is kept.

Deleting an equipment is blocked when it is the last one (D8) and warns when
it carries a lever.

The capacity unit sits in the source header, not on the rows (D9). Changing it
reinterprets every capacity in the source at once, so it takes a confirm when
any equipment already has a capacity recorded.

Fields **removed** from this screen: the source-level `Remaining life` slider
(`EntryScreen.tsx:259`) and the source-level `Number of units` field, both now
per row. `Annual spend` **stays** on the source (D5).

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
- **The nine `unitCount` consumers listed in §2.1** — `segments.ts`,
  `energy-balance.ts`, `suggestions.ts`, `index.ts`, `export.ts`. D8 keeps the
  field alive on the emitted row, so not one of them is touched. Had the
  2026-08-20 draft's deletion stood, every one would have needed respecifying.

**Changed:**

- `resolveAssets` reads `e.equipment` + `e.allocations` instead of a registry
  argument, and takes no registry parameter. A resolved row inherits the
  source's `fuelType`, `unit`, `year`, `bu`, `site` and its volume share of
  `opex`; it takes `name`, `remainingLife`, `endUse` and `unitCount` from the
  equipment.
- **The `opex` bug at `resolve.ts:71` is fixed** (§2.2): an allocated row takes
  `share * e.opex`, not the whole figure. This is the one behavioural change to
  the resolution pipeline that is not a straight port — everything else in this
  section is a re-pointing. Invariant 6 is its test.
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
     `endUse` = `entry.endUse`; `unitCount` = `entry.unitCount ?? 1`;
     `capacity`/`operatingHours` absent, and the source's `capacityUnit` absent
   - `allocations = { [entry.id]: entry.annualVolume }`
3. Drop `allocationMode`, `assetAllocations`, `weightAttribute`.
   Any allocation the shipped port wrote is **discarded, not translated** — it
   points at company-wide asset ids that no longer exist, and translating a
   diesel-allocated-to-Coal split would carry the §1 defect forward.
4. Drop the persisted `assets` registry key entirely.

`unitCount` **is** preserved, on the minted equipment (D8). A source recorded as
"30 units" becomes one equipment carrying 30, so every scenario that reads a
unit count — and every `unitsToConvert` a user has already saved against it —
keeps the meaning it had before the migration. The user splits it into real
machines when they want per-machine planning; until then nothing about their
numbers moves.

*(The 2026-08-20 draft discarded the count here, on the D4 reading D8 reversed.
The argument it gave — "thirty gensets were never thirty identities, just a
count" — is true and is exactly why the count belongs on one equipment rather
than becoming thirty of them.)*

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
  - migration preserves `unitCount` — a 30-unit source yields one equipment
    carrying 30, and a saved `unitsToConvert: 2` still means two of five (D8)
  - each basis, including a disabled basis with its stated reason, and the
    `units` basis weighting by `unitCount` (D10)
  - `explainAllocation` agrees with `computeAllocation` on the same input
    (the §4.3 single-source-of-truth requirement, asserted not assumed)
  - equipment cannot be deleted to zero
  - emissions invariance: split vs unsplit totals equal (invariant 4)
  - **spend invariance: emitted rows' `opex` sums to the source's `opex`**
    (invariant 6). Write this one against the *shipped* `resolve.ts` first and
    watch it fail — §2.2 is a live defect, and a test that passes before the
    fix is testing the wrong thing.
  - a lever on one equipment leaves its siblings unabated (D3)
- **No test asserts a capacity-unit mismatch**, because D9 makes one
  unrepresentable. If you find yourself writing that test, the model drifted
  back to per-equipment units.
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
   `unitCount` moves onto `Equipment` here (D8) and `capacityUnit` onto the
   source (D9); the `units` basis (D10) lands with the other bases.
2. `resolveAssets` rework against the new model, **including the `resolve.ts:71`
   spend fix** (§2.2) behind its failing invariant-6 test; downstream consumers
   verified unchanged — the nine `unitCount` readers should need no edit at all,
   and if one does, D8 was implemented wrongly.
3. Delete the global layer (§6) — provider, registry screen, minting, nav.
4. Add-source form: five fields to four (D6).
5. Entry-screen equipment section (§5.2) including the explainer.
6. Scenario-modeller equipment rows; remove Task 9's split-entry branches.
   The unit-total display (invariant 7) belongs with step 5's equipment
   section.
7. Browser verification of the whole flow, then a preview deploy.

Steps 1–3 are the risky half and land behind tests before any UI moves.

## 11. Resolved questions

All three were closed by the owner on 2026-08-24. Recorded here so they are not
reopened from the 2026-08-20 text.

1. **Does every source always hold one equipment?** *(→ D8.)* **Yes**, and
   `unitCount` moves down onto the equipment rather than being deleted. The
   §2.1 proposal was accepted; the "one equipment *is* one unit" corollary the
   draft attached to it was rejected once its nine consumers were traced. The
   rejected alternative — equipment optional, with `remainingLife`/`endUse`
   staying on the source as overridable defaults — would have left two places
   to read every attribute and defeated D4.
2. **Where does annual spend live?** *(→ D5, unchanged; §2.2 added.)* On the
   **source**, apportioned by volume share. The mockup was right and the
   option text was wrong. Separately, D5's justification was false: the shipped
   code does not apportion, it inflates. Per-equipment spend was rejected —
   nothing would reconcile the typed figures against the invoice, and the same
   fuel would show different unit prices per machine.
3. **How are capacity units handled across a split?** *(→ D9.)* The unit is
   declared **once on the source**; equipment carry bare numbers. Mixing
   becomes unrepresentable rather than validated against, which removes the
   check, the disabled-basis reason and its test. The spec's original proposal
   (per-equipment units, bases disabled on mismatch) was rejected as reporting
   an error the model can simply forbid — the units are not inter-convertible
   in general anyway: TR→kW is a fixed 3.517, but kVA→kW needs a power factor
   and tph is a steam mass flow needing enthalpy.

**One consequence worth carrying into the plan.** D8 keeps every `unitCount`
consumer untouched, but §4.2 invariant 7 is new UI work: the entry screen must
show the running unit total, or a user splitting a five-van fleet into two
five-unit equipment silently doubles `segments.ts:75`'s mobile capex with
nothing on screen to contradict them.
