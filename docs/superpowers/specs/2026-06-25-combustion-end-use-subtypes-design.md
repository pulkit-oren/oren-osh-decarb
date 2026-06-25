# Combustion end-use sub-types → scenario modeller

- **Date:** 2026-06-25
- **Status:** Draft for review
- **Scope:** Phase 1 — combustion (fuel) sources only. Electricity & refrigerant sub-types are explicitly later phases.

## Goal

Let the user tag each combustion source with *what kind of equipment it is* (e.g. diesel → **truck** vs **car** vs **kiln**), and use that sub-type to make the scenario modeller smarter: pre-fill realistic decarbonization-lever assumptions and flag which levers are feasible. The sub-type never changes the emissions baseline and never hides a lever — it tunes inputs and shows guidance.

## Decisions (from brainstorming)

1. **What it drives:** Smart defaults **+** feasibility flags. No new baseline math.
2. **Coverage:** Combustion first. (Electricity facility-type and finer refrigerant classes are future phases.)
3. **Placement:** Selectable both in the *Add a source* form and on the detailed entry screen.
4. **Taxonomy:** Use the proposed list (below).
5. **Overridable:** Every seeded value remains fully editable; feasibility is advisory only.

## Data model

Add one optional field to `CombustionAsset` (`lib/model/types.ts`):

```ts
/** Equipment / end-use class — drives scenario-lever defaults & feasibility. Absent ⇒ unspecified. */
endUse?: EndUseId;
```

Absent = today's behavior exactly (no migration, backward compatible with all persisted data and tests).

New module `lib/model/end-use.ts`:

```ts
export type EndUseId =
  | "car" | "van" | "truck" | "bus" | "forklift" | "heavyEquip"          // mobile
  | "boiler" | "furnaceKiln" | "generator" | "dryer" | "spaceHeat" | "otherProcess"; // stationary

export type Feasibility = "easy" | "yes" | "hard" | "no";

export interface EndUseProfile {
  id: EndUseId;
  label: string;
  category: "mobile" | "stationary";
  icon?: string;                       // lucide name or emoji for the selector
  electrify: { feasible: Feasibility; cop: number; capexPerUnit?: number; capacityHint?: number; note?: string };
  fuelSwitch: { feasible: Feasibility; preferred?: AltFuelId; note?: string };
  flexFuel?: { feasible: Feasibility };  // mobile only
}

export const END_USES: Record<EndUseId, EndUseProfile>;
export const endUsesFor = (category: "mobile" | "stationary"): EndUseProfile[];
```

## Taxonomy & lever profiles (initial, tunable, ₹ India-context)

**Mobile**
| End-use | Electrify | Flex-fuel | Fuel switch |
|---|---|---|---|
| Car | easy · COP 3.5 · ₹18L/unit | yes | biodiesel/ethanol |
| Van / LCV | yes · COP 3.2 · ₹25L/unit | yes | biodiesel |
| Truck (HGV) | yes · COP 3.0 · ₹95L/unit | yes | biodiesel |
| Bus | yes · COP 3.0 · ₹1.5Cr/unit | yes | biodiesel |
| Forklift / material handling | easy · COP 3.0 · ₹6L/unit | no | biodiesel |
| Heavy / off-road equipment | hard · COP 2.0 · ₹2Cr/unit ⚠ | no | biodiesel (preferred) |

**Stationary**
| End-use | Electrify | Fuel switch |
|---|---|---|
| Boiler (low/med-temp) | yes · COP 3.0 (heat pump) · 60% | biodiesel |
| Furnace / Kiln (high-temp) | hard · COP 1.0 ⚠ high-temp | biodiesel (preferred) |
| Generator (genset) | yes · COP 1.0 → grid/solar | biodiesel (easy) |
| Dryer | yes · COP 2.5 (heat pump) | biodiesel |
| Space / water heater | easy · COP 3.5 (heat pump) | biodiesel |
| Other process heat | yes · COP 2.0 | biodiesel |

`flexFuel` applies to mobile only (matches the existing `FlexFuelAction`, which is vehicle-only).

## UI changes

1. **Add-a-source form** (`SourceListScreen.tsx`): add an **End-use** select (combustion only), options filtered by the chosen stationary/mobile type. Default empty ("Unspecified").
2. **Fuel entry screen** (`EntryScreen.tsx`, Asset details card): add the same **Equipment / end-use type** selector, filtered by `a.category`. Changing the category re-filters options and clears an incompatible end-use.
3. Selector rendered with the existing `SelectField` primitive; small icon optional.

## Scenario-modeller integration

Two hook points, both centralized:

1. **Defaults** — `defaultActions(asset)` in `lib/model/segments.ts` reads `asset.endUse` and, when present, seeds:
   - `electrify.cop`, `electrify.assetCapex` (mobile per-unit; stationary uses `capacityHint` for `capacityPct`), from the profile.
   - `fuelSwitch.altFuel` from `profile.fuelSwitch.preferred` (falling back to today's `defaultAltFuelFor`).
   - `flexFuel` feasibility (mobile).
   All values remain user-editable; this only changes the starting point.

2. **Feasibility hints** — in the per-asset lever UI (`ActionPlanTab.tsx` / `BuilderTab.tsx`), when an asset has an end-use whose lever `feasible` is `hard`/`no`, show a small ⚠ badge with the `note` (e.g. "Hard to electrify — high-temp process"). Levers stay enabled and usable.

A small helper `endUseProfile(asset)` returns the profile (or `undefined`) so both the model and UI read from one source of truth.

## Non-goals (this phase)

- No change to the emissions **baseline** calculation (no sub-type efficiency curves / duty cycles).
- No electricity facility-type or refrigerant sub-type work (later phases).
- Levers are **never** hidden or disabled by feasibility — advisory only.

## Testing

- `end-use.ts`: `endUsesFor("mobile"|"stationary")` returns the right sets; every `EndUseId` has a profile.
- `defaultActions`: with `endUse: "truck"` seeds COP 3.0 & truck capex; with `endUse: "furnaceKiln"` seeds COP 1.0; unspecified end-use reproduces today's defaults (regression).
- Backward compat: existing assets with no `endUse` behave exactly as before (existing model tests stay green).
- UI: entry screen shows the end-use selector for combustion; options filter by category; selecting one persists.

## Files touched

- `lib/model/types.ts` — add `endUse?` field.
- `lib/model/end-use.ts` — **new**: taxonomy + profiles + helpers.
- `lib/model/segments.ts` — `defaultActions` consults the profile.
- `components/tabs/activity/SourceListScreen.tsx` — end-use in Add form.
- `components/tabs/activity/EntryScreen.tsx` — end-use selector in Asset details.
- `components/tabs/ActionPlanTab.tsx` / `BuilderTab.tsx` — feasibility hint badges.
- Tests for the above.
