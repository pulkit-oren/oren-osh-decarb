# Phase 5 — Seeded Boardroom Scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Give the CEO overview a "boardroom scenarios" picker — three pre-built pathways (Business as usual / Current plan / Accelerated) derived from the live plan, each showing 2030 cut + investment + on/off-track, with an "Adopt" button that applies it.

**Architecture:** A pure, tested `lib/boardroom-scenarios.ts` transforms the live `LeverSettings` into the three variants (BAU disables every lever; Accelerated pushes enabled levers harder and pulls target years to 2030; Current is the live plan). The CEO overview computes each variant with the existing pure `compute()` and renders a comparison card. No engine/store changes.

**Tech Stack:** Next.js 16 (custom — `AGENTS.md`), React 19, Tailwind v4, Vitest.

## Global Constraints

- Variants are derived live (no persistence) — they always reflect the current plan.
- No git: replace "commit" with `npm test` + manual check at http://localhost:3000.
- Run commands from `osh-decarbonization-dashboard-master/`.

---

### Task 1: Pure boardroom-variants transform

**Files:**
- Create: `lib/boardroom-scenarios.ts`
- Test: `lib/__tests__/boardroom-scenarios.test.ts`

**Interfaces:**
- `interface BoardroomVariant { id: string; name: string; settings: LeverSettings }`
- `function boardroomVariants(settings: LeverSettings): BoardroomVariant[]` — returns `[bau, balanced, accelerated]`.

- [ ] **Step 1: Write the failing test.**

```ts
// lib/__tests__/boardroom-scenarios.test.ts
import { describe, expect, it } from "vitest";
import { boardroomVariants } from "../boardroom-scenarios";
import type { LeverSettings } from "@/lib/model/types";

const settings: LeverSettings = {
  byAsset: {
    a1: {
      electrify: { enabled: true, unitsToConvert: 1, capacityPct: 40, cop: 3, tariffPerKwh: 8, assetCapex: 100, startYear: 2026, targetYear: 2035 },
      fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 90, retrofitCapex: 50, startYear: 2026, targetYear: 2034 },
    },
  },
  bySystem: {
    s1: {
      gasSwitch: { enabled: true, transitionPct: 50, altRefrigerant: "R32", retrofitCapex: 20, startYear: 2026, targetYear: 2033 },
      leakFix: { enabled: true, leakImprovementPct: 30, startYear: 2026, targetYear: 2033 },
    },
  },
  assumptions: { gridEf: 0.7, renewableSourcingPct: 0, recCostPerTonne: 0, carbonPricePerTonne: 3000, infraCapex: 0 },
};

describe("boardroomVariants", () => {
  it("returns BAU, Current and Accelerated", () => {
    expect(boardroomVariants(settings).map((v) => v.id)).toEqual(["bau", "balanced", "accelerated"]);
  });
  it("BAU disables every lever", () => {
    const bau = boardroomVariants(settings)[0].settings;
    expect(bau.byAsset.a1.electrify.enabled).toBe(false);
    expect(bau.byAsset.a1.fuelSwitch.enabled).toBe(false);
    expect(bau.bySystem.s1.gasSwitch.enabled).toBe(false);
    expect(bau.bySystem.s1.leakFix.enabled).toBe(false);
  });
  it("Current is unchanged", () => {
    expect(boardroomVariants(settings)[1].settings.byAsset.a1.electrify.capacityPct).toBe(40);
  });
  it("Accelerated pushes enabled levers harder and pulls target years to 2030", () => {
    const acc = boardroomVariants(settings)[2].settings;
    expect(acc.byAsset.a1.electrify.capacityPct).toBe(100);
    expect(acc.byAsset.a1.electrify.targetYear).toBe(2030);
    expect(acc.bySystem.s1.gasSwitch.transitionPct).toBe(100);
    expect(acc.bySystem.s1.leakFix.leakImprovementPct).toBeGreaterThanOrEqual(60);
  });
  it("does not mutate the input", () => {
    boardroomVariants(settings);
    expect(settings.byAsset.a1.electrify.enabled).toBe(true);
    expect(settings.byAsset.a1.electrify.capacityPct).toBe(40);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** Run: `npm test -- boardroom` → FAIL.

- [ ] **Step 3: Implement `lib/boardroom-scenarios.ts`.**

```ts
import type { LeverSettings } from "@/lib/model/types";

export interface BoardroomVariant { id: string; name: string; settings: LeverSettings }

function clone(s: LeverSettings): LeverSettings {
  return JSON.parse(JSON.stringify(s)) as LeverSettings;
}

export function boardroomVariants(settings: LeverSettings): BoardroomVariant[] {
  const bau = clone(settings);
  for (const a of Object.values(bau.byAsset)) {
    a.electrify.enabled = false;
    a.fuelSwitch.enabled = false;
    if (a.flexFuel) a.flexFuel.enabled = false;
  }
  for (const sy of Object.values(bau.bySystem)) {
    sy.gasSwitch.enabled = false;
    sy.leakFix.enabled = false;
  }

  const acc = clone(settings);
  for (const a of Object.values(acc.byAsset)) {
    if (a.electrify.enabled) {
      a.electrify.capacityPct = 100;
      a.electrify.targetYear = Math.min(a.electrify.targetYear, 2030);
    }
    if (a.fuelSwitch.enabled) {
      a.fuelSwitch.blendPct = Math.min(100, Math.round(a.fuelSwitch.blendPct * 1.3));
      a.fuelSwitch.targetYear = Math.min(a.fuelSwitch.targetYear, 2030);
    }
    if (a.flexFuel?.enabled) {
      a.flexFuel.targetYear = Math.min(a.flexFuel.targetYear, 2030);
    }
  }
  for (const sy of Object.values(acc.bySystem)) {
    if (sy.gasSwitch.enabled) {
      sy.gasSwitch.transitionPct = 100;
      sy.gasSwitch.targetYear = Math.min(sy.gasSwitch.targetYear, 2030);
    }
    if (sy.leakFix.enabled) {
      sy.leakFix.leakImprovementPct = Math.max(sy.leakFix.leakImprovementPct, 60);
      sy.leakFix.targetYear = Math.min(sy.leakFix.targetYear, 2030);
    }
  }

  return [
    { id: "bau", name: "Business as usual", settings: bau },
    { id: "balanced", name: "Current plan", settings: clone(settings) },
    { id: "accelerated", name: "Accelerated", settings: acc },
  ];
}
```

- [ ] **Step 4: Run — expect PASS.** Run: `npm test -- boardroom` → PASS.

---

### Task 2: Boardroom scenarios card on the CEO overview

**Files:**
- Modify: `components/tabs/CeoOverviewTab.tsx`
- Modify: `components/tabs/__tests__/render.test.tsx`

**Interfaces:**
- Consumes: `compute` from `@/lib/model`, `boardroomVariants` from `@/lib/boardroom-scenarios`; `useScenario()` now also reads `settings`, `baseYear`.

- [ ] **Step 1: Update imports + destructure.** In `components/tabs/CeoOverviewTab.tsx`:
  - Add `import { compute } from "@/lib/model";`
  - Add `import { boardroomVariants } from "@/lib/boardroom-scenarios";`
  - Change the hook destructure to: `const { result, baseAssets, baseSystems, scenarios, setSettings, settings, baseYear } = useScenario();`

- [ ] **Step 2: Compute the variants.** After the `confidence` calc, add:

```tsx
  const variants = boardroomVariants(settings).map((v) => {
    const r = compute(baseAssets, baseSystems, v.settings, baseYear);
    return { ...v, reduction2030: r.kpis.reduction2030, totalCapex: r.kpis.totalCapex, onTrack: r.kpis.onTrack2030 };
  });
```

- [ ] **Step 3: Render the card** (add just before the closing `</div>` of the component's root, i.e. after the glide-path `</Card>`):

```tsx
      <Card>
        <CardHeader title="Boardroom scenarios" subtitle="Three pathways from your live plan — adopt one as the committed plan" />
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="font-semibold text-left py-2 px-2">Pathway</th>
                <th className="font-semibold text-right py-2 px-2">Cut by 2030</th>
                <th className="font-semibold text-right py-2 px-2">Investment</th>
                <th className="font-semibold text-left py-2 px-2 pl-4">Status</th>
                <th className="py-2 px-2" />
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} className="border-t border-line/60">
                  <td className="py-2.5 px-2 font-medium text-ink">{v.name}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-semibold">{pct(v.reduction2030)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{fmtMoney(v.totalCapex)}</td>
                  <td className="py-2.5 px-2 pl-4">
                    <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-2.5 py-0.5", v.onTrack ? "text-brand-700 bg-brand-50" : "text-amber-700 bg-amber-50")}>
                      <span className={cn("w-1.5 h-1.5 rounded-full", v.onTrack ? "bg-good" : "bg-warn")} />
                      {v.onTrack ? "On track" : "Off track"}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <button onClick={() => setSettings(() => v.settings)} className="text-xs font-semibold rounded-lg border border-line px-3 py-1.5 hover:border-brand-300 hover:text-brand-700">
                      Adopt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
```

- [ ] **Step 4: Update the render test.** In `components/tabs/__tests__/render.test.tsx`, in the `CeoOverviewTab leads with…` test, add:

```tsx
    expect(html).toContain("Boardroom scenarios");
    expect(html).toContain("Business as usual");
    expect(html).toContain("Accelerated");
```

- [ ] **Step 5: Run the full suite.** Run: `npm test` → all pass.

- [ ] **Step 6: Production build + manual check.** Run: `npm run build` → compiles. Then `npm run dev` → CEO lens (Scope 1) Overview shows a **Boardroom scenarios** table: Business as usual (≈0% cut), Current plan, Accelerated (higher cut, more investment), each with status + an **Adopt** button that applies it to the live plan.

---

## Self-Review

**1. Spec coverage:** CEO 2–3 pre-built scenarios → `boardroomVariants` (BAU/Current/Accelerated) + comparison card with adopt. Derived from current baseline → uses live `settings` + `compute()`.

**2. Placeholder scan:** None — full code in every step.

**3. Type consistency:** `boardroomVariants(settings: LeverSettings)` returns `LeverSettings` variants; `compute(baseAssets, baseSystems, settings, baseYear)` matches the engine signature; `setSettings(() => v.settings)` matches the store's updater signature. `result.kpis.reduction2030/totalCapex/onTrack2030` are the same fields used elsewhere.

**Next:** Phase 3b — paste-from-Excel import + tile add flow.
