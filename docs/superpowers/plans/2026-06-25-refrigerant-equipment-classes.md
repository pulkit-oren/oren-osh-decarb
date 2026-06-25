# Refrigerant Equipment Classes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Tag a refrigeration system with a finer equipment class that sharpens the recommended low-GWP swap target feeding the modeller's gas-switch lever.

**Architecture:** A static taxonomy module (`lib/model/refrigerant-class.ts`) maps each equipment class to a parent `systemType` and a `recommendedAlt` refrigerant. `RefrigerationSystem` gains an optional `equipmentClass`. `defaultSystemActions` reads the class's `recommendedAlt` (fallback to today's `RECOMMENDED_ALT_BY_SYSTEM`). Selectors added to the refrigerant entry screen and Add form. No emission-math change.

**Tech Stack:** Next.js 16, React 19, TypeScript, vitest, the activity `fields.tsx` primitives (`SelectField`).

## Global Constraints

- **No git repo:** Do NOT run `git`. Gate = full suite (`npm test`) green + `npx tsc --noEmit` clean.
- **Backward compatible:** a `RefrigerationSystem` with `equipmentClass` absent behaves exactly as today (`gasSwitch.altRefrigerant === RECOMMENDED_ALT_BY_SYSTEM[systemType]`). Existing tests stay green.
- **No emission-math change:** only the `gasSwitch` default `altRefrigerant` is sharpened; `refrigerantCO2e`/GWP untouched.
- Phase 3 = refrigerant only. Do NOT touch combustion/electricity code or the old `components/tabs/DataInputTab.tsx`.
- `systemType` values are exactly `"commercialHVAC" | "industrialColdStorage" | "retailRefrigeration"`.
- All `recommendedAlt` values must be valid `RefrigerantId`s (e.g. R32, R454B, R1234ze, R717, R744, R290 — all exist in the union).

---

### Task 1: Refrigerant equipment-class taxonomy module

**Files:**
- Create: `lib/model/refrigerant-class.ts`
- Test: `lib/model/__tests__/refrigerant-class.test.ts`

**Interfaces:**
- Consumes: `RefrigerantId`, `RefrigerationSystem` from `./types`.
- Produces:
  - `type RefrigClassId = "splitAc"|"vrf"|"chiller"|"packagedRooftop"|"coldRoom"|"blastFreezer"|"ammoniaPlant"|"displayCase"|"supermarketRack"|"bottleCooler"`
  - `interface RefrigClassProfile { id: RefrigClassId; label: string; systemType: RefrigerationSystem["systemType"]; recommendedAlt: RefrigerantId; note: string }`
  - `const REFRIG_CLASSES: Record<RefrigClassId, RefrigClassProfile>`
  - `const REFRIG_CLASS_LIST: RefrigClassProfile[]`
  - `function refrigClassesFor(systemType): RefrigClassProfile[]`
  - `function refrigClassProfile(s: { equipmentClass?: RefrigClassId }): RefrigClassProfile | undefined`

- [ ] **Step 1: Write the failing test**

```ts
// lib/model/__tests__/refrigerant-class.test.ts
import { describe, expect, it } from "vitest";
import { REFRIG_CLASSES, REFRIG_CLASS_LIST, refrigClassesFor, refrigClassProfile, type RefrigClassId } from "@/lib/model/refrigerant-class";

const IDS: RefrigClassId[] = ["splitAc","vrf","chiller","packagedRooftop","coldRoom","blastFreezer","ammoniaPlant","displayCase","supermarketRack","bottleCooler"];

describe("refrigerant equipment-class taxonomy", () => {
  it("has a self-consistent profile for every id", () => {
    for (const id of IDS) {
      expect(REFRIG_CLASSES[id]).toBeTruthy();
      expect(REFRIG_CLASSES[id].id).toBe(id);
    }
  });

  it("exposes a stable 10-item list", () => {
    expect(REFRIG_CLASS_LIST.map((p) => p.id)).toEqual(IDS);
  });

  it("filters classes by parent system type", () => {
    expect(refrigClassesFor("retailRefrigeration").map((p) => p.id)).toEqual(["displayCase","supermarketRack","bottleCooler"]);
    expect(refrigClassesFor("commercialHVAC").map((p) => p.id)).toEqual(["splitAc","vrf","chiller","packagedRooftop"]);
  });

  it("maps classes to finer low-GWP swaps", () => {
    expect(REFRIG_CLASSES.displayCase.recommendedAlt).toBe("R290");
    expect(REFRIG_CLASSES.chiller.recommendedAlt).toBe("R1234ze");
    expect(REFRIG_CLASSES.coldRoom.recommendedAlt).toBe("R717");
  });

  it("refrigClassProfile resolves or returns undefined", () => {
    expect(refrigClassProfile({ equipmentClass: "splitAc" })?.id).toBe("splitAc");
    expect(refrigClassProfile({})).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/model/__tests__/refrigerant-class.test.ts`
Expected: FAIL — cannot resolve `@/lib/model/refrigerant-class`.

- [ ] **Step 3: Write the module**

```ts
// lib/model/refrigerant-class.ts
import type { RefrigerantId, RefrigerationSystem } from "./types";

export type RefrigClassId =
  | "splitAc" | "vrf" | "chiller" | "packagedRooftop"
  | "coldRoom" | "blastFreezer" | "ammoniaPlant"
  | "displayCase" | "supermarketRack" | "bottleCooler";

export interface RefrigClassProfile {
  id: RefrigClassId;
  label: string;
  systemType: RefrigerationSystem["systemType"];
  recommendedAlt: RefrigerantId;
  note: string;
}

export const REFRIG_CLASSES: Record<RefrigClassId, RefrigClassProfile> = {
  splitAc:         { id: "splitAc",         label: "Split AC",                systemType: "commercialHVAC",        recommendedAlt: "R32",     note: "Small charge — R-32 is the common A2L drop-forward." },
  vrf:             { id: "vrf",             label: "VRF / VRV",               systemType: "commercialHVAC",        recommendedAlt: "R454B",   note: "Leading R-410A replacement for variable-flow systems." },
  chiller:         { id: "chiller",         label: "Chiller",                 systemType: "commercialHVAC",        recommendedAlt: "R1234ze", note: "Ultra-low-GWP HFO suits water chillers." },
  packagedRooftop: { id: "packagedRooftop", label: "Packaged rooftop",        systemType: "commercialHVAC",        recommendedAlt: "R454B",   note: "A2L replacement for packaged DX units." },
  coldRoom:        { id: "coldRoom",        label: "Cold room / walk-in",     systemType: "industrialColdStorage", recommendedAlt: "R717",    note: "Ammonia — zero GWP, best efficiency at scale." },
  blastFreezer:    { id: "blastFreezer",    label: "Blast freezer",           systemType: "industrialColdStorage", recommendedAlt: "R744",    note: "CO₂ transcritical suits low-temp freezing." },
  ammoniaPlant:    { id: "ammoniaPlant",    label: "Ammonia plant",           systemType: "industrialColdStorage", recommendedAlt: "R717",    note: "Already ammonia-class; keep R-717." },
  displayCase:     { id: "displayCase",     label: "Display case / reach-in", systemType: "retailRefrigeration",   recommendedAlt: "R290",    note: "Propane — near-zero GWP within charge limits." },
  supermarketRack: { id: "supermarketRack", label: "Supermarket rack",        systemType: "retailRefrigeration",   recommendedAlt: "R744",    note: "CO₂ transcritical is the retail-rack standard." },
  bottleCooler:    { id: "bottleCooler",    label: "Bottle cooler / vending", systemType: "retailRefrigeration",   recommendedAlt: "R290",    note: "Self-contained — propane within charge limits." },
};

export const REFRIG_CLASS_LIST: RefrigClassProfile[] = [
  REFRIG_CLASSES.splitAc,
  REFRIG_CLASSES.vrf,
  REFRIG_CLASSES.chiller,
  REFRIG_CLASSES.packagedRooftop,
  REFRIG_CLASSES.coldRoom,
  REFRIG_CLASSES.blastFreezer,
  REFRIG_CLASSES.ammoniaPlant,
  REFRIG_CLASSES.displayCase,
  REFRIG_CLASSES.supermarketRack,
  REFRIG_CLASSES.bottleCooler,
];

export function refrigClassesFor(systemType: RefrigerationSystem["systemType"]): RefrigClassProfile[] {
  return REFRIG_CLASS_LIST.filter((p) => p.systemType === systemType);
}

/** Profile for a system's equipment class, or undefined when unspecified. */
export function refrigClassProfile(s: { equipmentClass?: RefrigClassId }): RefrigClassProfile | undefined {
  return s.equipmentClass ? REFRIG_CLASSES[s.equipmentClass] : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/model/__tests__/refrigerant-class.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Checkpoint** — `npx tsc --noEmit` clean and `npm test` green.

---

### Task 2: `equipmentClass` field + `defaultSystemActions` seeding

**Files:**
- Modify: `lib/model/types.ts` (add `equipmentClass?` to `RefrigerationSystem`)
- Modify: `lib/model/segments.ts` (`defaultSystemActions`)
- Test: `lib/model/__tests__/refrigerant-class-defaults.test.ts`

**Interfaces:**
- Consumes: `refrigClassProfile` from `./refrigerant-class` (Task 1); existing `defaultSystemActions(sys: RefrigerationSystem): SystemActions`.
- Produces: `RefrigerationSystem.equipmentClass?: RefrigClassId`; profile-aware `defaultSystemActions`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/model/__tests__/refrigerant-class-defaults.test.ts
import { describe, expect, it } from "vitest";
import { defaultSystemActions } from "@/lib/model/segments";
import { RECOMMENDED_ALT_BY_SYSTEM } from "@/lib/model/factors";
import type { RefrigerationSystem } from "@/lib/model/types";

function sys(over: Partial<RefrigerationSystem>): RefrigerationSystem {
  return { id: "r1", name: "x", systemType: "retailRefrigeration", refrigerant: "R404A", toppedUpKg: 5, gasCostPerKg: 900, ...over };
}

describe("defaultSystemActions — equipment-class seeding", () => {
  it("no class reproduces the system-type default", () => {
    const d = defaultSystemActions(sys({}));
    expect(d.gasSwitch.altRefrigerant).toBe(RECOMMENDED_ALT_BY_SYSTEM.retailRefrigeration);
  });

  it("a display case sharpens the swap to R-290", () => {
    const d = defaultSystemActions(sys({ equipmentClass: "displayCase" }));
    expect(d.gasSwitch.altRefrigerant).toBe("R290");
  });

  it("a supermarket rack sharpens the swap to R-744 (differs from the retail default)", () => {
    const d = defaultSystemActions(sys({ equipmentClass: "supermarketRack" }));
    expect(d.gasSwitch.altRefrigerant).toBe("R744");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/model/__tests__/refrigerant-class-defaults.test.ts`
Expected: FAIL — `equipmentClass` not assignable, or altRefrigerant still the system-type default for displayCase.

- [ ] **Step 3a: Add the field** — in `lib/model/types.ts`, inside `interface RefrigerationSystem`, add (e.g. after the `systemType` field):

```ts
  /** Finer equipment class within the system type — sharpens the recommended low-GWP swap. Absent ⇒ use the system-type default. */
  equipmentClass?: import("./refrigerant-class").RefrigClassId;
```

- [ ] **Step 3b: Add the import** — at the top of `lib/model/segments.ts`, add:

```ts
import { refrigClassProfile } from "./refrigerant-class";
```

- [ ] **Step 3c: Make `defaultSystemActions` profile-aware** — the function currently is:

```ts
export function defaultSystemActions(sys: RefrigerationSystem): SystemActions {
  return {
    gasSwitch: { enabled: false, transitionPct: 60, altRefrigerant: RECOMMENDED_ALT_BY_SYSTEM[sys.systemType], retrofitCapex: 0, startYear: 2026, targetYear: 2030 },
    leakFix: { enabled: false, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 },
  };
}
```

Replace ONLY the `altRefrigerant` value so it prefers the class's recommendation:

```ts
export function defaultSystemActions(sys: RefrigerationSystem): SystemActions {
  const cls = refrigClassProfile(sys);
  return {
    gasSwitch: { enabled: false, transitionPct: 60, altRefrigerant: cls?.recommendedAlt ?? RECOMMENDED_ALT_BY_SYSTEM[sys.systemType], retrofitCapex: 0, startYear: 2026, targetYear: 2030 },
    leakFix: { enabled: false, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 },
  };
}
```

(Do not change `leakFix` or any other value. Confirm `RECOMMENDED_ALT_BY_SYSTEM` import already exists in this file — it does — and leave it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/model/__tests__/refrigerant-class-defaults.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Checkpoint** — `npx tsc --noEmit` clean and `npm test` green (regression: existing refrigerant/system tests must still pass).

---

### Task 3: Equipment-class selector in the refrigerant UI

**Files:**
- Modify: `components/tabs/activity/EntryScreen.tsx` (refrigerant branch "System details")
- Modify: `components/tabs/activity/SourceListScreen.tsx` (refrigerant Add form)
- Test: append to `components/tabs/__tests__/activity-data.test.tsx`

**Interfaces:**
- Consumes: `refrigClassesFor`, `refrigClassProfile`, `type RefrigClassId` from `@/lib/model/refrigerant-class`; `REFRIGERANTS` from `@/lib/model/factors`; existing `SelectField`.
- Produces: equipment class selectable & stored on the system; recommended-swap advisory line.

- [ ] **Step 1: Write the failing test** — append to `activity-data.test.tsx` (reuse its `openR404aBuRow` helper which adds an R-404A retail-default system and the existing imports/`beforeEach`):

```ts
// ── Refrigerant equipment-class selector ─────────────────────────────────────
describe("ActivityDataTab — refrigerant equipment class", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("entry screen shows an equipment-class selector and recommended swap", async () => {
    await openR404aBuRow(); // existing helper: adds 'Pune R404A System' (commercialHVAC default)
    const nameSpanR = screen.getAllByText("Pune R404A System").find((el) => el.tagName === "SPAN");
    fireEvent.click(nameSpanR!.closest("div")!);
    const sel = screen.getByLabelText(/Equipment class/i) as HTMLSelectElement;
    expect(sel).toBeTruthy();
    const opts = Array.from(sel.querySelectorAll("option")).map((o) => o.textContent);
    // default systemType is commercialHVAC → its classes present, retail class absent
    expect(opts.join("|")).toMatch(/Chiller/);
    expect(opts.join("|")).not.toMatch(/Display case/);
    // pick Chiller → recommended swap line mentions R-1234ze
    fireEvent.change(sel, { target: { value: "chiller" } });
    expect(screen.getByText(/Recommended low-GWP swap/i)).toBeTruthy();
    expect(screen.getByText(/R-?1234ze/i)).toBeTruthy();
  });
});
```

NOTE: confirm via reading `openR404aBuRow` that the added system's default `systemType` is `commercialHVAC` (the Add-form default `systemType` state is `commercialHVAC`). If it differs, adjust the present/absent class assertions to match that system type's classes. The label text `REFRIGERANTS["R1234ze"].label` is what the recommended-swap line renders — read `factors.ts` to confirm it matches `/R-?1234ze/i` (it is "R-1234ze (...)"); adjust the regex if the label differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx -t "equipment class"`
Expected: FAIL — no "Equipment class" label.

- [ ] **Step 3a: EntryScreen** — in `components/tabs/activity/EntryScreen.tsx`:
(i) Add imports:
```ts
import { refrigClassesFor, refrigClassProfile, type RefrigClassId } from "@/lib/model/refrigerant-class";
```
(`REFRIGERANTS` is already imported in this file.)
(ii) In the refrigerant branch, after computing `s`, compute the active class profile:
```ts
const refClass = refrigClassProfile(s);
```
(iii) In the "System details" grid, AFTER the System type `SelectField` and BEFORE the Refrigerant gas `SelectField`, insert the equipment-class selector:
```tsx
<SelectField
  label="Equipment class"
  value={(s.equipmentClass ?? "") as RefrigClassId | ""}
  options={[{ value: "" as RefrigClassId | "", label: "Unspecified" }, ...refrigClassesFor(s.systemType).map((p) => ({ value: p.id as RefrigClassId | "", label: p.label }))]}
  onChange={(v) => updateRefrigeration(year, s.id, { equipmentClass: (v || undefined) as RefrigClassId | undefined })}
  hint="A finer class sharpens the recommended low-GWP swap used by the modeller."
/>
```
(iv) Change the System type `SelectField`'s onChange so switching system type clears an incompatible class. Its current onChange is `(v) => updateRefrigeration(year, s.id, { systemType: v })`. Replace with:
```tsx
onChange={(v) => {
  const patch: Partial<RefrigerationSystem> = { systemType: v };
  if (s.equipmentClass && !refrigClassesFor(v).some((p) => p.id === s.equipmentClass)) patch.equipmentClass = undefined;
  updateRefrigeration(year, s.id, patch);
}}
```
(`RefrigerationSystem` type is already imported in EntryScreen; if not, add it to the existing `@/lib/model/types` import.)
(v) Add the recommended-swap advisory line — place it right after the "System details" grid `</div>` (still inside that DetailCard), so it shows when a class is set:
```tsx
{refClass && (
  <p className="text-[11px] text-ink-faint mt-3">Recommended low-GWP swap: <strong className="text-ink">{REFRIGERANTS[refClass.recommendedAlt]?.label ?? refClass.recommendedAlt}</strong></p>
)}
```

- [ ] **Step 3b: SourceListScreen Add form** — in `components/tabs/activity/SourceListScreen.tsx`:
(i) Add import:
```ts
import { refrigClassesFor, type RefrigClassId } from "@/lib/model/refrigerant-class";
```
(ii) Add form state near the other fields: `const [equipmentClass, setEquipmentClass] = useState<RefrigClassId | "">("");`
(iii) In `handleOpenForm`, reset: `setEquipmentClass("");`
(iv) In the refrigerant branch of the form grid (where the System type `<select>` lives — i.e. the `isRefrigerant` side), add AFTER the system-type select cell:
```tsx
<div className="flex flex-col gap-1">
  <label htmlFor="src-refrig-class" className="text-[11px] font-semibold text-ink-soft">Equipment class</label>
  <select id="src-refrig-class" value={equipmentClass} onChange={(e) => setEquipmentClass(e.target.value as RefrigClassId | "")}
    className="rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:border-brand-400">
    <option value="">Unspecified</option>
    {refrigClassesFor(systemType).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
  </select>
</div>
```
NOTE: `systemType` here is the refrigerant Add-form's system-type state (`"commercialHVAC"|"industrialColdStorage"|"retailRefrigeration"`). Read the file to confirm the state variable name (it is `systemType`).
(v) In `handleAdd`, on the object passed to `addRefrigerationSystem`, add: `equipmentClass: equipmentClass || undefined,`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx -t "equipment class"`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — `npx tsc --noEmit` clean and `npm test` green.

---

## Self-Review

**Spec coverage:**
- `refrigerant-class.ts` taxonomy + profiles + `refrigClassesFor`/`refrigClassProfile`/`REFRIG_CLASS_LIST` → Task 1. ✓
- `RefrigerationSystem.equipmentClass?` field → Task 2 (3a). ✓
- `defaultSystemActions` sharpened swap → Task 2 (3c). ✓
- Entry-screen selector + clear-on-systemType-change + recommended-swap line → Task 3 (3a). ✓
- Add-form selector → Task 3 (3b). ✓
- Backward compat (no class = system-type default) → Task 2 test 1 (regression). ✓
- No emission-math / old-tab change → only the listed files touched. ✓

**Placeholder scan:** none — full code in every step.

**Type consistency:** `RefrigClassId`, `RefrigClassProfile`, `REFRIG_CLASSES`, `REFRIG_CLASS_LIST`, `refrigClassesFor`, `refrigClassProfile` used identically across tasks. `defaultSystemActions(sys: RefrigerationSystem): SystemActions` signature unchanged. `recommendedAlt` values (R32, R454B, R1234ze, R717, R744, R290) are all valid `RefrigerantId`s. `SelectField<T>` instantiates with `T = RefrigClassId | ""`. `updateRefrigeration(year, id, patch)` / `addRefrigerationSystem(year, system)` match existing prop signatures.
