# Electricity 4-box Flow & Entry-Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Electricity a BU-first flow with a single 4-box per-BU entry screen (Purchased / Virtual PPA / Solar onsite / I-REC), and redesign the per-BU entry screen (fuels, refrigerants, electricity) into clear zones with the emissions calculation in a collapsible dropdown.

**Architecture:** Keep the existing data model (one `Facility` per (BU, instrument); one `CombustionAsset`/`RefrigerationSystem` per (BU, fuel/gas)). Restructure navigation and the entry-screen UI only. Electricity gets a new nav target `{level:"elecbu", bu}` rendering four kWh inputs over four facility records. The entry screens share a small `Collapsible` for the calc block and a labeled "Details for the scenario modeller" section. Refrigerant detail becomes a full screen (new `entry` kind `"refrigerant"`), retiring the side panel for the per-BU flow.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind 4, lucide-react, vitest 4 + @testing-library/react (jsdom).

## Global Constraints

- Branch: create `electricity-4box-entry-redesign` off `master` (the executor sets this up; commits land there).
- `npm test` runs `vitest run`. Single file: `npx vitest run <path>`. `npx tsc --noEmit` must stay exit-0 clean after every task.
- Path alias `@/` = project root.
- Emissions rule (electricity): `Purchased × gridEf ÷ 1000`; Virtual PPA, Solar onsite, I-REC carry `gridEf: 0` → contribute 0. `facCO2e(f) = f.annualLoadKwh * f.gridEf / 1000` (already in `shared.tsx`).
- Data model unchanged: one `Facility` per (BU, instrument), keyed by `(f.bu ?? "") === bu && f.name === ELEC_TYPES[k].label`. No `Facility`/`CombustionAsset`/`RefrigerationSystem` field changes; no type-union member removed.
- No new heavy widgets (no sliders/steppers). Clearer grouping + inline `InfoTip` help + the calc dropdown only.
- Existing per-BU input, central toggle, scope drill-down, and the Scope 1/2 modeller must keep working.
- Tests in this repo use `getByText`/`getByLabelText`/`findBy*` (which throw on absence) with `.toBeTruthy()` — jest-dom is NOT wired. Match that style; use `queryBy*` + `.toBeFalsy()` for absence assertions.
- BU config localStorage key is `osh-bus-v3::c-0` for the default company; scope-2 planner key seeds facilities. Reuse the existing test helpers in `components/tabs/__tests__/activity-data.test.tsx`.

---

## File Structure

**Create:**
- `components/tabs/activity/Collapsible.tsx` — small expandable section (used for the calc dropdown).
- `components/tabs/activity/ElectricityBuScreen.tsx` — the 4-box per-BU electricity entry screen.

**Modify:**
- `components/tabs/activity/shared.tsx` — `ELEC_TYPES` (replace `any` with `solar`); `Nav` (add `{level:"elecbu"; bu:string}` and `entry` kind `"refrigerant"`).
- `components/tabs/DataInputTab.tsx` — add optional `showFuel?: boolean` to `CombustionDetails` (so the entry screen can show Category without the Fuel select).
- `components/tabs/activity/EntryScreen.tsx` — 3-zone redesign for fuel + facility; calc in `Collapsible`; add refrigerant full screen (`kind:"refrigerant"`).
- `components/tabs/activity/CategoryScreen.tsx` — electricity branch renders the BU list (central + bu modes, central toggle) → navigates to `{level:"elecbu", bu}`.
- `components/tabs/ActivityDataTab.tsx` — route `elecbu` and `entry`+`kind:"refrigerant"`; add `ensureFacility`, `buElecEmissions`, electricity central-toggle helper; pass new props.
- `components/tabs/activity/TypeScreen.tsx` — refrigerant gear navigates to `{level:"entry", kind:"refrigerant", id}` instead of `setSel`.
- `components/tabs/__tests__/activity-data.test.tsx` — new tests + update electricity-flow / refrigerant-gear tests.

---

## Task 1: Update ELEC_TYPES + extend Nav

**Files:**
- Modify: `components/tabs/activity/shared.tsx`
- Test: `components/tabs/__tests__/activity-data.test.tsx`

**Interfaces:**
- Produces: `ELEC_TYPES` keys are exactly `grid`, `vppa`, `solar`, `irec` (label "Solar onsite" for `solar`, gridEf 0). `Nav` union gains `{ level: "elecbu"; bu: string }` and the `entry` variant becomes `{ level: "entry"; kind: "combustion" | "facility" | "refrigerant"; id: string }`.

- [ ] **Step 1: Write the failing test** — append to `activity-data.test.tsx`:

```tsx
import { ELEC_TYPES } from "@/components/tabs/activity/shared";

describe("ELEC_TYPES (4 fixed instruments)", () => {
  it("has grid, vppa, solar, irec with Solar onsite labelled and clean EFs zero", () => {
    expect(ELEC_TYPES.map((t) => t.key)).toEqual(["grid", "vppa", "solar", "irec"]);
    const solar = ELEC_TYPES.find((t) => t.key === "solar");
    expect(solar?.label).toBe("Solar onsite");
    expect(solar?.gridEf).toBe(0);
    expect(ELEC_TYPES.find((t) => t.key === "vppa")?.gridEf).toBe(0);
    expect(ELEC_TYPES.find((t) => t.key === "irec")?.gridEf).toBe(0);
    expect(ELEC_TYPES.find((t) => t.key === "grid")?.gridEf).toBe(0.71);
    expect(ELEC_TYPES.some((t) => t.key === "any")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx`
Expected: FAIL — `any` still present / no `solar`.

- [ ] **Step 3: Edit `ELEC_TYPES`** in `shared.tsx` (replace the `any` entry with `solar`):

```ts
export const ELEC_TYPES: { key: string; label: string; gridEf: number; sub: string; icon: React.ElementType }[] = [
  { key: "grid", label: "Purchased electricity", gridEf: 0.71, sub: "Metered grid supply (location-based)", icon: Zap },
  { key: "vppa", label: "Virtual PPA", gridEf: 0, sub: "Contractual renewable — market-based", icon: Wind },
  { key: "solar", label: "Solar onsite", gridEf: 0, sub: "On-site solar generation, self-consumed", icon: Sun },
  { key: "irec", label: "I-REC", gridEf: 0, sub: "Renewable energy certificates", icon: Award },
];
```

Add `Sun` to the lucide-react import at the top of `shared.tsx` (it currently imports `Flame, Droplets, Mountain, Snowflake, Zap, Wind, Award, Plug, Leaf` — add `Sun`; `Plug` is now unused, remove it to keep tsc/lint clean).

- [ ] **Step 4: Extend the `Nav` union** in `shared.tsx`:

```ts
export type Nav =
  | { level: "home" }
  | { level: "bus" }
  | { level: "scope"; scope: 1 | 2 }
  | { level: "cat"; key: CatKey }
  | { level: "type"; key: CatKey; typeKey: string; cat?: "stationary" | "mobile" }
  | { level: "elecbu"; bu: string }
  | { level: "entry"; kind: "combustion" | "facility" | "refrigerant"; id: string };
```

- [ ] **Step 5: Run to verify the test passes + tsc**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx && npx tsc --noEmit`
Expected: the new test PASSES. `tsc` may now report errors in `CategoryScreen.tsx`/`EntryScreen.tsx` only where they reference `ELEC_TYPES` label "Grid electricity purchased" or the old `any` — those are addressed in Tasks 3–4. If `tsc` reports an unused-import error for `Plug`, ensure it was removed. If other files break, note them; they're handled downstream.

> The `grid` label changed from "Grid electricity purchased" → "Purchased electricity". `EntryScreen.tsx:37` matches a facility by `ELEC_TYPES.find((e) => e.label === f.name)` — old facilities named "Grid electricity purchased" won't match, but that back-button path is replaced in Task 4. Acceptable mid-plan.

- [ ] **Step 6: Commit**

```bash
git add components/tabs/activity/shared.tsx components/tabs/__tests__/activity-data.test.tsx
git commit -m "feat: ELEC_TYPES 4 fixed instruments (solar onsite) + nav elecbu/refrigerant"
```

---

## Task 2: Collapsible component

**Files:**
- Create: `components/tabs/activity/Collapsible.tsx`
- Test: `components/tabs/__tests__/activity-data.test.tsx`

**Interfaces:**
- Produces: `Collapsible({ title, defaultOpen?, children })` — a labeled section that is collapsed unless `defaultOpen` is true; clicking the header toggles it. The header is a `<button>` with the accessible name equal to `title`.

- [ ] **Step 1: Write the failing test** — append to `activity-data.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Collapsible } from "@/components/tabs/activity/Collapsible";

describe("Collapsible", () => {
  it("hides content until the header is clicked", () => {
    render(<Collapsible title="How this is calculated"><p>BODY-MARKER</p></Collapsible>);
    expect(screen.queryByText("BODY-MARKER")).toBeFalsy();
    fireEvent.click(screen.getByRole("button", { name: /How this is calculated/i }));
    expect(screen.getByText("BODY-MARKER")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx`
Expected: FAIL — module `Collapsible` not found.

- [ ] **Step 3: Create `components/tabs/activity/Collapsible.tsx`:**

```tsx
"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Collapsible({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-6 py-4 text-left hover:bg-surface-muted/50 transition-colors"
      >
        <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">{title}</span>
        <ChevronDown size={16} className={cn("text-ink-soft transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-6 pb-6 pt-0">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/tabs/activity/Collapsible.tsx components/tabs/__tests__/activity-data.test.tsx
git commit -m "feat: add Collapsible section component for the calc dropdown"
```

---

## Task 3: Entry-screen redesign (fuel + facility) + refrigerant full screen

**Files:**
- Modify: `components/tabs/DataInputTab.tsx` (add `showFuel?` to `CombustionDetails`)
- Modify: `components/tabs/activity/EntryScreen.tsx`
- Test: `components/tabs/__tests__/activity-data.test.tsx`

**Interfaces:**
- Consumes: `Collapsible` (Task 2); `Nav` with `kind:"refrigerant"` (Task 1).
- Produces: `EntryScreen` handles `kind` `"combustion" | "facility" | "refrigerant"`. The "How this is calculated" block is collapsed by default for all kinds. `CombustionDetails` gains `showFuel?: boolean` (default true); when false it renders the Category select but not the Fuel select. The refrigerant screen needs `refrigSysById` + `updateRefrigeration` props on `EntryScreen`.

- [ ] **Step 1: Write the failing tests** — append to `activity-data.test.tsx` (reuse the existing helper that navigates to a fuel BU entry screen; if none, navigate: open a fuel category → fuel card → BU row gear). Two tests:

```tsx
// (uses existing render+navigate helpers in this file; see the fuel BU-row tests already present)
it("entry screen hides the calculation until expanded", async () => {
  // navigate to a Diesel BU entry screen (reuse the helper used by the fuel BU-input tests)
  await openDieselBuEntry(); // helper: renders, BU mode, navigates fuel→BU→gear
  expect(screen.queryByText(/Energy/i)).toBeFalsy(); // calc body hidden
  fireEvent.click(screen.getByRole("button", { name: /How this is calculated/i }));
  expect(screen.getAllByText(/tCO₂e|GJ|Emission factor/i).length).toBeGreaterThan(0);
});

it("refrigerant gear opens a full entry screen (not a side panel)", async () => {
  await openR404aBuEntryViaGear(); // helper: refrigerants → R-404A → BU row gear
  // full screen shows the source title and a collapsible calc
  expect(screen.getByRole("button", { name: /How this is calculated/i })).toBeTruthy();
});
```

If the existing test file lacks `openDieselBuEntry`/`openR404aBuEntryViaGear`, add small local helpers next to the existing navigation helpers, following their pattern (seed `osh-bus-v3::c-0` to bu mode with a unit, click through). The refrigerant-gear test depends on Task 5 wiring; if it can't pass yet, write it `it.todo` here and convert it to `it` in Task 5. **Decision: write the calc-collapsed test now (passes this task); write the refrigerant-gear navigation test in Task 5.** So only include the first test in this task.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx`
Expected: FAIL — the calc block is currently always visible (no "How this is calculated" button).

- [ ] **Step 3: Add `showFuel?` to `CombustionDetails`** in `components/tabs/DataInputTab.tsx`. Find the signature `export function CombustionDetails({ a, year, showCalc = true, showSource = true }: ...)` and add `showFuel = true`; in the Source section, wrap the Fuel `<label>…</label>` block in `{showFuel && ( … )}`. Update the prop type to include `showFuel?: boolean`.

- [ ] **Step 4: Rewrite `EntryScreen.tsx`** to the 3-zone layout with a collapsible calc, and add the refrigerant branch. Full file:

```tsx
"use client";

import { ArrowLeft, Snowflake } from "lucide-react";
import { GRAD, CAT_ICON, ICON_COLOR, showNum, unitLabel, type Nav } from "./shared";
import { FUELS, REFRIGERANTS } from "@/lib/model/factors";
import { combustionCO2e, refrigerantCO2e } from "@/lib/model/baseline";
import { fuelFamily } from "@/lib/activity-groups";
import { displayUnits, fromRef, toRef } from "@/lib/unit-convert";
import { fyLabel, type FuelUnit } from "@/lib/model/types";
import { fmt } from "@/lib/utils";
import { CombustionDetails, CombustionCalc, RefrigerantDetailsPanel, RefrigerantCalcBlock } from "../DataInputTab";
import { FacilityDetailContent } from "../../scope2/DataInputTab";
import { Collapsible } from "./Collapsible";
import { CAT_DEFS } from "./shared";
import type { CombustionAsset, RefrigerationSystem } from "@/lib/model/types";
import type { Facility } from "@/lib/scope2/model/types";

type Props = {
  nav: Nav & { level: "entry" };
  setNav: (n: Nav) => void;
  year: number;
  combById: (id: string) => CombustionAsset | undefined;
  facById: (id: string) => Facility | undefined;
  refrigSysById: (id: string) => RefrigerationSystem | undefined;
  updateCombustion: (year: number, id: string, patch: Partial<CombustionAsset>) => void;
  updateFacility: (year: number, id: string, patch: Partial<Facility>) => void;
  updateRefrigeration: (year: number, id: string, patch: Partial<RefrigerationSystem>) => void;
  co2Fac: (id: string) => number;
};

const SECTION = "rounded-xl3 border border-line/60 bg-surface shadow-card p-6";
const LABEL = "text-[11px] uppercase tracking-wide text-ink-faint font-bold";

export function EntryScreen({ nav, setNav, year, combById, facById, refrigSysById, updateCombustion, updateFacility, updateRefrigeration, co2Fac }: Props) {
  /* ---- Refrigerant entry (full screen) ---- */
  if (nav.kind === "refrigerant") {
    const s = refrigSysById(nav.id);
    if (!s) { setNav({ level: "home" }); return null; }
    const gas = REFRIGERANTS[s.refrigerant];
    return (
      <div key={`ref-${s.id}`} className="screen-in flex flex-col gap-5">
        <button onClick={() => setNav({ level: "type", key: "refrigerants", typeKey: s.refrigerant })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to {gas.label}</button>
        <div style={{ background: GRAD.refrigerant }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4">
          <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><Snowflake size={28} strokeWidth={1.9} style={{ color: ICON_COLOR.refrigerant }} /></span>
          <div className="min-w-0 flex-1">
            <input value={s.name} onChange={(e) => updateRefrigeration(year, s.id, { name: e.target.value })} className="w-full text-2xl font-extrabold text-ink bg-transparent border-b-2 border-transparent hover:border-ink/20 focus:border-ink/40 focus:outline-none" aria-label="Source name" />
            <p className="text-sm font-medium text-ink-soft mt-0.5">{gas.label} · Refrigerant{s.bu ? ` · ${s.bu}` : ""} · {fyLabel(year)}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div>
            <div className="text-3xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(refrigerantCO2e(s))}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div>
          </div>
        </div>
        <div className={SECTION}>
          <div className={`${LABEL} mb-4`}>Consumption</div>
          <div className="flex items-end gap-3">
            <input type="number" value={s.toppedUpKg} onChange={(e) => updateRefrigeration(year, s.id, { toppedUpKg: Number(e.target.value) })} className="w-full text-4xl font-extrabold tabular-nums rounded-xl border-2 border-brand-200 bg-brand-50/40 px-4 py-3 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors" aria-label="Refrigerant topped up" />
            <span className="rounded-xl border border-line bg-surface-muted px-4 py-4 text-base text-ink-soft">kg/yr</span>
          </div>
          <p className="text-xs text-ink-faint mt-3">Refrigerant topped up over the year (= the amount that leaked).</p>
        </div>
        <div className={SECTION}>
          <div className={`${LABEL} mb-4`}>Details for the scenario modeller</div>
          <RefrigerantDetailsPanel s={s} year={year} updateRefrigeration={updateRefrigeration} />
        </div>
        <Collapsible title="How this is calculated">
          <RefrigerantCalcBlock s={s} />
        </Collapsible>
      </div>
    );
  }

  /* ---- Electricity is handled by ElectricityBuScreen, not here (kind 'facility' kept for legacy single-facility nav) ---- */
  if (nav.kind === "facility") {
    const f = facById(nav.id);
    if (!f) { setNav({ level: "home" }); return null; }
    const ElecIcon = CAT_ICON.electricity;
    return (
      <div key={`fac-${f.id}`} className="screen-in flex flex-col gap-5">
        <button onClick={() => setNav({ level: "cat", key: "electricity" })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to Electricity</button>
        <div style={{ background: GRAD.electricity }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4">
          <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><ElecIcon size={28} strokeWidth={1.9} style={{ color: ICON_COLOR.electricity }} /></span>
          <div className="min-w-0 flex-1">
            <input value={f.name} onChange={(e) => updateFacility(year, f.id, { name: e.target.value })} className="w-full text-2xl font-extrabold text-ink bg-transparent border-b-2 border-transparent hover:border-ink/20 focus:border-ink/40 focus:outline-none" aria-label="Source name" />
            <p className="text-sm font-medium text-ink-soft mt-0.5">Electricity · Scope 2{f.bu ? ` · ${f.bu}` : ""} · {fyLabel(year)}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div>
            <div className="text-3xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(co2Fac(f.id))}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div>
          </div>
        </div>
        <div className={SECTION}>
          <div className={`${LABEL} mb-4`}>Consumption</div>
          <div className="flex items-end gap-3">
            <input type="number" value={f.annualLoadKwh} onChange={(e) => updateFacility(year, f.id, { annualLoadKwh: Number(e.target.value) })} className="w-full text-4xl font-extrabold tabular-nums rounded-xl border-2 border-brand-200 bg-brand-50/40 px-4 py-3 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors" aria-label="Annual electricity" />
            <span className="rounded-xl border border-line bg-surface-muted px-4 py-4 text-base text-ink-soft">kWh</span>
          </div>
        </div>
        <div className={SECTION}>
          <div className={`${LABEL} mb-4`}>Details for the scenario modeller</div>
          <FacilityDetailContent f={f} year={year} locationT={co2Fac(f.id)} />
        </div>
        <Collapsible title="How this is calculated">
          <p className="text-sm text-ink-soft">Location-based Scope 2 = load × grid emission factor.</p>
          <p className="mt-2 text-sm font-mono text-ink-soft break-words">{fmt(f.annualLoadKwh)} kWh × {f.gridEf} kgCO₂e/kWh ÷ 1,000</p>
          <p className="mt-1.5 text-lg font-extrabold text-ink">→ {fmt(co2Fac(f.id))} tCO₂e</p>
        </Collapsible>
      </div>
    );
  }

  /* ---- Fuel (combustion) entry ---- */
  const a = combById(nav.id);
  if (!a) { setNav({ level: "home" }); return null; }
  const disp = a.displayUnit ?? a.unit;
  const fam = fuelFamily(a.fuelType) ?? "liquid";
  const Icon = CAT_ICON[fam] ?? CAT_ICON.liquid;
  const catLabel = CAT_DEFS.find((c) => c.key === fam)?.label ?? "fuels";
  return (
    <div key={`entry-${a.id}`} className="screen-in flex flex-col gap-5">
      <button onClick={() => setNav({ level: "type", key: fam, typeKey: a.fuelType, cat: a.category })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to {FUELS[a.fuelType].label}</button>
      <div style={{ background: GRAD[fam] }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4">
        <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><Icon size={28} strokeWidth={1.9} style={{ color: ICON_COLOR[fam] }} /></span>
        <div className="min-w-0 flex-1">
          <input value={a.name} onChange={(e) => updateCombustion(year, a.id, { name: e.target.value })} className="w-full text-2xl font-extrabold text-ink bg-transparent border-b-2 border-transparent hover:border-ink/20 focus:border-ink/40 focus:outline-none" aria-label="Source name" />
          <p className="text-sm font-medium text-ink-soft mt-0.5">{FUELS[a.fuelType].label} · {catLabel}{a.bu ? ` · ${a.bu}` : ""} · {fyLabel(year)}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div>
          <div className="text-3xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(combustionCO2e(a))}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div>
        </div>
      </div>
      <div className={SECTION}>
        <div className={`${LABEL} mb-4`}>Consumption</div>
        <div className="flex items-end gap-3">
          <input type="number" value={showNum(fromRef(a.annualVolume, a.fuelType, disp))} onChange={(e) => updateCombustion(year, a.id, { annualVolume: toRef(Number(e.target.value), a.fuelType, disp) })} className="w-full text-4xl font-extrabold tabular-nums rounded-xl border-2 border-brand-200 bg-brand-50/40 px-4 py-3 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors" aria-label="Annual consumption" />
          <select value={disp} onChange={(e) => updateCombustion(year, a.id, { displayUnit: e.target.value as FuelUnit })} className="rounded-xl border border-line bg-white px-3 py-4 text-base cursor-pointer focus:outline-none focus:border-brand-400" aria-label="Unit">
            {displayUnits(a.fuelType).map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
          </select>
        </div>
        <p className="text-xs text-ink-faint mt-3">Annual {FUELS[a.fuelType].label.toLowerCase()} consumed.</p>
      </div>
      <div className={SECTION}>
        <div className={`${LABEL} mb-4`}>Details for the scenario modeller</div>
        <CombustionDetails a={a} year={year} showCalc={false} showSource={true} showFuel={false} />
      </div>
      <Collapsible title="How this is calculated">
        <CombustionCalc a={a} />
      </Collapsible>
    </div>
  );
}
```

- [ ] **Step 5: Add the refrigerant detail/calc exports to `DataInputTab.tsx`.** The file already has private `RefrigerantDetails`/`RefrigerantCalc` used by its `DetailPanel`. Export thin wrappers with the prop shape used above:
  - `RefrigerantDetailsPanel({ s, year, updateRefrigeration })` — renders the System type + Gas cost fields (reuse the existing `RefrigerantDetails` body; it currently reads `useScenario().updateRefrigeration` — refactor it to accept `updateRefrigeration` as a prop OR keep using the store hook and ignore the passed prop). Simplest: `export function RefrigerantDetailsPanel({ s, year }: { s: RefrigerationSystem; year: number }) { return <RefrigerantDetails s={s} year={year} />; }` and drop `updateRefrigeration` from the EntryScreen call (RefrigerantDetails already uses the store). Adjust the EntryScreen call to `<RefrigerantDetailsPanel s={s} year={year} />`.
  - `export function RefrigerantCalcBlock({ s }: { s: RefrigerationSystem }) { return <RefrigerantCalc s={s} />; }`
  Add `import type { RefrigerationSystem } from "@/lib/model/types";` if not present.

> Note: `RefrigerantDetails` and `RefrigerantCalc` already pull from `useScenario()` and the factor library, so the wrappers need no extra wiring. Remove `updateRefrigeration` from `EntryScreen` Props/usage if you take this route — but you still need it? No: the refrigerant consumption input (`toppedUpKg`) and name use `updateRefrigeration`. KEEP `updateRefrigeration` on `EntryScreen` Props for the consumption input + name; only the details panel uses the store internally.

- [ ] **Step 6: Run the calc-collapsed test + tsc**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx && npx tsc --noEmit`
Expected: the calc-collapsed test PASSES. tsc clean (the container doesn't yet pass `refrigSysById`/`updateRefrigeration` to EntryScreen — add them in this step's container edit below to keep tsc green).

- [ ] **Step 7: Update the container's EntryScreen render** in `ActivityDataTab.tsx` to pass the new props (so tsc is green now):

```tsx
<EntryScreen
  nav={nav}
  setNav={setNav}
  year={year}
  combById={combById}
  facById={facById}
  refrigSysById={refrigSysById}
  updateCombustion={s1.updateCombustion}
  updateFacility={s2.updateFacility}
  updateRefrigeration={s1.updateRefrigeration}
  co2Fac={co2Fac}
/>
```

- [ ] **Step 8: Run full suite + tsc**

Run: `npm test && npx tsc --noEmit`
Expected: green / clean. If an existing test asserted the always-visible calc text on a fuel entry screen, update it to expand the collapsible first.

- [ ] **Step 9: Commit**

```bash
git add components/tabs/DataInputTab.tsx components/tabs/activity/EntryScreen.tsx components/tabs/ActivityDataTab.tsx components/tabs/__tests__/activity-data.test.tsx
git commit -m "feat: entry-screen redesign (zones + collapsible calc) + refrigerant full screen"
```

---

## Task 4: Electricity BU-first 4-box flow

**Files:**
- Create: `components/tabs/activity/ElectricityBuScreen.tsx`
- Modify: `components/tabs/activity/CategoryScreen.tsx`, `components/tabs/ActivityDataTab.tsx`
- Test: `components/tabs/__tests__/activity-data.test.tsx`

**Interfaces:**
- Consumes: `ELEC_TYPES` (Task 1), `Collapsible` (Task 2), `Nav` `elecbu` (Task 1).
- Produces: container helpers `ensureFacility(bu, instrumentKey, agg): string`, `buElecEmissions(bu): number`, `elecBuExcluded(bu): boolean`, `toggleElecCentral(bu, agg): void`; `ElectricityBuScreen({ bu, year, ensureFacility, facById, updateFacility, co2Fac, setNav })` rendering 4 kWh inputs.

- [ ] **Step 1: Write the failing tests** — append to `activity-data.test.tsx`:

```tsx
it("electricity goes straight to the BU list (no instrument cards)", async () => {
  await openElectricityCategory(); // helper: bu mode w/ a unit "Pune", click Electricity card
  expect(screen.queryByText("Virtual PPA")).toBeFalsy();   // no instrument card on the cat screen
  expect(screen.getByText("Pune")).toBeTruthy();           // BU row present
});

it("a BU electricity screen has 4 boxes; only Purchased drives emissions", async () => {
  await openPuneElectricity();   // helper: ...→ click the Pune row
  const purchased = screen.getByLabelText("Pune Purchased electricity");
  const vppa = screen.getByLabelText("Pune Virtual PPA");
  expect(screen.getByLabelText("Pune Solar onsite")).toBeTruthy();
  expect(screen.getByLabelText("Pune I-REC")).toBeTruthy();
  fireEvent.change(purchased, { target: { value: "200000" } });
  // 200000 * 0.71 / 1000 = 142
  expect(screen.getAllByText(/142/).length).toBeGreaterThan(0);
  fireEvent.change(vppa, { target: { value: "50000" } });
  expect(screen.getAllByText(/142/).length).toBeGreaterThan(0); // unchanged — vppa is clean
});
```

Add the three helpers (`openElectricityCategory`, `openPuneElectricity`) near the existing navigation helpers, following their seed-then-click pattern (seed `osh-bus-v3::c-0` = `{ mode:"bu", units:[{name:"Pune",aggregate:true}] }`).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx`
Expected: FAIL — electricity still shows instrument cards; no 4-box screen / aria-labels.

- [ ] **Step 3: Add container helpers** in `ActivityDataTab.tsx` (after `ensureEntry`):

```ts
// Find/create the (BU, instrument) facility; returns its id. Does not navigate.
const ensureFacility = (bu: string, instrumentKey: string, agg: boolean): string => {
  const t = ELEC_TYPES.find((e) => e.key === instrumentKey)!;
  let ex = s2.selectedFacilities.find((f) => (f.bu ?? "") === bu && f.name === t.label);
  if (!ex) { const rec = blankFac(bu, { label: t.label, gridEf: t.gridEf }, 0, agg); s2.addFacilityRecord(year, rec); ex = rec; }
  return ex.id;
};
const buElecFacilities = (bu: string) => s2.selectedFacilities.filter((f) => (f.bu ?? "") === bu && ELEC_TYPES.some((e) => e.label === f.name));
const buElecEmissions = (bu: string) => buElecFacilities(bu).filter((f) => !f.excluded).reduce((s, f) => s + facCO2e(f), 0);
const elecBuExcluded = (bu: string) => { const fs = buElecFacilities(bu); return fs.length > 0 && fs.every((f) => f.excluded); };
// Toggle central for all 4 of a BU's electricity records together.
const toggleElecCentral = (bu: string, agg: boolean) => {
  ELEC_TYPES.forEach((t) => {
    const id = ensureFacility(bu, t.key, agg);
    const cur = facById(id) ?? { excluded: !agg };
    s2.updateFacility(year, id, { excluded: !cur.excluded });
  });
};
```

> `toggleElecCentral` creates all four records then flips each; the `?? { excluded: !agg }` fallback handles the just-created-this-tick case (matches the Task-7 fuel toggle pattern).

- [ ] **Step 4: Route `elecbu` + replace the electricity CategoryScreen branch.** In `ActivityDataTab.tsx`, before the `cat` route add:

```tsx
if (nav.level === "elecbu") {
  const bu = nav.bu;
  const agg = bu ? (buReg.units.find((u) => u.name === bu)?.aggregate ?? true) : true;
  return (
    <ElectricityBuScreen
      bu={bu}
      year={year}
      ensureFacility={(k) => ensureFacility(bu, k, agg)}
      facById={facById}
      updateFacility={s2.updateFacility}
      co2Fac={co2Fac}
      setNav={setNav}
    />
  );
}
```

Pass three new props to `CategoryScreen`: `buElecEmissions`, `elecBuExcluded`, `toggleElecCentral` (and it already has `buReg`). Import `ElectricityBuScreen`.

- [ ] **Step 5: Replace the electricity branch in `CategoryScreen.tsx`** (the `def.kind === "electricity"` block) with a BU list. Add props to `CategoryScreen`'s `Props`: `buElecEmissions: (bu: string) => number; elecBuExcluded: (bu: string) => boolean; toggleElecCentral: (bu: string, agg: boolean) => void;`. New branch:

```tsx
) : def.kind === "electricity" ? (
  buReg.mode === "central" ? (
    <button onClick={() => setNav({ level: "elecbu", bu: "" })} className="rounded-xl3 border border-line/60 bg-surface shadow-card p-5 flex items-center gap-3 text-left hover:border-brand-300 hover:shadow-card-lg transition-all w-full">
      <span className="w-10 h-10 rounded-xl bg-surface-muted grid place-items-center text-ink-soft font-bold shrink-0">C</span>
      <div className="min-w-0 flex-1"><span className="block font-semibold text-ink">Central (company-wide)</span><span className="text-xs text-ink-faint">Click to enter purchased / VPPA / solar / I-REC</span></div>
      <span className="text-sm font-semibold tabular-nums shrink-0">{fmt(buElecEmissions(""))} tCO₂e</span>
      <ChevronRight size={18} className="text-ink-faint shrink-0" />
    </button>
  ) : buReg.units.length === 0 ? (
    <div className="rounded-xl3 border border-dashed border-line/70 bg-surface-muted/40 p-6 text-center">
      <p className="text-sm text-ink-soft">No business units set up yet.</p>
      <button onClick={() => setNav({ level: "bus" })} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-3.5 py-2 hover:bg-brand-600 transition-colors">Set up business units</button>
    </div>
  ) : (
    <div className="rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-brand-50 to-transparent">
        <span className="text-sm font-semibold text-ink">{buReg.units.length} business unit{buReg.units.length === 1 ? "" : "s"}</span>
        <span className="text-xs text-ink-faint">Purchased · VPPA · Solar · I-REC per BU</span>
      </div>
      {[...buReg.units].map((u) => {
        const ex = elecBuExcluded(u.name);
        return (
          <div key={u.name} className="group flex items-center gap-3 px-4 py-3 border-t border-line/40 hover:bg-brand-50/30 transition-colors">
            <span className="w-8 h-8 rounded-lg bg-surface-muted grid place-items-center text-ink-soft font-bold text-xs shrink-0">{u.name.charAt(0).toUpperCase()}</span>
            <button onClick={() => setNav({ level: "elecbu", bu: u.name })} className="min-w-0 flex-1 text-left font-medium text-ink truncate">{u.name}</button>
            <span className="w-20 text-right text-sm font-semibold tabular-nums shrink-0">{fmt(buElecEmissions(u.name))} t</span>
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => toggleElecCentral(u.name, u.aggregate)} aria-label={`Include ${u.name} in central total`} className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 border", !ex ? "bg-brand-50 text-brand-700 border-brand-200" : "bg-surface-muted text-ink-faint border-line")}>{!ex ? "✓ central" : "central"}</button>
            </div>
            <button onClick={() => setNav({ level: "elecbu", bu: u.name })} aria-label={`${u.name} electricity`} className="shrink-0"><ChevronRight size={16} className="text-ink-faint" /></button>
          </div>
        );
      })}
    </div>
  )
) : (() => {
```

(`ChevronRight`, `cn`, `fmt` are already imported in CategoryScreen.)

- [ ] **Step 6: Create `components/tabs/activity/ElectricityBuScreen.tsx`:**

```tsx
"use client";

import { ArrowLeft } from "lucide-react";
import { GRAD, CAT_ICON, ICON_COLOR, ELEC_TYPES, type Nav } from "./shared";
import { fyLabel } from "@/lib/model/types";
import { fmt } from "@/lib/utils";
import { FacilityDetailContent } from "../../scope2/DataInputTab";
import { Collapsible } from "./Collapsible";
import type { Facility } from "@/lib/scope2/model/types";

type Props = {
  bu: string;
  year: number;
  ensureFacility: (instrumentKey: string) => string;
  facById: (id: string) => Facility | undefined;
  updateFacility: (year: number, id: string, patch: Partial<Facility>) => void;
  co2Fac: (id: string) => number;
  setNav: (n: Nav) => void;
};

export function ElectricityBuScreen({ bu, year, ensureFacility, facById, updateFacility, co2Fac, setNav }: Props) {
  const Icon = CAT_ICON.electricity;
  // Resolve each instrument's facility (create on first render so values bind).
  const rows = ELEC_TYPES.map((t) => ({ t, id: ensureFacility(t.key) }));
  const gridRow = rows.find((r) => r.t.key === "grid")!;
  const gridFac = facById(gridRow.id);
  const total = rows.reduce((s, r) => s + co2Fac(r.id), 0);
  const title = bu || "Central (company-wide)";

  return (
    <div key={`elecbu-${bu}`} className="screen-in flex flex-col gap-5">
      <button onClick={() => setNav({ level: "cat", key: "electricity" })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to Electricity</button>
      <div style={{ background: GRAD.electricity }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4">
        <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><Icon size={28} strokeWidth={1.9} style={{ color: ICON_COLOR.electricity }} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-ink truncate">{title}</h1>
          <p className="text-sm font-medium text-ink-soft mt-0.5">Electricity · Scope 2 · {fyLabel(year)}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div>
          <div className="text-3xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(total)}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div>
        </div>
      </div>

      <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-4">Electricity by source (kWh/yr)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {rows.map(({ t, id }) => {
            const f = facById(id);
            return (
              <label key={t.key} className="block rounded-xl border border-line/70 p-4">
                <span className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{t.label}</span>
                  <span className="text-xs font-semibold tabular-nums text-brand-600">{fmt(co2Fac(id))} t</span>
                </span>
                <span className="text-[11px] text-ink-faint">{t.sub}</span>
                <span className="mt-2 flex items-center gap-2">
                  <input type="number" value={f?.annualLoadKwh ?? 0} onChange={(e) => updateFacility(year, id, { annualLoadKwh: Number(e.target.value) })} className="w-full text-right tabular-nums rounded-lg border border-brand-200 bg-brand-50/50 px-2.5 py-2 text-base focus:outline-none focus:border-brand-400 focus:bg-white" aria-label={`${title} ${t.label}`} />
                  <span className="text-xs text-ink-faint w-10">kWh</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-ink-faint mt-3">Only purchased grid electricity carries emissions; VPPA, solar and I-REC are clean (0 tCO₂e).</p>
      </div>

      {gridFac && (
        <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-4">Details for the scenario modeller</div>
          <FacilityDetailContent f={gridFac} year={year} locationT={co2Fac(gridRow.id)} />
        </div>
      )}

      <Collapsible title="How this is calculated">
        <p className="text-sm text-ink-soft">Location-based Scope 2 = purchased grid load × grid emission factor.</p>
        {gridFac && <p className="mt-2 text-sm font-mono text-ink-soft break-words">{fmt(gridFac.annualLoadKwh)} kWh × {gridFac.gridEf} kgCO₂e/kWh ÷ 1,000 = {fmt(co2Fac(gridRow.id))} tCO₂e</p>}
      </Collapsible>
    </div>
  );
}
```

- [ ] **Step 7: Run the electricity tests + tsc**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx && npx tsc --noEmit`
Expected: the two new electricity tests PASS; tsc clean.

- [ ] **Step 8: Run full suite**

Run: `npm test`
Expected: green. Update any existing electricity-flow test that clicked an instrument card (those are gone) to use the BU-list → 4-box path.

- [ ] **Step 9: Commit**

```bash
git add components/tabs/activity/ElectricityBuScreen.tsx components/tabs/activity/CategoryScreen.tsx components/tabs/ActivityDataTab.tsx components/tabs/__tests__/activity-data.test.tsx
git commit -m "feat: electricity BU-first 4-box flow (purchased/VPPA/solar/I-REC)"
```

---

## Task 5: Refrigerant gear → full screen + final cleanup

**Files:**
- Modify: `components/tabs/activity/TypeScreen.tsx`, `components/tabs/ActivityDataTab.tsx`
- Test: `components/tabs/__tests__/activity-data.test.tsx`

**Interfaces:**
- Consumes: `EntryScreen` refrigerant kind (Task 3).
- Produces: the refrigerant per-BU gear navigates to `{ level: "entry", kind: "refrigerant", id }`. The `sel`/side-`DetailPanel` path is no longer used by the per-BU flow.

- [ ] **Step 1: Write the failing test** — append to `activity-data.test.tsx` (the deferred Task-3 test):

```tsx
it("refrigerant gear opens the full refrigerant entry screen", async () => {
  await openR404aBuRow(); // refrigerants → R-404A → BU mode row visible
  fireEvent.click(screen.getByLabelText("Pune details")); // the gear
  // full screen: source title input + collapsible calc, NOT a side panel
  expect(screen.getByRole("button", { name: /How this is calculated/i })).toBeTruthy();
  expect(screen.getByText(/Details for the scenario modeller/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx`
Expected: FAIL — gear currently opens the side panel (`setSel`), no full-screen calc button.

- [ ] **Step 3: Repoint the refrigerant gear in `TypeScreen.tsx`.** Find the refrigerant-row gear `onClick` that calls `setSel({ kind: "refrigerant", id })` and change it to:

```tsx
onClick={() => { const id = ensureRefrigEntry(t.key as RefrigerantId, u.name, u.aggregate); setNav({ level: "entry", kind: "refrigerant", id }); }}
```

(Ensure `RefrigerantId` is imported in TypeScreen, or cast via `t.key as any` consistent with the existing `ensureRefrigEntry` call there. Use the same import style already present.)

- [ ] **Step 4: Remove the now-unused side-panel render** in `ActivityDataTab.tsx` if `setSel`/`sel` are no longer used anywhere. Check: `setSel` was passed to `TypeScreen` and the `sel?.kind === "refrigerant"` render exists in the `type` route. If TypeScreen no longer calls `setSel`, drop the `setSel` prop from `TypeScreen` usage, remove the `sel` state + the `{sel?.kind === "refrigerant" && …}` block, and remove the now-unused `DetailPanel` import + `Sel` import. If `setSel` is still referenced elsewhere, leave it. Run tsc to confirm no unused-symbol errors.

- [ ] **Step 5: Run the test + tsc**

Run: `npx vitest run components/tabs/__tests__/activity-data.test.tsx && npx tsc --noEmit`
Expected: PASS / clean.

- [ ] **Step 6: Full suite + manual smoke**

Run: `npm test && npx tsc --noEmit`
Expected: green / clean. Then `npm run dev` and verify: Electricity → BU list → BU → 4 boxes (Purchased drives emissions); fuel/refrigerant entry screens show the collapsed "How this is calculated"; refrigerant gear opens a full screen.

- [ ] **Step 7: Commit**

```bash
git add components/tabs/activity/TypeScreen.tsx components/tabs/ActivityDataTab.tsx components/tabs/__tests__/activity-data.test.tsx
git commit -m "feat: refrigerant gear opens full entry screen; retire per-BU side panel"
```

---

## Self-Review

**Spec coverage:**
- A (electricity BU-first 4-box): Task 1 (ELEC_TYPES/nav), Task 4 (CategoryScreen BU list + ElectricityBuScreen + helpers). ✓ Solar onsite replaces Any (Task 1). Central toggle across 4 records: `toggleElecCentral` (Task 4). ✓ Emissions = Purchased × gridEf (helpers + ElectricityBuScreen). ✓
- B (entry-screen redesign): Task 2 (Collapsible), Task 3 (3-zone fuel/facility + calc dropdown + `showFuel`). ✓
- C (refrigerant full screen): Task 3 (EntryScreen refrigerant branch), Task 5 (gear rewire + retire side panel). ✓
- Scope drill-down keeps working (unchanged; lists by facility). ✓ Migration (legacy "Other/Any" facilities): ELEC_TYPES no longer has `any`, so a legacy "Other / Any" facility simply won't surface in the 4-box screen — acceptable, seed uses none (noted in spec).

**Placeholder scan:** No TBD/“handle edge cases”. The only deferred item is the refrigerant-gear nav test, explicitly written in Task 5 (Task 3 carries the calc-collapsed test). Code blocks are concrete.

**Type consistency:** `Nav` `elecbu`/`entry`-`refrigerant` defined in Task 1, consumed in Tasks 3–5. `EntryScreen` Props gain `refrigSysById`/`updateRefrigeration` in Task 3 and the container passes them same task. `ensureFacility(bu, key, agg)` defined in Task 4; `ElectricityBuScreen` receives a pre-bound `ensureFacility(key)` (container closes over bu+agg) — signatures match the route in Task 4 Step 4. `RefrigerantDetailsPanel`/`RefrigerantCalcBlock` exported in Task 3 Step 5, used in Task 3 Step 4. `toggleElecCentral`/`buElecEmissions`/`elecBuExcluded` defined in Task 4 Step 3, passed to CategoryScreen in Step 4/5.

**Open details (from spec):** `Collapsible` is a small controlled component (chosen over native `<details>` for styling control). Electricity modeller-details attach to the `grid` facility (ElectricityBuScreen Step 6). Both as the spec recommended.
