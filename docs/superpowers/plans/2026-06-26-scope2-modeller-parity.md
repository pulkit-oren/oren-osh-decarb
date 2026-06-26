# Scope 2 Modeller Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bring the Scope 2 modeller (`Scope2BuilderTab`) to parity with Scope 1 — a Data-Input-style home with facility boxes + results panel, a per-facility scenario screen with restyled efficiency/solar levers + suggestions + live impact, a portfolio Procurement screen, and a Scope-2 energy balance.

**Architecture:** Two new pure modules (`lib/scope2/model/suggestions.ts`, `lib/scope2/model/energy-balance.ts`) derive suggestions/impact/CAPEX and the balance cascade/mix/suggest from the existing pure `computeScope2`/`applyEfficiency`/`applyGeneration`. `Scope2BuilderTab` is rebuilt into a router (`home | procurement | balance | {facilityId}`) reusing the activity `fields.tsx` primitives and mirroring the shipped Scope-1 components in `components/tabs/BuilderTab.tsx`. No Scope 2 compute/store change.

**Tech Stack:** Next.js 16, React 19, TypeScript, vitest. `lib/scope2/*`, `components/scope2/BuilderTab.tsx`.

## Global Constraints

- Git repo; controller handles commit/deploy. Per-task gate = `npx tsc --noEmit` clean AND `npm test` green (and `npm run build` clean on the final task). Do NOT run `git`.
- Do NOT change Scope 2 compute math (`computeScope2`, `applyEfficiency`, `applyGeneration`), the store handlers, or lever semantics. New code only reads them / sets existing lever fields.
- Do NOT touch Scope 1, Data input, Action plan, or Compare.
- Procurement is a single **portfolio** lever (`levers.procurement`), not per-facility.
- Reuse activity primitives from `@/components/tabs/activity/fields` (`DetailCard`, `SliderField`, `ToggleSwitch`, `NumField`, `SelectField`) + `@/components/tabs/activity/Collapsible`; `groupByBu` from `@/lib/group-by-bu`; `fmt`/`fmtMoney`/`pct`/`fmtNum`/`cn` from `@/lib/utils`. Mirror the Scope-1 components in `components/tabs/BuilderTab.tsx` (`ModellerHome`, `SourceBox`, `SuggestionCard`, `SourceImpact`, `EnergyBalanceScreen`) as the visual pattern.

## Reference — Scope 2 model (confirmed, unchanged)

- `useScope2()` → `{ baseFacilities: Facility[], levers: { byFacility: Record<id, FacilityActions>, procurement: ProcurementSettings }, result, updateFacilityAction(id, "efficiency"|"generation", patch), updateProcurement(patch), setLevers, resetLevers, saveScenario(name), deleteScenario(id), scenarios, baseYear }`. (READ `lib/scope2/store.tsx` to confirm the apply-all setter name — likely `setLevers`; if absent, use `updateFacilityAction`/`updateProcurement` per field.)
- `computeScope2(facilities, levers, baseYear)` — pure; `result.kpis = { baseLocationT, marketBaselineT, locationNowT, marketNowT, reduction2030, totalCapex, annualOpexDelta, paybackYears, costPerTonne, coveragePct, target2030, onTrack2030 }`; `result.perFacility[id] = { eff, gen }`.
- `applyEfficiency(f, a) → { ledKwh, motorKwh, bmsKwh, savedKwh, residualLoadKwh, capex, opexSaving }` (pure); `applyGeneration(f, a, residualLoadKwh) → { usedOnSiteKwh, capex, ... }` (pure). Imports from `@/lib/scope2/model/efficiency` and `.../generation`.
- `defaultFacilityActions(f) → { efficiency: EfficiencyAction, generation: GenerationAction }` (`@/lib/scope2/defaults`).
- `facilityTypeProfile(f) → { label, loadSplit, solar: { feasible: "strong"|"good"|"moderate"|"limited", note } } | undefined` (`@/lib/scope2/model/facility-type`).
- `Facility`: `{ id, name, bu?, annualLoadKwh, gridEf, roofSpaceM2, existingSolarKwp?, loadSplit {lightingPct,motorPct,hvacPct}, facilityType?, excluded? }`. `M2_PER_KW` from `@/lib/scope2/model/constants`.
- `EfficiencyAction {enabled, ledPct, motorPct, bmsPct, ledCapex, motorCapex, bmsCapex, startYear, targetYear}`; `GenerationAction {enabled, solarKwp, batteryKwh, exportMode, solarCapexPerKw, batteryCapexPerKwh, subsidyPct, startYear, targetYear}`; `ProcurementSettings {enabled, ppaPct, greenTariffPct, recPct, ppaStrikeDeltaPerKwh, greenTariffPremiumPerKwh, recPricePerKwh, re100Exclusion, startYear, targetYear}`.
- Per-facility baseline location emissions = `f.annualLoadKwh × f.gridEf / 1000`.

---

### Task 1: Scope 2 suggestions + impact engine (`lib/scope2/model/suggestions.ts`)

**Files:**
- Create: `lib/scope2/model/suggestions.ts`
- Test: `lib/scope2/model/__tests__/suggestions.test.ts`

**Interfaces:**
- Produces: `Scope2LeverKind = "efficiency" | "generation"`; `Scope2SuggestedAction { lever: Scope2LeverKind; patch: Record<string, number|string|boolean> }`; `Scope2Suggestion { headline; why; actions; altHeadline?; altActions? }`; `suggestForFacility(f): Scope2Suggestion`; `capexForFacility(f, acts): number`; `facilityImpact(f, acts): { baseT; afterT }`; `roofCapKwp(f): number`; tip helpers `efficiencyTip(f)`, `solarTip(f)`.
- Consumes: `applyEfficiency`, `applyGeneration`, `facilityTypeProfile`, `M2_PER_KW`, types.

- [ ] **Step 1: Write the failing test** `lib/scope2/model/__tests__/suggestions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { suggestForFacility, capexForFacility, facilityImpact, roofCapKwp } from "@/lib/scope2/model/suggestions";
import { defaultFacilityActions } from "@/lib/scope2/defaults";
import type { Facility } from "@/lib/scope2/model/types";

function fac(over: Partial<Facility>): Facility {
  return { id: "f1", name: "Plant", annualLoadKwh: 1_000_000, tariffPerKwh: 9, loadSplit: { lightingPct: 55, motorPct: 15, hvacPct: 15 }, roofSpaceM2: 5500, peakLoadKw: 0, gridEf: 0.71, irradiance: 1500, isolated: false, existingSolarKwp: 0, ...over } as Facility;
}

describe("suggestForFacility", () => {
  it("recommends efficiency (LED for lighting-heavy) and includes a solar action when roof headroom exists", () => {
    const s = suggestForFacility(fac({}));
    const eff = s.actions.find((a) => a.lever === "efficiency");
    expect(eff).toBeTruthy();
    expect(eff!.patch.enabled).toBe(true);
    expect(Number(eff!.patch.ledPct)).toBeGreaterThan(0);
    // 5500 m2 / 5.5 = 1000 kWp headroom → solar action present (primary or alternative)
    const hasSolar = [...s.actions, ...(s.altActions ?? [])].some((a) => a.lever === "generation");
    expect(hasSolar).toBe(true);
  });
});

describe("capexForFacility / facilityImpact", () => {
  it("baseT = load × gridEf / 1000 and afterT is lower once levers cut load", () => {
    const f = fac({});
    const acts = defaultFacilityActions(f);
    acts.efficiency = { ...acts.efficiency, enabled: true, ledPct: 100, motorPct: 0, bmsPct: 0 };
    const imp = facilityImpact(f, acts);
    expect(imp.baseT).toBeCloseTo((f.annualLoadKwh * f.gridEf) / 1000, 3);
    expect(imp.afterT).toBeLessThan(imp.baseT);
    expect(capexForFacility(f, acts)).toBeGreaterThanOrEqual(0);
  });
  it("roofCapKwp = roofSpaceM2 / M2_PER_KW − existing", () => {
    expect(roofCapKwp(fac({ roofSpaceM2: 5500, existingSolarKwp: 0 }))).toBeCloseTo(1000, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run lib/scope2/model/__tests__/suggestions.test.ts` → FAIL. (If `EfficiencyResult`/`GenerationResult` field names or a numeric differ, read `efficiency.ts`/`generation.ts` and adjust the test's expected numbers, keeping the behavioral assertions.)

- [ ] **Step 3: Create `lib/scope2/model/suggestions.ts`:**

```ts
import { applyEfficiency } from "./efficiency";
import { applyGeneration } from "./generation";
import { facilityTypeProfile } from "./facility-type";
import { M2_PER_KW } from "./constants";
import type { Facility, FacilityActions } from "./types";

export type Scope2LeverKind = "efficiency" | "generation";
export interface Scope2SuggestedAction { lever: Scope2LeverKind; patch: Record<string, number | string | boolean>; }
export interface Scope2Suggestion { headline: string; why: string; actions: Scope2SuggestedAction[]; altHeadline?: string; altActions?: Scope2SuggestedAction[]; }

const TARGET_YEAR = 2030;

export function roofCapKwp(f: Facility): number {
  return Math.max(0, f.roofSpaceM2 / M2_PER_KW - (f.existingSolarKwp ?? 0));
}

export function capexForFacility(f: Facility, acts: FacilityActions): number {
  let c = 0;
  if (acts.efficiency.enabled) c += applyEfficiency(f, acts.efficiency).capex;
  if (acts.generation.enabled) {
    const residual = acts.efficiency.enabled ? applyEfficiency(f, acts.efficiency).residualLoadKwh : f.annualLoadKwh;
    c += applyGeneration(f, acts.generation, residual).capex;
  }
  return c;
}

export function facilityImpact(f: Facility, acts: FacilityActions): { baseT: number; afterT: number } {
  const baseT = (f.annualLoadKwh * f.gridEf) / 1000;
  const eff = acts.efficiency.enabled ? applyEfficiency(f, acts.efficiency) : null;
  const residual = eff ? eff.residualLoadKwh : f.annualLoadKwh;
  const gen = acts.generation.enabled ? applyGeneration(f, acts.generation, residual) : null;
  const savedKwh = (eff?.savedKwh ?? 0) + (gen?.usedOnSiteKwh ?? 0);
  const afterT = Math.max(0, baseT - (savedKwh * f.gridEf) / 1000);
  return { baseT, afterT };
}

export function suggestForFacility(f: Facility): Scope2Suggestion {
  const prof = facilityTypeProfile(f);
  const ls = f.loadSplit;
  const cap = roofCapKwp(f);
  const solarStrong = prof ? prof.solar.feasible === "strong" || prof.solar.feasible === "good" : cap > 0;

  const efficiency: Scope2SuggestedAction = {
    lever: "efficiency",
    patch: { enabled: true, ledPct: ls.lightingPct > 0 ? 100 : 0, motorPct: ls.motorPct > 0 ? 100 : 0, bmsPct: ls.hvacPct > 0 ? 100 : 0, targetYear: TARGET_YEAR },
  };
  const solar: Scope2SuggestedAction | null = cap > 0
    ? { lever: "generation", patch: { enabled: true, solarKwp: Math.round(cap), targetYear: TARGET_YEAR } }
    : null;

  const dominant = ls.lightingPct >= ls.motorPct && ls.lightingPct >= ls.hvacPct ? "lighting (LED)"
    : ls.motorPct >= ls.hvacPct ? "motors (VFDs)" : "HVAC (BMS)";

  if (solar && solarStrong) {
    return {
      headline: `Add ${Math.round(cap)} kWp solar + efficiency by ${TARGET_YEAR}`,
      why: prof?.solar.note ?? `Roof fits ~${Math.round(cap)} kWp; pair it with ${dominant} efficiency.`,
      actions: [solar, efficiency],
      altHeadline: "Or start with efficiency only",
      altActions: [efficiency],
    };
  }
  return {
    headline: `Cut load with efficiency — ${dominant} first`,
    why: solar ? `Roof solar is limited here; lead with ${dominant}.` : `No roof headroom; lead with ${dominant}.`,
    actions: [efficiency],
    altHeadline: solar ? `Or add ${Math.round(cap)} kWp solar` : undefined,
    altActions: solar ? [solar] : undefined,
  };
}

export const efficiencyTip = (f: Facility) => {
  const ls = f.loadSplit;
  const d = ls.lightingPct >= ls.motorPct && ls.lightingPct >= ls.hvacPct ? "Lighting-heavy load → LED is the quick win."
    : ls.motorPct >= ls.hvacPct ? "Motor-heavy load → VFDs give the biggest cut." : "HVAC-heavy load → a BMS pays back well.";
  return d;
};
export const solarTip = (f: Facility) => `Roof fits about ${Math.round(roofCapKwp(f))} kWp of new solar (${M2_PER_KW} m²/kW).`;
```

- [ ] **Step 4: Run tests to verify they pass** — `npx vitest run lib/scope2/model/__tests__/suggestions.test.ts` → PASS.
- [ ] **Step 5: Checkpoint** — `npx tsc --noEmit` clean; `npm test` green.

---

### Task 2: Scope 2 energy-balance engine (`lib/scope2/model/energy-balance.ts`)

**Files:**
- Create: `lib/scope2/model/energy-balance.ts`
- Test: `lib/scope2/model/__tests__/energy-balance.test.ts`

**Interfaces:**
- Produces: `BalanceDials2 { efficiencyPct; solarPct; procurementPct }`; `applyDials2(facilities, base: Scope2Levers, dials): Scope2Levers`; `energyMix2(facilities, levers): { gridKwh; renewableKwh }`; `suggestMix2(facilities, base, target, baseYear): BalanceDials2`.
- Consumes: `computeScope2` (`./index`), `applyEfficiency`/`applyGeneration`, `defaultFacilityActions`, `roofCapKwp` (Task 1), types.

- [ ] **Step 1: Write the failing test** `lib/scope2/model/__tests__/energy-balance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyDials2, energyMix2, suggestMix2 } from "@/lib/scope2/model/energy-balance";
import { DEFAULT_PROCUREMENT, defaultFacilityActions } from "@/lib/scope2/defaults";
import type { Facility, Scope2Levers } from "@/lib/scope2/model/types";

function fac(over: Partial<Facility>): Facility {
  return { id: "f1", name: "Plant", annualLoadKwh: 1_000_000, tariffPerKwh: 9, loadSplit: { lightingPct: 55, motorPct: 15, hvacPct: 15 }, roofSpaceM2: 5500, peakLoadKw: 0, gridEf: 0.71, irradiance: 1500, isolated: false, existingSolarKwp: 0, ...over } as Facility;
}
const base = (fs: Facility[]): Scope2Levers => ({ byFacility: Object.fromEntries(fs.map((f) => [f.id, defaultFacilityActions(f)])), procurement: { ...DEFAULT_PROCUREMENT } });

describe("applyDials2", () => {
  it("efficiency dial enables + sets LED/VFD/BMS; does not mutate base", () => {
    const f = fac({}); const b = base([f]);
    const next = applyDials2([f], b, { efficiencyPct: 80, solarPct: 0, procurementPct: 0 });
    expect(next.byFacility[f.id].efficiency.enabled).toBe(true);
    expect(next.byFacility[f.id].efficiency.ledPct).toBe(80);
    expect(b.byFacility[f.id].efficiency.enabled).toBe(false); // base untouched
  });
  it("procurement dial enables and sets clean coverage", () => {
    const f = fac({}); const next = applyDials2([f], base([f]), { efficiencyPct: 0, solarPct: 0, procurementPct: 60 });
    expect(next.procurement.enabled).toBe(true);
    expect(next.procurement.ppaPct).toBe(60);
  });
});

describe("energyMix2 + suggestMix2", () => {
  it("mix shares are non-negative and suggest returns valid dials", () => {
    const f = fac({}); const b = base([f]);
    const m = energyMix2([f], applyDials2([f], b, { efficiencyPct: 50, solarPct: 50, procurementPct: 50 }));
    expect(m.gridKwh).toBeGreaterThanOrEqual(0);
    expect(m.renewableKwh).toBeGreaterThanOrEqual(0);
    const d = suggestMix2([f], b, 0.3, 2025);
    expect(d.efficiencyPct).toBeGreaterThanOrEqual(0);
    expect(d.efficiencyPct).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run lib/scope2/model/__tests__/energy-balance.test.ts` → FAIL. (Adjust literals to the real `ProcurementSettings`/`FacilityActions` shape if needed — read `types.ts`/`defaults.ts`.)

- [ ] **Step 3: Create `lib/scope2/model/energy-balance.ts`:**

```ts
import { computeScope2 } from "./index";
import { applyEfficiency } from "./efficiency";
import { applyGeneration } from "./generation";
import { defaultFacilityActions } from "../defaults";
import { roofCapKwp } from "./suggestions";
import type { Facility, Scope2Levers } from "./types";

export interface BalanceDials2 { efficiencyPct: number; solarPct: number; procurementPct: number; }
const TARGET_YEAR = 2030;

export function applyDials2(facilities: Facility[], base: Scope2Levers, d: BalanceDials2): Scope2Levers {
  const byFacility = { ...base.byFacility };
  for (const f of facilities) {
    const cur = byFacility[f.id] ?? defaultFacilityActions(f);
    const efficiency = d.efficiencyPct > 0
      ? { ...cur.efficiency, enabled: true, ledPct: d.efficiencyPct, motorPct: d.efficiencyPct, bmsPct: d.efficiencyPct, targetYear: TARGET_YEAR }
      : { ...cur.efficiency, enabled: false };
    const cap = roofCapKwp(f);
    const solarKwp = Math.round(cap * (d.solarPct / 100));
    const generation = d.solarPct > 0 && cap > 0
      ? { ...cur.generation, enabled: true, solarKwp, targetYear: TARGET_YEAR }
      : { ...cur.generation, enabled: false };
    byFacility[f.id] = { ...cur, efficiency, generation };
  }
  const clean = Math.max(0, Math.min(100, d.procurementPct));
  const procurement = d.procurementPct > 0
    ? { ...base.procurement, enabled: true, ppaPct: clean, greenTariffPct: 0, recPct: 0, targetYear: TARGET_YEAR }
    : { ...base.procurement, enabled: false };
  return { byFacility, procurement };
}

/** Indicative remaining-electricity mix (post-efficiency): grid vs renewable. */
export function energyMix2(facilities: Facility[], levers: Scope2Levers): { gridKwh: number; renewableKwh: number } {
  let grid = 0, renew = 0;
  const procClean = levers.procurement.enabled ? Math.min(100, levers.procurement.ppaPct + levers.procurement.greenTariffPct + levers.procurement.recPct) / 100 : 0;
  for (const f of facilities) {
    if (f.excluded) continue;
    const acts = levers.byFacility[f.id] ?? defaultFacilityActions(f);
    const eff = acts.efficiency.enabled ? applyEfficiency(f, acts.efficiency) : null;
    const residual = eff ? eff.residualLoadKwh : f.annualLoadKwh;
    const gen = acts.generation.enabled ? applyGeneration(f, acts.generation, residual) : null;
    const onSite = gen?.usedOnSiteKwh ?? 0;
    const gridDraw = Math.max(0, residual - onSite);
    renew += onSite + gridDraw * procClean;
    grid += gridDraw * (1 - procClean);
  }
  return { gridKwh: grid, renewableKwh: renew };
}

/** Stepwise heuristic: efficiency → solar → procurement until 2030 reduction ≥ target, via pure compute. */
export function suggestMix2(facilities: Facility[], base: Scope2Levers, target: number, baseYear: number): BalanceDials2 {
  const dials: BalanceDials2 = { efficiencyPct: 0, solarPct: 0, procurementPct: 0 };
  const reductionFor = (d: BalanceDials2) => computeScope2(facilities, applyDials2(facilities, base, d), baseYear).kpis.reduction2030;
  if (reductionFor(dials) >= target) return dials;
  const order: (keyof BalanceDials2)[] = ["efficiencyPct", "solarPct", "procurementPct"];
  for (const key of order) {
    for (let v = 10; v <= 100; v += 10) { dials[key] = v; if (reductionFor(dials) >= target) return dials; }
  }
  return dials;
}
```

- [ ] **Step 4: Run tests** — `npx vitest run lib/scope2/model/__tests__/energy-balance.test.ts` → PASS.
- [ ] **Step 5: Checkpoint** — `npx tsc --noEmit` clean; `npm test` green.

---

### Task 3: Rebuild `Scope2BuilderTab` — home + facility drill-down + scenario + procurement (UI)

**Files:**
- Modify (rebuild): `components/scope2/BuilderTab.tsx`
- Test: `components/scope2/__tests__/render.test.tsx` (extend) — confirm the real path by listing `components/scope2/__tests__/`.

**Interfaces:**
- Consumes Task 1 (`suggestForFacility`, `capexForFacility`, `facilityImpact`, `roofCapKwp`, `efficiencyTip`, `solarTip`), the activity primitives, `groupByBu`, and the existing `useScope2` handlers + `computeScope2` result.

**Approach:** READ both `components/tabs/BuilderTab.tsx` (the Scope-1 pattern: `ModellerHome`, `SourceBox`, `SuggestionCard`, `SourceImpact`, router) and the current `components/scope2/BuilderTab.tsx` (the existing Efficiency / Solar / Procurement lever JSX to restyle). Rebuild `Scope2BuilderTab` mirroring the Scope-1 structure with Scope-2 levers.

- [ ] **Step 1:** Add a `view` router to `Scope2BuilderTab`: `const [view, setView] = useState<"home" | "procurement" | "balance" | { facilityId: string }>("home");`. Render: `"home"` → `Scope2Home`; `"procurement"` → `ProcurementScreen`; `"balance"` → `Scope2EnergyBalanceScreen` (Task 4 — for now render a placeholder `null`/"coming" guard or wire after Task 4); object → `FacilityScenarioScreen`. Order the checks: `view === "home"`, then `=== "procurement"`, then `=== "balance"`, then object.

- [ ] **Step 2: `Scope2Home`** — mirror Scope-1 `ModellerHome`. Left column: `groupByBu(baseFacilities.filter(f=>!f.excluded))` → for each facility a `FacilityBox` (button) showing `f.name`, sublabel `${facilityTypeProfile(f)?.label ?? "Facility"}${f.bu ? " · "+f.bu : ""}`, abatement `−${fmt(facilityImpact(f, levers.byFacility[f.id] ?? defaultFacilityActions(f)).baseT - facilityImpact(...).afterT)} t` (compute once), `#active levers` (count `efficiency.enabled + generation.enabled`), chevron → `setView({ facilityId: f.id })`. Below the list: a **Procurement** tile → `setView("procurement")` and an **Energy balance** tile → `setView("balance")` (dashed tiles like Scope-1's Energy-balance tile). Right column: brand-gradient results panel with `result.kpis`: **Market-based net** `fmt(k.marketNowT)` t, **Reduction 2030** `pct(k.reduction2030)`, **OPEX Δ** `fmtMoney(k.annualOpexDelta)`/yr, **Total CAPEX** `fmtMoney(k.totalCapex)`, on-track pill (`k.onTrack2030`), Save scenario input (`saveScenario`) + saved chips (`scenarios`, `setLevers`/load + `deleteScenario`) + Reset (`resetLevers`).

- [ ] **Step 3: `FacilityScenarioScreen`** ({ facilityId, onBack }) — mirror Scope-1 `SourceScenarioScreen`:
  - Back button "← Back to facilities".
  - `<Scope2SuggestionCard facilityId={facilityId} />` (Step 4).
  - `<FacilityImpact facilityId={facilityId} />` (Step 5).
  - **Efficiency** `DetailCard`: `ToggleSwitch` (enabled via `updateFacilityAction(id, "efficiency", { enabled })`); `SliderField` for LED %, VFD/Motor %, BMS % (`ledPct/motorPct/bmsPct`, suffix "%"); Advanced `Collapsible` with `NumField`s for `ledCapex/motorCapex/bmsCapex` + target year (clamp 2021–2050); the `efficiencyTip(f)` note. (Restyle the existing efficiency JSX in the current file into this form.)
  - **Solar / battery** `DetailCard`: `SliderField` "Solar PV capacity" `value={gen.solarKwp}` `min={0}` `max={Math.max(1, Math.round(roofCapKwp(f)))}` suffix " kWp"; Advanced `NumField`s (`batteryKwh`, `solarCapexPerKw`, `batteryCapexPerKwh`, `subsidyPct`, years); `solarTip(f)` note; ToggleSwitch enable.
  - Use `updateFacilityAction(facilityId, "efficiency"|"generation", patch)` for every control (preserve current handlers exactly; only widgets change).

- [ ] **Step 4: `Scope2SuggestionCard`** ({ facilityId }) — mirror Scope-1 `SuggestionCard`. Get `f`, `sug = suggestForFacility(f)`. Apply atomically: `updateFacilityAction` can only patch one lever at a time, so loop the suggestion actions: for each `a` in `sug.actions`, `updateFacilityAction(f.id, a.lever, a.patch)`. (Each `a.patch` includes `enabled:true`; `updateFacilityAction` merges into the existing/default lever — confirm it falls back to `defaultFacilityActions` when none exists by reading the store; if it doesn't, first ensure the facility has actions via the store's create path.) Render headline + why + "Apply suggestion" + alternative, like Scope-1.

- [ ] **Step 5: `FacilityImpact`** ({ facilityId }) — mirror Scope-1 `SourceImpact`. `const { baseT, afterT } = facilityImpact(f, levers.byFacility[f.id] ?? defaultFacilityActions(f)); const capex = capexForFacility(f, ...)`. Sticky strip: `fmt(baseT) → fmt(afterT)` tCO₂e, `−fmt(abated) t · pct(cut)`, `CAPEX fmtMoney(capex)`, animated bar (`transition-all duration-500`).

- [ ] **Step 6: `ProcurementScreen`** ({ onBack }) — back button + a `DetailCard` "Procurement (all facilities)": `ToggleSwitch` (`updateProcurement({ enabled })`), `SliderField`s for PPA/VPPA (`ppaPct`), Green tariff (`greenTariffPct`), RECs (`recPct`), Advanced `Collapsible` with `NumField`s (`ppaStrikeDeltaPerKwh`, `greenTariffPremiumPerKwh`, `recPricePerKwh`), a RE100-exclusion `ToggleSwitch` (`re100Exclusion`), years, and the cost readout `fmtMoney(result.procurement.annualCost)/yr`. (Restyle the existing procurement JSX.)

- [ ] **Step 7: Update the test.** READ `components/scope2/__tests__/render.test.tsx` (it renders `Scope2BuilderTab`). Update it so: the home renders facility content + the results panel; add assertions that the home shows a facility (by seeded name) + "Procurement" + "Energy balance" tiles; clicking a facility shows the Efficiency + Solar levers + the suggestion card; clicking Procurement shows the PPA slider. Use the seed the file already uses (or the Scope2 default facilities). Keep existing Scope 2 render/compute tests green.

- [ ] **Step 8: Verify** — `npx tsc --noEmit` clean; `npm test` green. (Balance tile may route to a placeholder until Task 4 — ensure no crash; a guarded `null` or a "Coming up" message is acceptable for this task, replaced in Task 4.)

---

### Task 4: `Scope2EnergyBalanceScreen` + wire the balance entry

**Files:**
- Modify: `components/scope2/BuilderTab.tsx`
- Test: `components/scope2/__tests__/render.test.tsx` (extend)

**Interfaces:**
- Consumes Task 2 (`applyDials2`, `energyMix2`, `suggestMix2`, `BalanceDials2`) + `useScope2` (`baseFacilities`, `levers`, `setLevers`, `result`, `baseYear`).

- [ ] **Step 1: Add `Scope2EnergyBalanceScreen`** ({ onBack }) — mirror Scope-1 `EnergyBalanceScreen`:
  - Local `dials: BalanceDials2` (init from current levers — efficiency/solar/procurement at 0 or derived) + `targetPct` state (default 50).
  - `applyAndStore(next)`: `setDials(next); setLevers((p) => applyDials2(facilities, p, next));` (confirm the store exposes `setLevers(updater)`; if it's named differently or takes a value not an updater, adapt — read `store.tsx`).
  - Dials: `SliderField` Efficiency %, Solar %, Procurement clean % → `set(key, v)`.
  - Mix bar from `energyMix2(facilities, levers)` (grid vs renewable, two segments).
  - Result strip: `result.kpis.reduction2030` (vs target), `marketNowT`, `totalCapex`, on-track badge.
  - "Suggest a mix for {targetPct}% by 2030" → `applyAndStore(suggestMix2(facilities, levers, targetPct/100, baseYear))`; heuristic-order note.
- [ ] **Step 2: Wire** the `"balance"` route in `Scope2BuilderTab` to render `<Scope2EnergyBalanceScreen onBack={() => setView("home")} />` (replacing any Task-3 placeholder).
- [ ] **Step 3: Update the test** — add: clicking "Energy balance" shows the three dials + "Suggest a mix" button; clicking Suggest does not crash and "Reduction 2030" stays visible. Keep prior assertions intact.
- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; `npm test` green; `npm run build` clean.

---

## Self-Review

**Spec coverage:** suggestions/impact engine → Task 1; energy-balance engine → Task 2; home + facility boxes + results panel + facility scenario (efficiency/solar restyled) + suggestion + impact + procurement screen → Task 3; Scope-2 energy balance → Task 4. ✓
**Placeholder scan:** engines fully coded; UI tasks give concrete component specs + exact handler/field/primitive mappings and reference the existing Scope-1 components + current Scope-2 lever JSX as the source to restyle (a real, readable pattern, not "TODO"). The Task-3 balance placeholder is explicitly replaced in Task 4.
**Type consistency:** `Scope2LeverKind`/`Scope2Suggestion`/`Scope2SuggestedAction`, `suggestForFacility`/`capexForFacility`/`facilityImpact`/`roofCapKwp`, `BalanceDials2`/`applyDials2`/`energyMix2`/`suggestMix2` consistent across tasks. `updateFacilityAction(id, lever, patch)` / `updateProcurement(patch)` / `setLevers` match the store (confirm `setLevers` name in Tasks 3–4). `result.kpis` fields (`marketNowT`, `reduction2030`, `annualOpexDelta`, `totalCapex`, `onTrack2030`) confirmed present.
