# Activity Data tab — Excel master list, per-BU input & scope drill-downs

**Date:** 2026-06-22
**Status:** Approved (design)
**Area:** `components/tabs/ActivityDataTab.tsx`, `lib/model/factors.ts`, `lib/model/types.ts`, `lib/store.tsx`, `lib/activity-groups.ts`

## Background

The data-input screen the user works in is `ActivityDataTab` (rendered for both the `data` and `data2` tabs in `Shell.tsx`). It already has:

- A **home** screen with category cards (Fuels – Gaseous/Liquid/Solid, Biomass, Refrigerants, Electricity) and a right-hand **footprint rail** showing Scope 1 / Scope 2 totals.
- A **Business Units** setup screen with two modes — `central` (one company-wide figure per source) and `bu` (per-business-unit entries that roll up). Each BU has an `aggregate` flag.
- Navigation: home → category (`cat`) → per-type BU breakdown (`type`) → per-entry screen (`entry`). Refrigerants are the exception — they render a **flat list of named systems** with inline input, with no BU breakdown.

The emission-factor source of truth is `Scope 1_GHG emission factors.xlsx`, sheet **`Emission Factor 2025`**, Column A = category ("Type"), Column B = item ("Items"). The app currently ships a **curated subset** (~22 fuels, ~50 refrigerants) rather than the full list.

## Goals

1. Make the fuel and refrigerant lists in the data-input tab match the Excel's `Emission Factor 2025` Column A (category) and Column B (item).
2. Let the user enter activity data **inline on each business-unit row**, with a per-BU hover control to include/exclude that data from the central (company-wide) total.
3. Give refrigerants the same category → type → per-BU flow as fuels.
4. Make the Scope 1 and Scope 2 cards open a drill-down screen listing every source with its raw value and emissions.

### Out of scope (confirmed with user)

- **Process Emissions** (6 items) and **Fugitive Emissions / HFC–PFC gases** (37 items) from the Excel are NOT added. Only **Fuels – Liquid / Gas / Solid** and **Refrigerants** are in scope.
- No change to the modeller, action-plan, finance, compare, or CEO-overview tabs beyond what the shared factor/type/store changes require.

## Source data (verified against the workbook)

Sheet `Emission Factor 2025`, in-scope rows:

| Column A | # items | Notes |
|---|---|---|
| Fuels – Liquid | 15 | Diesel, Petrol, Fuel Oil/Furnace Oil, Lubricants, Kerosene, Residual Fuel Oil, 4× Marine fuels, Marine Gas Oil, Jet Fuel, Aviation Gasoline, Biodiesel, Bio Briquettes |
| Fuels – Gas | 9 | LNG, LPG, Butane, Propane, CNG-SCM, CNG-KG, PNG, Biogas, Landfill gas |
| Fuels – Solid | 11 | Petroleum Coke, 7× Coal variants, Wood Pellets/Chips/Logs |
| Refrigerants | 66 | R-401A … R-512A |

Per-row data available:
- **Emission factor:** DEFRA 2022/2023/2024/2025 columns for most rows; IPCC 2014 / IPCC 2006 for others; IMO 2024 for marine fuels. ~10 fuel rows have **no DEFRA** value (marine fuels, anthracite, bituminous, lignite, briquettes, biodiesel, bio briquettes).
- **Unit (Column D):** `Co2e (kg/l)` → `L`, `Co2e (kg/m3)` → `m3`, `Co2e (kg/kg)` → `kg`, `Co2e (kg/tonne)` → `t`.
- **Density** (kg/m³, kg/L) and **calorific value** (kJ/kg) present for most fuels, missing for marine fuels / some coals.
- **Refrigerant GWP:** carried in the factor columns as kgCO₂e/kg (e.g. R-404A = 3943).

## Design

### A. Master list (data layer)

**Extraction:** A one-off Node/Python script reads the workbook and regenerates the `FUELS` and `REFRIGERANTS` records in `lib/model/factors.ts`. Output is committed data, not runtime parsing — the engine already treats factors as data and re-derives from them.

**Fuels (`FUELS`, `FuelFactor`):**
- One entry per in-scope fuel row, keyed by a stable id. **Existing ids are preserved** (`diesel`, `png`, `lpg`, `coal`, `biogas`, …) so the seeded Ventive dataset and any saved localStorage data keep resolving; **new rows get new ids**. Labels are updated to the exact Excel Column-B names.
- Emission factor selection per fuel, in priority order: **DEFRA (by year, 2022–2025)** → **IPCC 2014** → **IMO 2024**. The chosen source + year are recorded on the factor so the UI can badge it ("DEFRA 2025", "IPCC 2014", "IMO 2024", with a "nearest available" flag when the requested FY is clamped).
- `densityKgPerUnit` and `cvKJperKg` from the Excel where present; a flag/absence marks fuels without them.
- `renewable` flag taken from the Excel Column C ("Renewable" / "Non Renewable").
- `unit` per the Column-D basis.

**`defraEF` / EF lookup:** generalised so a fuel can declare a non-DEFRA source. Existing DEFRA-by-year behaviour is unchanged for fuels that have DEFRA factors. Return type keeps `{ value, sourceYear, exact }` and adds a `source: "DEFRA" | "IPCC" | "IMO"` discriminator.

**Calc panel (`combustionBreakdown` / `CombustionCalc`):** when a fuel lacks density or CV, the "Energy (GJ)" step is omitted; the emissions step (volume × EF ÷ 1000) always renders.

**Refrigerants (`REFRIGERANTS`, `RefrigerantFactor`):**
- One entry per of the 66 gases, GWP from the Excel factor column. Existing ids preserved; missing gases added.
- `era` / `natural` / `volAdj` / `note` are advisory fields used by the Refrigerant advisor lever. New gases get a best-effort `era` classification and neutral defaults; the advisor's curated upgrade-target list (`ALT_REFRIGERANT_IDS`, `RECOMMENDED_ALT_BY_SYSTEM`) is unchanged so the lever keeps working.

### B. Category structure

Match the Excel Column A. The separate **Biomass** family/category is removed; renewable fuels return to Liquid/Gas/Solid, distinguished by the `renewable` flag.

- `lib/activity-groups.ts`: `FuelFamily` becomes `"liquid" | "gas" | "solid"` (drop `"biomass"`). `fuelFamily(id)` maps by the fuel's Excel category, not by renewable status.
- `CAT_DEFS` in `ActivityDataTab` becomes: Fuels – Liquid, Fuels – Gas, Fuels – Solid (Scope 1), Refrigerants (Scope 1), Electricity (Scope 2).
- The **stationary / mobile** toggle stays. Every fuel is available under both modes (no per-fuel restriction); the toggle sets the `category` of newly created combustion entries (which the modeller's electrification levers use).
- The "Outside of Scopes — Biogenic CO₂" panel is unchanged — it keys off the `renewable` flag and `biogenicCO2ePerUnit`, which persist.

### C. Inline per-BU input + central toggle

On the `type` screen (per fuel, and now per refrigerant gas), in `bu` mode each BU row is interactive:

- **Inline numeric field + unit.** For fuels: annual consumption in the fuel's display unit (litres/kg/m³/tonne). For refrigerants: kg topped-up. First edit creates the BU's entry (via `openEntry`-style create-if-missing logic, but without navigating away).
- **Live emissions** shown beside the field.
- **Hover controls** on the row:
  - **Central toggle** — include/exclude this BU's data from the rolled-up company total. Wired to the entry's `excluded` flag (true = excluded). Default for a new entry follows the BU's `aggregate` flag.
  - **Gear** — opens the full detail/entry screen (units, calc, spend, remaining life for fuels; system type, gas cost, leak detail for refrigerants).
- `central` mode is unchanged (single company-wide entry per type, opened via the existing card).

### D. Refrigerants follow the fuel flow

- `RefrigerationSystem` gains `bu?: string` and `excluded?: boolean` (mirroring `CombustionAsset`).
- `lib/store.tsx`: Scope 1 baseline and compute filter out excluded systems — `baselineScope1(selectedAssets.filter(!excluded), selectedSystems.filter(!excluded))` and the matching `compute(...)` line. (Today only combustion is filtered; refrigerant exclusion is a latent gap this surfaces.)
- New store method `addRefrigerationSystem(year, system)` parallel to `addCombustionAsset`, registering default `SystemActions`.
- `ActivityDataTab`: the Refrigerants category renders **gas-type cards** (each gas in the master list that has data, or all gases offered to add), then a per-BU `type` screen identical in shape to fuels. The flat-system `Row` list is removed.
- The per-gas, per-BU entry: name defaults to `<gas> — <BU>`, `systemType` default `commercialHVAC`, `gasCostPerKg` default seeded.

### E. Scope 1 / Scope 2 drill-down

- New `nav` level: `{ level: "scope"; scope: 1 | 2 }`.
- The Scope 1 and Scope 2 cards in the footprint rail become buttons opening that level.
- The screen header shows the scope total. Body is **grouped by category** (Fuels – Liquid / Gas / Solid / Refrigerants for Scope 1; Electricity for Scope 2). Each row: **source label · BU · raw value + unit · emissions (t)**. Excluded entries are shown muted/marked as not in total (or omitted — see open detail below). Back button → home.

### F. File organisation

`ActivityDataTab.tsx` (~630 lines today) is split so each screen is its own focused module, sharing types/helpers:

- `components/tabs/activity/types.ts` — `Nav`, `CatKey`, `CAT_DEFS`, `ELEC_TYPES`, shared meta maps.
- `components/tabs/activity/HomeScreen.tsx`
- `components/tabs/activity/CategoryScreen.tsx`
- `components/tabs/activity/TypeScreen.tsx` (the inline-BU-row screen)
- `components/tabs/activity/EntryScreen.tsx` (fuel + facility detail entry)
- `components/tabs/activity/BusinessUnitsScreen.tsx`
- `components/tabs/activity/ScopeScreen.tsx`
- `ActivityDataTab.tsx` becomes the nav-state container that picks the screen.

No unrelated refactoring; this split is scoped to the screens being changed.

## Data flow

```
Excel (Emission Factor 2025)
  └─ extraction script ─▶ lib/model/factors.ts  (FUELS, REFRIGERANTS)  [build-time, committed]

User input (per BU)
  └─ TypeScreen inline field ─▶ store.updateCombustion / updateRefrigeration
                                    (create-if-missing per (BU, type[, category]))
  └─ central toggle ─▶ store.update*( { excluded } )

store selectors
  selectedAssets / selectedSystems  ──filter(!excluded)──▶ baselineScope1 ─▶ totals
                                                          └─▶ footprint rail (Scope 1/2)
                                                          └─▶ ScopeScreen (grouped list)
```

## Migration & compatibility

- `FuelId` / `RefrigerantId` unions are **extended**, not renamed — existing ids stay valid.
- `RefrigerationSystem` gains optional `bu` / `excluded`; older saved systems (no field) read as Central + included. `migrateRefrigeration` in `store-helpers` left as-is unless a default is needed.
- Removing the `biomass` `FuelFamily` value: any code referencing it (`FAMILY_DEFAULT_FUEL`, `META`/`GRAD`/`CAT_ICON` keys, `fuelFamily`) is updated in lockstep.

## Testing

- **Unit (vitest):** EF lookup picks DEFRA→IPCC→IMO correctly per fuel; `combustionCO2e` for a non-DEFRA fuel (e.g. a marine fuel) matches Excel; refrigerant GWP matches Excel for a sample of gases; `fuelFamily` returns the Excel category; excluded combustion AND refrigerant entries are dropped from `baselineScope1`.
- **Render (vitest + testing-library):** `ActivityDataTab` renders home with the new 4 Scope-1 categories; a fuel `type` screen renders inline BU rows; refrigerant `type` screen renders per-gas → per-BU; scope drill-down lists sources grouped by category.
- **Manual:** enter a fuel value for a BU, toggle central off, confirm the Scope 1 total drops; same for a refrigerant; open Scope 1 drill-down and confirm every source listed.

## Open details (decide during implementation, low-risk)

- Whether the scope drill-down **omits** excluded entries or shows them greyed with an "excluded" tag. Default: show greyed (more transparent).
- Exact `era` classification for newly added refrigerant gases (advisory only).
- Display-unit default per new fuel (use the Excel reference unit unless a friendlier display unit exists, e.g. show LNG in kg).
