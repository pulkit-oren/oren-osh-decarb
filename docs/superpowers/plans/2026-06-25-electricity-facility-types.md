# Electricity Facility-Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Tag a BU's electricity with a facility type that presets the load split (lighting/motor/HVAC) and shows an on-site-solar feasibility hint; the preset feeds the modeller's existing efficiency levers automatically.

**Architecture:** A static taxonomy module (`lib/scope2/model/facility-type.ts`) maps each facility type to a `loadSplit` + solar-feasibility profile. `Facility` gains an optional `facilityType` field. The `ElectricityBuScreen` gets a selector that, on choosing a type, writes both `facilityType` and the preset `loadSplit` onto the BU's grid facility, and shows a solar badge. No scope2 model/computation change.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, vitest, the activity `fields.tsx` primitives (`SelectField`, `DetailCard`).

## Global Constraints

- **No git repo:** Do NOT run `git`. The "commit" gate = full suite (`npm test`) stays green + `npx tsc --noEmit` clean.
- **Backward compatible:** a `Facility` with `facilityType` absent behaves exactly as today; existing scope2 tests stay green.
- **Load split only** is preset — never irradiance/solar yield. Solar feasibility is advisory text only.
- **Selecting a type overwrites the current load split** (deliberate template action).
- Phase 2 = electricity only. Do NOT touch combustion, refrigerant, or the old `components/scope2/DataInputTab.tsx`.
- `LoadSplit` shape is exactly `{ lightingPct: number; motorPct: number; hvacPct: number }` (from `lib/scope2/model/types.ts`).

---

### Task 1: Facility-type taxonomy module

**Files:**
- Create: `lib/scope2/model/facility-type.ts`
- Test: `lib/scope2/model/__tests__/facility-type.test.ts`

**Interfaces:**
- Consumes: `LoadSplit` from `./types`.
- Produces:
  - `type FacilityTypeId = "office"|"warehouse"|"dataCentre"|"factory"|"retail"|"coldStorage"|"hotel"`
  - `type SolarFeasibility = "strong"|"good"|"moderate"|"limited"`
  - `interface FacilityTypeProfile { id: FacilityTypeId; label: string; loadSplit: LoadSplit; solar: { feasible: SolarFeasibility; note: string } }`
  - `const FACILITY_TYPES: Record<FacilityTypeId, FacilityTypeProfile>`
  - `const FACILITY_TYPE_LIST: FacilityTypeProfile[]`
  - `function facilityTypeProfile(f: { facilityType?: FacilityTypeId }): FacilityTypeProfile | undefined`

- [ ] **Step 1: Write the failing test**

```ts
// lib/scope2/model/__tests__/facility-type.test.ts
import { describe, expect, it } from "vitest";
import { FACILITY_TYPES, FACILITY_TYPE_LIST, facilityTypeProfile, type FacilityTypeId } from "@/lib/scope2/model/facility-type";

const IDS: FacilityTypeId[] = ["office","warehouse","dataCentre","factory","retail","coldStorage","hotel"];

describe("facility-type taxonomy", () => {
  it("has a self-consistent profile for every id", () => {
    for (const id of IDS) {
      expect(FACILITY_TYPES[id]).toBeTruthy();
      expect(FACILITY_TYPES[id].id).toBe(id);
    }
  });

  it("exposes a stable 7-item list", () => {
    expect(FACILITY_TYPE_LIST.map((p) => p.id)).toEqual(IDS);
  });

  it("load splits never exceed 100%", () => {
    for (const id of IDS) {
      const s = FACILITY_TYPES[id].loadSplit;
      expect(s.lightingPct + s.motorPct + s.hvacPct).toBeLessThanOrEqual(100);
    }
  });

  it("warehouse is strong solar, data centre is limited", () => {
    expect(FACILITY_TYPES.warehouse.solar.feasible).toBe("strong");
    expect(FACILITY_TYPES.dataCentre.solar.feasible).toBe("limited");
    expect(FACILITY_TYPES.warehouse.loadSplit.lightingPct).toBe(55);
  });

  it("facilityTypeProfile resolves or returns undefined", () => {
    expect(facilityTypeProfile({ facilityType: "office" })?.id).toBe("office");
    expect(facilityTypeProfile({})).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/scope2/model/__tests__/facility-type.test.ts`
Expected: FAIL — cannot resolve `@/lib/scope2/model/facility-type`.

- [ ] **Step 3: Write the module**

```ts
// lib/scope2/model/facility-type.ts
import type { LoadSplit } from "./types";

export type FacilityTypeId = "office" | "warehouse" | "dataCentre" | "factory" | "retail" | "coldStorage" | "hotel";
export type SolarFeasibility = "strong" | "good" | "moderate" | "limited";

export interface FacilityTypeProfile {
  id: FacilityTypeId;
  label: string;
  loadSplit: LoadSplit;
  solar: { feasible: SolarFeasibility; note: string };
}

export const FACILITY_TYPES: Record<FacilityTypeId, FacilityTypeProfile> = {
  office:      { id: "office",      label: "Office",                  loadSplit: { lightingPct: 30, motorPct: 10, hvacPct: 45 }, solar: { feasible: "moderate", note: "Rooftop limited on multi-storey; partial offset." } },
  warehouse:   { id: "warehouse",   label: "Warehouse",               loadSplit: { lightingPct: 55, motorPct: 15, hvacPct: 15 }, solar: { feasible: "strong",   note: "Large flat roof — strong on-site solar potential." } },
  dataCentre:  { id: "dataCentre",  label: "Data centre",             loadSplit: { lightingPct: 5,  motorPct: 10, hvacPct: 80 }, solar: { feasible: "limited",  note: "Demand far exceeds roof capacity — solar offsets little." } },
  factory:     { id: "factory",     label: "Factory / Manufacturing", loadSplit: { lightingPct: 15, motorPct: 60, hvacPct: 15 }, solar: { feasible: "good",     note: "Large roof area suits a sizeable array." } },
  retail:      { id: "retail",      label: "Retail",                  loadSplit: { lightingPct: 40, motorPct: 10, hvacPct: 35 }, solar: { feasible: "moderate", note: "Roof often shared/limited; partial offset." } },
  coldStorage: { id: "coldStorage", label: "Cold storage",            loadSplit: { lightingPct: 5,  motorPct: 70, hvacPct: 15 }, solar: { feasible: "good",     note: "Roof area suits solar; refrigeration dominates load." } },
  hotel:       { id: "hotel",       label: "Hotel",                   loadSplit: { lightingPct: 25, motorPct: 15, hvacPct: 45 }, solar: { feasible: "moderate", note: "Mixed roof use; partial offset." } },
};

export const FACILITY_TYPE_LIST: FacilityTypeProfile[] = [
  FACILITY_TYPES.office,
  FACILITY_TYPES.warehouse,
  FACILITY_TYPES.dataCentre,
  FACILITY_TYPES.factory,
  FACILITY_TYPES.retail,
  FACILITY_TYPES.coldStorage,
  FACILITY_TYPES.hotel,
];

/** Profile for a facility's type, or undefined when unspecified. */
export function facilityTypeProfile(f: { facilityType?: FacilityTypeId }): FacilityTypeProfile | undefined {
  return f.facilityType ? FACILITY_TYPES[f.facilityType] : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/scope2/model/__tests__/facility-type.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Checkpoint** — `npx tsc --noEmit` clean and `npm test` green.

---

### Task 2: `facilityType` field + ElectricityBuScreen selector & solar badge

**Files:**
- Modify: `lib/scope2/model/types.ts` (add `facilityType?` to `Facility`)
- Modify: `components/tabs/activity/ElectricityBuScreen.tsx`
- Test: `components/tabs/__tests__/` — create `electricity-facility-type.test.tsx`

**Interfaces:**
- Consumes: `FACILITY_TYPES`, `FACILITY_TYPE_LIST`, `facilityTypeProfile`, `type FacilityTypeId` from `@/lib/scope2/model/facility-type` (Task 1); `SelectField`, `DetailCard` from `./fields`.
- Produces: `Facility.facilityType?: FacilityTypeId`; UI that presets `loadSplit` on selection and shows a solar badge.

- [ ] **Step 1: Write the failing test**

```tsx
// components/tabs/__tests__/electricity-facility-type.test.tsx
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompanyProvider } from "@/lib/company/store";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { ActivityDataTab } from "../ActivityDataTab";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider><ScenarioProvider><Scope2Provider>{children}</Scope2Provider></ScenarioProvider></CompanyProvider>
  );
}

async function openCompanyElectricity() {
  render(<Wrapper><ActivityDataTab /></Wrapper>);
  // Electricity category → Company-wide BU electricity screen
  fireEvent.click(screen.getByText("Electricity").closest("button")!);
  fireEvent.click(screen.getByText(/Company-wide/i).closest("button")!);
}

describe("ElectricityBuScreen — facility type", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("selecting a facility type presets the load split and shows a solar hint", async () => {
    await openCompanyElectricity();
    const sel = screen.getByLabelText(/Facility type/i) as HTMLSelectElement;
    expect(sel).toBeTruthy();
    // pick Warehouse
    const warehouse = Array.from(sel.querySelectorAll("option")).find((o) => /Warehouse/.test(o.textContent || ""));
    fireEvent.change(sel, { target: { value: warehouse!.value } });
    // Lighting slider now reflects the warehouse preset (55)
    const lighting = screen.getByLabelText("Lighting") as HTMLInputElement;
    expect(lighting.value).toBe("55");
    // Solar feasibility note appears
    expect(screen.getByText(/strong on-site solar potential/i)).toBeTruthy();
  });
});
```

NOTE: This test renders the real `ActivityDataTab` and navigates Electricity → Company-wide. The "Lighting" slider's accessible label is `"Lighting"` (the `SliderField` in `ElectricityBuScreen` uses `label="Lighting"`). Confirm by reading the file; if the slider label differs, match the real one. The Company-wide electricity row text is "Company-wide".

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/tabs/__tests__/electricity-facility-type.test.tsx`
Expected: FAIL — no element labelled "Facility type".

- [ ] **Step 3a: Add the field** — in `lib/scope2/model/types.ts`, inside `interface Facility`, add (e.g. after the `bu?` field):

```ts
  /** Building/facility class — presets the load split & drives solar-feasibility guidance. Absent ⇒ unspecified. */
  facilityType?: import("./facility-type").FacilityTypeId;
```

- [ ] **Step 3b: Wire the UI** — in `components/tabs/activity/ElectricityBuScreen.tsx`:

(i) Add imports:
```ts
import { FACILITY_TYPES, FACILITY_TYPE_LIST, facilityTypeProfile, type FacilityTypeId } from "@/lib/scope2/model/facility-type";
```
and ensure `SelectField` is added to the existing `./fields` import.

(ii) Inside the `gridFac` details block (where `const f = gridFac;` and `setSplit` are defined), compute the active profile:
```ts
const ftProfile = facilityTypeProfile(f);
```

(iii) Add a "Facility type" selector as the FIRST DetailCard in that block (before "Cost & grid factor"):
```tsx
<DetailCard title="Facility type">
  <SelectField
    label="Facility type"
    value={(f.facilityType ?? "") as FacilityTypeId | ""}
    options={[{ value: "" as FacilityTypeId | "", label: "Unspecified" }, ...FACILITY_TYPE_LIST.map((p) => ({ value: p.id as FacilityTypeId | "", label: p.label }))]}
    onChange={(v) => {
      if (!v) { updateFacility(year, f.id, { facilityType: undefined }); return; }
      const prof = FACILITY_TYPES[v as FacilityTypeId];
      updateFacility(year, f.id, { facilityType: v as FacilityTypeId, loadSplit: { ...prof.loadSplit } });
    }}
    hint="Pre-fills a typical load split for this kind of site and flags on-site-solar potential. You can still adjust the sliders."
  />
  {ftProfile && (
    <p className="text-[11px] text-ink-faint mt-2">Applied the typical {ftProfile.label.toLowerCase()} load split — adjust below if you have actuals.</p>
  )}
</DetailCard>
```

(iv) In the existing "On-site solar potential" `DetailCard`, add a solar-feasibility badge at the top of its content (before the roof/yield grid). Use this colour mapping:
```tsx
{ftProfile && (
  <p className={
    "mb-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium border " +
    (ftProfile.solar.feasible === "strong" || ftProfile.solar.feasible === "good"
      ? "bg-brand-50 text-brand-700 border-brand-200"
      : ftProfile.solar.feasible === "limited"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-surface-muted text-ink-soft border-line")
  }>
    {ftProfile.solar.feasible === "limited" ? "⚠ " : ""}Solar: {ftProfile.solar.feasible} — {ftProfile.solar.note}
  </p>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/tabs/__tests__/electricity-facility-type.test.tsx`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — `npx tsc --noEmit` clean and `npm test` green (no regressions).

---

## Self-Review

**Spec coverage:**
- `facility-type.ts` taxonomy + profiles + `FACILITY_TYPE_LIST` + `facilityTypeProfile` → Task 1. ✓
- `Facility.facilityType?` field → Task 2 (3a). ✓
- Selector presets load split on selection → Task 2 (3b-iii). ✓
- Solar-feasibility badge → Task 2 (3b-iv). ✓
- Load-split-only preset (no irradiance) → onChange writes only `facilityType` + `loadSplit`. ✓
- No scope2 model/compute change; old DataInputTab untouched → only types.ts (field) + ElectricityBuScreen touched. ✓
- Backward compat (absent type) → `facilityTypeProfile` returns undefined; no badge; Task 1 test + Task 2 backward-compat implied. ✓

**Placeholder scan:** none — full code in every step.

**Type consistency:** `FacilityTypeId`, `FacilityTypeProfile`, `FACILITY_TYPES`, `FACILITY_TYPE_LIST`, `facilityTypeProfile`, `SolarFeasibility`, `LoadSplit` used identically across both tasks. `SelectField<T extends string>` instantiates with `T = FacilityTypeId | ""`. `updateFacility(year, id, patch)` matches the prop signature already used throughout `ElectricityBuScreen`.
