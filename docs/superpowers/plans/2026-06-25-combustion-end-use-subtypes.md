# Combustion End-Use Sub-types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each combustion source carry an "end-use type" (truck, kiln, etc.) that seeds realistic scenario-modeller lever defaults and shows feasibility hints.

**Architecture:** A static taxonomy module (`lib/model/end-use.ts`) maps each end-use to a "lever profile". `CombustionAsset` gains an optional `endUse` field. The central `defaultActions()` builder reads the profile to seed electrify/fuel-switch/flex-fuel defaults; the activity UI lets users pick the end-use; the modeller's lever card shows a feasibility badge. No baseline-math change, fully backward compatible.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, vitest, lucide-react, existing activity-tab field primitives (`components/tabs/activity/fields.tsx`).

## Global Constraints

- **No git repo:** This project is not under git. Replace every "commit" gate with "run the full suite (`npm test`) and confirm green". Do NOT run `git` commands.
- **Backward compatible:** An asset with `endUse` absent MUST behave exactly as today. Existing tests stay green.
- **Advisory only:** Feasibility never disables or hides a lever — it only changes default values and shows a hint.
- **Currency:** `₹`, via `CURRENCY` from `@/lib/defaults`.
- **AltFuelId** values are exactly: `"biodiesel" | "ethanol" | "biogas" | "bioCng" | "biomass"`.
- Phase 1 is **combustion only**. Do not touch electricity/refrigerant.

---

### Task 1: End-use taxonomy module

**Files:**
- Create: `lib/model/end-use.ts`
- Test: `lib/model/__tests__/end-use.test.ts`

**Interfaces:**
- Consumes: `AltFuelId` from `@/lib/model/types`.
- Produces:
  - `type EndUseId = "car"|"van"|"truck"|"bus"|"forklift"|"heavyEquip"|"boiler"|"furnaceKiln"|"generator"|"dryer"|"spaceHeat"|"otherProcess"`
  - `type Feasibility = "easy"|"yes"|"hard"|"no"`
  - `interface EndUseProfile { id: EndUseId; label: string; category: "mobile"|"stationary"; electrify: { feasible: Feasibility; cop: number; capexPerUnit?: number; capacityHint?: number; note?: string }; fuelSwitch: { feasible: Feasibility; preferred?: AltFuelId; note?: string }; flexFuel?: { feasible: Feasibility } }`
  - `const END_USES: Record<EndUseId, EndUseProfile>`
  - `function endUsesFor(category: "mobile"|"stationary"): EndUseProfile[]`

- [ ] **Step 1: Write the failing test**

```ts
// lib/model/__tests__/end-use.test.ts
import { describe, expect, it } from "vitest";
import { END_USES, endUsesFor, type EndUseId } from "@/lib/model/end-use";

const ALL_IDS: EndUseId[] = ["car","van","truck","bus","forklift","heavyEquip","boiler","furnaceKiln","generator","dryer","spaceHeat","otherProcess"];

describe("end-use taxonomy", () => {
  it("has a profile for every id, keyed correctly", () => {
    for (const id of ALL_IDS) {
      expect(END_USES[id]).toBeTruthy();
      expect(END_USES[id].id).toBe(id);
    }
  });

  it("splits mobile vs stationary", () => {
    const mobile = endUsesFor("mobile").map((p) => p.id);
    const stationary = endUsesFor("stationary").map((p) => p.id);
    expect(mobile).toEqual(["car","van","truck","bus","forklift","heavyEquip"]);
    expect(stationary).toEqual(["boiler","furnaceKiln","generator","dryer","spaceHeat","otherProcess"]);
  });

  it("marks a high-temp kiln as hard to electrify and a truck as feasible", () => {
    expect(END_USES.furnaceKiln.electrify.feasible).toBe("hard");
    expect(END_USES.truck.electrify.feasible).toBe("yes");
    expect(END_USES.truck.electrify.capexPerUnit).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/model/__tests__/end-use.test.ts`
Expected: FAIL — cannot resolve `@/lib/model/end-use`.

- [ ] **Step 3: Write the module**

```ts
// lib/model/end-use.ts
import type { AltFuelId, CombustionAsset } from "./types";

export type EndUseId =
  | "car" | "van" | "truck" | "bus" | "forklift" | "heavyEquip"
  | "boiler" | "furnaceKiln" | "generator" | "dryer" | "spaceHeat" | "otherProcess";

export type Feasibility = "easy" | "yes" | "hard" | "no";

export interface EndUseProfile {
  id: EndUseId;
  label: string;
  category: "mobile" | "stationary";
  electrify: { feasible: Feasibility; cop: number; capexPerUnit?: number; capacityHint?: number; note?: string };
  fuelSwitch: { feasible: Feasibility; preferred?: AltFuelId; note?: string };
  flexFuel?: { feasible: Feasibility };
}

export const END_USES: Record<EndUseId, EndUseProfile> = {
  // ── Mobile ──
  car:        { id: "car",        label: "Car / passenger",       category: "mobile",     electrify: { feasible: "easy", cop: 3.5, capexPerUnit: 1_800_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "yes" } },
  van:        { id: "van",        label: "Van / LCV",             category: "mobile",     electrify: { feasible: "yes",  cop: 3.2, capexPerUnit: 2_500_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "yes" } },
  truck:      { id: "truck",      label: "Truck (HGV)",           category: "mobile",     electrify: { feasible: "yes",  cop: 3.0, capexPerUnit: 9_500_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "yes" } },
  bus:        { id: "bus",        label: "Bus",                   category: "mobile",     electrify: { feasible: "yes",  cop: 3.0, capexPerUnit: 15_000_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "yes" } },
  forklift:   { id: "forklift",   label: "Forklift / handling",   category: "mobile",     electrify: { feasible: "easy", cop: 3.0, capexPerUnit: 600_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "no" } },
  heavyEquip: { id: "heavyEquip", label: "Heavy / off-road",      category: "mobile",     electrify: { feasible: "hard", cop: 2.0, capexPerUnit: 20_000_000, note: "Off-road duty cycles are hard to electrify today." }, fuelSwitch: { feasible: "yes", preferred: "biodiesel", note: "Biodiesel is the near-term lever." }, flexFuel: { feasible: "no" } },
  // ── Stationary ──
  boiler:       { id: "boiler",       label: "Boiler (low/med-temp)", category: "stationary", electrify: { feasible: "yes",  cop: 3.0, capacityHint: 60 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" } },
  furnaceKiln:  { id: "furnaceKiln",  label: "Furnace / Kiln (high-temp)", category: "stationary", electrify: { feasible: "hard", cop: 1.0, capacityHint: 0, note: "High-temp process — electrification is limited." }, fuelSwitch: { feasible: "yes", preferred: "biodiesel", note: "Bio-blend is the preferred lever." } },
  generator:    { id: "generator",    label: "Generator (genset)",    category: "stationary", electrify: { feasible: "yes",  cop: 1.0, capacityHint: 50, note: "Replace with grid / solar + battery." }, fuelSwitch: { feasible: "easy", preferred: "biodiesel" } },
  dryer:        { id: "dryer",        label: "Dryer",                 category: "stationary", electrify: { feasible: "yes",  cop: 2.5, capacityHint: 50 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" } },
  spaceHeat:    { id: "spaceHeat",    label: "Space / water heater",  category: "stationary", electrify: { feasible: "easy", cop: 3.5, capacityHint: 80 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" } },
  otherProcess: { id: "otherProcess", label: "Other process heat",    category: "stationary", electrify: { feasible: "yes",  cop: 2.0, capacityHint: 40 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" } },
};

export function endUsesFor(category: "mobile" | "stationary"): EndUseProfile[] {
  return (Object.values(END_USES) as EndUseProfile[]).filter((p) => p.category === category);
}

/** Profile for an asset's end-use, or undefined when unspecified. */
export function endUseProfile(asset: Pick<CombustionAsset, "endUse">): EndUseProfile | undefined {
  return asset.endUse ? END_USES[asset.endUse] : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/model/__tests__/end-use.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Checkpoint** — `npm test` stays green.

---

### Task 2: Add `endUse` to the model and seed lever defaults

**Files:**
- Modify: `lib/model/types.ts` (add field to `CombustionAsset`)
- Modify: `lib/model/segments.ts:53-59` (`defaultActions`)
- Test: `lib/model/__tests__/end-use-defaults.test.ts`

**Interfaces:**
- Consumes: `END_USES`, `endUseProfile` from `./end-use` (Task 1); `defaultActions` existing signature `defaultActions(asset: CombustionAsset): AssetActions`.
- Produces: `CombustionAsset.endUse?: EndUseId`; `defaultActions` now profile-aware (same signature).

- [ ] **Step 1: Write the failing test**

```ts
// lib/model/__tests__/end-use-defaults.test.ts
import { describe, expect, it } from "vitest";
import { defaultActions } from "@/lib/model/segments";
import type { CombustionAsset } from "@/lib/model/types";

function asset(over: Partial<CombustionAsset>): CombustionAsset {
  return { id: "a1", name: "x", category: "mobile", fuelType: "diesel", unit: "L", annualVolume: 1000, opex: 0, remainingLife: 10, unitCount: 4, ...over };
}

describe("defaultActions — end-use seeding", () => {
  it("unspecified end-use reproduces the legacy defaults", () => {
    const d = defaultActions(asset({}));
    expect(d.electrify.cop).toBe(3);
    expect(d.electrify.assetCapex).toBe(0);
  });

  it("a truck seeds truck COP and per-unit capex", () => {
    const d = defaultActions(asset({ endUse: "truck" }));
    expect(d.electrify.cop).toBe(3.0);
    expect(d.electrify.assetCapex).toBe(9_500_000);
  });

  it("a high-temp kiln seeds COP 1.0", () => {
    const d = defaultActions(asset({ category: "stationary", fuelType: "naturalGas", unit: "kg", endUse: "furnaceKiln" }));
    expect(d.electrify.cop).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/model/__tests__/end-use-defaults.test.ts`
Expected: FAIL — `endUse` is not assignable / COP still 3 for truck.

- [ ] **Step 3a: Add the field** — in `lib/model/types.ts`, inside `interface CombustionAsset`, directly after the `unitCount` field, add:

```ts
  /** Equipment / end-use class — drives scenario-lever defaults & feasibility. Absent ⇒ unspecified. */
  endUse?: import("./end-use").EndUseId;
```

- [ ] **Step 3b: Make `defaultActions` profile-aware** — replace the body of `defaultActions` (`lib/model/segments.ts:53-59`) with:

```ts
export function defaultActions(asset: CombustionAsset): AssetActions {
  const base: AssetActions = {
    electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 0, startYear: 2026, targetYear: 2032 },
    fuelSwitch: { enabled: false, altFuel: defaultAltFuelFor(asset.fuelType) ?? "biodiesel", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 78, retrofitCapex: 0, startYear: 2027, targetYear: 2033 },
    flexFuel: defaultFlexFuel(asset),
  };
  const p = endUseProfile(asset);
  if (!p) return base;
  return {
    ...base,
    electrify: {
      ...base.electrify,
      cop: p.electrify.cop,
      assetCapex: p.electrify.capexPerUnit ?? base.electrify.assetCapex,
      capacityPct: asset.category === "mobile" ? base.electrify.capacityPct : (p.electrify.capacityHint ?? base.electrify.capacityPct),
    },
    fuelSwitch: { ...base.fuelSwitch, altFuel: p.fuelSwitch.preferred ?? base.fuelSwitch.altFuel },
  };
}
```

- [ ] **Step 3c: Add the import** — at the top of `lib/model/segments.ts`, add to the existing import block:

```ts
import { endUseProfile } from "./end-use";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/model/__tests__/end-use-defaults.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Checkpoint** — `npm test` stays green (regression: legacy default tests must still pass).

---

### Task 3: End-use selector in the activity UI

**Files:**
- Modify: `components/tabs/activity/EntryScreen.tsx` (Asset details card)
- Modify: `components/tabs/activity/SourceListScreen.tsx` (Add-a-source form)
- Test: append to `components/tabs/__tests__/activity-data.test.tsx`

**Interfaces:**
- Consumes: `endUsesFor`, `type EndUseId` from `@/lib/model/end-use`; existing `SelectField` from `./fields`; `updateCombustion`, `addCombustionAsset`.
- Produces: end-use selectable; stored on the asset via `endUse`.

- [ ] **Step 1: Write the failing test** — append to `activity-data.test.tsx`:

```ts
// ── End-use selector (combustion) ───────────────────────────────────────────
describe("ActivityDataTab — end-use selector", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("fuel entry shows an end-use selector filtered by category", async () => {
    await openDieselSourceEntry(); // existing helper: adds 'Diesel gensets', opens its entry
    const sel = screen.getByLabelText(/Equipment \/ end-use/i) as HTMLSelectElement;
    expect(sel).toBeTruthy();
    // default category is 'stationary' for a freshly added liquid source → stationary options present
    const opts = Array.from(sel.querySelectorAll("option")).map((o) => o.textContent);
    expect(opts.join("|")).toMatch(/Boiler/);
    expect(opts.join("|")).not.toMatch(/Truck/); // mobile-only option absent for stationary
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx -t "end-use selector"`
Expected: FAIL — no element labelled "Equipment / end-use".

- [ ] **Step 3a: EntryScreen import** — in `components/tabs/activity/EntryScreen.tsx`, add:

```ts
import { endUsesFor, type EndUseId } from "@/lib/model/end-use";
```

- [ ] **Step 3b: Render the selector** — in the fuel branch's "Asset details" grid (after the Fuel `SelectField`, before the metered/spend conditional `NumField`), insert:

```tsx
<SelectField
  label="Equipment / end-use"
  value={(a.endUse ?? "") as EndUseId | ""}
  options={[{ value: "" as EndUseId | "", label: "Unspecified" }, ...endUsesFor(a.category).map((p) => ({ value: p.id as EndUseId | "", label: p.label }))]}
  onChange={(v) => updateCombustion(year, a.id, { endUse: (v || undefined) as EndUseId | undefined })}
  hint="What kind of equipment this is. Pre-fills realistic scenario-modeller assumptions (EV cost, heat-pump COP, bio-blend)."
/>
```

Note: when `onCategory` changes the category and the current `endUse` is not in `endUsesFor(newCat)`, clear it. Update `onCategory` to also clear an incompatible end-use:

```ts
const onCategory = (cat: CombustionAsset["category"]) => {
  const allowed = FUELS_BY_CATEGORY[cat];
  const patch: Partial<CombustionAsset> = { category: cat };
  if (!allowed.includes(a.fuelType)) { patch.fuelType = allowed[0]; patch.unit = FUELS[allowed[0]].unit; }
  if (a.endUse && !endUsesFor(cat).some((p) => p.id === a.endUse)) patch.endUse = undefined;
  updateCombustion(year, a.id, patch);
};
```

- [ ] **Step 3c: Add to the Add-a-source form** — in `components/tabs/activity/SourceListScreen.tsx`:
  - Add import: `import { endUsesFor, type EndUseId } from "@/lib/model/end-use";`
  - Add state near the other form state: `const [endUse, setEndUse] = useState<EndUseId | "">("");`
  - In `handleOpenForm`, reset it: `setEndUse("");`
  - In the form grid (combustion branch only — guard `!isRefrigerant`), after the Fuel select cell, add:

```tsx
{!isRefrigerant && (
  <div className="flex flex-col gap-1">
    <label htmlFor="src-enduse" className="text-[11px] font-semibold text-ink-soft">End-use</label>
    <select id="src-enduse" value={endUse} onChange={(e) => setEndUse(e.target.value as EndUseId | "")}
      className="rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:border-brand-400">
      <option value="">Unspecified</option>
      {endUsesFor(fuelType).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  </div>
)}
```

  - In `handleAdd`, on the combustion `addCombustionAsset` object, add `endUse: endUse || undefined,`.

  Note: `fuelType` here is the form's stationary/mobile state variable (`"stationary"|"mobile"`), which matches the `endUsesFor` parameter type.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx -t "end-use selector"`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — `npx tsc --noEmit` clean and `npm test` green.

---

### Task 4: Feasibility hint in the scenario modeller lever card

**Files:**
- Modify: `components/tabs/BuilderTab.tsx` (`AssetActionCard`, electrify lever area ~line 246-280)
- Test: append to `components/tabs/__tests__/builder-grouping.test.tsx`

**Interfaces:**
- Consumes: `endUseProfile` from `@/lib/model/end-use`.
- Produces: a ⚠ hint rendered when the asset's end-use marks electrify `hard`/`no`.

- [ ] **Step 1: Write the failing test** — append to `builder-grouping.test.tsx` (reuse its existing provider/render helpers; adapt names to that file's helpers):

```ts
// ── Electrify feasibility hint ───────────────────────────────────────────────
import { endUseProfile } from "@/lib/model/end-use";

describe("BuilderTab — electrify feasibility hint", () => {
  it("furnaceKiln profile is hard to electrify (drives the hint)", () => {
    // Guard the data the UI reads. The note text rendered in the card comes from here.
    expect(endUseProfile({ endUse: "furnaceKiln" })?.electrify.feasible).toBe("hard");
    expect(endUseProfile({ endUse: "furnaceKiln" })?.electrify.note).toMatch(/High-temp/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/tabs/__tests__/builder-grouping.test.tsx -t "feasibility hint"`
Expected: FAIL — `@/lib/model/end-use` `endUseProfile` import resolves, but assertion fails only if note wording differs; if Task 1 is done it PASSES. If so, this step's purpose is the UI wiring below — proceed to 3 and keep this as a guard test.

- [ ] **Step 3a: Import** — at the top of `components/tabs/BuilderTab.tsx`, add:

```ts
import { endUseProfile } from "@/lib/model/end-use";
```

- [ ] **Step 3b: Render the badge** — inside `AssetActionCard`, after `const e = acts.electrify;` add:

```ts
const eu = endUseProfile(asset);
const electrifyWarn = eu && (eu.electrify.feasible === "hard" || eu.electrify.feasible === "no");
```

Then within the Electrify `LeverCard` children (right after its opening, before the unitsToConvert/capacity control), add:

```tsx
{electrifyWarn && (
  <p className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 text-[11px] font-medium">
    ⚠ {eu!.electrify.note ?? "Limited electrification potential for this equipment."}
  </p>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/tabs/__tests__/builder-grouping.test.tsx -t "feasibility hint"`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — `npx tsc --noEmit` clean and full `npm test` green.

---

## Self-Review

**Spec coverage:**
- Data model `endUse` field → Task 2 (3a). ✓
- `lib/model/end-use.ts` taxonomy + profiles + `endUsesFor`/`endUseProfile` → Task 1. ✓
- Taxonomy (6 mobile + 6 stationary) → Task 1 `END_USES`. ✓
- Selector in Add form + entry screen → Task 3. ✓
- Modeller default seeding via `defaultActions` → Task 2 (3b). ✓
- Feasibility hint in lever UI → Task 4. ✓
- Backward compat (absent end-use = today) → Task 2 test 1 (regression) + Global Constraints. ✓
- Non-goals (no baseline math, combustion only) → respected; no baseline files touched. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; test code provided for each task.

**Type consistency:** `EndUseId`, `EndUseProfile`, `endUsesFor`, `endUseProfile`, `END_USES` used identically across Tasks 1–4. `defaultActions(asset: CombustionAsset): AssetActions` signature unchanged. `AltFuelId` values match the constraint list. `endUsesFor` takes `"mobile"|"stationary"`, matching both `a.category` (entry) and the form's `fuelType` state (add form).

**Note on Task 4 Step 2:** Because Task 1 already defines the profile, the guard test may pass immediately; its real purpose is to lock the `note` wording the UI renders. Treat it as a regression guard, then do the UI wiring in Step 3.
