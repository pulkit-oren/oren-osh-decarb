# Phase 3 — Data-Quality Engine + Reliability Surfacing (Scope 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Grade every Scope 1 source as Measured / Estimated / Needs-data, show a per-row reliability badge and a year-level data-confidence gauge in the data-input tab, and let a source be flagged as a ₹-spend estimate (with an optional "estimate volume from spend" helper). This is the reliability layer the CEO lens will reuse in Phase 4.

**Architecture:** A pure, unit-tested `lib/data-quality.ts` derives grades + a `Confidence` summary. One optional `inputMode` field is added to `CombustionAsset` (backward-compatible). Two presentational primitives (`ReliabilityBadge`, `ConfidenceGauge`) render it. The Scope 1 `DataInputTab` wires them in. No model-engine or store-action changes — `updateCombustion` already accepts a partial patch.

**Tech Stack:** Next.js 16 (custom — `AGENTS.md`), React 19, Tailwind v4, Vitest + `react-dom/server`.

## Global Constraints

- `inputMode` is OPTIONAL on `CombustionAsset`; absent ⇒ treated as `"metered"` (existing saved data stays Measured).
- Tile-add flow + paste-import are explicitly OUT of this phase (Phase 3b).
- No git: replace "commit" with `npm test` + manual check at http://localhost:3000.
- Run commands from `osh-decarbonization-dashboard-master/`.

---

### Task 1: Pure data-quality module

**Files:**
- Create: `lib/data-quality.ts`
- Test: `lib/__tests__/data-quality.test.ts`

**Interfaces:**
- Produces:
  - `type Grade = "measured" | "estimated" | "missing"`
  - `function combustionGrade(a: { annualVolume: number; inputMode?: "metered" | "spend" }): Grade`
  - `function refrigerantGrade(s: { toppedUpKg: number }): Grade`
  - `interface Confidence { measuredT: number; estimatedT: number; missingCount: number; totalT: number; measuredPct: number; estimatedPct: number; missingPct: number; label: "good" | "fair" | "low" }`
  - `function confidenceOf(sources: { grade: Grade; co2eT: number }[]): Confidence`

- [ ] **Step 1: Write the failing test.**

```ts
// lib/__tests__/data-quality.test.ts
import { describe, expect, it } from "vitest";
import { combustionGrade, refrigerantGrade, confidenceOf } from "../data-quality";

describe("grades", () => {
  it("metered volume is measured; spend is estimated; zero is missing", () => {
    expect(combustionGrade({ annualVolume: 100 })).toBe("measured");
    expect(combustionGrade({ annualVolume: 100, inputMode: "metered" })).toBe("measured");
    expect(combustionGrade({ annualVolume: 100, inputMode: "spend" })).toBe("estimated");
    expect(combustionGrade({ annualVolume: 0, inputMode: "spend" })).toBe("missing");
  });
  it("refrigerant is measured when topped-up, else missing", () => {
    expect(refrigerantGrade({ toppedUpKg: 5 })).toBe("measured");
    expect(refrigerantGrade({ toppedUpKg: 0 })).toBe("missing");
  });
});

describe("confidenceOf", () => {
  it("weights measured vs estimated by tonnes and counts gaps", () => {
    const c = confidenceOf([
      { grade: "measured", co2eT: 800 },
      { grade: "measured", co2eT: 100 },
      { grade: "estimated", co2eT: 100 },
      { grade: "missing", co2eT: 0 },
    ]);
    expect(c.measuredT).toBe(900);
    expect(c.estimatedT).toBe(100);
    expect(c.totalT).toBe(1000);
    expect(c.measuredPct).toBeCloseTo(0.9);
    expect(c.missingCount).toBe(1);
    expect(c.label).toBe("good");
  });
  it("is 'low' when mostly estimated and safe on an empty list", () => {
    expect(confidenceOf([{ grade: "estimated", co2eT: 100 }]).label).toBe("low");
    const empty = confidenceOf([]);
    expect(empty.measuredPct).toBe(0);
    expect(empty.totalT).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm test -- data-quality`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `lib/data-quality.ts`.**

```ts
export type Grade = "measured" | "estimated" | "missing";

export function combustionGrade(a: { annualVolume: number; inputMode?: "metered" | "spend" }): Grade {
  if (!(a.annualVolume > 0)) return "missing";
  return a.inputMode === "spend" ? "estimated" : "measured";
}

export function refrigerantGrade(s: { toppedUpKg: number }): Grade {
  return s.toppedUpKg > 0 ? "measured" : "missing";
}

export interface Confidence {
  measuredT: number;
  estimatedT: number;
  missingCount: number;
  totalT: number;
  measuredPct: number;
  estimatedPct: number;
  missingPct: number;
  label: "good" | "fair" | "low";
}

export function confidenceOf(sources: { grade: Grade; co2eT: number }[]): Confidence {
  let measuredT = 0, estimatedT = 0, missingCount = 0;
  for (const s of sources) {
    if (s.grade === "measured") measuredT += s.co2eT;
    else if (s.grade === "estimated") estimatedT += s.co2eT;
    else missingCount += 1;
  }
  const totalT = measuredT + estimatedT;
  const measuredPct = totalT > 0 ? measuredT / totalT : 0;
  const estimatedPct = totalT > 0 ? estimatedT / totalT : 0;
  const label: Confidence["label"] = measuredPct >= 0.8 ? "good" : measuredPct >= 0.5 ? "fair" : "low";
  return { measuredT, estimatedT, missingCount, totalT, measuredPct, estimatedPct, missingPct: 0, label };
}
```

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- data-quality`
Expected: PASS (4 tests).

---

### Task 2: `ReliabilityBadge` + `ConfidenceGauge` primitives

**Files:**
- Create: `components/ui/ReliabilityBadge.tsx`
- Create: `components/ui/ConfidenceGauge.tsx`
- Test: `components/ui/__tests__/reliability.test.tsx`

**Interfaces:**
- `ReliabilityBadge({ grade }: { grade: Grade })`
- `ConfidenceGauge({ confidence }: { confidence: Confidence })`
- Consumes: `Grade`, `Confidence` from `@/lib/data-quality`.

- [ ] **Step 1: Write the failing test.**

```tsx
// components/ui/__tests__/reliability.test.tsx
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ReliabilityBadge } from "../ReliabilityBadge";
import { ConfidenceGauge } from "../ConfidenceGauge";
import { confidenceOf } from "@/lib/data-quality";

describe("ReliabilityBadge", () => {
  it("labels each grade", () => {
    expect(renderToString(<ReliabilityBadge grade="measured" />)).toContain("Measured");
    expect(renderToString(<ReliabilityBadge grade="estimated" />)).toContain("Estimated");
    expect(renderToString(<ReliabilityBadge grade="missing" />)).toContain("Needs data");
  });
});

describe("ConfidenceGauge", () => {
  it("shows the measured percentage", () => {
    const c = confidenceOf([{ grade: "measured", co2eT: 81 }, { grade: "estimated", co2eT: 19 }]);
    const html = renderToString(<ConfidenceGauge confidence={c} />);
    expect(html).toContain("81%");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm test -- reliability`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `ReliabilityBadge`.**

```tsx
// components/ui/ReliabilityBadge.tsx
import { cn } from "@/lib/utils";
import type { Grade } from "@/lib/data-quality";

const MAP: Record<Grade, { label: string; cls: string; dot: string }> = {
  measured:  { label: "Measured",  cls: "text-brand-700 bg-brand-50",  dot: "bg-good" },
  estimated: { label: "Estimated", cls: "text-warn bg-amber-50",       dot: "bg-warn" },
  missing:   { label: "Needs data", cls: "text-bad bg-red-50",         dot: "bg-bad" },
};

export function ReliabilityBadge({ grade, className }: { grade: Grade; className?: string }) {
  const m = MAP[grade];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", m.cls, className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}
```

- [ ] **Step 4: Implement `ConfidenceGauge`.**

```tsx
// components/ui/ConfidenceGauge.tsx
import { cn } from "@/lib/utils";
import type { Confidence } from "@/lib/data-quality";

const LABEL: Record<Confidence["label"], string> = { good: "Good", fair: "Fair", low: "Low" };

export function ConfidenceGauge({ confidence: c, className }: { confidence: Confidence; className?: string }) {
  const pct = Math.round(c.measuredPct * 100);
  const est = Math.round(c.estimatedPct * 100);
  return (
    <div className={cn("flex items-center gap-4 rounded-xl3 border border-line/60 bg-surface-muted px-4 py-3.5", className)}>
      <div className="relative w-14 h-14 shrink-0">
        <svg width="56" height="56" viewBox="0 0 42 42">
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--color-line)" strokeWidth="5" />
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--color-good)" strokeWidth="5"
                  strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset="25" strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[13px] font-extrabold text-brand-600">{pct}%</span>
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-ink">Data confidence: {LABEL[c.label]}</p>
        <p className="text-[11.5px] text-ink-soft mt-0.5">
          {pct}% of this year&apos;s tCO₂e from metered data
          {est > 0 ? ` · ${est}% estimated` : ""}
          {c.missingCount > 0 ? ` · ${c.missingCount} need${c.missingCount === 1 ? "s" : ""} data` : ""}
        </p>
        <div className="mt-2 flex h-2 w-full max-w-[260px] overflow-hidden rounded-full bg-line">
          <span className="h-full bg-good" style={{ width: `${pct}%` }} />
          <span className="h-full bg-warn" style={{ width: `${est}%` }} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run — expect PASS, then full suite.**

Run: `npm test -- reliability`  → PASS (2 tests)
Run: `npm test`  → all pass.

---

### Task 3: Wire reliability into the Scope 1 Data Input tab

**Files:**
- Modify: `lib/model/types.ts` (add `inputMode` to `CombustionAsset`)
- Modify: `components/tabs/DataInputTab.tsx`
- Test (guard): `components/tabs/__tests__/render.test.tsx` (existing) + full suite

**Interfaces:**
- Consumes: `combustionGrade`, `refrigerantGrade`, `confidenceOf` from `@/lib/data-quality`; `ReliabilityBadge`, `ConfidenceGauge` from `../ui/*`.

- [ ] **Step 1: Add the optional field to the type.**

In `lib/model/types.ts`, inside `interface CombustionAsset`, after the `unit: FuelUnit;` line (line 113) add:

```ts
  /** How the annual volume was sourced. Absent ⇒ metered (measured). */
  inputMode?: "metered" | "spend";
```

- [ ] **Step 2: Import the new helpers in the data-input tab.**

In `components/tabs/DataInputTab.tsx`, add to the imports:

```tsx
import { combustionGrade, refrigerantGrade, confidenceOf } from "@/lib/data-quality";
import { ReliabilityBadge } from "../ui/ReliabilityBadge";
import { ConfidenceGauge } from "../ui/ConfidenceGauge";
```

- [ ] **Step 3: Compute the year confidence and render the gauge under the KPIs.**

In `DataInputTab`, just after the `mobileT` calculation near the top of the component body (after the line `const mobileT = b.combustionT - stationaryT;`), add:

```tsx
  const confidence = confidenceOf([
    ...selectedAssets.map((a) => ({ grade: combustionGrade(a), co2eT: co2eOf(a.id) })),
    ...selectedSystems.map((s) => ({ grade: refrigerantGrade(s), co2eT: b.perRefrigeration.find((p) => p.id === s.id)?.co2eT ?? 0 })),
  ]);
```

Then, immediately after the closing `</div>` of the baseline-KPIs grid (the `<div className="grid grid-cols-1 sm:grid-cols-3 gap-3"> … </div>` block), add:

```tsx
      <ConfidenceGauge confidence={confidence} />
```

- [ ] **Step 4: Add a reliability badge to each combustion row.**

In the combustion table, the asset-name cell is:

```tsx
                      <td className="py-1.5 px-2"><TextCell value={a.name} onChange={(v) => updateCombustion(selectedYear, a.id, { name: v })} label={`${a.name} name`} /></td>
```

Replace it with a name + badge stack:

```tsx
                      <td className="py-1.5 px-2">
                        <div className="flex items-center gap-2">
                          <TextCell value={a.name} onChange={(v) => updateCombustion(selectedYear, a.id, { name: v })} label={`${a.name} name`} />
                          <ReliabilityBadge grade={combustionGrade(a)} className="shrink-0" />
                        </div>
                      </td>
```

- [ ] **Step 5: Add the Metered / ₹-spend toggle to the combustion detail panel.**

In `CombustionDetails`, the `<SectionLabel>Inputs (averaged …)</SectionLabel>` block holds the spend + life inputs. Just below that `<SectionLabel>…</SectionLabel>` line and before its `<div className="space-y-4">`, insert a provenance toggle:

```tsx
          <div className="mb-4 flex items-center gap-1.5 rounded-lg bg-surface-muted p-1">
            {(["metered", "spend"] as const).map((m) => {
              const on = (a.inputMode ?? "metered") === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => updateCombustion(year, a.id, { inputMode: m })}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors",
                    on ? "bg-white text-ink shadow-card" : "text-ink-soft hover:text-ink",
                  )}
                >
                  {m === "metered" ? "Metered volume" : "₹ Spend (estimate)"}
                </button>
              );
            })}
          </div>
```

(`cn` is already imported in this file.)

- [ ] **Step 6: When in spend mode, offer to estimate the volume from spend.**

Still in `CombustionDetails`, the annual-spend `LabeledNum` has a `footer`. Append an estimate action when in spend mode. Replace the existing spend `LabeledNum`'s `footer={…}` prop value with:

```tsx
            footer={(a.inputMode === "spend" && price > 0) ? (
              <button type="button" onClick={() => updateCombustion(year, a.id, { annualVolume: Math.round(a.opex / price) })} className="text-brand-600 hover:underline">
                Estimate volume from spend → {fmt(Math.round(a.opex / price))} {a.unit}/yr
              </button>
            ) : price > 0 && a.opex !== avgOpex ? (
              <button type="button" onClick={() => updateCombustion(year, a.id, { opex: avgOpex })} className="text-brand-600 hover:underline">
                Use average ≈ {fmtMoney(avgOpex)} ({CURRENCY}{fmt(price)}/{a.unit})
              </button>
            ) : price > 0 ? `≈ average at ${CURRENCY}${fmt(price)}/${a.unit}` : null}
```

- [ ] **Step 7: Run the full suite.**

Run: `npm test`
Expected: all pass (existing data-input render test still green; new modules covered).

- [ ] **Step 8: Production build + manual check.**

Run: `npm run build`  → compiles, TS passes.
Then `npm run dev` → http://localhost:3000, Scope 1 → Data input. Manual:
- A **data-confidence gauge** sits under the KPI cards showing "% from metered data".
- Each combustion row shows a **Measured** badge (green); set a fuel's volume to 0 → **Needs data** (red); open its details, switch to **₹ Spend** → row turns **Estimated** (amber) and the gauge's metered % drops.
- In spend mode, the detail panel offers **"Estimate volume from spend → N L/yr"**.

---

## Self-Review

**1. Spec coverage (Phase 3 scope):** grade per source → Task 1 `combustionGrade`/`refrigerantGrade`. Year confidence "% from metered" → `confidenceOf` + `ConfidenceGauge` (Tasks 1-3). Per-row badge → Task 3 Step 4. Metered⇄₹-spend with back-calc → Task 3 Steps 5-6 (provenance toggle + estimate-from-spend helper). Reusable gauge for CEO lens → `ConfidenceGauge` primitive. Tile-add + paste-import → explicitly deferred to Phase 3b (stated in Global Constraints).

**2. Placeholder scan:** None — every step shows full code.

**3. Type consistency:** `Grade`/`Confidence` defined in Task 1, consumed by Task 2 primitives and Task 3 wiring. `inputMode?: "metered" | "spend"` added to `CombustionAsset` (Task 3 Step 1) matches the structural param of `combustionGrade` (Task 1). `confidenceOf` input shape `{ grade, co2eT }` matches the call site in Task 3 Step 3. `updateCombustion(year, id, patch)` partial-patch signature (from the store) accepts `{ inputMode }` and `{ annualVolume }`.

**Next:** Phase 3b (tile-add flow + paste import), then Phase 4 (per-persona content: CEO overview reusing `ConfidenceGauge`, CFO MACC/NPV, Plant site grouping).
