# Phase 4b — CFO Finance Screen + Scope 1 MACC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Give the CFO lens a dedicated Scope 1 "Finance" screen — finance KPIs (capex, blended ₹/t, opex impact, payback), a marginal abatement cost curve (MACC), and a ranked lever-economics table — all from the existing `result.levers`. The CFO lens lands on it.

**Architecture:** Mirrors the Phase 4 CEO overview pattern: a new `finance` tab key shown only in the CFO Scope 1 lens, rendered by a new `CfoFinanceTab`. A new pure-SVG `MaccChart` (width = tonnes abated, height = ₹/tonne, cheapest first, savings below the zero line) is fed by `result.levers`. No engine/store changes.

**Tech Stack:** Next.js 16 (custom — `AGENTS.md`), React 19, Tailwind v4, Vitest + `react-dom/server`.

## Global Constraints

- ESG lens unchanged (all working tabs, no `finance`).
- Plant Head site-grouping + Scope 2 CEO overview are OUT of this phase (Phase 4c).
- No git: replace "commit" with `npm test` + manual check at http://localhost:3000.
- Run commands from `osh-decarbonization-dashboard-master/`.

---

### Task 1: Point the CFO Scope 1 lens at a new `finance` tab

**Files:**
- Modify: `lib/persona.ts`
- Modify: `lib/__tests__/persona.test.ts`

**Interfaces:**
- `lensTabs("s1","cfo")` becomes `["finance","action","compare"]`; landing `"finance"`. Scope 2 CFO unchanged.

- [ ] **Step 1: Update the test first.**

In `lib/__tests__/persona.test.ts`, replace:

```ts
  it("CFO is economics-focused (no raw data entry, no refrigerant advisor)", () => {
    expect(lensTabs("s1", "cfo")).toEqual(["builder", "action", "compare"]);
  });
```

with:

```ts
  it("CFO lands on the finance screen (Scope 1)", () => {
    expect(lensTabs("s1", "cfo")).toEqual(["finance", "action", "compare"]);
    expect(personaLanding("s1", "cfo")).toBe("finance");
  });
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm test -- persona` → FAIL.

- [ ] **Step 3: Update the lens map.**

In `lib/persona.ts`, change the `cfo` entry:

```ts
  cfo:   { s1: ["finance", "action", "compare"],                         s2: ["builder2", "action2", "compare2"] },
```

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- persona` → PASS.

---

### Task 2: Register the `finance` tab in the chrome

**Files:**
- Modify: `components/Sidebar.tsx`
- Modify: `components/Topbar.tsx`

- [ ] **Step 1: Add the icon + tab key + NAV entry.**

In `components/Sidebar.tsx`, add `Wallet` to the lucide import:

```tsx
import { Database, Wand2, ClipboardList, Snowflake, GitCompare, Settings, LogOut, LayoutDashboard, Wallet } from "lucide-react";
```

Add `"finance"` to `TabKey`:

```tsx
export type TabKey = "overview" | "data" | "builder" | "action" | "finance" | "refrigerant" | "compare";
```

Add the Finance entry to `NAV` (after `action`):

```tsx
  { key: "action", icon: ClipboardList, label: "Action plan" },
  { key: "finance", icon: Wallet, label: "Finance" },
  { key: "refrigerant", icon: Snowflake, label: "Refrigerant advisor" },
```

- [ ] **Step 2: Add the Topbar title.**

In `components/Topbar.tsx` `TITLES`, add (after `action`):

```tsx
  finance: { eyebrow: "Finance", title: "Scope 1 business case" },
```

---

### Task 3: `MaccChart` — Scope 1 marginal abatement cost curve

**Files:**
- Create: `lib/macc.ts` (pure layout helper)
- Create: `components/charts/MaccChart.tsx`
- Test: `lib/__tests__/macc.test.ts`

**Interfaces:**
- Produces:
  - `interface MaccBar { id: string; label: string; color: string; x: number; width: number; costPerTonne: number; abatementT: number }`
  - `function maccLayout(levers: { id: string; label: string; colorIdx: number; costPerTonne: number; abatementT: number }[]): { bars: MaccBar[]; totalT: number; maxCost: number; minCost: number }` — sorts cheapest→dearest, lays out cumulative x by tonnes (0..totalT).
  - `function MaccChart({ levers }: { levers: ComputeResult["levers"] })` — SVG curve.

- [ ] **Step 1: Write the failing test.**

```ts
// lib/__tests__/macc.test.ts
import { describe, expect, it } from "vitest";
import { maccLayout } from "../macc";

const levers = [
  { id: "ref", label: "Refrigerant", colorIdx: 1, costPerTonne: -1200, abatementT: 300 },
  { id: "fuel", label: "Biofuel", colorIdx: 2, costPerTonne: 1800, abatementT: 400 },
  { id: "elec", label: "Electrify", colorIdx: 5, costPerTonne: 3500, abatementT: 100 },
];

describe("maccLayout", () => {
  it("orders cheapest first and lays out cumulative width by tonnes", () => {
    const { bars, totalT, maxCost, minCost } = maccLayout(levers);
    expect(bars.map((b) => b.id)).toEqual(["ref", "fuel", "elec"]);
    expect(totalT).toBe(800);
    expect(bars[0].x).toBe(0);
    expect(bars[0].width).toBe(300);
    expect(bars[1].x).toBe(300);
    expect(bars[2].x).toBe(700);
    expect(minCost).toBe(-1200);
    expect(maxCost).toBe(3500);
  });
  it("is safe on an empty list", () => {
    const out = maccLayout([]);
    expect(out.bars).toEqual([]);
    expect(out.totalT).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm test -- macc` → FAIL.

- [ ] **Step 3: Implement `lib/macc.ts`.**

```ts
import { FAMILY_COLORS } from "@/lib/model/factors";

export interface MaccBar {
  id: string; label: string; color: string;
  x: number; width: number; costPerTonne: number; abatementT: number;
}

interface LeverLike { id: string; label: string; colorIdx: number; costPerTonne: number; abatementT: number }

export function maccLayout(levers: LeverLike[]): { bars: MaccBar[]; totalT: number; maxCost: number; minCost: number } {
  const sorted = [...levers].filter((l) => l.abatementT > 0).sort((a, b) => a.costPerTonne - b.costPerTonne);
  let x = 0;
  const bars: MaccBar[] = sorted.map((l) => {
    const bar: MaccBar = {
      id: l.id, label: l.label, color: FAMILY_COLORS[l.colorIdx] ?? "#1F9E5A",
      x, width: l.abatementT, costPerTonne: l.costPerTonne, abatementT: l.abatementT,
    };
    x += l.abatementT;
    return bar;
  });
  const costs = sorted.map((l) => l.costPerTonne);
  return {
    bars,
    totalT: x,
    maxCost: costs.length ? Math.max(...costs, 0) : 0,
    minCost: costs.length ? Math.min(...costs, 0) : 0,
  };
}
```

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- macc` → PASS.

- [ ] **Step 5: Implement `components/charts/MaccChart.tsx`.**

```tsx
"use client";
import type { ComputeResult } from "@/lib/model";
import { CURRENCY } from "@/lib/defaults";
import { fmt } from "@/lib/utils";
import { maccLayout } from "@/lib/macc";

const W = 600, H = 240, PAD_L = 48, PAD_B = 28, PAD_T = 12;

export function MaccChart({ levers }: { levers: ComputeResult["levers"] }) {
  const active = levers.filter((l) => l.enabled && l.abatementT > 0);
  const { bars, totalT, maxCost, minCost } = maccLayout(active);
  if (bars.length === 0) {
    return <p className="text-sm text-ink-faint">Switch on actions in the Scenario Modeller to see the abatement cost curve.</p>;
  }
  const plotW = W - PAD_L - 10;
  const plotH = H - PAD_T - PAD_B;
  const xScale = (t: number) => PAD_L + (totalT > 0 ? (t / totalT) * plotW : 0);
  const top = Math.max(maxCost, 0), bot = Math.min(minCost, 0), span = top - bot || 1;
  const yOf = (c: number) => PAD_T + ((top - c) / span) * plotH;
  const zeroY = yOf(0);

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} fontFamily="Inter">
        {/* zero line */}
        <line x1={PAD_L} y1={zeroY} x2={W - 10} y2={zeroY} stroke="var(--color-ink-faint)" strokeWidth="1" />
        <text x={PAD_L - 6} y={zeroY + 3} fontSize="9" textAnchor="end" fill="var(--color-ink-faint)">0</text>
        {/* bars */}
        {bars.map((b) => {
          const x = xScale(b.x), w = Math.max(1, xScale(b.x + b.width) - x - 1);
          const yTop = b.costPerTonne >= 0 ? yOf(b.costPerTonne) : zeroY;
          const h = Math.max(1, Math.abs(yOf(b.costPerTonne) - zeroY));
          return (
            <g key={b.id}>
              <rect x={x} y={yTop} width={w} height={h} fill={b.color} opacity={b.costPerTonne < 0 ? 0.85 : 0.7} rx={2}>
                <title>{`${b.label}: ${CURRENCY}${fmt(b.costPerTonne)}/t · ${fmt(b.abatementT)} t`}</title>
              </rect>
            </g>
          );
        })}
        {/* axes captions */}
        <text x={PAD_L} y={H - 6} fontSize="9" fill="var(--color-ink-faint)">cheapest first →</text>
        <text x={W - 10} y={H - 6} fontSize="9" textAnchor="end" fill="var(--color-ink-faint)">{fmt(totalT)} tCO₂e abated</text>
        <text x={PAD_L - 6} y={PAD_T + 8} fontSize="9" textAnchor="end" fill="var(--color-ink-faint)">{CURRENCY}/t</text>
      </svg>
    </div>
  );
}
```

---

### Task 4: `CfoFinanceTab` + render in the Shell

**Files:**
- Create: `components/tabs/CfoFinanceTab.tsx`
- Modify: `components/Shell.tsx`
- Modify: `components/tabs/__tests__/render.test.tsx`

**Interfaces:**
- Consumes: `useScenario()` (`result`); `MaccChart`; `KpiCard`/`Card`/`CardHeader`/`HowTo`; `FAMILY_COLORS`; `CURRENCY`; `fmt`/`fmtMoney`/`fmtNum`.

- [ ] **Step 1: Create the component.**

```tsx
// components/tabs/CfoFinanceTab.tsx
"use client";

import { Layers, IndianRupee, Coins, Clock } from "lucide-react";
import { useScenario } from "@/lib/store";
import { FAMILY_COLORS } from "@/lib/model/factors";
import { CURRENCY } from "@/lib/defaults";
import { fmt, fmtMoney, fmtNum, cn } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";
import { KpiCard } from "../ui/KpiCard";
import { HowTo } from "../ui/HowTo";
import { MaccChart } from "../charts/MaccChart";

export function CfoFinanceTab() {
  const { result } = useScenario();
  const k = result.kpis;
  const active = result.levers.filter((l) => l.enabled);
  const opexDelta = active.reduce((s, l) => s + l.annualOpexDelta, 0);
  const ranked = active.filter((l) => l.abatementT > 0).sort((a, b) => a.costPerTonne - b.costPerTonne);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard emphasis icon={Layers} label="Capital required" value={fmtMoney(k.totalCapex)} hint="one-off CAPEX to target" />
        <KpiCard icon={Coins} label="Blended cost / tonne" value={`${CURRENCY}${fmt(k.costPerTonne)}`} hint="weighted ₹/tCO₂e" />
        <KpiCard icon={IndianRupee} label="Running-cost impact" value={`${opexDelta <= 0 ? "−" : "+"}${fmtMoney(Math.abs(opexDelta))}`} hint={opexDelta <= 0 ? "saving per year" : "cost per year"} />
        <KpiCard icon={Clock} label="Portfolio payback" value={k.paybackYears != null ? `${fmtNum(k.paybackYears, 1)} yrs` : "—"} hint={k.paybackYears != null ? "investment recovered" : "no payback yet"} />
      </div>

      <Card>
        <CardHeader
          title="Marginal abatement cost curve"
          subtitle={`Bar width = tonnes abated · height = ${CURRENCY}/tonne · cheapest first`}
          right={<HowTo points={[
            "Each bar is one action. Width = CO₂e it removes per year; height = cost per tonne.",
            "Bars below the zero line save money (negative cost per tonne).",
            "Fund left-to-right: the cheapest tonnes first.",
          ]} />}
        />
        <MaccChart levers={result.levers} />
      </Card>

      <Card>
        <CardHeader title="Lever economics — ranked by cost per tonne" subtitle="Capex, abatement, payback and running-cost change" />
        {ranked.length === 0 ? (
          <p className="text-sm text-ink-faint">No actions switched on yet — build the plan in the Scenario Modeller.</p>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="font-semibold text-left py-2 px-2">Action</th>
                  <th className="font-semibold text-right py-2 px-2">Abatement</th>
                  <th className="font-semibold text-right py-2 px-2">Capex</th>
                  <th className="font-semibold text-right py-2 px-2">{CURRENCY}/tonne</th>
                  <th className="font-semibold text-right py-2 px-2">Payback</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((l) => (
                  <tr key={l.id} className="border-t border-line/60">
                    <td className="py-2.5 px-2">
                      <span className="flex items-center gap-2 font-medium text-ink">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: FAMILY_COLORS[l.colorIdx] }} />
                        {l.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{fmt(l.abatementT)} t</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{fmtMoney(l.capex)}</td>
                    <td className={cn("py-2.5 px-2 text-right tabular-nums font-semibold", l.costPerTonne < 0 && "text-brand-600")}>
                      {l.costPerTonne < 0 ? "−" : ""}{CURRENCY}{fmt(Math.abs(l.costPerTonne))}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{l.paybackYears != null ? `${fmtNum(l.paybackYears, 1)} yrs` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Render it in the Shell.**

In `components/Shell.tsx`, add the import next to the other tab imports:

```tsx
import { CfoFinanceTab } from "./tabs/CfoFinanceTab";
```

In the tab-render block, add after the `action` line:

```tsx
                {tab === "finance" && <CfoFinanceTab />}
```

- [ ] **Step 3: Add a render smoke test.**

In `components/tabs/__tests__/render.test.tsx`, import `CfoFinanceTab`, add `["CfoFinanceTab", CfoFinanceTab]` to `cases`, and:

```tsx
  it("CfoFinanceTab shows finance KPIs and the MACC", () => {
    const html = renderToString(
      <ScenarioProvider>
        <CfoFinanceTab />
      </ScenarioProvider>,
    );
    expect(html).toContain("Capital required");
    expect(html).toContain("Blended cost / tonne");
    expect(html).toContain("Marginal abatement cost curve");
    expect(html).toContain("Portfolio payback");
  });
```

- [ ] **Step 4: Run the full suite.**

Run: `npm test` → all pass.

- [ ] **Step 5: Production build + manual check.**

Run: `npm run build` → compiles, TS passes.
Then `npm run dev` → http://localhost:3000. Manual:
- Switch to **CFO** → rail shows **Finance + Action plan + Compare**, lands on **Finance**: four finance KPIs, the MACC curve, and the ranked lever-economics table.
- The default seeded plan shows real bars (the sample scenario has active levers).
- **ESG** unchanged (no Finance tab).

---

## Self-Review

**1. Spec coverage (Phase 4b scope):** CFO finance framing → `CfoFinanceTab` (finance KPIs + ranked economics). Scope 1 MACC (previously missing) → `lib/macc.ts` + `MaccChart`. CFO lens lands on it → Task 1. Plant Head grouping + Scope 2 CEO overview → deferred to 4c (Global Constraints).

**2. Placeholder scan:** None — full code in every step.

**3. Type consistency:** `TabKey` adds `"finance"` (Sidebar) → propagates to `AnyTabKey`/`Shell`; `TITLES.finance` prevents the `t.eyebrow` crash. `lensTabs("s1","cfo")` returns `["finance","action","compare"]` matching the new `NAV` key. `maccLayout` input `{ id,label,colorIdx,costPerTonne,abatementT }` is a structural subset of `ComputeResult["levers"]` entries (verified against `ActionPlanTab` usage). `MaccChart`/`CfoFinanceTab` read `result.levers` (`enabled`,`abatementT`,`capex`,`costPerTonne`,`paybackYears`,`annualOpexDelta`,`colorIdx`,`label`) and `result.kpis` (`totalCapex`,`costPerTonne`,`paybackYears`) — same fields `ActionPlanTab` uses.

**Next:** Phase 4c — Plant Head site grouping + Scope 2 CEO overview; Phase 3b — tile-add + paste import; Phase 5 — seeded boardroom scenarios.
