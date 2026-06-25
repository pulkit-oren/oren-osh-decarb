# Electricity facility-types → load-split presets & solar feasibility

- **Date:** 2026-06-25
- **Status:** Draft for review
- **Scope:** Phase 2 — electricity only. (Phase 1 combustion shipped; Phase 3 refrigerant later.)

## Goal

Let the user tag a BU's electricity with a **facility type** (Office, Warehouse, Data centre, …) that pre-fills a realistic **load split** (lighting/motor/HVAC %) and shows an **on-site-solar feasibility** hint. The load split already drives the modeller's LED / VFD / BMS efficiency levers, so presetting it improves the modeller automatically. Solar feasibility is advisory. Everything stays editable; backward compatible.

## Decisions (from brainstorming)

1. **What it drives:** load-split presets **+** solar-feasibility hint. No new modeller math.
2. **Preset = template:** selecting a type overwrites the current load split (deliberate). Sliders remain editable afterward.
3. **Load split only** is preset — NOT solar *yield*/irradiance (that is geography-specific, not building-type-specific; conflating them would be wrong). Solar feasibility is a qualitative advisory hint only.
4. **Placement:** the facility-type selector lives on `ElectricityBuScreen` (the grid-facility details). Electricity has no add-form — the 4 instruments (grid/vppa/solar/irec) are auto-created — so there is no second placement.
5. The type attaches to the BU's **grid facility** (the one whose details are edited and whose `loadSplit` the modeller reads).

## Data model

New optional field on `Facility` (`lib/scope2/model/types.ts`):

```ts
/** Building/facility class — presets the load split & drives solar-feasibility guidance. Absent ⇒ unspecified. */
facilityType?: import("./facility-type").FacilityTypeId;
```

Absent = today's behavior (no migration; existing persisted facilities and tests unaffected).

New module `lib/scope2/model/facility-type.ts`:

```ts
import type { LoadSplit } from "./types";

export type FacilityTypeId = "office" | "warehouse" | "dataCentre" | "factory" | "retail" | "coldStorage" | "hotel";
export type SolarFeasibility = "strong" | "good" | "moderate" | "limited";

export interface FacilityTypeProfile {
  id: FacilityTypeId;
  label: string;
  loadSplit: LoadSplit;                 // { lightingPct; motorPct; hvacPct }
  solar: { feasible: SolarFeasibility; note: string };
}

export const FACILITY_TYPES: Record<FacilityTypeId, FacilityTypeProfile>;
export const FACILITY_TYPE_LIST: FacilityTypeProfile[];   // stable order for the selector
export function facilityTypeProfile(f: { facilityType?: FacilityTypeId }): FacilityTypeProfile | undefined;
```

## Taxonomy & profiles (initial, tunable)

| Type | label | Lighting | Motor | HVAC | Solar feasible | note |
|---|---|---|---|---|---|---|
| office | Office | 30 | 10 | 45 | moderate | Rooftop limited on multi-storey; partial offset. |
| warehouse | Warehouse | 55 | 15 | 15 | strong | Large flat roof — strong on-site solar potential. |
| dataCentre | Data centre | 5 | 10 | 80 | limited | Demand far exceeds roof capacity — solar offsets little. |
| factory | Factory / Manufacturing | 15 | 60 | 15 | good | Large roof area suits a sizeable array. |
| retail | Retail | 40 | 10 | 35 | moderate | Roof often shared/limited; partial offset. |
| coldStorage | Cold storage | 5 | 70 | 15 | good | Roof area suits solar; refrigeration dominates load. |
| hotel | Hotel | 25 | 15 | 45 | moderate | Mixed roof use; partial offset. |

Load-split values are advisory starting points (lighting+motor+HVAC ≤ 100; remainder is "other"). They are illustrative and tunable.

## UI changes (`components/tabs/activity/ElectricityBuScreen.tsx`)

Inside the existing grid-facility details block (`gridFac` is defined):

1. Add a **"Facility type"** `SelectField` (from `./fields`) at the top of the details (e.g. above "Cost & grid factor"). Value = `f.facilityType ?? ""`; options = `Unspecified` + `FACILITY_TYPE_LIST`.
2. On change: when a type is chosen, patch the grid facility with BOTH `facilityType` AND the type's `loadSplit` (the preset/template action). When cleared (Unspecified), set `facilityType: undefined` and leave the current load split as-is.
3. In the **"On-site solar potential"** `DetailCard`, render a **solar-feasibility badge** derived from the facility type (colour by feasibility: strong/good = brand/green, moderate = neutral, limited = amber ⚠). Only shown when a type is set.

No change to `defaultActions`-equivalent or any scope2 model computation — the preset writes straight to `Facility.loadSplit`, which the existing efficiency levers already consume.

## Non-goals (this phase)

- No solar *yield*/irradiance presetting (geography, not building type).
- No change to scope2 emission or lever math.
- No facility-type control on the old `components/scope2/DataInputTab.tsx` (the activity flow is the live screen). Leave it untouched.
- Refrigerant granularity is Phase 3.

## Testing

- `facility-type.ts`: all 7 ids have a profile, `.id` self-consistent; `FACILITY_TYPE_LIST` length 7 in stable order; `facilityTypeProfile({facilityType})` returns the profile or undefined; each `loadSplit` sums ≤ 100.
- `ElectricityBuScreen`: selecting a facility type applies its load split (e.g. Warehouse → lighting 55) and renders the solar-feasibility note; a facility with no type renders no badge (backward-compat).
- Backward compat: facilities without `facilityType` behave exactly as before; existing scope2 tests stay green.

## Files touched

- `lib/scope2/model/types.ts` — add `facilityType?` field.
- `lib/scope2/model/facility-type.ts` — **new**: taxonomy + profiles + helpers.
- `components/tabs/activity/ElectricityBuScreen.tsx` — facility-type selector (presets load split) + solar-feasibility badge.
- Tests for the above.
