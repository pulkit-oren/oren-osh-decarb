# Refrigerant equipment classes → finer low-GWP swap recommendation

- **Date:** 2026-06-25
- **Status:** Draft for review
- **Scope:** Phase 3 — refrigerant only. (Phase 1 combustion & Phase 2 electricity shipped.)

## Goal

Let the user refine a refrigeration system beyond today's 3 system types into a finer **equipment class** (Split AC, Chiller, Cold room, Display case, …). Each class maps to a more specific recommended **low-GWP swap target**, which seeds the modeller's `gasSwitch` lever. Backward compatible; advisory; no emission-math change.

## Decisions (from brainstorming)

1. **What it drives:** a finer recommended low-GWP swap target for the gas-switch lever (smart default). No new emission math.
2. **Coverage:** refrigerant only (final roadmap phase).
3. **Parent relationship:** each equipment class belongs to one of the existing 3 `systemType`s; the class selector is filtered by the chosen system type (mirrors combustion category → end-use).
4. **Placement:** selectable in the refrigerant **entry screen** ("System details") and the **Add-a-source** form (refrigerant branch).
5. **Fallback:** when no class is set, behavior is exactly today's — `RECOMMENDED_ALT_BY_SYSTEM[systemType]`.

## Data model

New optional field on `RefrigerationSystem` (`lib/model/types.ts`):

```ts
/** Finer equipment class within the system type — sharpens the recommended low-GWP swap. Absent ⇒ use the system-type default. */
equipmentClass?: import("./refrigerant-class").RefrigClassId;
```

New module `lib/model/refrigerant-class.ts`:

```ts
import type { RefrigerantId, RefrigerationSystem } from "./types";

export type RefrigClassId =
  | "splitAc" | "vrf" | "chiller" | "packagedRooftop"        // commercialHVAC
  | "coldRoom" | "blastFreezer" | "ammoniaPlant"             // industrialColdStorage
  | "displayCase" | "supermarketRack" | "bottleCooler";      // retailRefrigeration

export interface RefrigClassProfile {
  id: RefrigClassId;
  label: string;
  systemType: RefrigerationSystem["systemType"];   // parent
  recommendedAlt: RefrigerantId;                    // finer low-GWP swap target
  note: string;
}

export const REFRIG_CLASSES: Record<RefrigClassId, RefrigClassProfile>;
export const REFRIG_CLASS_LIST: RefrigClassProfile[];                         // stable order
export function refrigClassesFor(systemType: RefrigerationSystem["systemType"]): RefrigClassProfile[];
export function refrigClassProfile(s: { equipmentClass?: RefrigClassId }): RefrigClassProfile | undefined;
```

## Taxonomy & profiles (initial, tunable)

All `recommendedAlt` values are valid `RefrigerantId`s already in the union.

| id | label | parent systemType | recommendedAlt | note |
|---|---|---|---|---|
| splitAc | Split AC | commercialHVAC | R32 | Small charge — R-32 is the common A2L drop-forward. |
| vrf | VRF / VRV | commercialHVAC | R454B | Leading R-410A replacement for variable-flow systems. |
| chiller | Chiller | commercialHVAC | R1234ze | Ultra-low-GWP HFO suits water chillers. |
| packagedRooftop | Packaged rooftop | commercialHVAC | R454B | A2L replacement for packaged DX units. |
| coldRoom | Cold room / walk-in | industrialColdStorage | R717 | Ammonia — zero GWP, best efficiency at scale. |
| blastFreezer | Blast freezer | industrialColdStorage | R744 | CO₂ transcritical suits low-temp freezing. |
| ammoniaPlant | Ammonia plant | industrialColdStorage | R717 | Already ammonia-class; keep R-717. |
| displayCase | Display case / reach-in | retailRefrigeration | R290 | Propane — near-zero GWP within charge limits. |
| supermarketRack | Supermarket rack | retailRefrigeration | R744 | CO₂ transcritical is the retail-rack standard. |
| bottleCooler | Bottle cooler / vending | retailRefrigeration | R290 | Self-contained — propane within charge limits. |

`REFRIG_CLASS_LIST` order: splitAc, vrf, chiller, packagedRooftop, coldRoom, blastFreezer, ammoniaPlant, displayCase, supermarketRack, bottleCooler.

## Modeller integration

Single central hook — `defaultSystemActions(sys)` in `lib/model/segments.ts` (currently sets `gasSwitch.altRefrigerant = RECOMMENDED_ALT_BY_SYSTEM[sys.systemType]`):

```ts
const cls = refrigClassProfile(sys);
// gasSwitch.altRefrigerant:
altRefrigerant: cls?.recommendedAlt ?? RECOMMENDED_ALT_BY_SYSTEM[sys.systemType],
```

Everything else in `defaultSystemActions` unchanged. When no class set → identical to today.

## UI changes

1. **Entry screen** (`components/tabs/activity/EntryScreen.tsx`, refrigerant branch "System details"): add an **Equipment class** `SelectField` after the System type selector. Options = `Unspecified` + `refrigClassesFor(s.systemType)`. On change, write `equipmentClass`. When the System type changes, clear an incompatible class (set `equipmentClass: undefined` if not in `refrigClassesFor(newType)`). Below it, show an advisory line for the chosen class: `Recommended low-GWP swap: {REFRIGERANTS[cls.recommendedAlt].label}`.
2. **Add-a-source form** (`components/tabs/activity/SourceListScreen.tsx`, refrigerant branch only): add an **Equipment class** `<select>` (matching the form's existing raw-select style) after the System type select, options filtered by the form's `systemType` state; reset on form open; include `equipmentClass: equipmentClass || undefined` on the `addRefrigerationSystem` object.

## Non-goals

- No change to refrigerant emission math (`refrigerantCO2e`, GWP factors).
- No new modeller lever; only the existing `gasSwitch` default sharpens.
- No edits to the old `components/tabs/DataInputTab.tsx` refrigerant panel (activity flow is the live screen).

## Testing

- `refrigerant-class.ts`: all 10 ids have a self-consistent profile; `REFRIG_CLASS_LIST` length 10 stable order; `refrigClassesFor("retailRefrigeration")` returns exactly the 3 retail classes; `refrigClassProfile({equipmentClass})` resolves / returns undefined; every `recommendedAlt` is a valid RefrigerantId.
- `defaultSystemActions`: a system with `equipmentClass: "displayCase"` seeds `gasSwitch.altRefrigerant === "R290"`; with no class, seeds `RECOMMENDED_ALT_BY_SYSTEM[systemType]` (regression).
- UI: refrigerant entry screen shows the Equipment class selector filtered by system type and the recommended-swap line; absent class → no line. Existing refrigerant tests stay green.

## Files touched

- `lib/model/types.ts` — add `equipmentClass?` field.
- `lib/model/refrigerant-class.ts` — **new**: taxonomy + profiles + helpers.
- `lib/model/segments.ts` — `defaultSystemActions` consults the class.
- `components/tabs/activity/EntryScreen.tsx` — equipment-class selector + recommended-swap line (refrigerant branch).
- `components/tabs/activity/SourceListScreen.tsx` — equipment-class select in the refrigerant Add form.
- Tests for the above.
