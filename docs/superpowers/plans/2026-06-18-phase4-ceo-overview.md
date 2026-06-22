# Phase 4 — CEO Boardroom Overview (Scope 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Give the CEO lens a dedicated single-screen Scope 1 "Overview" — verdict, headline KPIs, a green gradient target HeroCard, the data-confidence gauge, and the glide-path chart — reusing the existing compute engine and Phase-1/3 primitives. The CEO lens lands on it.

**Architecture:** A new `overview` tab key, shown only in the CEO Scope 1 lens, rendered by a new `CeoOverviewTab` that reads `useScenario().result` (KPIs + trajectory + baseline) and derives confidence via Phase 3's `confidenceOf`. No engine/store changes.

**Tech Stack:** Next.js 16 (custom — `AGENTS.md`), React 19, Tailwind v4, Vitest + `react-dom/server`.

## Global Constraints

- ESG lens MUST still show every working tab and MUST NOT show `overview`.
- Scope 2 CEO overview + CFO/Plant content tailoring are OUT of this phase (Phase 4b).
- No git: replace "commit" with `npm test` + manual check at http://localhost:3000.
- Run commands from `osh-decarbonization-dashboard-master/`.

---

### Task 1: Point the CEO Scope 1 lens at the new `overview` tab

**Files:**
- Modify: `lib/persona.ts`
- Modify: `lib/__tests__/persona.test.ts`

**Interfaces:**
- `lensTabs("s1", "ceo")` becomes `["overview", "compare"]`; `personaLanding("s1", "ceo")` becomes `"overview"`. Scope 2 CEO unchanged (`["action2", "compare2"]`). ESG unchanged (no `overview`).

- [ ] **Step 1: Update the persona test first.**

In `lib/__tests__/persona.test.ts`, replace the CEO assertion block:

```ts
  it("CEO is a trimmed overview set", () => {
    expect(lensTabs("s1", "ceo")).toEqual(["action", "compare"]);
    expect(lensTabs("s2", "ceo")).toEqual(["action2", "compare2"]);
  });
```

with:

```ts
  it("CEO lands on the boardroom overview (Scope 1)", () => {
    expect(lensTabs("s1", "ceo")).toEqual(["overview", "compare"]);
    expect(lensTabs("s2", "ceo")).toEqual(["action2", "compare2"]);
  });
```

And change the landing assertion `expect(personaLanding("s1", "ceo")).toBe("action");` to `expect(personaLanding("s1", "ceo")).toBe("overview");`.

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm test -- persona`
Expected: FAIL (still returns `action`).

- [ ] **Step 3: Update the lens map.**

In `lib/persona.ts`, change the `ceo` entry of `LENS`:

```ts
  ceo:   { s1: ["overview", "compare"],                                  s2: ["action2", "compare2"] },
```

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- persona`
Expected: PASS.

---

### Task 2: Register the `overview` tab in the chrome

**Files:**
- Modify: `components/Sidebar.tsx`
- Modify: `components/Topbar.tsx`

**Interfaces:**
- `TabKey` gains `"overview"`; `NAV` gains an Overview entry (icon `LayoutDashboard`). `TITLES.overview` added so the Topbar title renders.

- [ ] **Step 1: Add the icon import + tab key + NAV entry in Sidebar.**

In `components/Sidebar.tsx`, add `LayoutDashboard` to the lucide import:

```tsx
import { Database, Wand2, ClipboardList, Snowflake, GitCompare, Settings, LogOut, LayoutDashboard } from "lucide-react";
```

Change the `TabKey` type to include `overview`:

```tsx
export type TabKey = "overview" | "data" | "builder" | "action" | "refrigerant" | "compare";
```

Add the Overview entry at the FRONT of `NAV`:

```tsx
const NAV: { key: TabKey; icon: React.ElementType; label: string }[] = [
  { key: "overview", icon: LayoutDashboard, label: "Overview" },
  { key: "data", icon: Database, label: "Data input" },
  { key: "builder", icon: Wand2, label: "Scenario modeller" },
  { key: "action", icon: ClipboardList, label: "Action plan" },
  { key: "refrigerant", icon: Snowflake, label: "Refrigerant advisor" },
  { key: "compare", icon: GitCompare, label: "Compare & track" },
];
```

(ESG won't see it: `lensTabs("s1","esg")` does not list `overview`, and `navFor` filters `NAV` by the lens.)

- [ ] **Step 2: Add the Topbar title for `overview`.**

In `components/Topbar.tsx`, add to the `TITLES` map (top of the object):

```tsx
  overview: { eyebrow: "Boardroom", title: "Scope 1 overview" },
```

---

### Task 3: Build `CeoOverviewTab` and render it in the Shell

**Files:**
- Create: `components/tabs/CeoOverviewTab.tsx`
- Modify: `components/Shell.tsx`
- Modify: `components/tabs/__tests__/render.test.tsx`

**Interfaces:**
- Consumes: `useScenario()` (`result`, `baseAssets`, `baseSystems`, `scenarios`, `setSettings`); `confidenceOf`/`combustionGrade`/`refrigerantGrade`; `HeroCard`, `ConfidenceGauge`, `KpiCard`, `Card`/`CardHeader`, `HowTo`, `WedgeChart`.

- [ ] **Step 1: Create the component.**

```tsx
// components/tabs/CeoOverviewTab.tsx
"use client";

import { CheckCircle2, AlertTriangle, TrendingDown, Layers } from "lucide-react";
import { useScenario } from "@/lib/store";
import { combustionGrade, refrigerantGrade, confidenceOf } from "@/lib/data-quality";
import { cn, fmt, fmtMoney, pct } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";
import { KpiCard } from "../ui/KpiCard";
import { HeroCard } from "../ui/HeroCard";
import { ConfidenceGauge } from "../ui/ConfidenceGauge";
import { HowTo } from "../ui/HowTo";
import { WedgeChart } from "../charts/WedgeChart";

export function CeoOverviewTab() {
  const { result, baseAssets, baseSystems, scenarios, setSettings } = useScenario();
  const k = result.kpis;
  const confidence = confidenceOf([
    ...baseAssets.map((a) => ({ grade: combustionGrade(a), co2eT: result.baseline.perCombustion.find((p) => p.id === a.id)?.co2eT ?? 0 })),
    ...baseSystems.map((s) => ({ grade: refrigerantGrade(s), co2eT: result.baseline.perRefrigeration.find((p) => p.id === s.id)?.co2eT ?? 0 })),
  ]);

  const onLoad = (id: string) => {
    if (id === "__live") return;
    const s = scenarios.find((x) => x.id === id);
    if (s) setSettings(() => s.settings);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* verdict + scenario picker */}
      <Card className={cn("border-l-4", k.onTrack2030 ? "border-l-brand-500" : "border-l-amber-500")}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={cn("w-11 h-11 rounded-xl grid place-items-center shrink-0", k.onTrack2030 ? "bg-brand-50 text-brand-600" : "bg-amber-50 text-amber-600")}>
              {k.onTrack2030 ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold text-ink leading-tight">
                {k.onTrack2030 ? "On track for the 2030 climate target" : "Off track for the 2030 climate target"}
              </h2>
              <p className="text-sm text-ink-soft mt-1">
                Scope 1 falls <strong>{pct(k.reduction2030)} by 2030</strong> and {pct(k.reduction2050)} by 2050 on the current pathway.
              </p>
            </div>
          </div>
          {scenarios.length > 0 && (
            <div className="shrink-0">
              <label className="block text-[10px] uppercase tracking-wide text-ink-faint font-bold mb-1">Scenario shown</label>
              <select onChange={(e) => onLoad(e.target.value)} defaultValue="__live" className="border border-line rounded-lg px-3 py-2 text-sm font-medium bg-white focus:outline-none focus:border-brand-400">
                <option value="__live">Current (live)</option>
                {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </Card>

      {/* hero target + headline KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <HeroCard
          tag="Projected · 2030"
          value={fmt(k.net2030)}
          unit="tCO₂e"
          note={`▼ ${pct(k.reduction2030)} vs baseline`}
          footLeft="Baseline"
          footRight={`${fmt(result.baseTotalT)} t`}
        />
        <KpiCard emphasis icon={TrendingDown} label="Cut by 2030" value={pct(k.reduction2030)} delta={k.onTrack2030 ? "On track" : "Off track"} hint="vs base year" />
        <KpiCard icon={Layers} label="Investment to target" value={fmtMoney(k.totalCapex)} hint="one-off CAPEX" />
      </div>

      {/* data confidence */}
      <ConfidenceGauge confidence={confidence} />

      {/* glide path */}
      <Card>
        <CardHeader
          title="Glide path to 2050"
          subtitle="Where emissions go if you do nothing, and what this plan changes · tCO₂e"
          right={<HowTo points={[
            "Grey dashed line: business as usual.",
            "Coloured bands: the cut each action delivers.",
            "Solid green line: emissions with the plan in place.",
            "Blue dashed line: the SBTi 1.5°C target — stay below it to be on track.",
          ]} />}
        />
        <WedgeChart result={result} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Render it in the Shell.**

In `components/Shell.tsx`, add the import alongside the other tab imports:

```tsx
import { CeoOverviewTab } from "./tabs/CeoOverviewTab";
```

In the tab-render block, add as the first conditional (before `{tab === "data" && …}`):

```tsx
                {tab === "overview" && <CeoOverviewTab />}
```

- [ ] **Step 3: Add a render smoke test.**

In `components/tabs/__tests__/render.test.tsx`, add the import:

```tsx
import { CeoOverviewTab } from "../CeoOverviewTab";
```

Add `["CeoOverviewTab", CeoOverviewTab],` to the `cases` array, and a focused test:

```tsx
  it("CeoOverviewTab leads with the verdict, hero and glide path", () => {
    const html = renderToString(
      <ScenarioProvider>
        <CeoOverviewTab />
      </ScenarioProvider>,
    );
    expect(html).toMatch(/2030 climate target/);
    expect(html).toContain("Projected");
    expect(html).toContain("Cut by 2030");
    expect(html).toContain("Glide path to 2050");
    expect(html).toContain("Data confidence"); // gauge present
  });
```

- [ ] **Step 4: Run the full suite.**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Production build + manual check.**

Run: `npm run build`  → compiles, TS passes.
Then `npm run dev` → http://localhost:3000. Manual:
- Default (ESG) lens: five tabs, **no** Overview, behaves as before.
- Switch to **CEO**: left rail shows **Overview + Compare**, lands on **Overview** — verdict banner, green target HeroCard, "Cut by 2030"/"Investment" KPIs, the data-confidence gauge, and the glide-path chart.
- Switch back to **ESG**: Overview disappears, all working tabs return.

---

## Self-Review

**1. Spec coverage (Phase 4 scope):** CEO single-screen overview → `CeoOverviewTab` (Tasks 1-3). Reuses data-confidence gauge → `ConfidenceGauge`. Reuses glide path → `WedgeChart`. Headline target → `HeroCard`. CEO lens lands on it → Task 1 lens + landing. ESG keeps full toolset, no overview → `LENS.esg` unchanged + `navFor` filter. CFO/Plant content + Scope 2 overview → deferred to 4b (Global Constraints).

**2. Placeholder scan:** None — full code in every step.

**3. Type consistency:** `TabKey` adds `"overview"` (Sidebar) → `AnyTabKey` propagates → `Shell` renders it → `TITLES.overview` prevents the `t.eyebrow` crash. `lensTabs("s1","ceo")` returns `["overview","compare"]` matching the new `NAV` key. `CeoOverviewTab` reads `result.kpis` fields (`net2030`, `reduction2030`, `reduction2050`, `totalCapex`, `onTrack2030`) and `result.baseline.perCombustion/perRefrigeration` — the same shapes `ActionPlanTab`/`DataInputTab` already use. `HeroCard`/`ConfidenceGauge` props match their Phase 1/3 definitions.

**Next:** Phase 4b — CFO finance framing (Scope 1 MACC + NPV), Plant Head site grouping, and the Scope 2 CEO overview.
