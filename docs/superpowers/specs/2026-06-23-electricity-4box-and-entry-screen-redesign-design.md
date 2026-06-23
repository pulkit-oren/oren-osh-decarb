# Electricity BU-first 4-box flow & per-BU entry-screen redesign

**Date:** 2026-06-23
**Status:** Approved (design)
**Area:** `components/tabs/activity/` (shared, CategoryScreen, EntryScreen, TypeScreen), `components/tabs/ActivityDataTab.tsx`

## Background

The Activity Data tab (`components/tabs/ActivityDataTab.tsx`, split into `components/tabs/activity/` screen modules) lets users enter Scope 1 & 2 baseline data per business unit (BU). Current flows:

- **Fuels / Bio Fuels:** category → fuel-type cards → per-BU rows (inline input + central toggle + gear) → full entry screen.
- **Refrigerants:** category → gas-type cards → per-BU rows → gear opens a **side `DetailPanel`** (inconsistent with fuels' full screen).
- **Electricity:** category → instrument-type cards (Grid / VPPA / I-REC / Any) → per-BU rows → per-(BU,instrument) entry screen. Each instrument is a separate `Facility` record (grid EF 0.71; VPPA/I-REC/Any 0 except Any=0.71).

The Scope 2 model (`lib/scope2/model/`) operates per `Facility` (annualLoadKwh + gridEf + loadSplit + roof/solar + existing renewables), with efficiency / on-site-generation / procurement levers applied in the modeller.

The per-BU entry screen currently shows the consumption input, a column of scenario-modeller fields, and an **always-visible** "How this is calculated" block.

## Goals

1. **Electricity becomes BU-first with a 4-box entry screen.** Clicking Electricity goes straight to the BU list; clicking a BU opens one screen with four kWh inputs: Purchased electricity, Virtual PPA, Solar onsite, I-REC.
2. **Redesign the per-BU entry screen** (fuels, refrigerants, electricity) to be clearer: prominent consumption input, a clearly-labeled "Details for the scenario modeller" group with inline help, and the emissions calculation moved into a collapsed dropdown.
3. **Make refrigerant detail a full screen** like fuels/electricity (retire the side panel for the per-BU flow).

### Out of scope

- No change to the Scope 1/Scope 2 modeller math, action-plan, compare, or CEO tabs (beyond the data they already read).
- No new heavy input widgets (no sliders/steppers) — the approved direction is clearer grouping + inline help + the calc dropdown.
- Solar/PPA/REC remain baseline data here; the modeller's procurement/generation levers are unchanged.

## Design

### A. Electricity: BU-first 4-box flow

**Data model — unchanged:** one `Facility` record per (BU, instrument). The four instruments are a fixed set defined in `ELEC_TYPES`:

| key | label | gridEf default |
|---|---|---|
| `grid` | Purchased electricity | 0.71 |
| `vppa` | Virtual PPA | 0 |
| `solar` | Solar onsite | 0 |
| `irec` | I-REC | 0 |

(`solar` replaces the current `any`. The `icon`/`sub` fields stay for display.)

**Navigation:**
- Electricity category card → BU list (no instrument-card screen). This is the `cat` screen's electricity branch, rendered as a BU list (mirrors the fuel `type`-screen BU breakdown, but keyed to the BU and summing all four instruments).
  - In `central` mode: a single "Central (company-wide)" row.
  - In `bu` mode: one row per BU, showing the BU's **total electricity emissions** (sum of its four records' emissions) + the **central toggle** + a chevron.
- Click a BU (or the Central row) → the **4-box electricity entry screen** (new nav target — see Section C).
- The per-instrument electricity `type` path is retired. Fuels/Bio Fuels/refrigerants keep their category → type → per-BU-row flow.

**Emissions:** `Purchased × gridEf ÷ 1000` (the `grid` facility). VPPA, Solar onsite, and I-REC carry gridEf 0, so they contribute 0. The BU-row total = sum across the four records (only `grid` is non-zero).

**Central toggle (electricity BU row):** flips `excluded` on **all four** of that BU's facility records together (so a non-aggregated BU drops entirely from totals). Uses the same create-if-missing + `?? { excluded: !aggregate }` fallback pattern used by the fuel/refrigerant toggles, applied across the (up to) four records.

### B. Per-BU entry screen redesign

Applies to all three source kinds, restructured into zones:

1. **Header** — emoji/icon, source name (editable where it is today), `· BU · FY`, and the live emissions (large, right-aligned).
2. **Consumption** — the primary input(s) prominent:
   - Fuel/Bio Fuel: annual volume + display-unit selector (existing `fromRef`/`toRef`).
   - Refrigerant: kg topped-up.
   - Electricity: the **four kWh boxes** (Purchased, VPPA, Solar onsite, I-REC), each labeled, with the live per-source and total emissions shown.
3. **"Details for the scenario modeller"** — a clearly-labeled, well-spaced group with an (i) explainer header and inline (i) help per field:
   - Fuel/Bio Fuel: Category (Stationary/Mobile), Units, Spend (metered/₹-spend toggle — existing), Remaining life. (Reuses `CombustionDetails`' fields, regrouped.)
   - Refrigerant: System type, Gas cost. (Reuses `RefrigerantDetails`' fields.)
   - Electricity: Grid EF, Tariff, Load split, Roof space / solar potential, Isolated-grid toggle, existing solar/green-contract fields. (Reuses `FacilityDetailContent`.)
4. **"How this is calculated"** — a **collapsed-by-default dropdown** (accordion). Expanding shows the existing breakdown component (`CombustionCalc` / `RefrigerantCalc` / the electricity calc lines). A small chevron + label toggles it.

**Refrigerant full screen:** the per-BU refrigerant gear navigates to a full entry screen (new `entry` kind `refrigerant`) instead of opening the side `DetailPanel`. The screen reuses `RefrigerantDetails` + `RefrigerantCalc` inside the new zone layout. The side `DetailPanel` may remain for any other caller, but the per-BU flow uses the full screen.

A small reusable **`Collapsible`** (or `<details>`-based) component holds the calc dropdown; used by all three entry screens.

### C. Mechanics

- **Nav type (`shared.tsx`):** add an electricity-BU target. Two options considered; chosen: extend the `entry` variant with `kind: "electricityBU"` carrying `bu: string` (the screen resolves/creates the four facilities for that BU), OR add a dedicated `{ level: "elecbu"; bu: string }`. **Decision:** add `{ level: "elecbu"; bu: string }` — it keeps the existing `entry` (single-record) screen simple and makes the multi-record electricity screen explicit. Also add `kind: "refrigerant"` to the `entry` variant for the refrigerant full screen.
- **`ELEC_TYPES`:** replace `any` with `solar` (label "Solar onsite", gridEf 0); keep `grid`/`vppa`/`irec`.
- **`CategoryScreen.tsx`:** electricity branch renders the BU list (central + bu modes) instead of instrument cards; rows navigate to `{ level: "elecbu", bu }` (or the Central equivalent with `bu: ""`).
- **`EntryScreen.tsx`:** (1) restructure the combustion + facility entry into the three-zone layout with the calc `Collapsible`; (2) add the 4-box electricity-BU screen (resolves the four facilities for the BU via an `ensureFacility(bu, instrumentKey)` helper, renders four inputs + the shared modeller-details + calc dropdown); (3) add the refrigerant full screen.
- **`ActivityDataTab.tsx`:** route `nav.level === "elecbu"` → the 4-box screen; route `entry`+`kind: "refrigerant"` → refrigerant screen. Add helpers: `ensureFacility(bu, key, agg)` (find/create the (BU,instrument) facility), `buElecEmissions(bu)` (sum), and the per-BU electricity central toggle.
- **`TypeScreen.tsx`:** the refrigerant gear navigates to the refrigerant full screen (`{ level: "entry", kind: "refrigerant", id }`) instead of `setSel(...)`.
- The **Scope 2 drill-down** (`ScopeScreen`) already lists by facility; it keeps working and now shows the four instruments per BU (Purchased/VPPA/Solar/I-REC rows).

## Data flow

```
Electricity card → CategoryScreen (electricity branch)
  central mode → one "Central" row → {level:"elecbu", bu:""}
  bu mode      → one row per BU (total = Σ 4 facilities) + central toggle
                  → {level:"elecbu", bu}

elecbu screen (4 boxes):
  for each instrument k in [grid,vppa,solar,irec]:
    input kWh → ensureFacility(bu,k) → s2.updateFacility(year,id,{annualLoadKwh})
  emissions = grid facility load × gridEf ÷ 1000  (others 0)
  details (collapsible-ready) → FacilityDetailContent on the grid facility
  calc dropdown → location-based formula

entry screen (fuel / refrigerant):
  consumption input (existing) → store update
  modeller details group (existing fields, regrouped)
  calc dropdown (collapsed) → CombustionCalc / RefrigerantCalc
```

## Testing

- **Render/interaction (vitest + testing-library):**
  - Electricity card → BU list (no instrument cards); a BU row shows the central toggle.
  - Clicking a BU → the 4-box screen; typing in Purchased updates emissions; typing in VPPA/Solar/I-REC leaves emissions unchanged (0 contribution).
  - Electricity central toggle excludes the BU's electricity from the Scope 2 total.
  - Entry screen: "How this is calculated" is collapsed by default and expands on click; the modeller-details group renders its fields.
  - Refrigerant gear → full refrigerant screen (not the side panel); calc dropdown present.
- **Existing tests:** update electricity-flow tests (instrument cards gone), the refrigerant gear test (full screen now), and any scope-drill-down assertion referencing electricity rows.
- **Unit:** `buElecEmissions(bu)` sums the four records and counts only `grid × gridEf`.

## Migration & compatibility

- Existing electricity `Facility` records created under the old instrument types still resolve: `grid`, `vppa`, `irec` keys are unchanged; old `any` records (if any) map to `grid` behaviour (gridEf 0.71) or are surfaced under Purchased — the 4-box screen keys facilities by `name === ELEC_TYPES[k].label`, so a legacy "Other / Any" facility would appear as an extra record; acceptable (rare; the seed uses none). No `Facility` field changes.
- No type unions removed. Nav type is extended only.

## Open details (low-risk, decide in implementation)

- Exact `Collapsible` implementation (native `<details>` vs a small controlled component) — pick the one matching existing styling.
- Whether the electricity modeller-details (load split, roof/solar) attach only to the `grid` facility (recommended) or are shown once per BU — recommended: on the `grid` facility, since that is what the efficiency/generation levers act on.
