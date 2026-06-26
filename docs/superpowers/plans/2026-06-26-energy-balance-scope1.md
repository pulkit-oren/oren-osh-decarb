# Energy Balance (Scope 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A scenario-level "Energy balance" screen for Scope 1 — portfolio dials (electrify fossil %, renewable sourcing %, bio-blend %, low-GWP refrigerant %) that cascade to the real per-source levers, a live energy-mix bar + result vs a target line, and a transparent "suggest a mix" helper.

**Architecture:** A pure `lib/model/energy-balance.ts` builds a cascaded `LeverSettings` from dial values, computes the energy mix, and runs a stepwise suggest-heuristic via the existing pure `compute()`. A new `EnergyBalanceScreen` in `BuilderTab.tsx` holds dial state, applies the cascade via `setSettings`, reads the live `result`, and is reached from a new "Energy balance" entry on the modeller home (`view: "balance"`). Scope 1 only; Scope 2 electricity is not driven here.

**Tech Stack:** Next.js 16, React 19, TypeScript, vitest. `lib/model/*`, `components/tabs/BuilderTab.tsx`.

## Global Constraints

- Git repo; controller handles commit/deploy. Per-task gate = `npx tsc --noEmit` clean AND `npm test` green (and `npm run build` clean on the final task). Do NOT run `git`.
- Do NOT change scenario math/KPIs/store handlers. The dials only set existing lever fields + the `renewableSourcingPct` assumption via the store.
- **Scope 1 only** — do not touch `Scope2BuilderTab`/`useScope2`, Action plan, Compare, Data input.
- Cascade is **lossy by design** (re-dragging a dial re-distributes; documented in the UI). Dials are transient UI state — no new persisted fields.
- "Suggest a mix" is a stated stepwise heuristic (electrify → renewable → bio → refrigerant), NOT a least-cost optimiser.
- Reuse `DetailCard`/`SliderField` from `@/components/tabs/activity/fields`; `fmt`/`fmtMoney`/`pct`/`cn` from `@/lib/utils`; `CURRENCY` from `@/lib/defaults`.

## Reference — existing signatures (unchanged)

- `LeverSettings = { byAsset: Record<string, AssetActions>; bySystem: Record<string, SystemActions>; assumptions: GlobalAssumptions }` (`@/lib/model/types`); `GlobalAssumptions.renewableSourcingPct: number`.
- `compute(assets: CombustionAsset[], systems: RefrigerationSystem[], s: LeverSettings, baseYear?): ComputeResult` — pure; `result.kpis = { reduction2030, net2030, totalCapex, costPerTonne, yearsToTarget, onTrack2030 }` (`@/lib/model/index`).
- `applyAssetActions(asset, acts, assumptions)` → `{ ..., elecFraction, fuelFraction, flexFraction }` (`@/lib/model/segments`).
- `combustionBreakdown(asset).energyGJ` (`@/lib/model/baseline`).
- `defaultActions(asset)`, `defaultSystemActions(system)` (`@/lib/model/segments`).
- `endUseProfile(asset)`, `refrigClassProfile(system)` (`@/lib/model/end-use`, `@/lib/model/refrigerant-class`).
- `ALT_FUELS_BY_FUEL`, `maxBlendPctFor(category, altFuel)`, `RECOMMENDED_ALT_BY_SYSTEM` (`@/lib/model/factors`).
- Store: `useScenario()` → `{ baseAssets, baseSystems, settings, setSettings, result, baseYear }`.

---

### Task 1: Energy-balance engine (`lib/model/energy-balance.ts`)

**Files:**
- Create: `lib/model/energy-balance.ts`
- Test: `lib/model/__tests__/energy-balance.test.ts`

**Interfaces:**
- Produces: `BalanceDials` `{ electrifyPct, renewablePct, bioBlendPct, refrigPct }`; `applyDials(assets, systems, base, dials) → LeverSettings`; `energyMix(assets, settings) → { fossilFuelGJ, gridElecGJ, renewableGJ }`; `suggestMix(assets, systems, base, target, baseYear) → BalanceDials`.
- Consumes: the reference signatures above.

- [ ] **Step 1: Write the failing test** `lib/model/__tests__/energy-balance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyDials, energyMix, suggestMix } from "@/lib/model/energy-balance";
import type { CombustionAsset, RefrigerationSystem, LeverSettings } from "@/lib/model/types";
import { defaultActions } from "@/lib/model/segments";

const truck = (): CombustionAsset => ({ id: "t1", name: "Trucks", category: "mobile", fuelType: "diesel", unit: "L", annualVolume: 100000, opex: 0, remainingLife: 10, unitCount: 10, endUse: "truck" });
const base = (assets: CombustionAsset[]): LeverSettings => ({
  byAsset: Object.fromEntries(assets.map((a) => [a.id, defaultActions(a)])),
  bySystem: {},
  assumptions: { renewableSourcingPct: 50, gridEf: 0.71, recCostPerTonne: 800, carbonPricePerTonne: 2000, infraCapex: 15000000 },
});

describe("applyDials", () => {
  it("electrify dial sets feasible mobile sources to ~that share of the fleet", () => {
    const a = truck(); const s = applyDials([a], [], base([a]), { electrifyPct: 50, renewablePct: 50, bioBlendPct: 0, refrigPct: 0 });
    expect(s.byAsset[a.id].electrify.enabled).toBe(true);
    expect(s.byAsset[a.id].electrify.unitsToConvert).toBe(5);
  });
  it("renewable dial writes the global assumption", () => {
    const a = truck(); const s = applyDials([a], [], base([a]), { electrifyPct: 0, renewablePct: 80, bioBlendPct: 0, refrigPct: 0 });
    expect(s.assumptions.renewableSourcingPct).toBe(80);
  });
  it("does not mutate the base settings", () => {
    const a = truck(); const b = base([a]); const before = b.assumptions.renewableSourcingPct;
    applyDials([a], [], b, { electrifyPct: 50, renewablePct: 90, bioBlendPct: 0, refrigPct: 0 });
    expect(b.assumptions.renewableSourcingPct).toBe(before);
  });
});

describe("energyMix", () => {
  it("returns non-negative shares that sum to ~the total fuel energy", () => {
    const a = truck(); const s = applyDials([a], [], base([a]), { electrifyPct: 50, renewablePct: 50, bioBlendPct: 20, refrigPct: 0 });
    const m = energyMix([a], s);
    expect(m.fossilFuelGJ).toBeGreaterThanOrEqual(0);
    expect(m.gridElecGJ).toBeGreaterThanOrEqual(0);
    expect(m.renewableGJ).toBeGreaterThanOrEqual(0);
    expect(m.fossilFuelGJ + m.gridElecGJ + m.renewableGJ).toBeGreaterThan(0);
  });
});

describe("suggestMix", () => {
  it("raises dials toward a target and returns valid percentages", () => {
    const a = truck(); const d = suggestMix([a], [], base([a]), 0.3, 2025);
    expect(d.electrifyPct).toBeGreaterThanOrEqual(0);
    expect(d.electrifyPct).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run lib/model/__tests__/energy-balance.test.ts` → FAIL (module missing). (If a numeric expectation like `unitsToConvert === 5` or the `GlobalAssumptions` literal shape differs from the real type, read `lib/model/types.ts` and adjust the test literal to the real field set, keeping the behavioral assertions.)

- [ ] **Step 3: Create `lib/model/energy-balance.ts`:**

```ts
import { compute } from "./index";
import { combustionBreakdown } from "./baseline";
import { applyAssetActions, defaultActions, defaultSystemActions } from "./segments";
import { endUseProfile } from "./end-use";
import { refrigClassProfile } from "./refrigerant-class";
import { ALT_FUELS_BY_FUEL, maxBlendPctFor, RECOMMENDED_ALT_BY_SYSTEM } from "./factors";
import type { AltFuelId, CombustionAsset, LeverSettings, RefrigerationSystem } from "./types";

export interface BalanceDials { electrifyPct: number; renewablePct: number; bioBlendPct: number; refrigPct: number; }

const TARGET_YEAR = 2030;

function electrifyFeasible(a: CombustionAsset): boolean {
  const eu = endUseProfile(a);
  return eu ? eu.electrify.feasible === "easy" || eu.electrify.feasible === "yes" : true;
}
function bioAltFor(a: CombustionAsset): AltFuelId | null {
  const eu = endUseProfile(a);
  const compatible = ALT_FUELS_BY_FUEL[a.fuelType] ?? [];
  if (eu?.fuelSwitch.preferred && compatible.includes(eu.fuelSwitch.preferred)) return eu.fuelSwitch.preferred;
  return compatible[0] ?? null;
}

/** Pure: return a NEW LeverSettings with the dials cascaded onto the per-source levers. */
export function applyDials(assets: CombustionAsset[], systems: RefrigerationSystem[], base: LeverSettings, d: BalanceDials): LeverSettings {
  const byAsset = { ...base.byAsset };
  for (const a of assets) {
    const cur = byAsset[a.id] ?? defaultActions(a);
    const eu = endUseProfile(a);
    const electrify = { ...cur.electrify };
    if (d.electrifyPct > 0 && electrifyFeasible(a)) {
      electrify.enabled = true;
      electrify.targetYear = TARGET_YEAR;
      electrify.cop = eu?.electrify.cop ?? electrify.cop;
      if (a.category === "mobile") {
        electrify.unitsToConvert = Math.round(a.unitCount * (d.electrifyPct / 100));
        electrify.assetCapex = eu?.electrify.capexPerUnit ?? electrify.assetCapex;
      } else {
        electrify.capacityPct = d.electrifyPct;
      }
    } else if (d.electrifyPct === 0) {
      electrify.enabled = false;
    }
    const fuelSwitch = { ...cur.fuelSwitch };
    const alt = bioAltFor(a);
    if (d.bioBlendPct > 0 && alt) {
      fuelSwitch.enabled = true;
      fuelSwitch.altFuel = alt;
      fuelSwitch.blendPct = Math.min(d.bioBlendPct, maxBlendPctFor(a.category, alt));
      fuelSwitch.targetYear = TARGET_YEAR;
    } else if (d.bioBlendPct === 0) {
      fuelSwitch.enabled = false;
    }
    byAsset[a.id] = { ...cur, electrify, fuelSwitch };
  }
  const bySystem = { ...base.bySystem };
  for (const s of systems) {
    const cur = bySystem[s.id] ?? defaultSystemActions(s);
    const alt = refrigClassProfile(s)?.recommendedAlt ?? RECOMMENDED_ALT_BY_SYSTEM[s.systemType];
    const gasSwitch = d.refrigPct > 0
      ? { ...cur.gasSwitch, enabled: true, altRefrigerant: alt, transitionPct: d.refrigPct, targetYear: TARGET_YEAR }
      : { ...cur.gasSwitch, enabled: false };
    bySystem[s.id] = { ...cur, gasSwitch };
  }
  return { ...base, byAsset, bySystem, assumptions: { ...base.assumptions, renewableSourcingPct: d.renewablePct } };
}

/** Pure: approximate energy mix (GJ) for the given settings. Indicative visualization. */
export function energyMix(assets: CombustionAsset[], settings: LeverSettings): { fossilFuelGJ: number; gridElecGJ: number; renewableGJ: number } {
  let fossil = 0, elec = 0, bio = 0;
  for (const a of assets) {
    if (a.excluded) continue;
    const E = combustionBreakdown(a).energyGJ;
    const acts = settings.byAsset[a.id];
    const res = acts ? applyAssetActions(a, acts, settings.assumptions) : null;
    const eF = res?.elecFraction ?? 0;
    const fF = res?.fuelFraction ?? 0;
    elec += E * eF;
    bio += E * fF;
    fossil += E * Math.max(0, 1 - eF - fF);
  }
  const re = (settings.assumptions.renewableSourcingPct ?? 0) / 100;
  return { fossilFuelGJ: fossil, gridElecGJ: elec * (1 - re), renewableGJ: bio + elec * re };
}

/** Pure stepwise heuristic: raise dials (electrify → renewable → bio → refrigerant) until the
 *  projected 2030 reduction reaches `target` (0..1), else return the best reachable mix. */
export function suggestMix(assets: CombustionAsset[], systems: RefrigerationSystem[], base: LeverSettings, target: number, baseYear: number): BalanceDials {
  const dials: BalanceDials = { electrifyPct: 0, renewablePct: base.assumptions.renewableSourcingPct ?? 0, bioBlendPct: 0, refrigPct: 0 };
  const reductionFor = (d: BalanceDials) => compute(assets, systems, applyDials(assets, systems, base, d), baseYear).kpis.reduction2030;
  if (reductionFor(dials) >= target) return dials;
  const order: (keyof BalanceDials)[] = ["electrifyPct", "renewablePct", "bioBlendPct", "refrigPct"];
  for (const key of order) {
    for (let v = 10; v <= 100; v += 10) {
      dials[key] = v;
      if (reductionFor(dials) >= target) return dials;
    }
  }
  return dials;
}
```

- [ ] **Step 4: Run tests to verify they pass** — `npx vitest run lib/model/__tests__/energy-balance.test.ts` → PASS. (If `AssetActions`/`GlobalAssumptions` field names differ from the test's `base()` literal, fix the literal to the real shape — read `types.ts`.)

- [ ] **Step 5: Checkpoint** — `npx tsc --noEmit` clean; `npm test` green.

---

### Task 2: Energy Balance screen + entry point (UI)

**Files:**
- Modify: `components/tabs/BuilderTab.tsx`
- Test: `components/tabs/__tests__/builder-grouping.test.tsx`

**Interfaces:**
- Consumes Task 1: `applyDials`, `energyMix`, `suggestMix`, `type BalanceDials` from `@/lib/model/energy-balance`.
- Consumes existing: `useScenario`, `DetailCard`, `SliderField`, `fmt`/`fmtMoney`/`pct`, `cn`.

- [ ] **Step 1: Add imports** to `BuilderTab.tsx`:

```tsx
import { applyDials, energyMix, suggestMix, type BalanceDials } from "@/lib/model/energy-balance";
import { SliderField } from "@/components/tabs/activity/fields"; // ensure SliderField is in this import (DetailCard already is)
```

- [ ] **Step 2: Extend the router** to add the `"balance"` view. Update `BuilderTab`'s `view` union and routing:

```tsx
const [view, setView] = useState<"home" | "balance" | Seg | { seg: Seg; sourceId: string }>("home");
// ...
if (view === "home") return <ModellerHome onOpen={setView} onOpenBalance={() => setView("balance")} name={name} setName={setName} />;
if (view === "balance") return <EnergyBalanceScreen onBack={() => setView("home")} />;
if (typeof view === "string") { /* Seg → SegmentScreen, unchanged */ }
// object → SourceScenarioScreen, unchanged
```

- [ ] **Step 3: Add an "Energy balance" entry to `ModellerHome`.** Add an `onOpenBalance: () => void` prop to `ModellerHome`'s signature, and render a button below the segment cards (in the left column) — a dashed tile matching the app's style:

```tsx
<button onClick={onOpenBalance} className="group flex items-center gap-3 rounded-xl3 border-2 border-dashed border-brand-300 bg-brand-50/40 px-5 py-3 text-left hover:border-brand-400 hover:bg-brand-50 transition-colors shrink-0">
  <span className="w-9 h-9 rounded-xl bg-brand-100 grid place-items-center shrink-0"><Scale size={18} className="text-brand-700" /></span>
  <div className="min-w-0 flex-1">
    <span className="block font-bold text-ink">Energy balance</span>
    <span className="text-xs text-ink-soft">Balance the fuel / electricity / renewable mix to a target</span>
  </div>
  <ChevronDown size={18} className="-rotate-90 text-ink-soft/70 group-hover:text-ink transition-colors shrink-0" />
</button>
```
Add `Scale` to the `lucide-react` import.

- [ ] **Step 4: Add `EnergyBalanceScreen`** (new component):

```tsx
function EnergyBalanceScreen({ onBack }: { onBack: () => void }) {
  const { baseAssets, baseSystems, settings, setSettings, result, baseYear } = useScenario();
  const assets = baseAssets.filter((a) => !a.excluded);
  const systems = baseSystems.filter((s) => !s.excluded);
  const [dials, setDials] = useState<BalanceDials>({ electrifyPct: 0, renewablePct: settings.assumptions.renewableSourcingPct ?? 0, bioBlendPct: 0, refrigPct: 0 });
  const [targetPct, setTargetPct] = useState(50);

  const applyAndStore = (next: BalanceDials) => { setDials(next); setSettings((p) => applyDials(assets, systems, p, next)); };
  const set = (k: keyof BalanceDials, v: number) => applyAndStore({ ...dials, [k]: v });
  const onSuggest = () => applyAndStore(suggestMix(assets, systems, settings, targetPct / 100, baseYear));

  const mix = energyMix(assets, settings);
  const totalGJ = mix.fossilFuelGJ + mix.gridElecGJ + mix.renewableGJ;
  const share = (v: number) => (totalGJ > 0 ? (v / totalGJ) * 100 : 0);
  const k = result.kpis;
  const onTrack = k.reduction2030 >= targetPct / 100;

  return (
    <div className="screen-in flex flex-col gap-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ChevronDown size={16} className="rotate-90" /> Back to modeller</button>

      <div className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60">
        <h1 className="text-2xl font-extrabold text-ink leading-tight">Energy balance</h1>
        <p className="text-sm text-ink-soft mt-0.5">Shift the fuel / electricity / renewable mix and watch Scope 1 move toward your target. Dials set the per-source levers — open any source to fine-tune.</p>
      </div>

      {/* result vs target */}
      <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-5 flex flex-wrap items-center gap-x-8 gap-y-3">
        <label className="flex items-center gap-2 text-sm"><span className="text-ink-soft font-medium">Target</span>
          <input type="number" value={targetPct} min={0} max={100} onChange={(e) => setTargetPct(Math.max(0, Math.min(100, Number(e.target.value))))} className="w-20 text-right tabular-nums rounded-lg border border-line px-2 py-1.5" /> <span className="text-ink-faint text-sm">% by 2030</span>
        </label>
        <div><div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Reduction 2030</div><div className={cn("text-2xl font-extrabold tabular-nums", onTrack ? "text-brand-600" : "text-amber-600")}>{pct(k.reduction2030)}</div></div>
        <div><div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Net 2030</div><div className="text-2xl font-extrabold tabular-nums text-ink">{fmt(k.net2030)} t</div></div>
        <div><div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Total CAPEX</div><div className="text-2xl font-extrabold tabular-nums text-ink">{fmtMoney(k.totalCapex)}</div></div>
        <span className={cn("ml-auto text-xs font-bold rounded-full px-3 py-1", onTrack ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700")}>{onTrack ? "On track to target" : "Below target"}</span>
      </div>

      {/* mix bar */}
      <DetailCard title="Energy mix">
        <div className="flex h-3 rounded-full overflow-hidden bg-surface-muted">
          <div className="h-full bg-slate-500" style={{ width: `${share(mix.fossilFuelGJ)}%` }} title="Fossil fuel" />
          <div className="h-full bg-sky-500" style={{ width: `${share(mix.gridElecGJ)}%` }} title="Grid electricity" />
          <div className="h-full bg-brand-500" style={{ width: `${share(mix.renewableGJ)}%` }} title="Renewable" />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-500" /> Fossil fuel <strong className="tabular-nums">{Math.round(share(mix.fossilFuelGJ))}%</strong></span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> Grid electricity <strong className="tabular-nums">{Math.round(share(mix.gridElecGJ))}%</strong></span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-500" /> Renewable <strong className="tabular-nums">{Math.round(share(mix.renewableGJ))}%</strong></span>
        </div>
        <p className="text-[11px] text-ink-faint mt-2">Indicative energy split across Scope 1 fuel use. Scope 2 purchased electricity is managed on the Scope 2 side.</p>
      </DetailCard>

      {/* dials */}
      <DetailCard title="Balance dials">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          <SliderField label="Electrify fossil energy" suffix="%" min={0} max={100} value={dials.electrifyPct} onChange={(v) => set("electrifyPct", v)} hint="Turns on electrification across feasible sources to ~this share (skips hard-to-electrify like kilns)." />
          <SliderField label="Renewable sourcing" suffix="%" min={0} max={100} value={dials.renewablePct} onChange={(v) => set("renewablePct", v)} hint="Clean share of the new electricity (sets the global assumption)." />
          <SliderField label="Bio-blend remaining fuel" suffix="%" min={0} max={100} value={dials.bioBlendPct} onChange={(v) => set("bioBlendPct", v)} hint="Drop-in bio blend on sources still on fuel (capped at each one's limit)." />
          <SliderField label="Low-GWP refrigerant" suffix="%" min={0} max={100} value={dials.refrigPct} onChange={(v) => set("refrigPct", v)} hint="Transition share to the recommended low-GWP gas across cooling systems." />
        </div>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button onClick={onSuggest} className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-3.5 py-2 hover:bg-brand-600 transition-colors">Suggest a mix for {targetPct}% by 2030</button>
          <span className="text-[11px] text-ink-faint">Heuristic: layers electrification first, then renewables, then bio-blend, then refrigerant — a starting point, not an optimum.</span>
        </div>
      </DetailCard>
    </div>
  );
}
```

- [ ] **Step 5: Verify the `ModellerHome` call site** passes `onOpenBalance` (Step 2 already wires it). Confirm `ModellerHome`'s prop type adds `onOpenBalance: () => void`.

- [ ] **Step 6: Update the test** `components/tabs/__tests__/builder-grouping.test.tsx`. READ it. Add a describe block:
  - Render the modeller (home). Assert the **"Energy balance"** entry is present (`screen.getByText("Energy balance")`).
  - Click it → assert the Energy Balance screen renders: the **"Balance dials"** card and the four dial labels (`Electrify fossil energy`, `Renewable sourcing`, `Bio-blend remaining fuel`, `Low-GWP refrigerant`), plus the **"Suggest a mix"** button.
  - Click **"Suggest a mix…"** and assert it does not crash and the reduction readout is present (`screen.getByText(/Reduction 2030/i)`).
  Keep all existing home/segment/source/suggestion tests intact.

- [ ] **Step 7: Verify** — `npx vitest run components/tabs/__tests__/builder-grouping.test.tsx` passes; `npx tsc --noEmit` clean; `npm test` green; `npm run build` clean.

---

## Self-Review

**Spec coverage (Scope 1 portion):**
- Placement: "Energy balance" entry on modeller home + `view: "balance"` → Task 2 Steps 2–3. ✓
- Dials cascade to per-source levers (electrify/bio/refrigerant) + renewable assumption → Task 1 `applyDials` + Task 2 `set`. ✓
- Live result vs target line → Task 2 result strip (`result.kpis`, `onTrack`). ✓
- Energy mix bar → Task 1 `energyMix` + Task 2 mix card. ✓
- Suggest-a-mix heuristic (stepwise, transparent, not optimiser) → Task 1 `suggestMix` + Task 2 button. ✓
- Cascade pure & non-mutating; truth lives in per-source settings → `applyDials` returns new `LeverSettings`; `setSettings` applies it. ✓
- Scope 1 only; S2 noted as context → mix note + Global Constraints. ✓
- No new persisted fields; no math/store change → dials are local state; only existing `setSettings`/assumptions used. ✓

**Placeholder scan:** none — full code for `energy-balance.ts` and `EnergyBalanceScreen`; precise router/home/test edits.

**Type consistency:** `BalanceDials` defined Task 1, used Task 2. `applyDials(assets, systems, base, dials) → LeverSettings`, `energyMix(assets, settings)`, `suggestMix(assets, systems, base, target, baseYear)` signatures consistent across tasks and call sites. `view` union extended to include `"balance"`; `ModellerHome` gains `onOpenBalance`. `result.kpis.totalCapex` used (confirmed present in `index.ts`).
