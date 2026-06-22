# Activity Data — Excel Master List, Per-BU Input & Scope Drill-downs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Activity Data tab's fuel and refrigerant lists match the `Emission Factor 2025` workbook, let users enter activity data inline per business unit with a per-BU "include in central total" toggle, give refrigerants the same category→type→per-BU flow as fuels, and add clickable Scope 1 / Scope 2 drill-down screens.

**Architecture:** A one-off Node extraction script (using the already-installed `exceljs`) regenerates the `FUELS` and `REFRIGERANTS` data in `lib/model/factors.ts` from the workbook, extending — never removing — existing ids so the seed, levers and saved data keep resolving. The emission-factor lookup is generalised to fall back DEFRA→IPCC→IMO. `RefrigerationSystem` gains `bu`/`excluded` (combustion already has them) and the Scope 1 store filters excluded systems. `ActivityDataTab.tsx` is split into per-screen modules; the type screen gains inline per-BU input + a hover central toggle, refrigerants get the fuel flow, and a new scope drill-down screen is added.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind 4, lucide-react (icons), vitest 4 + @testing-library/react (jsdom), exceljs 4.

## Global Constraints

- **No git repository.** The project is not under version control. Each task's final step is a **verification checkpoint** (`npm test`, plus `npx tsc --noEmit` for type-touching tasks), not a commit. If the user later runs `git init`, the same boundaries make good commits.
- **Test runner:** `npm test` runs `vitest run`. Run a single file with `npx vitest run <path>`.
- **Path alias:** `@/` maps to the project root (e.g. `@/lib/model/factors`).
- **AGENTS.md:** "This is NOT the Next.js you know." Do not add Next.js APIs; this work is client components + pure TS only. No new runtime dependencies (exceljs is dev-time only, already installed).
- **Never remove an existing `FuelId` or `RefrigerantId`** — the seed (`lib/defaults.ts`), the levers (`ALT_FUELS_BY_FUEL`, `ALT_REFRIGERANT_IDS`, `RECOMMENDED_ALT_BY_SYSTEM`) and persisted localStorage data reference them. Only **add** ids and **update labels/factors**.
- **Workbook location:** `C:/Users/rakes/Documents/Dashboard Module/scenario/Scope 1_GHG emission factors.xlsx`, sheet `Emission Factor 2025`. Column A = type, B = item, D = unit string, cols 8–11 = DEFRA 2025/2024/2023/2022, col 15 = IPCC 2014, col 18 = IMO 2024, col 5 = DEFRA density kg/m³, col 6 = DEFRA density kg/L, col 7 = calorific value kJ/kg, col C(3) = Renewable/Non-Renewable.
- **Unit basis mapping** (Column D → `FuelUnit`): `Co2e (kg/l)`→`L`, `Co2e (kg/m3)`→`m3`, `Co2e (kg/kg)`→`kg`, `Co2e (kg/tonne)`→`t`.

---

## Authoritative id ↔ Excel-row mapping

This table is the single source of truth for the extraction script. **Existing ids** keep their key; **new ids** are added.

### Fuels — existing ids mapped to an Excel row (update label + factors + tag category)

| id | Excel Column-B name | family | renewable |
|---|---|---|---|
| `diesel` | Diesel | liquid | no |
| `petrol` | Petrol | liquid | no |
| `fuelOil` | Fuel Oil / Furnace Oil | liquid | no |
| `kerosene` | Kerosene / Burning Oil | liquid | no |
| `lpg` | Liquefied Petroleum Gases (LPG) | gas | no |
| `propane` | Propane | gas | no |
| `butane` | Butane | gas | no |
| `cng` | Compressed Natural Gas (CNG) - KG | gas | no |
| `png` | Piped Natural Gas (PNG) | gas | no |
| `coal` | Coal (Industrial) | solid | no |
| `cokingCoal` | Coal - Coking | solid | no |
| `lignite` | Coal - Lignite | solid | no |
| `petcoke` | Petroleum Coke | solid | no |
| `biogas` | Biogas | gas | yes |
| `bioBriquettes` | Bio Briquettes | liquid | yes |

### Fuels — existing ids with NO Excel row (keep as-is, NOT shown in Activity tab)

`ldo`, `naphtha`, `bioCng`, `biomass`, `bagasse`, `riceHusk` — leave their current data unchanged; do **not** set an `excelCategory`.

### Fuels — NEW ids to add (key → Excel Column-B name, family, renewable)

| new id | Excel Column-B name | family | renewable |
|---|---|---|---|
| `lubricants` | Lubricants | liquid | no |
| `residualFuelOil` | Residual Fuel Oil | liquid | no |
| `marineHfoVlsfo` | Marine Heavy Fuel Oil (VLSFO) | liquid | no |
| `marineHfoHsfo` | Marine Heavy Fuel Oil (HSFO) | liquid | no |
| `marineLfoUlsfo` | Marine Light Fuel Oil (ULSFO) | liquid | no |
| `marineLfoVlsfo` | Marine Light Fuel Oil (VLSFO) | liquid | no |
| `marineGasOil` | Marine Gas Oil (ULSGO) | liquid | no |
| `jetFuel` | Jet Fuel (Aviation Turbine Fuel) | liquid | no |
| `aviationGasoline` | Aviation Gasoline (Aviation Spirit) | liquid | no |
| `biodiesel` | Biodiesel | liquid | yes |
| `lng` | Liquefied Natural Gas (LNG) | gas | no |
| `cngScm` | Compressed Natural Gas (CNG) - SCM | gas | no |
| `landfillGas` | Landfill gas | gas | yes |
| `coalAnthracite` | Coal - Anthracite | solid | no |
| `coalBituminous` | Coal - Bituminous | solid | no |
| `coalBriquettes` | Coal - Briquettes | solid | no |
| `coalElectricity` | Coal (Electricity Generation) | solid | no |
| `woodPellets` | Wood Pellets | solid | yes |
| `woodChips` | Wood Chips | solid | yes |
| `woodLogs` | Wood Logs | solid | yes |

> Note: `biodiesel` is **new as a `FuelId`** (currently it only exists as an `AltFuelId`). The `AltFuelId` of the same name is unrelated and stays. Bio Briquettes / Biodiesel appear under **Fuels – Liquid** per the workbook's Column A.

### Refrigerants

- Existing `RefrigerantId`s: keep all. For any whose stripped-dash name matches an Excel Column-B row (e.g. `R404A`→`R404A`), **update `gwp` to the Excel value** and set `inExcel: true`.
- Add a new `RefrigerantId` for every Excel Column-B refrigerant (rows 81–146) not already present (e.g. `R401A`, `R402A`, `R500`, `R508A`, `R512A`, …), `gwp` = Excel factor value, `inExcel: true`, `era: "legacy"` (default for added blends), `natural: false`, `volAdj: 1`, `note: "Imported from emission-factor workbook."`.
- App-only gases not in the workbook (`R32`, `R290`, `R717`, `R744`, `R1234yf`, etc.): leave unchanged, `inExcel` falsy. They remain valid advisor upgrade targets but are not shown as selectable charged gases in the Activity tab.

---

## File Structure

**Create:**
- `scripts/generate-factors.mjs` — dev tool: reads the workbook, emits the `FUELS`/`REFRIGERANTS` source blocks.
- `data/emission-factors-2025.json` — committed extracted rows (the script's intermediate output), so regeneration is reproducible without the absolute workbook path.
- `components/tabs/activity/shared.ts` — `Nav`, `Sel`, `CatKey`, `CAT_DEFS`, `ELEC_TYPES`, `META`/`GRAD`/`CAT_ICON`/`ICON_COLOR` maps, small helpers (`facCO2e`, `newId`, `showNum`, `unitLabel`, `IconTile`, `ScopeBadge`).
- `components/tabs/activity/HomeScreen.tsx`
- `components/tabs/activity/CategoryScreen.tsx`
- `components/tabs/activity/TypeScreen.tsx`
- `components/tabs/activity/EntryScreen.tsx`
- `components/tabs/activity/BusinessUnitsScreen.tsx`
- `components/tabs/activity/ScopeScreen.tsx`
- `components/tabs/activity/useBuConfig.ts` — the BU-config hook (mode + units), extracted from `ActivityDataTab`.

**Modify:**
- `lib/model/types.ts` — extend `FuelId`/`RefrigerantId` unions, add `FuelFactor` fields (`efSource`, optional density/cv, `excelCategory`), `RefrigerantFactor.inExcel`, `RefrigerationSystem.bu`/`excluded`.
- `lib/model/factors.ts` — regenerated `FUELS`/`REFRIGERANTS`; `defraEF`→`efFor` generalisation.
- `lib/model/baseline.ts` — use `efFor`; guard energy on missing density/cv.
- `lib/activity-groups.ts` — `FuelFamily` = `liquid|gas|solid`; `fuelFamily` keys off `excelCategory`; add `fuelsInExcelFamily`.
- `lib/store.tsx` — filter excluded refrigeration; add `addRefrigerationSystem`.
- `lib/store-helpers.ts` — preserve `bu`/`excluded` in `migrateRefrigeration`.
- `components/tabs/ActivityDataTab.tsx` — becomes the nav container that renders the screen modules.
- `components/tabs/DataInputTab.tsx` — `efFor` rename in the DEFRA badge line.
- Tests: `lib/model/__tests__/factors.test.ts`, `refrigerant-compute.test.ts`, `components/tabs/__tests__/activity-data.test.ts`.

---

## Task 1: Generalise the emission-factor lookup (DEFRA → IPCC → IMO)

**Files:**
- Modify: `lib/model/types.ts` (FuelFactor interface)
- Modify: `lib/model/factors.ts` (EFLookup, defraEF→efFor)
- Modify: `lib/model/baseline.ts:12-14, 83-103`
- Modify: `components/tabs/DataInputTab.tsx:192`
- Test: `lib/model/__tests__/factors.test.ts`

**Interfaces:**
- Produces: `efFor(fuelId: FuelId, year?: number): EFLookup` where `EFLookup = { value: number; sourceYear: number; exact: boolean; source: "DEFRA" | "IPCC" | "IMO" }`. `FuelFactor` gains `efSource: "DEFRA" | "IPCC" | "IMO"` and `densityKgPerUnit?`/`cvKJperKg?` become optional (`number | undefined`).
- Consumes (later tasks): `efFor` replaces `defraEF` everywhere.

- [ ] **Step 1: Write the failing test** — append to `lib/model/__tests__/factors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { efFor, FUELS } from "../factors";

describe("efFor source fallback", () => {
  it("uses DEFRA by year when present", () => {
    const ef = efFor("diesel", 2025);
    expect(ef.source).toBe("DEFRA");
    expect(ef.value).toBeCloseTo(2.57082, 5);
    expect(ef.exact).toBe(true);
  });
  it("clamps an out-of-range year for a DEFRA fuel", () => {
    const ef = efFor("diesel", 2030);
    expect(ef.sourceYear).toBe(2025);
    expect(ef.exact).toBe(false);
  });
  it("falls back to IMO for a marine fuel with no DEFRA factor", () => {
    const ef = efFor("marineHfoHsfo", 2025);
    expect(ef.source).toBe("IMO");
    expect(ef.value).toBeCloseTo(3.1251428, 5);
  });
  it("falls back to IPCC for anthracite", () => {
    const ef = efFor("coalAnthracite", 2025);
    expect(ef.source).toBe("IPCC");
    expect(ef.value).toBeCloseTo(2643.09, 2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/model/__tests__/factors.test.ts`
Expected: FAIL — `efFor is not a function` / unknown ids `marineHfoHsfo`, `coalAnthracite` (these arrive in Task 2; this task makes `efFor` exist and the diesel cases pass).

> The two fallback cases reference ids added in Task 2. Mark them `it.todo` until Task 2, OR implement Task 2 immediately after; the diesel cases must pass at the end of this task.

- [ ] **Step 3: Extend `FuelFactor` in `lib/model/types.ts`** — change the interface so density/cv are optional and add the source tag and category. Replace the `densityKgPerUnit`/`cvKJperKg`/`co2eFactor`/`co2eByYear` region (lines ~52-60) with:

```ts
  /** kg of fuel per `unit`. Absent when the workbook has no density (energy step hidden). */
  densityKgPerUnit?: number;
  /** Calorific value, kJ per kg. Absent when the workbook has none. */
  cvKJperKg?: number;
  /** Combustion emission factor, kgCO2e per `unit` (the chosen source's latest). */
  co2eFactor: number;
  /** DEFRA emission factor by year (kgCO2e per `unit`). Empty for non-DEFRA fuels. */
  co2eByYear: Record<number, number>;
  /** Which dataset `co2eFactor`/`co2eByYear` came from. */
  efSource: "DEFRA" | "IPCC" | "IMO";
  /** Workbook Column-A family this fuel is listed under; absent ⇒ app-only, hidden in Activity tab. */
  excelCategory?: "liquid" | "gas" | "solid";
```

- [ ] **Step 4: Generalise the lookup in `lib/model/factors.ts`** — replace the `EFLookup` interface and `defraEF` function (lines ~267-282) with:

```ts
export interface EFLookup {
  value: number;
  sourceYear: number;
  exact: boolean; // true if the requested year had its own factor
  source: "DEFRA" | "IPCC" | "IMO";
}

/** Non-DEFRA reference years for the badge. */
const SOURCE_YEAR: Record<"IPCC" | "IMO", number> = { IPCC: 2014, IMO: 2024 };

/** Emission factor for a fuel in a given year. DEFRA fuels clamp to the
 *  available DEFRA range; IPCC/IMO fuels return their single year-independent
 *  factor. */
export function efFor(fuelId: FuelId, year: number = LATEST_DEFRA_YEAR): EFLookup {
  const f = FUELS[fuelId];
  if (f.efSource !== "DEFRA") {
    return { value: f.co2eFactor, sourceYear: SOURCE_YEAR[f.efSource], exact: false, source: f.efSource };
  }
  const min = DEFRA_YEARS[0];
  const max = DEFRA_YEARS[DEFRA_YEARS.length - 1];
  const clamped = Math.max(min, Math.min(max, year));
  const value = f.co2eByYear[clamped] ?? f.co2eFactor;
  return { value, sourceYear: clamped, exact: clamped === year && f.co2eByYear[year] != null, source: "DEFRA" };
}
```

- [ ] **Step 5: Update `baseline.ts`** — replace `defraEF` imports/uses. Line ~8 import: `import { efFor, getFuel, getRefrigerant, type EFLookup } from "./factors";`. Line ~13 `combustionCO2e`: `return (a.annualVolume * efFor(a.fuelType, a.year).value) / 1000;`. In `combustionBreakdown` (lines ~84-102) replace `defraEF` with `efFor`, and guard energy:

```ts
export function combustionEnergyKJ(a: CombustionAsset): number {
  const f = getFuel(a.fuelType);
  if (f.densityKgPerUnit == null || f.cvKJperKg == null) return 0;
  return a.annualVolume * f.densityKgPerUnit * f.cvKJperKg;
}
```

In `combustionBreakdown`, set `density: f.densityKgPerUnit ?? 0`, `cv: f.cvKJperKg ?? 0`, `ef: efFor(a.fuelType, a.year)`.

- [ ] **Step 6: Update the badge in `DataInputTab.tsx:192`** — replace `defraEF("diesel", selectedYear)` usages with `efFor("diesel", selectedYear)` and the label text to read `${efFor("diesel", selectedYear).source} ${efFor("diesel", selectedYear).sourceYear}`.

- [ ] **Step 7: Keep existing FUELS valid** — every current `FUELS` entry now needs `efSource: "DEFRA"` and `excelCategory` per the mapping table. (Full regeneration is Task 2; for THIS task add `efSource: "DEFRA"` to each existing entry so the file type-checks.) Run `npx tsc --noEmit` and fix any entry missing `efSource`.

- [ ] **Step 8: Verify**

Run: `npx vitest run lib/model/__tests__/factors.test.ts && npx tsc --noEmit`
Expected: diesel cases PASS; fallback cases are `todo` (Task 2 promotes them). `tsc` clean.

---

## Task 2: Extract the workbook & regenerate `FUELS`

**Files:**
- Create: `scripts/generate-factors.mjs`
- Create: `data/emission-factors-2025.json`
- Modify: `lib/model/types.ts` (FuelId union — add new ids)
- Modify: `lib/model/factors.ts` (FUELS regenerated)
- Test: `lib/model/__tests__/factors.test.ts`

**Interfaces:**
- Produces: `FUELS` record containing all existing ids (updated labels/factors/`excelCategory`) plus the 21 new ids from the mapping table. Each entry: `{ id, label, unit, densityKgPerUnit?, cvKJperKg?, co2eFactor, co2eByYear, efSource, renewable, excelCategory?, biogenicCO2ePerUnit?, typicalPricePerUnit? }`.

- [ ] **Step 1: Write the extraction script** — `scripts/generate-factors.mjs`:

```js
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";

const WB = process.argv[2] ?? "C:/Users/rakes/Documents/Dashboard Module/scenario/Scope 1_GHG emission factors.xlsx";
const UNIT = { "Co2e (kg/l)": "L", "Co2 (kg/tonne)": "t", "Co2e (kg/m3)": "m3", "Co2e (kg/kg)": "kg", "Co2e (kg/tonne)": "t" };

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(WB);
const ws = wb.getWorksheet("Emission Factor 2025");
const rows = [];
ws.eachRow((row, r) => {
  if (r < 3) return;
  const a = row.getCell(1).value, b = row.getCell(2).value;
  if (!b) return;
  const num = (c) => { const v = row.getCell(c).value; return typeof v === "number" ? v : null; };
  rows.push({
    r, type: String(a ?? "").trim(), item: String(b).trim(),
    renewable: String(row.getCell(3).value ?? "").trim() === "Renewable",
    unitStr: String(row.getCell(4).value ?? "").trim(),
    densKgM3: num(5), densKgL: num(6), cv: num(7),
    defra: { 2025: num(8), 2024: num(9), 2023: num(10), 2022: num(11) },
    ipcc2014: num(15), imo2024: num(18),
  });
});
writeFileSync("data/emission-factors-2025.json", JSON.stringify(rows, null, 2));
console.log(`Wrote ${rows.length} rows to data/emission-factors-2025.json`);
```

- [ ] **Step 2: Run the script**

Run: `node scripts/generate-factors.mjs`
Expected: `Wrote 144 rows to data/emission-factors-2025.json`. Open the JSON and confirm row 3 is Diesel with `defra.2025 = 2.57082`, row 10 is Marine Heavy Fuel Oil (HSFO) with `imo2024 = 3.1251428` and `defra` all null, row 25 is Coal - Anthracite with `ipcc2014 = 2643.09`.

- [ ] **Step 3: Add the new `FuelId`s in `types.ts`** — extend the union (after the existing entries):

```ts
  // Added from Emission Factor 2025 workbook
  | "lubricants" | "residualFuelOil" | "marineHfoVlsfo" | "marineHfoHsfo"
  | "marineLfoUlsfo" | "marineLfoVlsfo" | "marineGasOil" | "jetFuel" | "aviationGasoline"
  | "biodiesel" | "lng" | "cngScm" | "landfillGas"
  | "coalAnthracite" | "coalBituminous" | "coalBriquettes" | "coalElectricity"
  | "woodPellets" | "woodChips" | "woodLogs";
```

(Remove the trailing `;` from the previous last member `riceHusk` and re-add at the new end.)

- [ ] **Step 4: Regenerate the `FUELS` entries** — for each mapping-table fuel, build its `FuelFactor` from `data/emission-factors-2025.json`:
  - `efSource`: `"DEFRA"` if `defra[2025] != null`, else `"IPCC"` if `ipcc2014 != null`, else `"IMO"`.
  - `co2eByYear`: the non-null DEFRA years (or `{}` for non-DEFRA fuels).
  - `co2eFactor`: `defra[2025]` if DEFRA, else `ipcc2014` if IPCC, else `imo2024`.
  - `densityKgPerUnit`: for unit `L` use `densKgL`; for `m3` use `densKgM3`; for `kg`/`t` omit (mass basis) — set only when the workbook gives a density and the unit is volumetric; otherwise omit.
  - `cvKJperKg`: `cv` when present, else omit.
  - `renewable`, `excelCategory` per the mapping table.
  - For existing renewable fuels keep their `biogenicCO2ePerUnit`/`typicalPricePerUnit`; for new fuels carry over a sensible `typicalPricePerUnit` (reuse the nearest existing fuel's price, e.g. marine fuels ≈ 62, jet/aviation ≈ 80, wood ≈ 5000, biodiesel ≈ 78) and **no** `biogenicCO2ePerUnit` unless renewable (omit — out of scope to compute biogenic split for the new wood/biodiesel rows; they contribute Scope 1 = workbook EF, which is acceptable).

  Write the regenerated block into `lib/model/factors.ts` replacing the current `FUELS` object. Keep the existing app-only fuels (`ldo`, `naphtha`, `bioCng`, `biomass`, `bagasse`, `riceHusk`) unchanged except adding `efSource: "DEFRA"` (already added in Task 1) and **no** `excelCategory`.

  Example regenerated entries (verify the numbers against the JSON):

```ts
  diesel: {
    id: "diesel", label: "Diesel", unit: "L", densityKgPerUnit: 0.830565, cvKJperKg: 42839,
    renewable: false, efSource: "DEFRA", excelCategory: "liquid",
    co2eFactor: 2.57082, co2eByYear: { 2022: 2.56, 2023: 2.51, 2024: 2.51279, 2025: 2.57082 },
    typicalPricePerUnit: 92,
  },
  marineHfoHsfo: {
    id: "marineHfoHsfo", label: "Marine Heavy Fuel Oil (HSFO)", unit: "L",
    renewable: false, efSource: "IMO", excelCategory: "liquid",
    co2eFactor: 3.1251428, co2eByYear: {}, typicalPricePerUnit: 60,
  },
  coalAnthracite: {
    id: "coalAnthracite", label: "Coal - Anthracite", unit: "t",
    renewable: false, efSource: "IPCC", excelCategory: "solid",
    co2eFactor: 2643.09, co2eByYear: {}, typicalPricePerUnit: 6000,
  },
  woodPellets: {
    id: "woodPellets", label: "Wood Pellets", unit: "t", densityKgPerUnit: 650, cvKJperKg: 17280,
    renewable: true, efSource: "DEFRA", excelCategory: "solid",
    co2eFactor: 55.19389, co2eByYear: { 2022: 50.55459, 2023: 51.56192, 2024: 54.33654, 2025: 55.19389 },
    typicalPricePerUnit: 8000,
  },
```

- [ ] **Step 5: Promote the `it.todo` fallback tests from Task 1** — change them back to `it(...)`. Add coverage for the new ids:

```ts
it("every Excel-listed fuel has a category and an EF source", () => {
  const listed = Object.values(FUELS).filter((f) => f.excelCategory);
  expect(listed.length).toBe(35);
  for (const f of listed) expect(["DEFRA", "IPCC", "IMO"]).toContain(f.efSource);
});
```

- [ ] **Step 6: Verify**

Run: `npx vitest run lib/model/__tests__/factors.test.ts && npx tsc --noEmit`
Expected: PASS (all four `efFor` cases + the 35-fuel coverage test). `tsc` clean.

- [ ] **Step 7: Run the full suite to catch fallout**

Run: `npm test`
Expected: PASS. If `baseline`/`compute` tests assert old fuel labels, update the expected label strings to the new Excel names (do not change numbers — existing ids' factors are unchanged).

---

## Task 3: Regenerate `REFRIGERANTS` from the workbook

**Files:**
- Modify: `lib/model/types.ts` (RefrigerantId union, RefrigerantFactor.inExcel)
- Modify: `lib/model/factors.ts` (REFRIGERANTS)
- Test: `lib/model/__tests__/factors.test.ts`, `lib/model/__tests__/refrigerant-compute.test.ts`

**Interfaces:**
- Produces: `REFRIGERANTS` with all existing ids (GWP updated where the gas is in the workbook) plus a new id per workbook refrigerant. `RefrigerantFactor` gains `inExcel?: boolean`.

- [ ] **Step 1: Write the failing test** — append to `factors.test.ts`:

```ts
import { REFRIGERANTS } from "../factors";
describe("refrigerants from workbook", () => {
  it("R404A GWP matches the workbook value", () => {
    expect(REFRIGERANTS.R404A.gwp).toBe(3943);
    expect(REFRIGERANTS.R404A.inExcel).toBe(true);
  });
  it("includes added workbook-only blends", () => {
    expect(REFRIGERANTS.R401A?.gwp).toBe(18);
    expect(REFRIGERANTS.R512A?.inExcel).toBe(true);
  });
  it("lists exactly 66 workbook refrigerants", () => {
    expect(Object.values(REFRIGERANTS).filter((r) => r.inExcel).length).toBe(66);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run lib/model/__tests__/factors.test.ts`
Expected: FAIL — `R404A.gwp` is 3922; `R401A`/`inExcel` undefined.

- [ ] **Step 3: Add `inExcel` to `RefrigerantFactor`** (`types.ts`): add `/** Listed in the Emission Factor 2025 workbook (selectable in the Activity tab). */ inExcel?: boolean;`.

- [ ] **Step 4: Add new `RefrigerantId`s** (`types.ts`) — extend the union with every workbook refrigerant not already present, e.g.:

```ts
  // Added from Emission Factor 2025 workbook
  | "R401A" | "R401B" | "R401C" | "R402A" | "R402B" | "R403A" | "R403B" | "R405A"
  | "R407B" | "R407D" | "R407E" | "R410B" | "R411A" | "R411B" | "R412A" | "R413A"
  | "R415A" | "R415B" | "R416A" | "R417B" | "R417C" | "R418A" | "R419A" | "R419B"
  | "R420A" | "R421A" | "R421B" | "R422A" | "R422B" | "R422C" | "R422E" | "R423A"
  | "R424A" | "R425A" | "R426A" | "R428A" | "R429A" | "R430A" | "R431A" | "R434A"
  | "R435A" | "R437A" | "R439A" | "R440A" | "R442A" | "R444A" | "R445A" | "R500"
  | "R503" | "R504" | "R508A" | "R508B" | "R509A" | "R511A" | "R512A";
```

(Cross-check against the JSON rows 81–146 so none is missed and none duplicates an existing id such as `R404A`, `R407A`, `R407C`, `R407F`, `R408A`, `R410A`, `R417A`, `R422D`, `R427A`, `R438A` which already exist.)

- [ ] **Step 5: Update/extend `REFRIGERANTS`** in `factors.ts`:
  - Extend the script `scripts/generate-factors.mjs` to also dump refrigerant rows (81–146) into the JSON (their `defra[2025]` holds GWP). Re-run `node scripts/generate-factors.mjs`.
  - For each existing refrigerant whose stripped name matches a workbook row: set its `gwp` to the workbook value and add `inExcel: true`.
  - For each workbook refrigerant with no existing id: add `{ id, label: "R-XXX", gwp: <workbook>, era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." }`.

- [ ] **Step 6: Fix the refrigerant-compute test** — `refrigerant-compute.test.ts` likely asserts a tonnage using R404A's old GWP (3922). Recompute the expected value with 3943 and update the assertion. Run it:

Run: `npx vitest run lib/model/__tests__/refrigerant-compute.test.ts`
Expected: PASS after updating the expected tonnage.

- [ ] **Step 7: Verify**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. Update any test asserting a refrigerant label/GWP that changed.

---

## Task 4: Restructure fuel families to the workbook's Liquid/Gas/Solid

**Files:**
- Modify: `lib/activity-groups.ts`
- Test: `lib/activity-groups` covered via `components/tabs/__tests__/activity-data.test.ts` (Task 7) + a new unit test here.

**Interfaces:**
- Produces: `type FuelFamily = "liquid" | "gas" | "solid"`; `fuelFamily(id): FuelFamily | null` (null ⇒ app-only, not shown); `fuelsInExcelFamily(fam): { id: FuelId; label: string; renewable: boolean }[]`; `FAMILY_DEFAULT_FUEL: Record<FuelFamily, FuelId>`.

- [ ] **Step 1: Write the failing test** — create `lib/__tests__/activity-groups.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fuelFamily, fuelsInExcelFamily } from "../activity-groups";

describe("fuelFamily by workbook category", () => {
  it("maps diesel to liquid, png to gas, coal to solid", () => {
    expect(fuelFamily("diesel")).toBe("liquid");
    expect(fuelFamily("png")).toBe("gas");
    expect(fuelFamily("coal")).toBe("solid");
  });
  it("returns null for an app-only fuel not in the workbook", () => {
    expect(fuelFamily("naphtha")).toBeNull();
  });
  it("lists biodiesel under liquid (renewable)", () => {
    const liquid = fuelsInExcelFamily("liquid");
    const bd = liquid.find((f) => f.id === "biodiesel");
    expect(bd?.renewable).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run lib/__tests__/activity-groups.test.ts`
Expected: FAIL — current `fuelFamily` returns `"biomass"`/non-null for everything.

- [ ] **Step 3: Rewrite `lib/activity-groups.ts`:**

```ts
import type { FuelId } from "@/lib/model/types";
import { FUELS } from "@/lib/model/factors";

export type FuelFamily = "liquid" | "gas" | "solid";

/** Workbook Column-A family for a fuel, or null when the fuel is app-only
 *  (not listed in the Emission Factor 2025 workbook). */
export function fuelFamily(id: FuelId): FuelFamily | null {
  return FUELS[id]?.excelCategory ?? null;
}

/** All workbook-listed fuels in a family, in declaration order. */
export function fuelsInExcelFamily(fam: FuelFamily): { id: FuelId; label: string; renewable: boolean }[] {
  return (Object.keys(FUELS) as FuelId[])
    .filter((id) => FUELS[id].excelCategory === fam)
    .map((id) => ({ id, label: FUELS[id].label, renewable: FUELS[id].renewable }));
}

export const FAMILY_DEFAULT_FUEL: Record<FuelFamily, FuelId> = {
  liquid: "diesel",
  gas: "png",
  solid: "coal",
};
```

- [ ] **Step 4: Verify**

Run: `npx vitest run lib/__tests__/activity-groups.test.ts && npx tsc --noEmit`
Expected: test PASS. `tsc` will now FAIL in `ActivityDataTab.tsx` (it references the old families/`fuelsInFamily`) — that is expected and fixed in Tasks 6–7. Note the tsc errors are confined to `ActivityDataTab.tsx`.

---

## Task 5: Give `RefrigerationSystem` BU support + filter excluded in the store

**Files:**
- Modify: `lib/model/types.ts` (RefrigerationSystem)
- Modify: `lib/store.tsx` (filter + addRefrigerationSystem)
- Modify: `lib/store-helpers.ts` (migrateRefrigeration preserves new fields)
- Test: `lib/model/__tests__/baseline.test.ts` (or new `lib/__tests__/store-exclude.test.ts`)

**Interfaces:**
- Produces: `RefrigerationSystem` gains `bu?: string` and `excluded?: boolean`. Store gains `addRefrigerationSystem(year: number, system: RefrigerationSystem): void`. `selectedBaseline`/`result` exclude `excluded` systems.

- [ ] **Step 1: Write the failing test** — create `lib/model/__tests__/baseline-exclude.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { baselineScope1 } from "../baseline";
import type { RefrigerationSystem } from "../types";

const sys = (id: string, excluded?: boolean): RefrigerationSystem => ({
  id, name: id, systemType: "commercialHVAC", refrigerant: "R410A", toppedUpKg: 10, gasCostPerKg: 900, excluded,
});

describe("baselineScope1 excludes excluded systems when the caller filters", () => {
  it("drops an excluded system from the refrigerant total", () => {
    const all = [sys("a"), sys("b", true)];
    const included = baselineScope1([], all.filter((s) => !s.excluded));
    const both = baselineScope1([], all);
    expect(both.refrigerantT).toBeGreaterThan(included.refrigerantT);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run lib/model/__tests__/baseline-exclude.test.ts`
Expected: FAIL — `excluded` not assignable to `RefrigerationSystem`.

- [ ] **Step 3: Add fields to `RefrigerationSystem`** (`types.ts`, after `toppedUpKg`):

```ts
  /** Business unit this entry belongs to. Absent ⇒ Central (consolidated). */
  bu?: string;
  /** When true, excluded from all footprint totals (a non-aggregated BU). */
  excluded?: boolean;
```

- [ ] **Step 4: Filter excluded systems in `lib/store.tsx`** (lines ~249-250):

```ts
  const result = useMemo(() => compute(baseAssets.filter((a) => !a.excluded), baseSystems.filter((s) => !s.excluded), settings, baseYear), [baseAssets, baseSystems, settings, baseYear]);
  const selectedBaseline = useMemo(() => baselineScope1(selectedAssets.filter((a) => !a.excluded), selectedSystems.filter((s) => !s.excluded)), [selectedAssets, selectedSystems]);
```

- [ ] **Step 5: Add `addRefrigerationSystem`** — declare in `StoreShape` (after `addRefrigeration`): `addRefrigerationSystem: (year: number, system: RefrigerationSystem) => void;`. Implement (next to `addRefrigeration`):

```ts
  const addRefrigerationSystem = (year: number, system: RefrigerationSystem) => {
    setRefrigeration((prev) => ({ ...prev, [year]: [...(prev[year] ?? []), system] }));
    setSettingsState((p) => (p.bySystem[system.id] ? p : { ...p, bySystem: { ...p.bySystem, [system.id]: defaultSystemActions(system) } }));
  };
```

Add `addRefrigerationSystem` to the `value` object.

- [ ] **Step 6: Preserve new fields in `migrateRefrigeration`** (`store-helpers.ts:18-26`) — add `bu` and `excluded` to the returned object:

```ts
      return {
        id: s.id!, name: s.name ?? "System", systemType: s.systemType ?? "commercialHVAC",
        refrigerant: s.refrigerant ?? "R410A", toppedUpKg, gasCostPerKg: s.gasCostPerKg ?? 900,
        bu: s.bu, excluded: s.excluded,
      };
```

- [ ] **Step 7: Verify**

Run: `npx vitest run lib/model/__tests__/baseline-exclude.test.ts && npm test`
Expected: new test PASS; full suite PASS (UI tsc errors remain until Task 6, but `vitest` test files that import the store/types compile fine).

---

## Task 6: Split `ActivityDataTab` into per-screen modules (behaviour-preserving)

**Goal of this task:** move the existing code into the new files with the family/`efFor` renames applied, so the app compiles and the existing render test passes — **no new features yet**.

**Files:**
- Create: `components/tabs/activity/shared.ts`, `useBuConfig.ts`, `HomeScreen.tsx`, `CategoryScreen.tsx`, `TypeScreen.tsx`, `EntryScreen.tsx`, `BusinessUnitsScreen.tsx`, `ScopeScreen.tsx` (ScopeScreen is a stub here; filled in Task 10)
- Modify: `components/tabs/ActivityDataTab.tsx`
- Test: `components/tabs/__tests__/activity-data.test.ts`

**Interfaces:**
- Produces: `shared.ts` exports `Nav` (incl. the new `{ level: "scope"; scope: 1 | 2 }` variant), `Sel`, `CatKey`, `CatDef`, `CAT_DEFS`, `ELEC_TYPES`, `META`, `GRAD`, `CAT_ICON`, `ICON_COLOR`, `IconTile`, `ScopeBadge`, `facCO2e`, `newId`, `showNum`, `unitLabel`. `useBuConfig(activeId)` returns `{ buReg, addBu, removeBu, setMode }`. Each screen is a default-less named export taking explicit props (store slices + `nav`/`setNav` + bu config).

- [ ] **Step 1: Create `shared.ts`** — move `META`, `GRAD`, `CAT_ICON`, `ICON_COLOR`, `IconTile`, `ScopeBadge`, `facCO2e`, `newId`, `showNum`, `unitLabel` verbatim from `ActivityDataTab.tsx`. Update `CatKey`/`CAT_DEFS` to the new families:

```ts
export type CatKey = "liquid" | "gas" | "solid" | "refrigerants" | "electricity";
export const CAT_DEFS: { key: CatKey; label: string; scope: 1 | 2; meta: string; kind: "fuel" | "refrigerant" | "electricity" }[] = [
  { key: "liquid", label: "Fuels – Liquid", scope: 1, meta: "liquid", kind: "fuel" },
  { key: "gas", label: "Fuels – Gas", scope: 1, meta: "gaseous", kind: "fuel" },
  { key: "solid", label: "Fuels – Solid", scope: 1, meta: "solid", kind: "fuel" },
  { key: "refrigerants", label: "Refrigerants & cooling", scope: 1, meta: "refrigerant", kind: "refrigerant" },
  { key: "electricity", label: "Electricity", scope: 2, meta: "electricity", kind: "electricity" },
];
```

Keep `META`/`GRAD`/`CAT_ICON`/`ICON_COLOR` keys `gaseous|liquid|solid|refrigerant|electricity` (the `gas` family maps to `meta: "gaseous"`). Drop the `biomass` entries from those maps. Add the `Nav` type with the scope variant:

```ts
export type Nav =
  | { level: "home" }
  | { level: "bus" }
  | { level: "scope"; scope: 1 | 2 }
  | { level: "cat"; key: CatKey }
  | { level: "type"; key: CatKey; typeKey: string; cat?: "stationary" | "mobile" }
  | { level: "entry"; kind: "combustion" | "facility"; id: string };
export type Sel = { kind: "refrigerant"; id: string } | null;
```

- [ ] **Step 2: Create `useBuConfig.ts`** — move the `buKey`/`buReg`/`addBu`/`removeBu`/`setMode` logic (ActivityDataTab lines ~122-133) into a hook `useBuConfig(activeId: string)`.

- [ ] **Step 3: Move each screen** into its file as a named export, passing what it needs as props. Apply renames throughout: `fuelsInFamily`→`fuelsInExcelFamily`, family `"biomass"` removed, `def.key as FuelFamily` still valid for `liquid|gas|solid`. The home screen's biogenic panel and footprint rail move into `HomeScreen.tsx`. `EntryScreen.tsx` holds both the facility and combustion entry blocks (lines ~209-305). `ScopeScreen.tsx` is a stub: `export function ScopeScreen({ scope, onBack }: { scope: 1 | 2; onBack: () => void }) { return <button onClick={onBack}>Back</button>; }` (filled in Task 10).

- [ ] **Step 4: Rewrite `ActivityDataTab.tsx`** as the container: hold `nav`/`sel` state + the two stores + `useBuConfig`, and switch on `nav.level` to render the right screen, passing props. Keep the existing `openCat`, `openEntry`, `entryFor`, `typeAggTotal`, `catTotal`, etc. in the container (or move to a shared `useActivityData` helper) and pass down as props/callbacks.

- [ ] **Step 5: Run the existing render test**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.ts`
Expected: It may assert the old "Biomass & biofuels" / "Fuels – Gaseous" labels. Update those expectations to the new labels (`Fuels – Liquid/Gas/Solid`). Test PASS after that.

- [ ] **Step 6: Verify the whole app type-checks**

Run: `npx tsc --noEmit && npm test`
Expected: clean; full suite PASS.

- [ ] **Step 7: Manual smoke**

Run: `npm run dev`, open the Data tab. Expected: home shows 4 Scope-1 category cards + Electricity, footprint rail unchanged, drilling into a fuel still works exactly as before (click-through entry). No regressions.

---

## Task 7: Inline per-BU input + central hover toggle on the Type screen (fuels & electricity)

**Files:**
- Modify: `components/tabs/activity/TypeScreen.tsx`
- Test: `components/tabs/__tests__/activity-data.test.ts`

**Interfaces:**
- Consumes: store `updateCombustion`, `addCombustionAsset`, `updateFacility`, `addFacilityRecord`; helpers `entryFor`, `openEntry` (now split into `ensureEntry(...) => id` that creates-if-missing WITHOUT navigating, plus a separate `openDetail(id)` that sets `nav.level==="entry"`).
- Produces: each BU row renders an inline value field that writes to that BU's entry; a hover `central` toggle flipping `excluded`; a hover gear opening the detail entry screen.

- [ ] **Step 1: Write the failing test** — add to `activity-data.test.ts`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
// helper renderActivityWithBu(...) sets BU mode + one BU "Pune" (see existing test setup)

it("typing a value on a BU row creates the entry and shows emissions", async () => {
  renderActivityInTypeScreen({ family: "liquid", fuel: "diesel", bus: ["Pune"] });
  const input = await screen.findByLabelText("Pune diesel consumption");
  fireEvent.change(input, { target: { value: "100000" } });
  expect(screen.getByText(/t$/)).toBeInTheDocument(); // emissions cell populated
});

it("toggling the central control excludes the BU from the total", async () => {
  renderActivityInTypeScreen({ family: "liquid", fuel: "diesel", bus: ["Pune"], value: 100000 });
  const toggle = screen.getByLabelText("Include Pune in central total");
  fireEvent.click(toggle);
  // the row is marked excluded
  expect(screen.getByText(/Excluded from total/)).toBeInTheDocument();
});
```

(Implement `renderActivityInTypeScreen` in the test file: render `ActivityDataTab` inside the providers, set BU mode via the BusinessUnits screen or by seeding localStorage `osh-bus-v3::c-0`, then navigate to the type screen. Reuse the existing test's provider setup.)

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.ts`
Expected: FAIL — no inline input / `aria-label` not found.

- [ ] **Step 3: Add `ensureEntry` to the container** (`ActivityDataTab.tsx`) — refactor `openEntry` into create-without-navigate:

```ts
  // returns the entry id, creating it if missing; does NOT navigate
  const ensureEntry = (d: CatDef, t: { key: string; label: string; gridEf?: number }, cat: "stationary" | "mobile" | undefined, bu: string, agg: boolean): string => {
    if (d.kind === "electricity") {
      let ex = s2.selectedFacilities.find((f) => (f.bu ?? "") === bu && f.name === t.label);
      if (!ex) { const rec = blankFac(bu, t, 0, agg); s2.addFacilityRecord(year, rec); ex = rec; }
      return ex.id;
    }
    const fuelId = t.key as FuelId;
    const ex = s1.selectedAssets.find((a) => (a.bu ?? "") === bu && a.fuelType === fuelId && (!cat || a.category === cat));
    if (ex) return ex.id;
    const id = newId("c");
    s1.addCombustionAsset(year, { id, name: bu ? `${FUELS[fuelId].label} — ${bu}` : FUELS[fuelId].label, category: cat ?? "stationary", fuelType: fuelId, unit: FUELS[fuelId].unit, annualVolume: 0, opex: 0, remainingLife: 10, unitCount: 1, bu: bu || undefined, excluded: bu ? !agg : false });
    return id;
  };
```

Keep `openEntry` as `ensureEntry(...)` then `setNav({ level: "entry", ... })` for the gear button.

- [ ] **Step 4: Make BU rows interactive in `TypeScreen.tsx`** — replace the read-only `unitRows.map(button…)` block (the `bu` mode branch) with rows that contain an inline input, an emissions cell, and hover controls. For fuels:

```tsx
{unitRows.map(({ u, has, co2 }) => {
  const ex = entryFor(def, t, cat, u.name) as CombustionAsset | undefined;
  const disp = ex?.displayUnit ?? ex?.unit ?? FUELS[t.key as FuelId].unit;
  const shownVal = ex ? showNum(fromRef(ex.annualVolume, t.key as FuelId, disp)) : 0;
  return (
    <div key={u.name} className="group flex items-center gap-3 px-4 py-3 border-t border-line/40 hover:bg-brand-50/30 transition-colors">
      <span className="w-8 h-8 rounded-lg bg-surface-muted grid place-items-center text-ink-soft font-bold text-xs shrink-0">{u.name.charAt(0).toUpperCase()}</span>
      <span className="min-w-0 flex-1 font-medium text-ink truncate">{u.name}</span>
      <input
        type="number" value={shownVal}
        onChange={(e) => { const id = ensureEntry(def, t, cat, u.name, u.aggregate); s1.updateCombustion(year, id, { annualVolume: toRef(Number(e.target.value), t.key as FuelId, disp) }); }}
        className="w-28 text-right tabular-nums rounded-lg border border-brand-200 bg-brand-50/50 px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400 focus:bg-white"
        aria-label={`${u.name} ${t.label} consumption`}
      />
      <span className="text-xs text-ink-faint w-12 shrink-0">{unitLabel(disp)}</span>
      <span className="w-20 text-right text-sm font-semibold tabular-nums shrink-0">{has ? `${fmt(co2)} t` : "—"}</span>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => { const id = ensureEntry(def, t, cat, u.name, u.aggregate); const cur = combById(id); s1.updateCombustion(year, id, { excluded: !cur?.excluded }); }}
          aria-label={`Include ${u.name} in central total`}
          title={ex && !ex.excluded ? "Counted in the company total — click to exclude" : "Not in the company total — click to include"}
          className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 border", ex && !ex.excluded ? "bg-brand-50 text-brand-700 border-brand-200" : "bg-surface-muted text-ink-faint border-line")}
        >{ex && !ex.excluded ? "✓ central" : "central"}</button>
        <button onClick={() => { const id = ensureEntry(def, t, cat, u.name, u.aggregate); setNav({ level: "entry", kind: def.kind === "electricity" ? "facility" : "combustion", id }); }} aria-label={`${u.name} details`} className="p-1.5 rounded-lg text-ink-faint hover:text-brand-600 hover:bg-brand-50"><Settings size={15} /></button>
      </div>
      {ex?.excluded && <span className="text-[10px] text-amber-700 shrink-0">Excluded from total</span>}
    </div>
  );
})}
```

For the `electricity` kind, use `s2.updateFacility` and `annualLoadKwh` (kWh) instead of the fuel volume/unit conversion. Import `Settings` from `lucide-react`, `fromRef`/`toRef` from `@/lib/unit-convert`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify + manual**

Run: `npx tsc --noEmit && npm test`, then `npm run dev`. In BU mode, type a diesel value on a BU row → emissions update; hover → central toggle + gear; toggling central drops the value from the Scope 1 total in the footprint rail.

---

## Task 8: Refrigerants follow the fuel flow (gas type → per-BU rows)

**Files:**
- Modify: `components/tabs/activity/CategoryScreen.tsx`, `TypeScreen.tsx`, container `ActivityDataTab.tsx`
- Test: `components/tabs/__tests__/activity-data.test.ts`

**Interfaces:**
- Consumes: `REFRIGERANTS` (filter `inExcel`), store `addRefrigerationSystem`, `updateRefrigeration`.
- Produces: Refrigerants category renders one card per `inExcel` gas; selecting one shows per-BU rows entering `toppedUpKg`; `ensureRefrigEntry(gasId, bu, agg) => id` creates-if-missing.

- [ ] **Step 1: Write the failing test** — add:

```tsx
it("refrigerants category lists workbook gases and supports per-BU entry", async () => {
  renderActivityInCategory("refrigerants");
  fireEvent.click(await screen.findByText("R-404A"));
  // now on the gas type screen with BU "Pune"
  const input = await screen.findByLabelText("Pune R-404A topped up");
  fireEvent.change(input, { target: { value: "6" } });
  expect(screen.getByText(/t$/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.ts`
Expected: FAIL — refrigerant category still renders the flat system list.

- [ ] **Step 3: Extend the type model for refrigerants in `shared.ts`** — `CAT_DEFS` refrigerant kind already exists. Add a `typesFor` branch (in the container) so a refrigerant category lists gases:

```ts
  const refrigGases = (Object.values(REFRIGERANTS) as RefrigerantFactor[]).filter((r) => r.inExcel).map((r) => ({ key: r.id, label: r.label, gwp: r.gwp }));
```

Add `ensureRefrigEntry`:

```ts
  const ensureRefrigEntry = (gasId: RefrigerantId, bu: string, agg: boolean): string => {
    const ex = s1.selectedSystems.find((sy) => (sy.bu ?? "") === bu && sy.refrigerant === gasId);
    if (ex) return ex.id;
    const id = newId("r");
    s1.addRefrigerationSystem(year, { id, name: bu ? `${REFRIGERANTS[gasId].label} — ${bu}` : REFRIGERANTS[gasId].label, systemType: "commercialHVAC", refrigerant: gasId, toppedUpKg: 0, gasCostPerKg: 900, bu: bu || undefined, excluded: bu ? !agg : false });
    return id;
  };
```

- [ ] **Step 4: Render gas cards in `CategoryScreen.tsx`** — replace the `def.kind === "refrigerant"` branch (the flat `Row` list) with a card grid mirroring the electricity branch, mapping `refrigGases`. Each card shows `r.label`, `GWP {gwp}`, total t (sum of that gas's included systems), and `{nbu}/{units} BUs`; onClick `setNav({ level: "type", key: "refrigerants", typeKey: r.id })`.

- [ ] **Step 5: Add a refrigerant branch to `TypeScreen.tsx`** — when `def.kind === "refrigerant"`, render per-BU rows with a `toppedUpKg` input (`aria-label={`${u.name} ${gasLabel} topped up`}`, unit `kg`), the central toggle (flipping the system's `excluded`), and a gear opening a refrigerant detail (reuse the existing `DetailPanel` with `refrigerant=` via `sel`, or a dedicated entry — simplest: keep the side `DetailPanel` for refrigerant detail as today). Emissions per row = `refrigerantCO2e(system)`.

- [ ] **Step 6: Central-mode refrigerant** — when `buReg.mode === "central"`, render the single "Central" card (bu="") like fuels, writing `toppedUpKg` to the central system.

- [ ] **Step 7: Run the test**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.ts`
Expected: PASS.

- [ ] **Step 8: Verify + manual**

Run: `npx tsc --noEmit && npm test`, then `npm run dev`. Refrigerants → R-404A → per-BU kg entry, central toggle works, total updates. Confirm the Refrigerant advisor tab still renders (it reads `selectedSystems`).

---

## Task 9: Backfill — keep the modeller/refrigerant-advisor working with per-BU systems

**Files:**
- Modify: none expected; this task is a verification + targeted fix task.
- Test: full suite + manual.

**Interfaces:** none new.

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: PASS. The Scope 1 modeller (`compute`) and Refrigerant advisor iterate `baseSystems`/`selectedSystems`; per-BU systems are just more systems with `bu` set. Confirm no test assumed exactly 2 systems.

- [ ] **Step 2: Manual — modeller & advisor**

Run: `npm run dev`. Add per-BU diesel + R-404A entries; open the Builder (modeller) and Refrigerant tabs. Expected: each per-BU asset/system appears as its own lever line. If any list shows duplicate/blank names, set a clearer default `name` in `ensureEntry`/`ensureRefrigEntry` (already `<fuel> — <BU>`).

- [ ] **Step 3: Manual — exclude semantics across tabs**

Toggle a BU's central off; confirm it drops from the footprint rail AND from the Builder baseline (since `result` now filters `excluded`). Confirm CEO Overview totals match.

- [ ] **Step 4: Verify**

Run: `npm test && npx tsc --noEmit`
Expected: clean.

---

## Task 10: Scope 1 / Scope 2 drill-down screen

**Files:**
- Modify: `components/tabs/activity/ScopeScreen.tsx` (fill the stub), `HomeScreen.tsx` (make Scope cards buttons), container routing.
- Test: `components/tabs/__tests__/activity-data.test.ts`

**Interfaces:**
- Consumes: `s1.selectedAssets`, `s1.selectedSystems`, `s2.selectedFacilities`, `combustionCO2e`, `refrigerantCO2e`, `facCO2e`, `efFor`, `CAT_DEFS`.
- Produces: `ScopeScreen({ scope, s1, s2, year, onBack })` renders the scope total + sources grouped by category.

- [ ] **Step 1: Write the failing test** — add:

```tsx
it("clicking Scope 1 opens a drill-down listing sources by category", async () => {
  renderActivityHomeWithData(); // seeds a diesel asset + an R-404A system
  fireEvent.click(screen.getByRole("button", { name: /Scope 1 details/i }));
  expect(await screen.findByText("Fuels – Liquid")).toBeInTheDocument();
  expect(screen.getByText(/Diesel/)).toBeInTheDocument();
  expect(screen.getByText(/Refrigerants/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.ts`
Expected: FAIL — no "Scope 1 details" button / ScopeScreen is a stub.

- [ ] **Step 3: Make the Scope cards buttons in `HomeScreen.tsx`** — wrap the Scope 1 and Scope 2 rail cards in `<button onClick={() => setNav({ level: "scope", scope: 1 })} aria-label="Scope 1 details">…</button>` (and scope 2). Add a `setNav` prop to `HomeScreen`.

- [ ] **Step 4: Route in the container** — `ActivityDataTab.tsx`: `if (nav.level === "scope") return <ScopeScreen scope={nav.scope} s1={s1} s2={s2} year={year} onBack={() => setNav({ level: "home" })} />;`.

- [ ] **Step 5: Implement `ScopeScreen.tsx`:**

```tsx
"use client";
import { ArrowLeft } from "lucide-react";
import type { useScenario } from "@/lib/store";
import type { useScope2 } from "@/lib/scope2/store";
import { combustionCO2e, refrigerantCO2e } from "@/lib/model/baseline";
import { FUELS, REFRIGERANTS } from "@/lib/model/factors";
import { fuelFamily } from "@/lib/activity-groups";
import { fyLabel } from "@/lib/model/types";
import { cn, fmt } from "@/lib/utils";
import { facCO2e, unitLabel } from "./shared";

type S1 = ReturnType<typeof useScenario>;
type S2 = ReturnType<typeof useScope2>;

export function ScopeScreen({ scope, s1, s2, year, onBack }: { scope: 1 | 2; s1: S1; s2: S2; year: number; onBack: () => void }) {
  const groups: { label: string; rows: { name: string; bu?: string; raw: string; t: number; excluded?: boolean }[] }[] = [];
  if (scope === 1) {
    for (const fam of ["liquid", "gas", "solid"] as const) {
      const rows = s1.selectedAssets.filter((a) => fuelFamily(a.fuelType) === fam).map((a) => ({
        name: FUELS[a.fuelType].label, bu: a.bu, raw: `${fmt(a.annualVolume)} ${unitLabel(a.unit)}`, t: combustionCO2e(a), excluded: a.excluded,
      }));
      if (rows.length) groups.push({ label: `Fuels – ${fam[0].toUpperCase() + fam.slice(1)}`, rows });
    }
    const refRows = s1.selectedSystems.map((sy) => ({
      name: REFRIGERANTS[sy.refrigerant].label, bu: sy.bu, raw: `${fmt(sy.toppedUpKg)} kg`, t: refrigerantCO2e(sy), excluded: sy.excluded,
    }));
    if (refRows.length) groups.push({ label: "Refrigerants", rows: refRows });
  } else {
    const rows = s2.selectedFacilities.map((f) => ({ name: f.name, bu: f.bu, raw: `${fmt(f.annualLoadKwh)} kWh`, t: facCO2e(f), excluded: f.excluded }));
    if (rows.length) groups.push({ label: "Electricity", rows });
  }
  const total = groups.flatMap((g) => g.rows).filter((r) => !r.excluded).reduce((s, r) => s + r.t, 0);
  return (
    <div className="screen-in flex flex-col gap-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> All activity data</button>
      <div className="rounded-xl3 border border-line/60 bg-surface shadow-card px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">Scope {scope} · {fyLabel(year)}</h1>
        <div className="text-right"><div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Total</div><div className="text-2xl font-extrabold tabular-nums">{fmt(total)} <span className="text-sm text-ink-soft">tCO₂e</span></div></div>
      </div>
      {groups.length === 0 ? <p className="text-sm text-ink-faint">No Scope {scope} sources yet.</p> : groups.map((g) => (
        <div key={g.label} className="rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden">
          <div className="px-4 py-2.5 bg-gradient-to-r from-brand-50 to-transparent text-sm font-semibold text-ink">{g.label}</div>
          {g.rows.map((r, i) => (
            <div key={i} className={cn("flex items-center gap-3 px-4 py-2.5 border-t border-line/40", r.excluded && "opacity-50")}>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{r.name}{r.bu ? <span className="text-ink-faint font-normal"> · {r.bu}</span> : null}</span>
              <span className="text-sm tabular-nums text-ink-soft shrink-0 w-32 text-right">{r.raw}</span>
              <span className="text-sm font-semibold tabular-nums shrink-0 w-24 text-right">{fmt(r.t)} t{r.excluded ? <span className="text-[10px] text-amber-700"> · excl</span> : null}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.ts`
Expected: PASS.

- [ ] **Step 7: Verify + manual**

Run: `npx tsc --noEmit && npm test`, then `npm run dev`. Click Scope 1 → see Liquid/Gas/Solid/Refrigerants groups with raw value + emissions; excluded rows greyed with "· excl"; total matches the rail. Click Scope 2 → Electricity group. Back returns home.

---

## Self-Review

**Spec coverage:**
- Spec A (master list from Excel): Tasks 1–3 (EF lookup + fuels + refrigerants), Task 4 (categories). ✓
- Spec B (inline per-BU input + central toggle): Task 7. ✓
- Spec C (refrigerants follow fuel flow): Tasks 5 (data model) + 8 (UI). ✓
- Spec D (scope drill-down): Task 10. ✓
- Spec F (file split): Task 6. ✓
- Migration/compat (extend ids, preserve `bu`/`excluded`): Tasks 2/3 (extend unions), Task 5 (migrate). ✓
- Testing section: each task is TDD with concrete assertions using verified workbook numbers. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to" — code blocks are concrete. The only deferred item is `ScopeScreen` being a stub in Task 6, explicitly filled in Task 10 (intentional sequencing, not a placeholder).

**Type consistency:** `efFor` (not `defraEF`) used in Tasks 1/5/10; `EFLookup.source` defined in Task 1 and consumed in the badge; `fuelFamily` returns `FuelFamily | null` (Task 4) and callers null-check; `ensureEntry`/`ensureRefrigEntry` return `id: string` and callers pass it to `update*`/`setNav`; `RefrigerationSystem.bu/excluded` added in Task 5 before TypeScreen (Task 8) reads them; `addRefrigerationSystem` signature consistent between Task 5 (definition) and Task 8 (use).

**Open implementation details (from spec, low-risk):** scope drill-down shows excluded rows greyed (decided: greyed). New-refrigerant `era` defaults to `legacy` (advisory only). New-fuel display unit defaults to the reference unit.
