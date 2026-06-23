# Named-Source Data-Input Redesign + Data-Flow Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Activity Data tab into an easy step-process — within a category the user adds named sources (only those show), each tagged to one Business Unit — trim the entry screen to modeller-fed fields, group records by BU in the downstream tabs, fix the `excluded` bugs, and add two correctness/clarity enhancements.

**Architecture:** No new record types — `CombustionAsset`/`RefrigerationSystem`/`Facility` already carry `name`, `bu?`, `excluded?`. The "central vs by-BU mode" is removed; a source is a record tagged to one BU (or Company-wide). A new `SourceListScreen` replaces the fuel-card / gas-card grids and the per-BU `type` screen; `TypeScreen` and the `type` nav level are retired. Downstream tabs group by `bu` and respect `excluded`.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind 4, lucide-react, vitest 4 + @testing-library/react (jsdom).

## Global Constraints

- Branch: `named-sources-redesign` off `master` (executor sets up; commits land there). Merge to `master` at the end.
- `npm test` = `vitest run`; single file `npx vitest run <path>`. `npx tsc --noEmit` must be exit-0 clean after every task.
- Path alias `@/` = project root. jest-dom is NOT wired — tests use `getBy/queryBy` + `.toBeTruthy()`/`.toBeFalsy()` (queries throw on absence). Match the existing `components/tabs/__tests__/activity-data.test.tsx` style and reuse its helpers.
- No emission/abatement math changes. No new model fields. No FuelId/RefrigerantId/Facility-field type removed (`peakLoadKw` stays on the `Facility` type; only dropped from the entry UI).
- Engine fields that MUST stay collected (audit): fuel = `fuelType`, `annualVolume`, `category`, `unitCount`, `opex`, `remainingLife`, `year`; refrigerant = `refrigerant`, `toppedUpKg`, `gasCostPerKg`, `systemType`; electricity = all except `peakLoadKw`. `bu` is a UI grouping tag only (engine never reads it). `excluded` gates totals (filtered in the stores already).
- A "source" = one record. Tagged to one BU via `bu` (`undefined` = Company-wide). `excluded:true` = NOT in central total (the per-source central toggle).
- Mobile fuel filter: when a fuel source's type is Mobile, the fuel dropdown shows only `FUELS_BY_CATEGORY.mobile` members of the family; Stationary → `FUELS_BY_CATEGORY.stationary`.

---

## File Structure

**Create:**
- `components/tabs/activity/SourceListScreen.tsx` — per-category "Your sources" list + inline "Add a source" form (fuels + refrigerants).

**Modify:**
- `components/tabs/activity/useBuConfig.ts` — drop `mode`/`setMode`; keep `units`.
- `components/tabs/activity/BusinessUnitsScreen.tsx` — drop the mode radio; always show the BU list.
- `components/tabs/activity/CategoryScreen.tsx` — strip the fuel + refrigerant branches (electricity-only); electricity branch drops `mode` (Company-wide + per-BU rows).
- `components/tabs/ActivityDataTab.tsx` — route `cat` fuel/refrig → `SourceListScreen`, electricity → `CategoryScreen`; remove the `type` route + the now-unused per-BU matrix helpers; pass source/Add-source callbacks.
- `components/tabs/activity/shared.tsx` — remove the `type` variant from `Nav`.
- `components/tabs/DataInputTab.tsx` — `CombustionDetails` gains a "modeller-only" mode (spend/units/remaining-life, no source/site/inputMode) incl. an editable `unitCount`; remove `peakLoadKw` from `FacilityDetailContent` (in `components/scope2/DataInputTab.tsx`).
- `components/tabs/activity/EntryScreen.tsx` — fuel details use the trimmed `CombustionDetails`; add the empty-field hints (E2).
- `components/tabs/BuilderTab.tsx`, `components/tabs/ActionPlanTab.tsx`, `components/tabs/RefrigerantTab.tsx`, `components/scope2/BuilderTab.tsx`, `components/scope2/CompareTab.tsx`, `components/scope2/CeoOverviewTab.tsx` — per-BU grouping + `excluded` fixes.
- `components/tabs/__tests__/activity-data.test.tsx` and tab test files — new + updated tests.

**Delete:**
- `components/tabs/activity/TypeScreen.tsx` (retired).

---

## Task 1: SourceListScreen + Add-source form (replaces fuel/refrigerant card grids and the type screen)

**Files:**
- Create: `components/tabs/activity/SourceListScreen.tsx`
- Modify: `components/tabs/ActivityDataTab.tsx`, `components/tabs/activity/CategoryScreen.tsx`, `components/tabs/activity/shared.tsx`
- Delete: `components/tabs/activity/TypeScreen.tsx`
- Test: `components/tabs/__tests__/activity-data.test.tsx`

**Interfaces:**
- Produces: `SourceListScreen` renders, for a fuel/refrigerant `cat`, the list of that category's sources and an Add-source form; clicking a source → `{level:"entry", kind:"combustion"|"refrigerant", id}`; central toggle flips `excluded`. The `Nav` `type` variant is removed.
- Consumes: store `addCombustionAsset`, `addRefrigerationSystem`, `updateCombustion`, `updateRefrigeration`, `delCombustion`, `delRefrigeration`; `fuelsInExcelFamily`, `FUELS`, `FUELS_BY_CATEGORY`, `REFRIGERANTS` (inExcel), `fuelFamily`, `combustionCO2e`, `refrigerantCO2e`; `buReg.units`.

- [ ] **Step 1: Write the failing test** — append to `activity-data.test.tsx` (reuse the helper that renders the tab + seeds a BU). Test: open the Fuels–Liquid category → only an "Add a source" affordance and no fuel-card grid; add a source named "Diesel gensets" (fuel Diesel, Stationary, BU Pune); it appears as a row; typing the consumption is reachable by clicking it (entry screen opens). Concretely:

```tsx
it("category shows a source list and adding a source creates it", async () => {
  renderActivityWithBu({ units: [{ name: "Pune", aggregate: true }] }); // seeds osh-bus-v3::c-0
  fireEvent.click(await screen.findByText("Fuels – Liquid"));
  // no all-fuels grid: a known non-added fuel card is absent
  expect(screen.queryByText("Marine Gas Oil (ULSGO)")).toBeFalsy();
  fireEvent.click(screen.getByRole("button", { name: /Add a source/i }));
  fireEvent.change(screen.getByLabelText(/Source name/i), { target: { value: "Diesel gensets" } });
  // fuel + type + BU default to first sensible values; submit
  fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
  expect(screen.getByText("Diesel gensets")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx`
Expected: FAIL — clicking the category still shows the fuel-card grid; no "Add a source".

- [ ] **Step 3: Remove the `type` variant from `Nav`** in `shared.tsx`:

```ts
export type Nav =
  | { level: "home" }
  | { level: "bus" }
  | { level: "scope"; scope: 1 | 2 }
  | { level: "cat"; key: CatKey }
  | { level: "elecbu"; bu: string }
  | { level: "entry"; kind: "combustion" | "facility" | "refrigerant"; id: string };
```

- [ ] **Step 4: Create `components/tabs/activity/SourceListScreen.tsx`.** It receives the category def, the BU list, the source records for the category, and create/update/delete/navigate callbacks. Responsibilities:
  - Header: category label + total emissions (sum of non-excluded sources).
  - "+ Add a source" toggles an inline form with: `Source name` (aria-label "Source name"), Fuel/gas `<select>`, Type control (Stationary/Mobile for fuels via segmented buttons; System type `<select>` for refrigerants), Business unit `<select>` (options: "Company-wide" + each `buReg.units[].name`). For fuels, the fuel `<select>` options = `fuelsInExcelFamily(family)` filtered by the selected Type via `FUELS_BY_CATEGORY[type].includes(id)`; default Type = Stationary, default BU = Company-wide.
  - On Add (button name "Add"): for fuels call `addCombustionAsset(year, { id: newId("c"), name, category: type, fuelType, unit: FUELS[fuelType].unit, annualVolume:0, opex:0, remainingLife:10, unitCount:1, bu: bu||undefined, excluded:false })`; for refrigerants `addRefrigerationSystem(year, { id: newId("r"), name, systemType, refrigerant: gasId, toppedUpKg:0, gasCostPerKg:900, bu: bu||undefined, excluded:false })`.
  - Source rows: name · `${fuelLabel} · ${type} · ${bu ?? "Company-wide"}` · emissions · central toggle (aria-label `Include ${name} in central total`, flips `excluded` via update*) · delete (aria-label `Delete ${name}`) · row click → `setNav({level:"entry", kind: fuel?"combustion":"refrigerant", id})`. Sources for the category = combustion assets with `fuelFamily(a.fuelType)===family` (fuels) or all systems (refrigerants). Use the existing card/row Tailwind classes from CategoryScreen/TypeScreen for visual consistency. `"use client"` at top.

- [ ] **Step 5: Wire the container.** In `ActivityDataTab.tsx`:
  - In the `cat` route: if `def.kind === "electricity"` render `<CategoryScreen .../>` (unchanged for now); else render `<SourceListScreen .../>` passing the category def, `buReg.units`, the filtered source records, `year`, and the store create/update/delete + `setNav`.
  - Remove the `nav.level === "type"` route, the `<TypeScreen/>` usage, and the helpers used ONLY by TypeScreen/fuel-card flow: `typesFor` (keep only if electricity still needs it — electricity uses `ELEC_TYPES` directly, so a fuel/refrig `typesFor` arm can go), `ensureEntry`, `openEntry`, `entryFor`, `emOfEntry`, `nWithData`, `ensureRefrigEntry`, the `refrigGases` card list. KEEP `ensureFacility`, `buElecEmissions`, `elecBuExcluded`, `toggleElecCentral`, `facFor`, `combById`, `facById`, `refrigSysById`, `co2Fac`, `co2Ref`, `catTotal`/`countOf` (still used by Home/CategoryScreen). Verify by tsc which helpers are now unused and remove exactly those.
  - Delete `components/tabs/activity/TypeScreen.tsx` and its import.

- [ ] **Step 6: Strip CategoryScreen to electricity-only.** In `CategoryScreen.tsx`, remove the `def.kind === "refrigerant"` and the fuel `(() => {...})()` branches and their now-unused imports/props (`typeAggTotal` for fuels, `nWithData`, `refrigGases`, `FUELS_BY_CATEGORY`, `fuelsInFamily`, `catMode`/`fuelFilter` state). Keep the electricity branch + header. (The electricity `mode` cleanup is Task 2.)

- [ ] **Step 7: Run the test + tsc**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx && npx tsc --noEmit`
Expected: the new test PASSES; tsc clean. Update/replace existing tests that navigated via the old fuel-card grid or the `type` screen (electricity central-toggle and per-BU-input tests for fuels/refrigerants) to the new source-list flow; delete tests that asserted the retired card grid.

- [ ] **Step 8: Full suite**

Run: `npm test`
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: named-source list + Add-source form; retire fuel/gas card grids and type screen"
```

---

## Task 2: Remove the BU "mode" (Company-wide + per-BU everywhere)

**Files:**
- Modify: `components/tabs/activity/useBuConfig.ts`, `components/tabs/activity/BusinessUnitsScreen.tsx`, `components/tabs/activity/CategoryScreen.tsx` (electricity branch), `components/tabs/ActivityDataTab.tsx`
- Test: `components/tabs/__tests__/activity-data.test.tsx`

**Interfaces:**
- Produces: `useBuConfig` returns `{ buReg: { units }, addBu, removeBu }` (no `mode`/`setMode`). The electricity category shows a "Company-wide" row + one row per BU (no mode branch).

- [ ] **Step 1: Write the failing test** — append:

```tsx
it("Business Units screen has no central/by-BU mode and lists units", async () => {
  renderActivityWithBu({ units: [{ name: "Pune", aggregate: true }] });
  fireEvent.click(screen.getByRole("button", { name: /Business units/i }));
  expect(screen.queryByText(/How is the data collected/i)).toBeFalsy(); // mode radio gone
  expect(screen.getByText("Pune")).toBeTruthy();
});
it("electricity shows a Company-wide row plus each BU", async () => {
  renderActivityWithBu({ units: [{ name: "Pune", aggregate: true }] });
  fireEvent.click(await screen.findByText("Electricity"));
  expect(screen.getByText(/Company-wide/i)).toBeTruthy();
  expect(screen.getByText("Pune")).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx`
Expected: FAIL — mode radio still present / electricity branches on `mode`.

- [ ] **Step 3: Edit `useBuConfig.ts`** — drop `mode` from the type and all defaults, drop `setMode`:

```ts
type BuConfig = { units: { name: string; aggregate: boolean }[] };
export type BuReg = BuConfig;

export function useBuConfig(activeId: string) {
  const buKey = `osh-bus-v3::${activeId}`;
  const [buReg, setBuReg] = useState<BuConfig>(() => {
    if (typeof window === "undefined") return { units: [] };
    try { const v = JSON.parse(window.localStorage.getItem(buKey) || ""); return v && Array.isArray(v.units) ? { units: v.units } : { units: [] }; }
    catch { return { units: [] }; }
  });
  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem(buKey, JSON.stringify(buReg)); }, [buReg, buKey]);
  const addBu = (name: string, aggregate: boolean) =>
    setBuReg((prev) => prev.units.some((b) => b.name === name) ? prev : { units: [...prev.units, { name, aggregate }] });
  const removeBu = (name: string) => setBuReg((prev) => ({ units: prev.units.filter((b) => b.name !== name) }));
  return { buReg, addBu, removeBu };
}
```

(Reading an old `{mode,units}` payload still yields `{units}` — `mode` ignored. No data loss.)

- [ ] **Step 4: Simplify `BusinessUnitsScreen.tsx`** — drop the `setMode` prop and the "How is the data collected?" mode card; always render the "Your business units" add/list block (remove the `buReg.mode === "bu"` gate). Update the `buReg` prop type to `{ units: {name; aggregate}[] }`.

- [ ] **Step 5: Electricity branch in `CategoryScreen.tsx`** — remove the `buReg.mode === "central"` branch; always render a **Company-wide** row (`bu: ""`) followed by one row per `buReg.units` (each with the central toggle + → `{level:"elecbu", bu}`). Reuse the existing row markup; the Company-wide row navigates to `{level:"elecbu", bu:""}`.

- [ ] **Step 6: Container** — `useBuConfig` no longer returns `setMode`; remove it from the `BusinessUnitsScreen` props pass and anywhere `buReg.mode` is read in `ActivityDataTab.tsx`. tsc will pinpoint remaining `mode` references — remove each.

- [ ] **Step 7: Run tests + tsc**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx && npx tsc --noEmit && npm test`
Expected: new tests pass; tsc clean; suite green. Update any test referencing the mode radio.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: remove central/by-BU mode; BUs are a plain list, electricity shows Company-wide + per BU"
```

---

## Task 3: Trim the entry screen to modeller-fed fields

**Files:**
- Modify: `components/tabs/DataInputTab.tsx` (`CombustionDetails`), `components/scope2/DataInputTab.tsx` (`FacilityDetailContent`), `components/tabs/activity/EntryScreen.tsx`
- Test: `components/tabs/__tests__/activity-data.test.tsx`

**Interfaces:**
- Produces: the fuel entry screen "Details for the scenario modeller" shows only Annual spend, Number of units, Remaining life — no Stationary/Mobile, Site, or metered/spend toggle. Electricity details have no peak-load field.

- [ ] **Step 1: Write the failing test** — navigate to a fuel source's entry screen (reuse the Task-1 flow + click the source) and assert:

```tsx
it("fuel entry details show modeller fields only (no stationary/mobile, no site)", async () => {
  await openDieselSourceEntry(); // helper: add 'Diesel gensets', click it
  expect(screen.getByLabelText(/Number of units/i)).toBeTruthy();
  expect(screen.getByText(/Annual spend/i)).toBeTruthy();
  expect(screen.queryByText(/Site \/ location/i)).toBeFalsy();
  expect(screen.queryByText(/Metered volume/i)).toBeFalsy();   // inputMode toggle gone
  // category control absent in details
  expect(screen.queryByText(/^Category$/i)).toBeFalsy();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx`
Expected: FAIL — site/inputMode/category still render; no "Number of units" field.

- [ ] **Step 3: Add a modeller-only mode to `CombustionDetails`** in `components/tabs/DataInputTab.tsx`. Add prop `modellerOnly = false`. When true: do NOT render the Source section (category/fuel) or the Site field or the metered/spend `inputMode` toggle; render only Annual spend (`opex`), a new **Number of units** numeric field bound to `unitCount` (`updateCombustion(year, a.id, { unitCount: Math.max(1, Math.round(v)) })`, aria-label "Number of units"), and Remaining life. Keep the existing default behaviour (`modellerOnly` false) for legacy callers.

- [ ] **Step 4: EntryScreen fuel branch** — replace `<CombustionDetails a={a} year={year} showCalc={false} showSource={true} showFuel={false} />` with `<CombustionDetails a={a} year={year} showCalc={false} modellerOnly />`.

- [ ] **Step 5: Remove `peakLoadKw` from `FacilityDetailContent`** in `components/scope2/DataInputTab.tsx` — delete the Peak-load input field and its label (keep the field on the `Facility` type and elsewhere; only the UI input is removed). Confirm nothing else in that component references `peakLoadKw` for display.

- [ ] **Step 6: Run test + tsc + suite**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx && npx tsc --noEmit && npm test`
Expected: pass / clean / green. Update legacy DataInputTab render tests only if they asserted the peak-load field.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: trim entry-screen details to modeller-fed fields (spend/units/remaining-life); drop peakLoadKw input"
```

---

## Task 4: Per-BU grouping + excluded badge — Scope 1 Builder

**Files:**
- Modify: `components/tabs/BuilderTab.tsx`
- Test: `components/tabs/__tests__/render.test.tsx` (or the builder's nearest test; if none, add a focused test file)

**Interfaces:**
- Produces: within each segment, asset/system cards are grouped under collapsible BU headers ("Company-wide" for untagged); excluded records show an "Excluded from totals" badge and are visually muted.

- [ ] **Step 1: Write the failing test** — render `BuilderTab` (inside the scenario provider) with two assets tagged to different BUs (seed the scope-1 store) and assert a BU header per group appears, and an excluded asset shows the badge. Use the existing test setup pattern; if the file lacks one, create `components/tabs/__tests__/builder-grouping.test.tsx` that seeds `osh-scope1-planner-v4` with two `category:"mobile"` assets (`bu:"Pune"`, `bu:"Mumbai"`, one `excluded:true`) and renders `<ScenarioProvider><BuilderTab/></ScenarioProvider>`, asserting both BU names render and an "Excluded" badge appears.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/tabs/__tests__/builder-grouping.test.tsx`
Expected: FAIL — cards render flat, no BU header / no badge.

- [ ] **Step 3: Group `segAssets` by BU** in `BuilderTab.tsx`. Replace `segAssets.map((a) => <AssetActionCard key={a.id} asset={a} />)` (line ~122) with a grouped render. Add a helper near the top of the component:

```tsx
const groupByBu = <T extends { bu?: string }>(rows: T[]) => {
  const groups = new Map<string, T[]>();
  for (const r of rows) { const k = r.bu ?? ""; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
  return [...groups.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b))); // Company-wide first
};
```

Render: for each `[bu, assets]` group, a `<Collapsible title={bu || "Company-wide"} defaultOpen>` (import the activity `Collapsible`) wrapping that group's `<AssetActionCard>`s. Do the same for the refrigerant segment (`baseSystems.map(...)` at line ~466 → group by `sys.bu`).

- [ ] **Step 4: Excluded badge + mute** in `AssetActionCard`/`SystemActionCard`. The cards iterate `baseAssets`/`baseSystems` (the unfiltered store export). When `asset.excluded`/`system.excluded`, render a small "Excluded from totals" pill in the card header and add `opacity-60` to the card container. (Keep them rendered — the user may re-include via the data tab.) Exclude them from any per-BU roll-up count shown in the group header.

- [ ] **Step 5: Run test + tsc + suite**

Run: `npx vitest run components/tabs/__tests__/builder-grouping.test.tsx && npx tsc --noEmit && npm test`
Expected: pass / clean / green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: group Scope 1 Builder cards by BU + excluded badge"
```

---

## Task 5: Per-BU grouping + excluded filter — Scope 1 Action Plan

**Files:**
- Modify: `components/tabs/ActionPlanTab.tsx`
- Test: `components/tabs/__tests__/` (new `actionplan-excluded.test.tsx`)

**Interfaces:**
- Produces: plan-item rows are grouped by BU and EXCLUDE `excluded` records (so rows sum to the headline KPIs).

- [ ] **Step 1: Write the failing test** — seed two mobile assets (one `excluded:true`) with an enabled electrification lever; render `<ScenarioProvider><ActionPlanTab/></ScenarioProvider>`; assert the excluded asset does NOT appear as a plan row (and a BU header appears for the included one). (If lever seeding is heavy, assert at minimum that an excluded asset's name is absent from the plan-items list while a non-excluded one is present.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/tabs/__tests__/actionplan-excluded.test.tsx`
Expected: FAIL — excluded asset still produces a row.

- [ ] **Step 3: Filter excluded + group by BU** in `ActionPlanTab.tsx`. At the plan-items build (line ~38 for assets, ~69 for systems), filter `baseAssets.filter((a) => !a.excluded)` and `baseSystems.filter((s) => !s.excluded)` before generating rows. Then group the resulting rows by `bu` (reuse the same `groupByBu` helper — extract it to a shared util `lib/group-by-bu.ts` if cleaner, or inline) under "Company-wide"-first collapsible sections.

- [ ] **Step 4: Run test + tsc + suite**

Run: `npx vitest run components/tabs/__tests__/actionplan-excluded.test.tsx && npx tsc --noEmit && npm test`
Expected: pass / clean / green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: Action Plan respects excluded; group plan items by BU"
```

---

## Task 6: Refrigerant advisor + Scope 2 Builder — grouping + excluded

**Files:**
- Modify: `components/tabs/RefrigerantTab.tsx`, `components/scope2/BuilderTab.tsx`
- Test: new `components/tabs/__tests__/refrigerant-excluded.test.tsx`

**Interfaces:**
- Produces: the Refrigerant advisor filters `excluded` systems and groups cards by BU; the Scope 2 Builder facility picker groups chips by BU and shows an excluded badge.

- [ ] **Step 1: Write the failing test** — seed two refrigeration systems (one `excluded:true`); render `<ScenarioProvider><RefrigerantTab/></ScenarioProvider>`; assert the excluded system's name is absent and a BU header is present.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/tabs/__tests__/refrigerant-excluded.test.tsx`
Expected: FAIL — excluded system still shown.

- [ ] **Step 3: RefrigerantTab** — change `const { baseSystems: systems } = useScenario();` usage to `systems.filter((s) => !s.excluded)` before the `.map`, and group the recommendation cards by `bu` (Company-wide first) under collapsible headers.

- [ ] **Step 4: Scope 2 Builder picker** — group the facility-picker chips (`baseFacilities.map`) by `bu`; show an "Excluded" badge + mute on chips whose facility is `excluded` (don't hide). (Leave the lever logic; E1 in Task 8 restricts which facilities are eligible for efficiency/generation.)

- [ ] **Step 5: Run test + tsc + suite**

Run: `npx vitest run components/tabs/__tests__/refrigerant-excluded.test.tsx && npx tsc --noEmit && npm test`
Expected: pass / clean / green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: Refrigerant advisor respects excluded + BU grouping; Scope 2 Builder picker grouped by BU"
```

---

## Task 7: Scope 2 Compare + CEO confidence excluded fixes

**Files:**
- Modify: `components/scope2/CompareTab.tsx`, `components/scope2/CeoOverviewTab.tsx`
- Test: `components/scope2/__tests__/` (extend the existing render test, or a small new one)

**Interfaces:**
- Produces: Scope 2 Compare saved-scenario columns and the CEO confidence gauge exclude `excluded` facilities.

- [ ] **Step 1: Write the failing test** — seed a facility with `excluded:true` and a saved scenario; render `<Scope2Provider><Scope2CompareTab/></Scope2Provider>`; assert a saved-scenario column's location-based tonnes equal the live column's (i.e. excluded facility not double-counted). If seeding a saved scenario is heavy, instead unit-test the compute call path by asserting the column total matches `result`. (Pick the lighter assertion that still proves exclusion.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/scope2/__tests__/<file>`
Expected: FAIL — saved column higher than live.

- [ ] **Step 3: Fix Compare** — `computeScope2(baseFacilities.filter((f) => !f.excluded), sc.levers, baseYear)` (line ~29).

- [ ] **Step 4: Fix CEO confidence** — `components/scope2/CeoOverviewTab.tsx` line ~17: `confidenceOf(baseFacilities.filter((f) => !f.excluded).map(...))`.

- [ ] **Step 5: Run test + tsc + suite**

Run: `npx vitest run components/scope2/__tests__/<file> && npx tsc --noEmit && npm test`
Expected: pass / clean / green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: Scope 2 Compare + CEO confidence exclude excluded facilities"
```

---

## Task 8: Electricity clean-instrument levers (E1) + empty-field guards (E2)

**Files:**
- Modify: `components/scope2/BuilderTab.tsx` (E1), `components/tabs/activity/EntryScreen.tsx` + `components/scope2/DataInputTab.tsx` (E2)
- Test: `components/tabs/__tests__/` + `components/scope2/__tests__/`

**Interfaces:**
- Produces: the Scope 2 Builder efficiency/generation levers are offered only for the Purchased (grid) facility; zero-value hints render on the entry screens.

- [ ] **Step 1: Write the failing tests** —
  - E1: seed a BU's 4 electricity facilities (grid + vppa + solar + irec); render Scope 2 Builder; assert the efficiency/generation lever picker lists only the grid (Purchased) facility, not "Virtual PPA"/"Solar onsite"/"I-REC".
  - E2: on a fuel entry screen with `opex===0`, assert the hint "Add annual spend to see cost savings in the modeller." renders; set spend > 0 and assert it disappears.

- [ ] **Step 2: Run to verify failure**

Run the two focused tests; Expected: FAIL.

- [ ] **Step 3: E1 — restrict levers to the grid facility** in `components/scope2/BuilderTab.tsx`. The efficiency + on-site-generation lever facility list should be `baseFacilities.filter((f) => f.gridEf > 0)` (the Purchased/grid records). VPPA/Solar/I-REC (gridEf 0) are not selectable for those two levers. Procurement (portfolio-level) is unchanged. Keep them visible in any read-only baseline list, just not as efficiency/generation lever targets.

- [ ] **Step 4: E2 — empty-field hints.**
  - In `EntryScreen.tsx` fuel branch, under the Annual spend field area, render `{a.opex === 0 && <p className="text-[11px] text-amber-700 mt-1">Add annual spend to see cost savings in the modeller.</p>}`.
  - In `FacilityDetailContent` (`components/scope2/DataInputTab.tsx`), near Roof space, render `{f.roofSpaceM2 === 0 && <p className="text-[11px] text-amber-700 mt-1">Set roof space to size the on-site solar option.</p>}`.
  - In `AssetActionCard` (Scope 1 Builder), if `asset.annualVolume === 0`, a muted "No consumption entered yet" note in the card.

- [ ] **Step 5: Run tests + tsc + suite**

Run: `npx vitest run <the two files> && npx tsc --noEmit && npm test`
Expected: pass / clean / green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: restrict electricity efficiency/solar levers to grid facility; add empty-field guards"
```

---

## Self-Review

**Spec coverage:**
- A (named-source flow): Task 1 (SourceListScreen + Add-source, retire card grids + type screen) + Task 2 (remove mode; electricity Company-wide + per-BU). ✓
- B (trimmed entry): Task 3 (modeller-only details, drop peakLoadKw, editable unitCount). ✓
- C (per-BU grouping): Task 4 (Builder), 5 (Action Plan), 6 (Refrigerant advisor + Scope 2 picker). ✓
- D (excluded bug fixes): Task 5 (Action Plan), 6 (Refrigerant + Scope 2 Builder badge), 7 (Scope 2 Compare + CEO confidence), 4 (Builder badge). ✓
- E (enhancements): Task 8 (E1 grid-only levers, E2 hints). ✓
- Migration (no record change, mode read-tolerant, type-level removed): Tasks 1-2 + Global Constraints. ✓

**Placeholder scan:** No TBD/"handle edge cases". Grouping uses a concrete `groupByBu` helper. Test steps give concrete assertions; where lever seeding is heavy, the fallback assertion is specified explicitly.

**Type consistency:** `Nav` loses `type` (Task 1) — all `type`-route code removed same task; `useBuConfig` loses `mode`/`setMode` (Task 2) — consumers updated same task; `CombustionDetails` gains `modellerOnly` (Task 3) used by EntryScreen same task; `groupByBu` reused across Tasks 4/5/6 (extract to `lib/group-by-bu.ts` if shared). `ensureFacility`/`facFor`/`toggleElecCentral` (electricity) retained; only fuel/refrig matrix helpers removed.

**Open details (from spec):** Company-wide sorts first in BU groups. Add-source defaults: Type=Stationary, BU=Company-wide. Reuse the activity `Collapsible` for BU groups.
