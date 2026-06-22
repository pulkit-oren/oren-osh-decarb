# Phase 6 — Unified Activity Data (one data input for Scope 1 + 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Replace the two per-scope Data Input tabs with one "Activity data" page: scope-badged collapsible category cards grouped by fuel family + refrigerants + electricity, each row showing name + sub-label + an inline **consumption** input (the only inline field) + computed CO₂e, with everything else opening in the existing detail sidebar, and a persistent Total Footprint panel. Existing dashboard colours.

**Architecture:** A new `ActivityDataTab` reads both stores (`useScenario` + `useScope2`), groups Scope 1 combustion by fuel family (`lib/activity-groups.ts`), and renders category cards. The consumption input edits `annualVolume` / `toppedUpKg` / `annualLoadKwh` inline; the "details" button reuses the **exported** `DetailPanel` (combustion/refrigerant) and `FacilityDetail` (facility) — which already omit consumption. Shell renders it for both `data` and `data2` tab keys. Engine/stores unchanged.

**Tech Stack:** Next.js 16 (custom — `AGENTS.md`), React 19, Tailwind v4, Vitest.

## Global Constraints

- Add-your-own preserved; categories are always shown (even empty) with an Add button.
- Consumption (quantity + unit) is the ONLY inline-editable field; all else is in the sidebar.
- Colours = existing emerald `brand` / teal `oren` tokens (not the screenshots' blue).
- No git: replace "commit" with `npm test` + manual check at http://localhost:3000.
- Run from `osh-decarbonization-dashboard-master/`.

---

### Task 1: Fuel-family helper (pure)

**Files:** Create `lib/activity-groups.ts`; Test `lib/__tests__/activity-groups.test.ts`

**Interfaces:**
- `type FuelFamily = "gaseous" | "liquid" | "solid" | "biomass"`
- `function fuelFamily(id: FuelId): FuelFamily`
- `const FAMILY_DEFAULT_FUEL: Record<FuelFamily, FuelId>`

- [ ] **Step 1: Failing test.**

```ts
// lib/__tests__/activity-groups.test.ts
import { describe, expect, it } from "vitest";
import { fuelFamily, FAMILY_DEFAULT_FUEL } from "../activity-groups";

describe("fuelFamily", () => {
  it("classifies fuels by family", () => {
    expect(fuelFamily("png")).toBe("gaseous");
    expect(fuelFamily("cng")).toBe("gaseous");
    expect(fuelFamily("diesel")).toBe("liquid");
    expect(fuelFamily("coal")).toBe("solid");
    expect(fuelFamily("biomass")).toBe("biomass");
    expect(fuelFamily("bioCng")).toBe("biomass");
  });
  it("has a valid default fuel per family", () => {
    expect(fuelFamily(FAMILY_DEFAULT_FUEL.gaseous)).toBe("gaseous");
    expect(fuelFamily(FAMILY_DEFAULT_FUEL.liquid)).toBe("liquid");
    expect(fuelFamily(FAMILY_DEFAULT_FUEL.solid)).toBe("solid");
    expect(fuelFamily(FAMILY_DEFAULT_FUEL.biomass)).toBe("biomass");
  });
});
```

- [ ] **Step 2: Run → FAIL.** `npm test -- activity-groups`

- [ ] **Step 3: Implement.**

```ts
import type { FuelId } from "@/lib/model/types";
import { FUELS } from "@/lib/model/factors";

export type FuelFamily = "gaseous" | "liquid" | "solid" | "biomass";

const GASEOUS = new Set<FuelId>(["lpg", "propane", "butane", "cng", "png"]);
const SOLID = new Set<FuelId>(["coal", "cokingCoal", "lignite", "petcoke"]);

export function fuelFamily(id: FuelId): FuelFamily {
  if (FUELS[id]?.renewable) return "biomass";
  if (GASEOUS.has(id)) return "gaseous";
  if (SOLID.has(id)) return "solid";
  return "liquid";
}

export const FAMILY_DEFAULT_FUEL: Record<FuelFamily, FuelId> = {
  gaseous: "png",
  liquid: "diesel",
  solid: "coal",
  biomass: "biomass",
};
```

- [ ] **Step 4: Run → PASS.**

---

### Task 2: Export the existing detail panels for reuse

**Files:** Modify `components/tabs/DataInputTab.tsx`, `components/scope2/DataInputTab.tsx`

- [ ] **Step 1:** In `components/tabs/DataInputTab.tsx`, change `function DetailPanel(` to `export function DetailPanel(`.
- [ ] **Step 2:** In `components/scope2/DataInputTab.tsx`, change `function FacilityDetail(` to `export function FacilityDetail(`.

(Both are self-contained `<aside>` overlays that already omit the consumption field.)

---

### Task 3: `ActivityDataTab` (the unified page)

**Files:** Create `components/tabs/ActivityDataTab.tsx`

**Interfaces:** Consumes `useScenario`, `useScope2`, `fuelFamily`/`FAMILY_DEFAULT_FUEL`, `FUELS`, `combustionGrade`/`refrigerantGrade`/`facilityGrade`, `ReliabilityBadge`, exported `DetailPanel`/`FacilityDetail`, `Card`, `fmt`, `fyLabel`, `FY_YEARS`.

- [ ] **Step 1: Create the component.**

```tsx
"use client";

import { useState } from "react";
import { Leaf, Snowflake, Zap, Plus, ChevronDown, SlidersHorizontal, Trash2 } from "lucide-react";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import { FUELS } from "@/lib/model/factors";
import { fuelFamily, FAMILY_DEFAULT_FUEL, type FuelFamily } from "@/lib/activity-groups";
import { combustionGrade, refrigerantGrade, facilityGrade } from "@/lib/data-quality";
import { FY_YEARS, fyLabel, type CombustionAsset, type RefrigerationSystem } from "@/lib/model/types";
import type { Facility } from "@/lib/scope2/model/types";
import { cn, fmt } from "@/lib/utils";
import { ReliabilityBadge } from "../ui/ReliabilityBadge";
import { DetailPanel } from "./DataInputTab";
import { FacilityDetail } from "../scope2/DataInputTab";

const FUEL_CATS: { family: FuelFamily; label: string }[] = [
  { family: "gaseous", label: "Fuels – Gaseous" },
  { family: "liquid", label: "Fuels – Liquid" },
  { family: "solid", label: "Fuels – Solid" },
  { family: "biomass", label: "Biomass & biofuels" },
];

type Sel =
  | { kind: "combustion"; id: string }
  | { kind: "refrigerant"; id: string }
  | { kind: "facility"; id: string }
  | null;

function ScopeBadge({ scope }: { scope: 1 | 2 }) {
  return (
    <span className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5",
      scope === 1 ? "bg-brand-50 text-brand-700" : "bg-oren-100 text-oren-700")}>
      Scope {scope}
    </span>
  );
}

function Row({ name, sub, badge, value, unit, onChange, co2e, onDetails, onDelete }: {
  name: string; sub: string; badge: React.ReactNode; value: number; unit: string;
  onChange: (v: number) => void; co2e: number; onDetails: () => void; onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 border-t border-line/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink truncate">{name}</span>
          {badge}
        </div>
        <div className="text-xs text-ink-faint truncate">{sub}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 text-right tabular-nums rounded-lg border border-brand-200 bg-brand-50/50 px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400 focus:bg-white"
          aria-label={`${name} consumption`}
        />
        <span className="text-xs text-ink-faint w-12">{unit}</span>
      </div>
      <div className="w-24 text-right text-sm font-semibold tabular-nums shrink-0">{fmt(co2e)}<span className="text-ink-faint font-normal text-xs"> t</span></div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={onDetails} className="p-1.5 rounded-lg text-ink-faint hover:text-brand-600 hover:bg-brand-50" aria-label="Details" title="Details (everything except consumption)"><SlidersHorizontal size={15} /></button>
        <button onClick={onDelete} className="p-1.5 rounded-lg text-ink-faint hover:text-red-500" aria-label="Delete"><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

function CategoryCard({ title, scope, icon: Icon, count, onAdd, children }: {
  title: string; scope: 1 | 2; icon: React.ElementType; count: number; onAdd: () => void; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-8 h-8 rounded-lg bg-brand-50 grid place-items-center text-brand-600 shrink-0"><Icon size={16} /></div>
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          <span className="font-semibold text-ink truncate">{title}</span>
          <ScopeBadge scope={scope} />
          <span className="text-xs text-ink-faint">{count} source{count === 1 ? "" : "s"}</span>
          <ChevronDown size={16} className={cn("ml-auto text-ink-faint transition-transform", !open && "-rotate-90")} />
        </button>
        <button onClick={onAdd} className="inline-flex items-center gap-1 text-xs font-medium rounded-lg border border-line px-2.5 py-1.5 hover:border-brand-300 shrink-0"><Plus size={13} /> Add</button>
      </div>
      {open && (count > 0 ? <div>{children}</div> : <p className="px-4 pb-4 text-xs text-ink-faint">No sources yet — use Add.</p>)}
    </div>
  );
}

export function ActivityDataTab() {
  const s1 = useScenario();
  const s2 = useScope2();
  const [sel, setSel] = useState<Sel>(null);

  const year = s1.selectedYear;
  const setYear = (y: number) => { s1.setSelectedYear(y); s2.setSelectedYear(y); };

  const b1 = s1.selectedBaseline;
  const b2 = s2.selectedBaseline;
  const co2Comb = (id: string) => b1.perCombustion.find((p) => p.id === id)?.co2eT ?? 0;
  const co2Ref = (id: string) => b1.perRefrigeration.find((p) => p.id === id)?.co2eT ?? 0;
  const co2Fac = (id: string) => b2.perFacility.find((p) => p.id === id)?.locationT ?? 0;

  const scope1T = b1.totalT;
  const scope2T = b2.totalLocationT;
  const total = scope1T + scope2T;
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  const assetsByFamily = (fam: FuelFamily) => s1.selectedAssets.filter((a) => fuelFamily(a.fuelType) === fam);

  const addInFamily = (fam: FuelFamily) => {
    const fuelId = FAMILY_DEFAULT_FUEL[fam];
    s1.importCombustion(year, [{
      name: `New ${fam} fuel`, category: "stationary", fuelType: fuelId, unit: FUELS[fuelId].unit,
      annualVolume: 0, opex: 0, remainingLife: 10, unitCount: 1,
    }]);
  };

  const combById = (id: string): CombustionAsset | undefined => s1.selectedAssets.find((a) => a.id === id);
  const sysById = (id: string): RefrigerationSystem | undefined => s1.selectedSystems.find((s) => s.id === id);
  const facById = (id: string): Facility | undefined => s2.selectedFacilities.find((f) => f.id === id);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-ink">Activity data</h1>
          <p className="text-sm text-ink-soft">Enter consumption against each source. Scope 1 &amp; 2 in one place — open ⚙ for everything else.</p>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Financial year</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400">
            {FY_YEARS.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start">
        {/* categories */}
        <div className="flex flex-col gap-3">
          {FUEL_CATS.map(({ family, label }) => {
            const list = assetsByFamily(family);
            return (
              <CategoryCard key={family} title={label} scope={1} icon={Leaf} count={list.length} onAdd={() => addInFamily(family)}>
                {list.map((a) => (
                  <Row
                    key={a.id}
                    name={a.name}
                    sub={`${FUELS[a.fuelType].label} · ${a.category}`}
                    badge={<ReliabilityBadge grade={combustionGrade(a)} />}
                    value={a.annualVolume}
                    unit={a.unit}
                    onChange={(v) => s1.updateCombustion(year, a.id, { annualVolume: v })}
                    co2e={co2Comb(a.id)}
                    onDetails={() => setSel({ kind: "combustion", id: a.id })}
                    onDelete={() => s1.delCombustion(year, a.id)}
                  />
                ))}
              </CategoryCard>
            );
          })}

          <CategoryCard title="Refrigerants & cooling" scope={1} icon={Snowflake} count={s1.selectedSystems.length} onAdd={() => s1.addRefrigeration(year)}>
            {s1.selectedSystems.map((sy) => (
              <Row
                key={sy.id}
                name={sy.name}
                sub={FUELS ? `${sy.refrigerant} · topped up` : ""}
                badge={<ReliabilityBadge grade={refrigerantGrade(sy)} />}
                value={sy.toppedUpKg}
                unit="kg"
                onChange={(v) => s1.updateRefrigeration(year, sy.id, { toppedUpKg: v })}
                co2e={co2Ref(sy.id)}
                onDetails={() => setSel({ kind: "refrigerant", id: sy.id })}
                onDelete={() => s1.delRefrigeration(year, sy.id)}
              />
            ))}
          </CategoryCard>

          <CategoryCard title="Purchased electricity" scope={2} icon={Zap} count={s2.selectedFacilities.length} onAdd={() => s2.addFacility(year)}>
            {s2.selectedFacilities.map((f) => (
              <Row
                key={f.id}
                name={f.name}
                sub="Grid electricity (location-based)"
                badge={<ReliabilityBadge grade={facilityGrade(f)} />}
                value={f.annualLoadKwh}
                unit="kWh"
                onChange={(v) => s2.updateFacility(year, f.id, { annualLoadKwh: v })}
                co2e={co2Fac(f.id)}
                onDetails={() => setSel({ kind: "facility", id: f.id })}
                onDelete={() => s2.delFacility(year, f.id)}
              />
            ))}
          </CategoryCard>
        </div>

        {/* total footprint */}
        <aside className="rounded-xl3 border border-line/60 bg-surface shadow-card p-5 lg:sticky lg:top-4">
          <p className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Total footprint · {fyLabel(year)}</p>
          <p className="mt-2 text-3xl font-extrabold text-ink tabular-nums">{fmt(total)} <span className="text-base font-semibold text-ink-faint">tCO₂e</span></p>
          <div className="mt-4 flex flex-col gap-2">
            <div className="rounded-xl border border-line/60 px-3 py-2.5">
              <div className="flex items-center justify-between"><span className="text-sm font-semibold text-brand-700">Scope 1</span><span className="text-xs text-ink-faint">{share(scope1T)}%</span></div>
              <div className="text-lg font-extrabold tabular-nums">{fmt(scope1T)} <span className="text-xs font-normal text-ink-faint">t</span></div>
            </div>
            <div className="rounded-xl border border-line/60 px-3 py-2.5">
              <div className="flex items-center justify-between"><span className="text-sm font-semibold text-oren-600">Scope 2</span><span className="text-xs text-ink-faint">{share(scope2T)}%</span></div>
              <div className="text-lg font-extrabold tabular-nums">{fmt(scope2T)} <span className="text-xs font-normal text-ink-faint">t</span></div>
            </div>
          </div>
          {b1.biogenicT > 0 && (
            <p className="mt-4 text-[11px] text-ink-faint border-t border-line/60 pt-3">
              Biogenic CO₂ <strong className="text-ink">{fmt(b1.biogenicT)} t</strong> — disclosed separately, outside Scope 1/2.
            </p>
          )}
        </aside>
      </div>

      {/* sidebar — reuses the existing detail panels (consumption omitted) */}
      {sel?.kind === "combustion" && combById(sel.id) && <DetailPanel onClose={() => setSel(null)} combustion={combById(sel.id)} year={year} />}
      {sel?.kind === "refrigerant" && sysById(sel.id) && <DetailPanel onClose={() => setSel(null)} refrigerant={sysById(sel.id)} year={year} />}
      {sel?.kind === "facility" && facById(sel.id) && <FacilityDetail facility={facById(sel.id)!} year={year} locationT={co2Fac(sel.id)} onClose={() => setSel(null)} />}
    </div>
  );
}
```

(Note: `b1.biogenicT` — if the baseline result has no `biogenicT`, drop that block. Verify against `BaselineResult` during Step / build; if absent, remove the biogenic footnote.)

---

### Task 4: Render the unified tab in the Shell + retitle

**Files:** Modify `components/Shell.tsx`, `components/Topbar.tsx`

- [ ] **Step 1:** In `components/Shell.tsx`, import: `import { ActivityDataTab } from "./tabs/ActivityDataTab";`
- [ ] **Step 2:** Replace the `{tab === "data" && <DataInputTab />}` line with `{tab === "data" && <ActivityDataTab />}` and the `{tab === "data2" && <Scope2DataInputTab />}` line with `{tab === "data2" && <ActivityDataTab />}`.
- [ ] **Step 3:** In `components/Topbar.tsx`, change the `data` and `data2` `TITLES` entries' `title` to `"Activity data"` (eyebrow can stay "Step 1 · Baseline").

---

### Task 5: Render smoke test

**Files:** Create `components/tabs/__tests__/activity-data.test.tsx`

- [ ] **Step 1:**

```tsx
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { ActivityDataTab } from "../ActivityDataTab";

describe("ActivityDataTab", () => {
  it("renders the unified categories and total footprint", () => {
    const html = renderToString(
      <ScenarioProvider>
        <Scope2Provider>
          <ActivityDataTab />
        </Scope2Provider>
      </ScenarioProvider>,
    );
    expect(html).toContain("Activity data");
    expect(html).toContain("Fuels – Gaseous");
    expect(html).toContain("Purchased electricity");
    expect(html).toContain("Total footprint");
    expect(html).toContain("Scope 1");
    expect(html).toContain("Scope 2");
  });
});
```

- [ ] **Step 2: Run the full suite.** `npm test` → all pass.

- [ ] **Step 3: Build + manual.** `npm run build` → compiles. `npm run dev` → http://localhost:3000:
  - Data input (either scope) shows one **Activity data** page with category cards (Gaseous/Liquid/Solid/Biomass/Refrigerants = Scope 1, Purchased electricity = Scope 2), each collapsible with a scope badge + count + Add.
  - Each row: name + sub-label + reliability badge, an inline **consumption** input + unit, computed tCO₂e.
  - **⚙** opens the existing sidebar (spend/life/site/etc. for fuels; tariff/grid/load-split for electricity) — never the consumption.
  - The **Total footprint** panel shows the combined total + Scope 1 / Scope 2 split with %.

---

## Self-Review

**1. Spec coverage:** One unified data input (S1+S2) → `ActivityDataTab` rendered for both `data`/`data2`. Structure per screenshots → scope-badged collapsible category cards, name+sub-label rows, inline consumption + unit, computed CO₂e, Total Footprint panel. Group by fuel family → `fuelFamily` + `FUEL_CATS`. Colours = existing tokens (brand/oren). Everything-but-consumption in a sidebar → reuse exported `DetailPanel`/`FacilityDetail` (already consumption-free).

**2. Placeholder scan:** None except the guarded `b1.biogenicT` note (Task 3 instructs verifying/removing if the field is absent). The `sub={FUELS ? … : ""}` ternary in the refrigerant Row is simplified to `sub={\`${sy.refrigerant} · topped up\`}` — use that form.

**3. Type consistency:** `ActivityDataTab` reads `selectedBaseline.perCombustion/perRefrigeration` (Scope 1) and `selectedBaseline.perFacility[].locationT` (Scope 2) — same shapes used elsewhere. `importCombustion(year, [Omit<CombustionAsset,"id">])` matches the Phase-3b store action. `DetailPanel({onClose, combustion?, refrigerant?, year})` and `FacilityDetail({facility, year, locationT, onClose})` match the existing (now exported) signatures.

**Done after this:** the data input is unified per your screenshots. Optional later: Expand-all/Collapse-all controls, biogenic "Outside" section card.
