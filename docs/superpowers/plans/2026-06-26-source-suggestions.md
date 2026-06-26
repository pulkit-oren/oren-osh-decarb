# Per-Source Suggestions + Live Impact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make each Scope 1 source's scenario screen interactive and guided — a tailored suggestion card (apply-able), a live now→after impact panel (emissions + CAPEX), and a fuel-specific tip on each lever.

**Architecture:** A pure `lib/model/suggestions.ts` derives suggestions (from the existing end-use/equipment-class profiles + fuel data), per-lever tips, and per-source committed CAPEX. The UI adds a `SuggestionCard` + `SourceImpact` to the `SourceScenarioScreen`, inline lever tips, and removes the now-duplicate header `ImpactBar`. No scenario math/store change — suggestions just set existing lever values.

**Tech Stack:** Next.js 16, React 19, TypeScript, vitest. `lib/model/*`, `components/tabs/BuilderTab.tsx`.

## Global Constraints

- Git repo; controller handles commit/deploy. Per-task gate = `npx tsc --noEmit` clean AND `npm test` green (and `npm run build` clean on the final task). Do NOT run `git`.
- Do NOT change scenario math/KPIs/store handlers. Suggestions only set existing lever fields via the store.
- Live cost readout = **CAPEX committed only** (per-source), mirroring `index.ts` attribution. No per-source payback/running-cost.
- Scope 1 only (fuels + refrigerant). Scope 2 untouched.
- Suggestions are **derived** from `endUseProfile`/`refrigClassProfile` + `ALT_FUELS_BY_FUEL`/`maxBlendPctFor`/`RECOMMENDED_ALT_BY_SYSTEM` — not hand-authored per source.
- Reuse `DetailCard` from `@/components/tabs/activity/fields`. `CURRENCY` from `@/lib/defaults`; `fmt`/`fmtMoney`/`pct`/`cn` from `@/lib/utils`.

## Reference — existing signatures (unchanged)

- `endUseProfile(asset)` → `{ label; electrify: { feasible: "easy"|"yes"|"hard"|"no"; cop; capexPerUnit?; capacityHint?; note? }; fuelSwitch: { feasible; preferred?: AltFuelId; note? }; flexFuel? } | undefined` (`@/lib/model/end-use`).
- `refrigClassProfile(system)` → `{ label; systemType; recommendedAlt: RefrigerantId; note } | undefined` (`@/lib/model/refrigerant-class`).
- `ALT_FUELS_BY_FUEL[fuelId] → AltFuelId[]`, `ALT_FUELS[id] → { label; blendNote; ... }`, `maxBlendPctFor(category, altFuelId) → number`, `RECOMMENDED_ALT_BY_SYSTEM[systemType] → RefrigerantId`, `REFRIGERANTS[id] → { label; gwp; ... }` (`@/lib/model/factors`). `defaultAltFuelFor(fuelId) → AltFuelId | null` (`@/lib/model/segments`).
- `combustionCO2e(asset)`, `refrigerantCO2e(system)` (`@/lib/model/baseline`); `applyAssetActions(asset, acts, assumptions) → { scope1AbatementT; fuelAbatementT; ... }`, `applyRefrigerant(system, { transitionPct; altRefrigerant; leakImprovementPct }) → { newFugitiveT; ... }`, `defaultActions(asset)`, `defaultSystemActions(system)` (`@/lib/model/segments`).
- Lever shapes — `electrify {enabled,unitsToConvert,capacityPct,cop,tariffPerKwh,assetCapex,startYear,targetYear}`, `fuelSwitch {enabled,altFuel,blendPct,efficiencyPenaltyPct,altFuelPricePerUnit,retrofitCapex,startYear,targetYear}`, `flexFuel {enabled,unitsToConvert,altFuel,highBlendPct,vehicleCapex,startYear,targetYear}`, `gasSwitch {enabled,transitionPct,altRefrigerant,retrofitCapex,startYear,targetYear}`, `leakFix {enabled,leakImprovementPct,startYear,targetYear}` (`@/lib/model/types`: `AssetActions`, `SystemActions`).
- Store: `useScenario()` → `{ baseAssets, baseSystems, settings, setSettings, ... }`; `settings.byAsset[id]: AssetActions`, `settings.bySystem[id]: SystemActions`, `settings.assumptions`.

---

### Task 1: Suggestions engine (`lib/model/suggestions.ts`)

**Files:**
- Create: `lib/model/suggestions.ts`
- Test: `lib/model/__tests__/suggestions.test.ts`

**Interfaces:**
- Produces: `LeverKind`, `SuggestedAction`, `Suggestion`, `suggestForAsset(asset): Suggestion`, `suggestForSystem(system): Suggestion`, `capexForAsset(asset, acts): number`, `capexForSystem(acts): number`, and tip helpers `electrifyTip`, `fuelSwitchTip`, `flexFuelTip`, `gasSwitchTip`, `leakFixTip`.
- Consumes: the reference signatures above.

- [ ] **Step 1: Write the failing test** `lib/model/__tests__/suggestions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { suggestForAsset, suggestForSystem, capexForAsset, capexForSystem } from "@/lib/model/suggestions";
import type { CombustionAsset, RefrigerationSystem, AssetActions } from "@/lib/model/types";

function asset(over: Partial<CombustionAsset>): CombustionAsset {
  return { id: "a1", name: "x", category: "mobile", fuelType: "diesel", unit: "L", annualVolume: 1000, opex: 0, remainingLife: 10, unitCount: 4, ...over };
}
function sys(over: Partial<RefrigerationSystem>): RefrigerationSystem {
  return { id: "r1", name: "x", systemType: "retailRefrigeration", refrigerant: "R404A", toppedUpKg: 5, gasCostPerKg: 900, ...over };
}

describe("suggestForAsset", () => {
  it("electrify-feasible end-use (truck) → primary electrify, enabled, ~half the fleet, by 2030", () => {
    const s = suggestForAsset(asset({ endUse: "truck", unitCount: 4 }));
    expect(s.actions[0].lever).toBe("electrify");
    expect(s.actions[0].patch.enabled).toBe(true);
    expect(s.actions[0].patch.unitsToConvert).toBe(2);
    expect(s.actions[0].patch.targetYear).toBe(2030);
    expect(s.altActions?.[0].lever).toBe("fuelSwitch"); // diesel has a drop-in bio
  });
  it("hard-to-electrify end-use (furnaceKiln) → primary fuelSwitch at the drop-in cap", () => {
    const s = suggestForAsset(asset({ category: "stationary", fuelType: "diesel", unit: "L", endUse: "furnaceKiln" }));
    expect(s.actions[0].lever).toBe("fuelSwitch");
    expect(s.actions[0].patch.enabled).toBe(true);
    expect(typeof s.actions[0].patch.blendPct).toBe("number");
  });
});

describe("suggestForSystem", () => {
  it("recommends gasSwitch to the class/system alt + leakFix", () => {
    const s = suggestForSystem(sys({}));
    expect(s.actions.map((a) => a.lever).sort()).toEqual(["gasSwitch", "leakFix"]);
    const gs = s.actions.find((a) => a.lever === "gasSwitch")!;
    expect(gs.patch.transitionPct).toBe(60);
    expect(typeof gs.patch.altRefrigerant).toBe("string");
  });
});

describe("capexForAsset / capexForSystem", () => {
  it("electrify mobile capex = assetCapex × unitsToConvert", () => {
    const acts = { electrify: { enabled: true, unitsToConvert: 3, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 1_000_000, startYear: 2026, targetYear: 2030 }, fuelSwitch: { enabled: false, altFuel: "biodiesel", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 78, retrofitCapex: 0, startYear: 2027, targetYear: 2033 }, flexFuel: { enabled: false, unitsToConvert: 0, altFuel: "biodiesel", highBlendPct: 85, vehicleCapex: 500_000, startYear: 2027, targetYear: 2033 } } as AssetActions;
    expect(capexForAsset(asset({ category: "mobile", unitCount: 4 }), acts)).toBe(3_000_000);
  });
  it("system capex = gasSwitch retrofit when enabled", () => {
    const acts = { gasSwitch: { enabled: true, transitionPct: 60, altRefrigerant: "R290", retrofitCapex: 2_000_000, startYear: 2026, targetYear: 2030 }, leakFix: { enabled: true, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 } } as const;
    expect(capexForSystem(acts as any)).toBe(2_000_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run lib/model/__tests__/suggestions.test.ts` → FAIL (module missing).

- [ ] **Step 3: Create `lib/model/suggestions.ts`:**

```ts
import { ALT_FUELS, ALT_FUELS_BY_FUEL, maxBlendPctFor, REFRIGERANTS, RECOMMENDED_ALT_BY_SYSTEM } from "./factors";
import { endUseProfile } from "./end-use";
import { refrigClassProfile } from "./refrigerant-class";
import type { AltFuelId, AssetActions, CombustionAsset, RefrigerationSystem, SystemActions } from "./types";

export type LeverKind = "electrify" | "fuelSwitch" | "flexFuel" | "gasSwitch" | "leakFix";
export interface SuggestedAction { lever: LeverKind; patch: Record<string, number | string | boolean>; }
export interface Suggestion {
  headline: string;
  why: string;
  actions: SuggestedAction[];
  altHeadline?: string;
  altActions?: SuggestedAction[];
}

const TARGET_YEAR = 2030;

export function suggestForAsset(asset: CombustionAsset): Suggestion {
  const eu = endUseProfile(asset);
  const isMobile = asset.category === "mobile";
  const compatible = ALT_FUELS_BY_FUEL[asset.fuelType] ?? [];
  const altFuel: AltFuelId | null =
    eu?.fuelSwitch.preferred && compatible.includes(eu.fuelSwitch.preferred) ? eu.fuelSwitch.preferred : (compatible[0] ?? null);
  const maxBlend = altFuel ? maxBlendPctFor(asset.category, altFuel) : 0;
  const halfUnits = Math.max(1, Math.round(asset.unitCount * 0.5));

  const electrifyAction = (): SuggestedAction =>
    isMobile
      ? { lever: "electrify", patch: { enabled: true, unitsToConvert: halfUnits, cop: eu?.electrify.cop ?? 3, assetCapex: eu?.electrify.capexPerUnit ?? 0, targetYear: TARGET_YEAR } }
      : { lever: "electrify", patch: { enabled: true, capacityPct: eu?.electrify.capacityHint ?? 60, cop: eu?.electrify.cop ?? 3, targetYear: TARGET_YEAR } };
  const fuelSwitchAction = (): SuggestedAction | null =>
    altFuel ? { lever: "fuelSwitch", patch: { enabled: true, altFuel, blendPct: maxBlend, targetYear: TARGET_YEAR } } : null;

  const electrifyFeasible = eu ? eu.electrify.feasible === "easy" || eu.electrify.feasible === "yes" : true;
  const electrifyHard = eu ? eu.electrify.feasible === "hard" || eu.electrify.feasible === "no" : false;

  if (electrifyFeasible) {
    const fs = fuelSwitchAction();
    return {
      headline: isMobile
        ? `Electrify ${halfUnits} of ${asset.unitCount} vehicles by ${TARGET_YEAR}`
        : `Electrify ${eu?.electrify.capacityHint ?? 60}% of this asset by ${TARGET_YEAR}`,
      why: eu?.electrify.note ?? "Electrification is the primary lever for this equipment.",
      actions: [electrifyAction()],
      altHeadline: fs ? `Or run ${ALT_FUELS[altFuel!].label} at ${maxBlend}% now (drop-in)` : undefined,
      altActions: fs ? [fs] : undefined,
    };
  }

  const fs = fuelSwitchAction();
  if (fs) {
    return {
      headline: `Run ${ALT_FUELS[altFuel!].label} at ${maxBlend}% (drop-in) by ${TARGET_YEAR}`,
      why: eu?.fuelSwitch.note ?? "A bio-blend is the near-term lever; electrification is limited for this equipment.",
      actions: [fs],
      altHeadline: electrifyHard ? undefined : "Or electrify over the longer term",
      altActions: electrifyHard ? undefined : [electrifyAction()],
    };
  }
  return {
    headline: `Electrify where feasible by ${TARGET_YEAR}`,
    why: "No drop-in bio fuel for this fuel — consider electrification (or CNG / biomass).",
    actions: [electrifyAction()],
  };
}

export function suggestForSystem(system: RefrigerationSystem): Suggestion {
  const cls = refrigClassProfile(system);
  const alt = cls?.recommendedAlt ?? RECOMMENDED_ALT_BY_SYSTEM[system.systemType];
  const leak: SuggestedAction = { lever: "leakFix", patch: { enabled: true, leakImprovementPct: 50 } };
  return {
    headline: `Switch to ${REFRIGERANTS[alt].label} (60% by ${TARGET_YEAR}) + cut leaks 50%`,
    why: cls?.note ?? "A low-GWP swap plus leak reduction is the standard refrigerant pathway.",
    actions: [{ lever: "gasSwitch", patch: { enabled: true, altRefrigerant: alt, transitionPct: 60, targetYear: TARGET_YEAR } }, leak],
    altHeadline: "Or start with leak reduction (50%) — the cheapest win",
    altActions: [leak],
  };
}

export function capexForAsset(asset: CombustionAsset, acts: AssetActions): number {
  let c = 0;
  if (acts.electrify.enabled) c += acts.electrify.assetCapex * (asset.category === "mobile" ? acts.electrify.unitsToConvert : 1);
  if (acts.fuelSwitch.enabled) c += acts.fuelSwitch.retrofitCapex;
  if (acts.flexFuel?.enabled) c += acts.flexFuel.vehicleCapex * acts.flexFuel.unitsToConvert;
  return c;
}
export function capexForSystem(acts: SystemActions): number {
  return acts.gasSwitch.enabled ? acts.gasSwitch.retrofitCapex : 0;
}

export const electrifyTip = (isMobile: boolean) =>
  isMobile
    ? "EVs suit depot / return-to-base routes; an EV uses about a third of the energy (COP ~3)."
    : "Heat pump COP ≈3; an electric boiler is 1. High-temp processes are hard to electrify.";
export const fuelSwitchTip = (altLabel: string, maxBlend: number, category: string) =>
  `${altLabel} drop-in limit is ${maxBlend}% on existing ${category} equipment.`;
export const flexFuelTip = () =>
  "Flex-fuel vehicles run high blends (E85/B100) beyond the drop-in limit — counted per vehicle.";
export const gasSwitchTip = (altLabel: string, gwp: number) =>
  `${altLabel} · GWP ${gwp}. Naturals (R-290 / R-717 / R-744) need less charge but have charge & safety limits.`;
export const leakFixTip = () => "Maintenance & monitoring — usually the cheapest first win.";
```

- [ ] **Step 4: Run tests to verify they pass** — `npx vitest run lib/model/__tests__/suggestions.test.ts` → PASS. (If the `furnaceKiln` test's `blendPct` is 0 because diesel's drop-in cap for stationary differs, the test still asserts it's a number — fine. If `endUseProfile`/`maxBlendPctFor` return unexpected values, fix the test's expectations to the real values, keeping the lever assertions.)

- [ ] **Step 5: Checkpoint** — `npx tsc --noEmit` clean; `npm test` green.

---

### Task 2: SuggestionCard, SourceImpact, lever tips (UI)

**Files:**
- Modify: `components/tabs/BuilderTab.tsx`
- Test: `components/tabs/__tests__/builder-grouping.test.tsx`

**Interfaces:**
- Consumes Task 1: `suggestForAsset`, `suggestForSystem`, `capexForAsset`, `capexForSystem`, `electrifyTip`, `fuelSwitchTip`, `flexFuelTip`, `gasSwitchTip`, `leakFixTip`, and `Suggestion`/`SuggestedAction` types from `@/lib/model/suggestions`.
- Consumes existing: `useScenario`, `defaultActions`, `defaultSystemActions`, `applyAssetActions`, `applyRefrigerant`, `combustionCO2e`, `refrigerantCO2e`, `DetailCard`.

- [ ] **Step 1: Add imports** to `BuilderTab.tsx`:

```tsx
import { suggestForAsset, suggestForSystem, capexForAsset, capexForSystem, electrifyTip, fuelSwitchTip, flexFuelTip, gasSwitchTip, leakFixTip, type Suggestion, type SuggestedAction } from "@/lib/model/suggestions";
import { Lightbulb } from "lucide-react";
```
(`combustionCO2e`/`refrigerantCO2e`/`applyAssetActions`/`applyRefrigerant`/`defaultActions`/`defaultSystemActions`/`DetailCard` are already imported.)

- [ ] **Step 2: Add `SuggestionCard`** (new component). It applies a suggestion atomically via a single `setSettings` (creating the plan from `defaultActions` if absent), so no stale-state issues:

```tsx
function SuggestionCard({ kind, id }: { kind: "asset" | "system"; id: string }) {
  const { baseAssets, baseSystems, setSettings } = useScenario();
  const asset = kind === "asset" ? baseAssets.find((a) => a.id === id) : undefined;
  const system = kind === "system" ? baseSystems.find((s) => s.id === id) : undefined;
  if (!asset && !system) return null;
  const sug: Suggestion = asset ? suggestForAsset(asset) : suggestForSystem(system!);

  const apply = (actions: SuggestedAction[]) => {
    setSettings((p) => {
      if (asset) {
        const cur = p.byAsset[asset.id] ?? defaultActions(asset);
        const next: typeof cur = { ...cur };
        for (const a of actions) (next as Record<string, unknown>)[a.lever] = { ...(next as Record<string, Record<string, unknown>>)[a.lever], ...a.patch };
        return { ...p, byAsset: { ...p.byAsset, [asset.id]: next } };
      }
      const cur = p.bySystem[system!.id] ?? defaultSystemActions(system!);
      const next: typeof cur = { ...cur };
      for (const a of actions) (next as Record<string, unknown>)[a.lever] = { ...(next as Record<string, Record<string, unknown>>)[a.lever], ...a.patch };
      return { ...p, bySystem: { ...p.bySystem, [system!.id]: next } };
    });
  };

  return (
    <div className="rounded-xl3 border border-brand-200 bg-brand-50/50 shadow-card p-5">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-brand-100 grid place-items-center shrink-0"><Lightbulb size={18} className="text-brand-700" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-brand-700 font-bold">Suggested for this source</div>
          <div className="mt-0.5 font-bold text-ink">{sug.headline}</div>
          <p className="text-xs text-ink-soft mt-1">{sug.why}</p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button onClick={() => apply(sug.actions)} className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-3.5 py-2 hover:bg-brand-600 transition-colors">Apply suggestion</button>
            {sug.altHeadline && sug.altActions && (
              <button onClick={() => apply(sug.altActions!)} className="text-sm font-medium text-brand-700 hover:underline">{sug.altHeadline}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add `SourceImpact`** (new component) — the prominent live now→after panel + CAPEX:

```tsx
function SourceImpact({ kind, id }: { kind: "asset" | "system"; id: string }) {
  const { baseAssets, baseSystems, settings } = useScenario();
  let baseT = 0, afterT = 0, capex = 0;
  if (kind === "asset") {
    const a = baseAssets.find((x) => x.id === id); if (!a) return null;
    baseT = combustionCO2e(a);
    const acts = settings.byAsset[a.id];
    if (acts) { const res = applyAssetActions(a, acts, settings.assumptions); afterT = Math.max(0, baseT - res.scope1AbatementT - res.fuelAbatementT); capex = capexForAsset(a, acts); }
    else afterT = baseT;
  } else {
    const s = baseSystems.find((x) => x.id === id); if (!s) return null;
    baseT = refrigerantCO2e(s);
    const acts = settings.bySystem[s.id];
    if (acts) {
      const after = applyRefrigerant(s, { transitionPct: acts.gasSwitch.enabled ? acts.gasSwitch.transitionPct : 0, altRefrigerant: acts.gasSwitch.altRefrigerant, leakImprovementPct: acts.leakFix.enabled ? acts.leakFix.leakImprovementPct : 0 });
      afterT = Math.max(0, after.newFugitiveT); capex = capexForSystem(acts);
    } else afterT = baseT;
  }
  const abated = Math.max(0, baseT - afterT);
  const cut = baseT > 0 ? abated / baseT : 0;
  return (
    <div className="sticky top-2 z-20 rounded-xl3 border border-line/60 bg-surface shadow-card p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Impact</span>
          <span className="text-2xl font-extrabold tabular-nums text-ink">{fmt(baseT)} <span className="text-sm text-ink-faint">→</span> {fmt(afterT)} <span className="text-sm font-semibold text-ink-soft">tCO₂e</span></span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right"><div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Cut</div><div className="text-lg font-extrabold tabular-nums text-brand-600">−{fmt(abated)} t · {pct(cut)}</div></div>
          <div className="text-right"><div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">CAPEX</div><div className="text-lg font-extrabold tabular-nums text-ink">{fmtMoney(capex)}</div></div>
        </div>
      </div>
      <div className="mt-3 h-2.5 rounded-full bg-surface-muted overflow-hidden flex">
        <div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${cut * 100}%` }} />
        <div className="h-full bg-ink/10" style={{ width: `${(1 - cut) * 100}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire into `SourceScenarioScreen`.** Insert the `SuggestionCard` and `SourceImpact` between the back button and the lever card:

```tsx
// refrigerant branch:
{back}
<SuggestionCard kind="system" id={sys.id} />
<SourceImpact kind="system" id={sys.id} />
<SystemActionCard system={sys} />
<AssumptionsCard seg="refrigerant" />

// combustion branch:
{back}
<SuggestionCard kind="asset" id={a.id} />
<SourceImpact kind="asset" id={a.id} />
<AssetActionCard asset={a} />
<AssumptionsCard seg={seg} />
```

- [ ] **Step 5: Remove the now-duplicate header `ImpactBar`** from `AssetActionCard` and `SystemActionCard` (the live panel above replaces it). In each card's header row, delete the `<ImpactBar base={...} after={...} />` element (and remove the surrounding wrapper if it leaves an empty flex slot). Leave the `ImpactBar` function defined only if still referenced; if not referenced anywhere after removal, delete the `ImpactBar` function too (search first).

- [ ] **Step 6: Add per-lever tips** inside the lever controls. Add a small note line at the end of each lever's content:
  - Electrify `ActionRow` children: `<p className="text-[11px] text-ink-faint mt-2">{electrifyTip(isMobile)}</p>`
  - Flex-fuel `ActionRow`: `<p className="text-[11px] text-ink-faint mt-2">{flexFuelTip()}</p>`
  - Fuel-switch: there is already a `blendNote` note; additionally ensure the drop-in limit reads via `fuelSwitchTip(ALT_FUELS[effectiveAlt].label, maxBlend, asset.category)` — either replace the existing `blendNote` paragraph's text with this, or add it; keep one concise tip (avoid two redundant notes).
  - Refrigerant `gasSwitch`: add `<p className="text-[11px] text-ink-faint mt-2">{gasSwitchTip(alt.label, alt.gwp)}</p>` (where `alt = REFRIGERANTS[gs.altRefrigerant]`, already in scope as `alt`).
  - Refrigerant `leakFix`: add `<p className="text-[11px] text-ink-faint mt-2">{leakFixTip()}</p>`.

- [ ] **Step 7: Update the test** `components/tabs/__tests__/builder-grouping.test.tsx`. READ it. Navigation is segment → click source box → source scenario screen (unchanged from the drill-down work). Add a describe block:
  - Navigate to a combustion source's scenario screen (use the existing seed + box click pattern). Assert the **Suggestion card** renders: `screen.getByText(/Suggested for this source/i)` and an `Apply suggestion` button.
  - Assert the **live impact** shows the now→after numbers (e.g. `screen.getByText(/tCO₂e/)` within the impact strip, or the "Impact" label + a "Cut" label).
  - Click **Apply suggestion**, then assert the recommended lever became active — e.g. the impact "Cut" now shows a non-zero `−… t` for a source with consumption, OR a lever toggle is now on. Keep it robust (find by role/text that exists post-apply).
  - Assert a lever tip is present (e.g. `screen.getByText(/drop-in limit is/i)` or `/COP/i`).
  Keep the existing home + drill-down assertions intact (the feasibility-hint test still navigates segment → box → scenario).

- [ ] **Step 8: Verify** — `npx vitest run components/tabs/__tests__/builder-grouping.test.tsx` passes; `npx tsc --noEmit` clean; `npm test` green; `npm run build` clean.

---

## Self-Review

**Spec coverage:**
- Suggestion engine derived from end-use/class profiles → Task 1 `suggestForAsset`/`suggestForSystem`. ✓
- Per-lever tips → Task 1 tip helpers + Task 2 Step 6. ✓
- Live impact (emissions now→after + cut + % + CAPEX committed) → Task 1 `capexFor*` + Task 2 `SourceImpact`. ✓
- CAPEX-only, no payback → `SourceImpact` shows CAPEX only. ✓
- Suggestion card with Apply + alternative → Task 2 `SuggestionCard`. ✓
- Screen layout order (suggestion → impact → levers → assumptions) → Task 2 Step 4. ✓
- Remove duplicate header ImpactBar → Task 2 Step 5. ✓
- No math/store change (apply only sets existing lever fields) → Global Constraints + atomic `setSettings`. ✓
- Scope 1 fuels + refrigerant only → covered; Scope 2 untouched. ✓

**Placeholder scan:** none — full code for `suggestions.ts`, `SuggestionCard`, `SourceImpact`; precise edits for wiring/tips/test.

**Type consistency:** `LeverKind`/`SuggestedAction`/`Suggestion` defined Task 1, used Task 2. `capexForAsset(asset, acts)`/`capexForSystem(acts)` signatures match call sites. `suggestForAsset`/`suggestForSystem` return `Suggestion`. `SuggestionCard`/`SourceImpact` both take `{ kind: "asset"|"system"; id }`. Apply uses `setSettings` with `defaultActions`/`defaultSystemActions` fallback (matches existing "Add plan" pattern).
