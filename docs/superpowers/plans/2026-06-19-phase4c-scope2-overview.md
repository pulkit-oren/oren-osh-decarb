# Phase 4c — Scope 2 Data-Quality + CEO Boardroom Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Mirror the Scope 1 reliability + CEO boardroom work for Scope 2: grade facilities, show the confidence gauge in the Scope 2 data-input tab, and give the CEO lens a Scope 2 single-screen Overview (verdict, target HeroCard, KPIs, confidence gauge, location/market pathway).

**Architecture:** Extend the pure `lib/data-quality.ts` with `facilityGrade`. Add a Scope 2 `overview2` tab shown only in the CEO Scope 2 lens, rendered by `Scope2CeoOverviewTab`, reusing `confidenceOf`, `ConfidenceGauge`, `HeroCard`, `KpiCard`, and the existing `Scope2TrajectoryChart`. No engine/store changes.

**Tech Stack:** Next.js 16 (custom — `AGENTS.md`), React 19, Tailwind v4, Vitest + `react-dom/server`.

## Global Constraints

- ESG Scope 2 lens unchanged (all working tabs, no `overview2`).
- Plant Head site-grouping is OUT (Phase 4d).
- No git: replace "commit" with `npm test` + manual check at http://localhost:3000.
- Run commands from `osh-decarbonization-dashboard-master/`.

---

### Task 1: `facilityGrade` in the data-quality module

**Files:**
- Modify: `lib/data-quality.ts`
- Modify: `lib/__tests__/data-quality.test.ts`

**Interfaces:**
- Produces: `function facilityGrade(f: { annualLoadKwh: number }): Grade`.

- [ ] **Step 1: Add the failing test.** In `lib/__tests__/data-quality.test.ts`, inside the `describe("grades", …)` block, add:

```ts
  it("facility is measured when load is entered, else missing", () => {
    expect(facilityGrade({ annualLoadKwh: 1000 })).toBe("measured");
    expect(facilityGrade({ annualLoadKwh: 0 })).toBe("missing");
  });
```

and add `facilityGrade` to the import at the top of the file:

```ts
import { combustionGrade, refrigerantGrade, facilityGrade, confidenceOf } from "../data-quality";
```

- [ ] **Step 2: Run — expect FAIL.** Run: `npm test -- data-quality` → FAIL (no `facilityGrade`).

- [ ] **Step 3: Implement.** In `lib/data-quality.ts`, after `refrigerantGrade`, add:

```ts
export function facilityGrade(f: { annualLoadKwh: number }): Grade {
  return f.annualLoadKwh > 0 ? "measured" : "missing";
}
```

- [ ] **Step 4: Run — expect PASS.** Run: `npm test -- data-quality` → PASS.

---

### Task 2: Point the CEO Scope 2 lens at a new `overview2` tab

**Files:**
- Modify: `lib/persona.ts`
- Modify: `lib/__tests__/persona.test.ts`
- Modify: `components/Sidebar.tsx`
- Modify: `components/Topbar.tsx`

**Interfaces:**
- `lensTabs("s2","ceo")` becomes `["overview2","compare2"]`; landing `"overview2"`. `Scope2TabKey` gains `"overview2"`; `NAV2` gains an Overview entry; `TITLES.overview2` added.

- [ ] **Step 1: Update the persona test.** In `lib/__tests__/persona.test.ts`, change the CEO Scope 2 assertion:

```ts
    expect(lensTabs("s2", "ceo")).toEqual(["overview2", "compare2"]);
```

- [ ] **Step 2: Run — expect FAIL.** Run: `npm test -- persona` → FAIL.

- [ ] **Step 3: Update the lens map.** In `lib/persona.ts`, change the `ceo` entry's `s2`:

```ts
  ceo:   { s1: ["overview", "compare"],                                  s2: ["overview2", "compare2"] },
```

- [ ] **Step 4: Run — expect PASS.** Run: `npm test -- persona` → PASS.

- [ ] **Step 5: Register the tab in Sidebar.** In `components/Sidebar.tsx`, change `Scope2TabKey`:

```tsx
export type Scope2TabKey = "overview2" | "data2" | "builder2" | "action2" | "compare2";
```

and add the Overview entry at the FRONT of `NAV2`:

```tsx
const NAV2: { key: Scope2TabKey; icon: React.ElementType; label: string }[] = [
  { key: "overview2", icon: LayoutDashboard, label: "Overview" },
  { key: "data2", icon: Database, label: "Data input" },
  { key: "builder2", icon: Wand2, label: "Scenario modeller" },
  { key: "action2", icon: ClipboardList, label: "Action plan" },
  { key: "compare2", icon: GitCompare, label: "Compare & track" },
];
```

(`LayoutDashboard` is already imported from Phase 4.)

- [ ] **Step 6: Add the Topbar title.** In `components/Topbar.tsx` `TITLES`, add (near the other `*2` entries):

```tsx
  overview2: { eyebrow: "Boardroom", title: "Scope 2 overview" },
```

---

### Task 3: Confidence gauge in the Scope 2 data-input tab

**Files:**
- Modify: `components/scope2/DataInputTab.tsx`

**Interfaces:**
- Consumes: `facilityGrade`, `confidenceOf`, `ConfidenceGauge`.

- [ ] **Step 1: Add imports.** In `components/scope2/DataInputTab.tsx`, add:

```tsx
import { facilityGrade, confidenceOf } from "@/lib/data-quality";
import { ConfidenceGauge } from "../ui/ConfidenceGauge";
```

- [ ] **Step 2: Compute confidence.** Just after the existing `const isolatedShare = …` line near the top of `Scope2DataInputTab`, add:

```tsx
  const confidence = confidenceOf(
    selectedFacilities.map((f) => ({ grade: facilityGrade(f), co2eT: b.perFacility.find((p) => p.id === f.id)?.locationT ?? 0 })),
  );
```

- [ ] **Step 3: Render the gauge under the KPI grid.** Immediately after the baseline-KPI grid `</div>` (the `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3` block), add:

```tsx
      {/* data-quality confidence for the selected FY */}
      <ConfidenceGauge confidence={confidence} />
```

- [ ] **Step 4: Run the Scope 2 render test.** Run: `npm test -- scope2` → still passes (`DataInputTab renders with seeded defaults`).

---

### Task 4: `Scope2CeoOverviewTab` + Shell wiring + test

**Files:**
- Create: `components/scope2/CeoOverviewTab.tsx`
- Modify: `components/Shell.tsx`
- Modify: `components/scope2/__tests__/render.test.tsx`

**Interfaces:**
- Consumes: `useScope2()` (`result`, `baseFacilities`); `facilityGrade`/`confidenceOf`; `HeroCard`/`ConfidenceGauge`/`KpiCard`/`Card`/`HowTo`; `Scope2TrajectoryChart`.

- [ ] **Step 1: Create the component.**

```tsx
// components/scope2/CeoOverviewTab.tsx
"use client";

import { CheckCircle2, AlertTriangle, TrendingDown, Wallet } from "lucide-react";
import { useScope2 } from "@/lib/scope2/store";
import { facilityGrade, confidenceOf } from "@/lib/data-quality";
import { cn, fmt, fmtMoney, pct } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";
import { KpiCard } from "../ui/KpiCard";
import { HeroCard } from "../ui/HeroCard";
import { ConfidenceGauge } from "../ui/ConfidenceGauge";
import { HowTo } from "../ui/HowTo";
import { Scope2TrajectoryChart } from "./TrajectoryChart";

export function Scope2CeoOverviewTab() {
  const { result, baseFacilities } = useScope2();
  const k = result.kpis;
  const confidence = confidenceOf(
    baseFacilities.map((f) => ({ grade: facilityGrade(f), co2eT: result.baseline.perFacility.find((p) => p.id === f.id)?.locationT ?? 0 })),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* verdict */}
      <Card className={cn("border-l-4", k.onTrack2030 ? "border-l-brand-500" : "border-l-amber-500")}>
        <div className="flex items-start gap-3">
          <div className={cn("w-11 h-11 rounded-xl grid place-items-center shrink-0", k.onTrack2030 ? "bg-brand-50 text-brand-600" : "bg-amber-50 text-amber-600")}>
            {k.onTrack2030 ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-ink leading-tight">
              {k.onTrack2030 ? "On track for the 2030 climate target" : "Off track for the 2030 climate target"}
            </h2>
            <p className="text-sm text-ink-soft mt-1">
              Market-based Scope 2 falls <strong>{pct(k.reduction2030)} by 2030</strong> on the current pathway.
            </p>
          </div>
        </div>
      </Card>

      {/* hero target + headline KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <HeroCard
          tag="Target · 2030 · SBTi"
          value={fmt(k.target2030)}
          unit="tCO₂e"
          note={`Projected ▼ ${pct(k.reduction2030)} by 2030`}
          footLeft="Baseline (location)"
          footRight={`${fmt(k.baseLocationT)} t`}
        />
        <KpiCard emphasis icon={TrendingDown} label="Cut by 2030" value={pct(k.reduction2030)} delta={k.onTrack2030 ? "On track" : "Off track"} hint="market-based vs base" />
        <KpiCard icon={Wallet} label="Investment to target" value={fmtMoney(k.totalCapex)} hint="one-off CAPEX" />
      </div>

      {/* data confidence */}
      <ConfidenceGauge confidence={confidence} />

      {/* pathway */}
      <Card>
        <CardHeader
          title="Emissions pathway to 2050"
          subtitle="Location-based (solid) and market-based (dashed) · tCO₂e"
          right={<HowTo points={[
            "Grey dashed line: business as usual.",
            "Solid green line: location-based emissions (physical grid).",
            "Dashed teal line: market-based emissions (after green contracts).",
            "Pale line: the SBTi 1.5°C target — stay below it to be on track.",
          ]} />}
        />
        <Scope2TrajectoryChart
          series={[
            { id: "loc", label: "Location-based", color: "#1F9E5A", rows: result.trajectoryLocation },
            { id: "mkt", label: "Market-based", color: "#0F7873", dashed: true, rows: result.trajectoryMarket },
          ]}
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Render it in the Shell.** In `components/Shell.tsx`, add the import:

```tsx
import { Scope2CeoOverviewTab } from "./scope2/CeoOverviewTab";
```

and in the tab-render block, add before `{tab === "data2" && …}`:

```tsx
                {tab === "overview2" && <Scope2CeoOverviewTab />}
```

- [ ] **Step 3: Add a render smoke test.** In `components/scope2/__tests__/render.test.tsx`, import `Scope2CeoOverviewTab`, add `["CeoOverviewTab", Scope2CeoOverviewTab]` to `cases`, and:

```tsx
  it("CeoOverviewTab shows the verdict, hero and pathway", () => {
    const html = renderToString(
      <Scope2Provider>
        <Scope2CeoOverviewTab />
      </Scope2Provider>,
    );
    expect(html).toMatch(/2030 climate target/);
    expect(html).toContain("Cut by 2030");
    expect(html).toContain("Data confidence");
    expect(html).toContain("Emissions pathway to 2050");
  });
```

- [ ] **Step 4: Run the full suite.** Run: `npm test` → all pass.

- [ ] **Step 5: Production build + manual check.** Run: `npm run build` → compiles, TS passes. Then `npm run dev` → http://localhost:3000:
  - Switch to **Scope 2** (left rail), then **CEO** lens → rail shows **Overview + Compare**, lands on the Scope 2 boardroom Overview (verdict, target HeroCard, KPIs, confidence gauge, location/market pathway).
  - Scope 2 **Data input** now shows the confidence gauge under the KPIs.
  - **ESG** Scope 2 unchanged.

---

## Self-Review

**1. Spec coverage (Phase 4c scope):** Scope 2 data-quality → `facilityGrade` + gauge in Scope 2 data input (Tasks 1, 3). Scope 2 CEO overview → `Scope2CeoOverviewTab` (Task 4), CEO lens lands on it (Task 2). Reuses `ConfidenceGauge`/`HeroCard`/`Scope2TrajectoryChart`. Plant grouping + Scope 2 CFO framing → deferred to 4d (Global Constraints; Scope 2 already has a MACC via `Scope2ActionPlanTab`).

**2. Placeholder scan:** None — full code in every step.

**3. Type consistency:** `Scope2TabKey` adds `"overview2"` → propagates to `AnyTabKey`/`Shell`; `TITLES.overview2` prevents the `t.eyebrow` crash. `lensTabs("s2","ceo")` returns `["overview2","compare2"]` matching the new `NAV2` key. `Scope2CeoOverviewTab` reads `result.kpis` (`onTrack2030`,`reduction2030`,`target2030`,`baseLocationT`,`totalCapex`) and `result.baseline.perFacility[].locationT` and `result.trajectoryLocation/Market` — all confirmed against `lib/scope2/model/index.ts` and `baseline.ts`. `Scope2TrajectoryChart` `series:{id,label,color,dashed?,rows:TrajectoryRow[]}` matches its definition. `facilityGrade` param `{annualLoadKwh}` matches `Facility`.

**Next:** Phase 4d — Plant Head site grouping; Phase 3b — tile-add + paste import; Phase 5 — seeded boardroom scenarios.
