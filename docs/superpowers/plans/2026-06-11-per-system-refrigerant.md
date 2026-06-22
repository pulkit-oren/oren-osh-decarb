# Per-System Refrigerant Modeller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single global refrigerant lever with per-system planning — each cooling system gets its own card with two independent actions (Switch gas | Fix leaks), matching the per-asset Mobile/Stationary modellers.

**Architecture:** Staged so every commit compiles: the new `bySystem` shape is ADDED alongside the legacy `refrigerant` field first, consumers migrate one by one (compute → store/migration → UI → export), and the legacy field is deleted in a final cleanup task. Physics in `applyRefrigerant` is untouched; attribution between the two actions is leak-fix-first.

**Tech Stack:** Next.js 16.2.9, React 19, TypeScript 5, Tailwind 4, Vitest 4.

**Working directory for every command:** `C:\Users\rakes\Documents\Dashboard Module\scenario\scope1-decarb` (git repo, branch `master`). Shell is PowerShell. The dev server is already running on localhost:3000 — do NOT restart it.

**Spec:** `docs/superpowers/specs/2026-06-11-per-system-refrigerant-design.md`

**Conventions:** model files carry `/* ==== */` banner comments; tests use real default data, no mocks; components are Tailwind function components; money via `fmtMoney`, numbers via `fmt`/`fmtNum`/`pct` from `lib/utils.ts`.

---

### Task 1: New types, recommended-swap map, defaults (additive — legacy field stays)

**Files:**
- Modify: `lib/model/types.ts`
- Modify: `lib/model/factors.ts`
- Modify: `lib/model/segments.ts`
- Modify: `lib/defaults.ts`
- Modify: `lib/model/__tests__/compute.test.ts` (fixture gains `bySystem: {}`)
- Test: `lib/model/__tests__/system-actions.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `lib/model/__tests__/system-actions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { defaultSystemActions } from "../segments";
import { RECOMMENDED_ALT_BY_SYSTEM } from "../factors";
import type { RefrigerationSystem } from "../types";

const sys = (systemType: RefrigerationSystem["systemType"]): RefrigerationSystem => ({
  id: "x", name: "X", systemType, refrigerant: "R404A", chargeKg: 100, leakRatePct: 10, gasCostPerKg: 500,
});

describe("defaultSystemActions", () => {
  it("starts with both actions off and the recommended gas for the system type", () => {
    const d = defaultSystemActions(sys("industrialColdStorage"));
    expect(d.gasSwitch.enabled).toBe(false);
    expect(d.leakFix.enabled).toBe(false);
    expect(d.gasSwitch.altRefrigerant).toBe("R717");
    expect(d.gasSwitch.targetYear).toBeGreaterThan(d.gasSwitch.startYear);
  });

  it("recommended swap map covers every system type", () => {
    expect(RECOMMENDED_ALT_BY_SYSTEM.industrialColdStorage).toBe("R717");
    expect(RECOMMENDED_ALT_BY_SYSTEM.commercialHVAC).toBe("R454B");
    expect(RECOMMENDED_ALT_BY_SYSTEM.retailRefrigeration).toBe("R290");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/model/__tests__/system-actions.test.ts`
Expected: FAIL — `defaultSystemActions` / `RECOMMENDED_ALT_BY_SYSTEM` not exported.

- [ ] **Step 3: Add types**

In `lib/model/types.ts`, directly BELOW the existing `RefrigerantCfg` interface (which stays for now — it is deleted in Task 6), add:

```ts
/* ---- Per-system refrigerant actions (replaces the global RefrigerantCfg) ---- */

export interface GasSwitchAction {
  enabled: boolean;
  transitionPct: number; // 0..100, share of this system's charge moved
  altRefrigerant: RefrigerantId;
  retrofitCapex: number;
  startYear: number;
  targetYear: number;
}

export interface LeakFixAction {
  enabled: boolean;
  leakImprovementPct: number; // 0..80, reduction in leak rate
  startYear: number;
  targetYear: number;
}

export interface SystemActions {
  gasSwitch: GasSwitchAction;
  leakFix: LeakFixAction;
}
```

Then change `LeverSettings` to:

```ts
export interface LeverSettings {
  byAsset: Record<string, AssetActions>; // keyed by CombustionAsset id
  bySystem: Record<string, SystemActions>; // keyed by RefrigerationSystem id
  refrigerant: RefrigerantCfg; // legacy global config — deleted at the end of this migration (Task 6)
  assumptions: GlobalAssumptions;
}
```

- [ ] **Step 4: Add the recommended-swap map**

In `lib/model/factors.ts`, add `RefrigerationSystem` to the type import from `./types`, and below `ALT_REFRIGERANT_IDS` add:

```ts
/** Sensible low-GWP swap per system type, surfaced as a one-click suggestion. */
export const RECOMMENDED_ALT_BY_SYSTEM: Record<RefrigerationSystem["systemType"], RefrigerantId> = {
  industrialColdStorage: "R717", // ammonia — zero GWP, best efficiency; industrial, trained staff
  commercialHVAC: "R454B",       // leading R-410A replacement, mildly flammable (A2L)
  retailRefrigeration: "R290",   // propane — near-zero GWP; charge limits suit smaller systems
};
```

- [ ] **Step 5: Add `defaultSystemActions`**

In `lib/model/segments.ts`, extend the factors import to `import { RECOMMENDED_ALT_BY_SYSTEM } from "./factors";` (new import line — segments.ts currently imports nothing from factors), add `RefrigerationSystem, SystemActions` to the type import, and below `defaultActions` add:

```ts
/** Sensible default (off) plan for a freshly-added cooling system. */
export function defaultSystemActions(sys: RefrigerationSystem): SystemActions {
  return {
    gasSwitch: { enabled: false, transitionPct: 60, altRefrigerant: RECOMMENDED_ALT_BY_SYSTEM[sys.systemType], retrofitCapex: 0, startYear: 2026, targetYear: 2030 },
    leakFix: { enabled: false, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 },
  };
}
```

- [ ] **Step 6: Defaults carry both shapes**

In `lib/defaults.ts`, inside `DEFAULT_SETTINGS` (keep the existing `refrigerant:` block untouched), add directly after the `refrigerant: { ... },` block:

```ts
  bySystem: {
    cold: {
      gasSwitch: { enabled: true, transitionPct: 60, altRefrigerant: "R717", retrofitCapex: 8_000_000, startYear: 2026, targetYear: 2029 },
      leakFix: { enabled: true, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 },
    },
    hvac: {
      gasSwitch: { enabled: true, transitionPct: 60, altRefrigerant: "R454B", retrofitCapex: 4_000_000, startYear: 2026, targetYear: 2029 },
      leakFix: { enabled: true, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 },
    },
  },
```

- [ ] **Step 7: Fix the compute test fixture**

In `lib/model/__tests__/compute.test.ts`, the `settings` fixture object must now satisfy the extended `LeverSettings`: add `bySystem: {},` directly above the `refrigerant:` line.

- [ ] **Step 8: Run all tests + lint**

Run: `npx vitest run` then `npm run lint`
Expected: ALL pass (the new test included), lint clean. `npm run build` is optional here; TypeScript runs in vitest transform but run `npx tsc --noEmit` if unsure all consumers still compile.

- [ ] **Step 9: Commit**

```powershell
git add lib/model/types.ts lib/model/factors.ts lib/model/segments.ts lib/defaults.ts lib/model/__tests__/system-actions.test.ts lib/model/__tests__/compute.test.ts
git commit -m "feat(model): per-system refrigerant action types, recommended swaps and defaults"
```

---

### Task 2: Compute reads `bySystem` — per-system loop, leak-first attribution, split segments

**Files:**
- Modify: `lib/model/index.ts`
- Test: `lib/model/__tests__/refrigerant-compute.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `lib/model/__tests__/refrigerant-compute.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { compute } from "../index";
import type { LeverSettings, RefrigerationSystem, SystemActions } from "../types";

/** R-404A (GWP 3,922) system: base fugitive = 1000 kg × 10% × 3922 / 1000 = 392.2 t/yr. */
const system: RefrigerationSystem = {
  id: "s1", name: "Test cold store", systemType: "industrialColdStorage",
  refrigerant: "R404A", chargeKg: 1000, leakRatePct: 10, gasCostPerKg: 1000,
};

const mkSettings = (actions: SystemActions, carbonPrice = 0): LeverSettings => ({
  assumptions: { gridEf: 0.71, renewableSourcingPct: 50, recCostPerTonne: 0, carbonPricePerTonne: carbonPrice, infraCapex: 0 },
  byAsset: {},
  bySystem: { s1: actions },
  refrigerant: { enabled: false, transitionPct: 0, altRefrigerant: "R290", leakImprovementPct: 0, retrofitCapex: 0, startYear: 2026, rampYears: 4 },
});

const off = { enabled: false, transitionPct: 0, altRefrigerant: "R717" as const, retrofitCapex: 0, startYear: 2026, targetYear: 2030 };
const leakOff = { enabled: false, leakImprovementPct: 0, startYear: 2026, targetYear: 2028 };

describe("compute — per-system refrigerant", () => {
  it("leak fix alone abates leak share and saves gas top-ups", () => {
    const r = compute([], [system], mkSettings({
      gasSwitch: off,
      leakFix: { enabled: true, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 },
    }), 2025);
    const lever = r.levers.find((l) => l.id === "refrigerant")!;
    expect(lever.abatementT).toBeCloseTo(196.1, 1); // 392.2 × 50%
    expect(lever.capex).toBe(0);
    // gas saving: 100 kg leaked × 50% × ₹1000 = ₹50,000/yr saving
    expect(lever.annualOpexDelta).toBeCloseTo(-50_000, 0);
    expect(r.segments.find((s) => s.key === "ref-leak")?.abatementT).toBeCloseTo(196.1, 1);
    expect(r.segments.find((s) => s.key === "ref-gas")).toBeUndefined();
  });

  it("gas switch alone to ammonia removes the transitioned share entirely", () => {
    const r = compute([], [system], mkSettings({
      gasSwitch: { enabled: true, transitionPct: 100, altRefrigerant: "R717", retrofitCapex: 5_000_000, startYear: 2027, targetYear: 2031 },
      leakFix: leakOff,
    }), 2025);
    const lever = r.levers.find((l) => l.id === "refrigerant")!;
    expect(lever.abatementT).toBeCloseTo(392.2, 1); // R-717 GWP = 0
    expect(lever.capex).toBe(5_000_000);
    expect(r.segments.find((s) => s.key === "ref-gas")?.abatementT).toBeCloseTo(392.2, 1);
    expect(r.segments.find((s) => s.key === "ref-leak")).toBeUndefined();
  });

  it("both actions: increments are attributed leak-first and sum to the total", () => {
    const r = compute([], [system], mkSettings({
      gasSwitch: { enabled: true, transitionPct: 100, altRefrigerant: "R717", retrofitCapex: 0, startYear: 2027, targetYear: 2031 },
      leakFix: { enabled: true, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 },
    }), 2025);
    const leak = r.segments.find((s) => s.key === "ref-leak")!.abatementT;
    const gas = r.segments.find((s) => s.key === "ref-gas")!.abatementT;
    expect(leak).toBeCloseTo(196.1, 1); // leak fix on the CURRENT gas first
    expect(gas).toBeCloseTo(196.1, 1); // gas switch removes what leak fix left
    const lever = r.levers.find((l) => l.id === "refrigerant")!;
    expect(leak + gas).toBeCloseTo(lever.abatementT, 4);
  });

  it("the refrigerant wedge ramps from min start to max target across actions", () => {
    const r = compute([], [system], mkSettings({
      gasSwitch: { enabled: true, transitionPct: 50, altRefrigerant: "R717", retrofitCapex: 0, startYear: 2027, targetYear: 2031 },
      leakFix: { enabled: true, leakImprovementPct: 30, startYear: 2026, targetYear: 2028 },
    }), 2025);
    const wedge = r.wedges.find((w) => w.id === "refrigerant")!;
    expect(wedge.startYear).toBe(2026);
    expect(wedge.rampYears).toBe(6); // 2026..2031
  });

  it("carbon price flows into the opex parts", () => {
    const r = compute([], [system], mkSettings({
      gasSwitch: off,
      leakFix: { enabled: true, leakImprovementPct: 50, startYear: 2026, targetYear: 2028 },
    }, 2000), 2025);
    const lever = r.levers.find((l) => l.id === "refrigerant")!;
    const carbon = lever.opexParts.find((p) => p.label === "Carbon-price value of abatement")!;
    expect(carbon.amount).toBeCloseTo(-196.1 * 2000, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/model/__tests__/refrigerant-compute.test.ts`
Expected: FAIL — compute still reads `s.refrigerant` (lever abatement 0, segments missing).

- [ ] **Step 3: Implement in `lib/model/index.ts`**

3a. Extend the baseline import: `import { baselineScope1, refrigerantCO2e } from "./baseline";`

3b. Update the `SegmentImpact.key` comment: `// elec-mobile | elec-stationary | fuel-mobile | fuel-stationary | ref-leak | ref-gas`

3c. Replace the whole `/* ---- Refrigerant (unchanged math) ---- */` block (currently `let refAbate = 0 ... const refCapex = ...`) with:

```ts
  /* ---- Refrigerant: per-system gas switch + leak fix ---- */
  let refAbateLeak = 0, refAbateGas = 0, refGasSavingOpex = 0, refCapex = 0;
  let refStart = Infinity, refEnd = -Infinity;
  for (const sys of systems) {
    const acts = s.bySystem[sys.id];
    if (!acts) continue;
    const gasOn = acts.gasSwitch.enabled && acts.gasSwitch.transitionPct > 0;
    const leakOn = acts.leakFix.enabled && acts.leakFix.leakImprovementPct > 0;
    if (!gasOn && !leakOn) continue;

    // Leak fix first (operational before capital); the gas switch takes the increment.
    const leakPct = leakOn ? acts.leakFix.leakImprovementPct : 0;
    const base = refrigerantCO2e(sys);
    const leakOnly = applyRefrigerant(sys, { transitionPct: 0, altRefrigerant: acts.gasSwitch.altRefrigerant, leakImprovementPct: leakPct });
    const both = applyRefrigerant(sys, { transitionPct: gasOn ? acts.gasSwitch.transitionPct : 0, altRefrigerant: acts.gasSwitch.altRefrigerant, leakImprovementPct: leakPct });
    refAbateLeak += base - leakOnly.newFugitiveT;
    refAbateGas += leakOnly.newFugitiveT - both.newFugitiveT;

    if (leakOn) {
      refGasSavingOpex += sys.chargeKg * (sys.leakRatePct / 100) * (acts.leakFix.leakImprovementPct / 100) * sys.gasCostPerKg;
      refStart = Math.min(refStart, acts.leakFix.startYear);
      refEnd = Math.max(refEnd, acts.leakFix.targetYear);
    }
    if (gasOn) {
      refCapex += acts.gasSwitch.retrofitCapex;
      refStart = Math.min(refStart, acts.gasSwitch.startYear);
      refEnd = Math.max(refEnd, acts.gasSwitch.targetYear);
    }
  }
  const refAbate = refAbateLeak + refAbateGas;
  const refCarbonValue = refAbate * g.carbonPricePerTonne;
  const refOpexDelta = -(refGasSavingOpex + refCarbonValue);
```

3d. In the roll-ups section, next to `const elecR = mkRamp(...)` add:

```ts
  const refR = mkRamp(refStart, refEnd);
```

3e. In `leverRows`, replace the refrigerant entry's ramp argument:

```ts
    mk("refrigerant", "Refrigerant", 1, refAbate, refCapex, refOpexDelta, refR, refParts),
```

3f. In `segments`, replace the single `{ key: "refrigerant", ... }` entry with:

```ts
    { key: "ref-leak", label: "Refrigerant · Leak fix", abatementT: refAbateLeak, colorIdx: 1 },
    { key: "ref-gas", label: "Refrigerant · Gas switch", abatementT: refAbateGas, colorIdx: 0 },
```

(The existing `.filter((x) => x.abatementT > 0)` removes whichever is zero.)

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: ALL pass — including `defaults.test.ts` (the new per-system defaults produce a near-identical refrigerant abatement to the old story: ≈441 vs ≈446 t/yr) and `compute.test.ts` parts-sum.

- [ ] **Step 5: Lint + commit**

Run: `npm run lint` (clean), then:

```powershell
git add lib/model/index.ts lib/model/__tests__/refrigerant-compute.test.ts
git commit -m "feat(model): per-system refrigerant compute with leak-first attribution and split segments"
```

---

### Task 3: Settings migration + store wiring

**Files:**
- Modify: `lib/store-helpers.ts`
- Modify: `lib/store.tsx`
- Test: `lib/__tests__/migrate.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/migrate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { migrateSettings } from "../store-helpers";
import type { RefrigerationSystem } from "../model/types";

const systems: RefrigerationSystem[] = [
  { id: "cold", name: "Cold storage plant", systemType: "industrialColdStorage", refrigerant: "R404A", chargeKg: 800, leakRatePct: 15, gasCostPerKg: 1200 },
  { id: "hvac", name: "Office HVAC", systemType: "commercialHVAC", refrigerant: "R410A", chargeKg: 350, leakRatePct: 12, gasCostPerKg: 950 },
];

const legacy = {
  byAsset: {},
  assumptions: { gridEf: 0.71, renewableSourcingPct: 50, recCostPerTonne: 800, carbonPricePerTonne: 2000, infraCapex: 0 },
  refrigerant: { enabled: true, transitionPct: 60, altRefrigerant: "R290", leakImprovementPct: 50, retrofitCapex: 12_000_000, startYear: 2026, rampYears: 4 },
};

describe("migrateSettings", () => {
  it("fans a legacy global config out per system", () => {
    const m = migrateSettings(legacy, systems);
    expect(Object.keys(m.bySystem).sort()).toEqual(["cold", "hvac"]);
    const cold = m.bySystem.cold;
    expect(cold.gasSwitch.enabled).toBe(true);
    expect(cold.gasSwitch.transitionPct).toBe(60);
    expect(cold.gasSwitch.altRefrigerant).toBe("R290");
    expect(cold.leakFix.leakImprovementPct).toBe(50);
    // startYear 2026 + rampYears 4 → target 2029
    expect(cold.gasSwitch.targetYear).toBe(2029);
    expect(cold.leakFix.targetYear).toBe(2029);
  });

  it("splits legacy capex pro-rata by charge, remainder on the last system", () => {
    const m = migrateSettings(legacy, systems);
    const coldShare = m.bySystem.cold.gasSwitch.retrofitCapex;
    const hvacShare = m.bySystem.hvac.gasSwitch.retrofitCapex;
    expect(coldShare).toBe(Math.round((12_000_000 * 800) / 1150));
    expect(coldShare + hvacShare).toBe(12_000_000);
  });

  it("passes a new-shape object through, filling missing systems with defaults", () => {
    const fresh = migrateSettings(legacy, systems); // new shape
    const extra: RefrigerationSystem = { id: "r-9", name: "New chiller", systemType: "retailRefrigeration", refrigerant: "R134a", chargeKg: 50, leakRatePct: 10, gasCostPerKg: 700 };
    const m = migrateSettings(fresh, [...systems, extra]);
    expect(m.bySystem.cold.gasSwitch.retrofitCapex).toBe(fresh.bySystem.cold.gasSwitch.retrofitCapex); // untouched
    expect(m.bySystem["r-9"].gasSwitch.enabled).toBe(false); // defaulted
    expect(m.bySystem["r-9"].gasSwitch.altRefrigerant).toBe("R290"); // retail recommendation
  });

  it("a disabled legacy lever migrates to disabled actions", () => {
    const m = migrateSettings({ ...legacy, refrigerant: { ...legacy.refrigerant, enabled: false } }, systems);
    expect(m.bySystem.cold.gasSwitch.enabled).toBe(false);
    expect(m.bySystem.cold.leakFix.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/migrate.test.ts`
Expected: FAIL — `migrateSettings` not exported.

- [ ] **Step 3: Implement the migration**

Append to `lib/store-helpers.ts` (and add the imports at the top of the file):

```ts
import { defaultSystemActions } from "./model/segments";
import type { LeverSettings, RefrigerantId, RefrigerationSystem, SystemActions } from "./model/types";

/** Shape of the pre-migration global refrigerant config. */
interface LegacyRefrigerantCfg {
  enabled: boolean;
  transitionPct: number;
  altRefrigerant: RefrigerantId;
  leakImprovementPct: number;
  retrofitCapex: number;
  startYear: number;
  rampYears: number;
}

/** Legacy filler so migrated objects satisfy the transitional LeverSettings type (removed with the legacy field). */
const DISABLED_LEGACY: LegacyRefrigerantCfg = {
  enabled: false, transitionPct: 0, altRefrigerant: "R290", leakImprovementPct: 0,
  retrofitCapex: 0, startYear: 2026, rampYears: 4,
};

/** Upgrade persisted settings (or a saved scenario's settings) to the per-system shape.
 *  Legacy global config fans out to every system; capex splits pro-rata by charge. */
export function migrateSettings(raw: unknown, systems: RefrigerationSystem[]): LeverSettings {
  const r = raw as Partial<LeverSettings> & { refrigerant?: LegacyRefrigerantCfg };
  const base = {
    byAsset: r.byAsset ?? {},
    assumptions: r.assumptions!,
    refrigerant: r.refrigerant ?? DISABLED_LEGACY,
  };

  if (r.bySystem) {
    const bySystem: Record<string, SystemActions> = { ...r.bySystem };
    for (const sys of systems) if (!bySystem[sys.id]) bySystem[sys.id] = defaultSystemActions(sys);
    return { ...base, bySystem };
  }

  const legacy = r.refrigerant ?? DISABLED_LEGACY;
  const targetYear = legacy.startYear + Math.max(0, legacy.rampYears - 1);
  const totalCharge = systems.reduce((s, x) => s + x.chargeKg, 0);
  let capexLeft = legacy.retrofitCapex;
  const bySystem: Record<string, SystemActions> = {};
  systems.forEach((sys, i) => {
    const last = i === systems.length - 1;
    const share = last ? capexLeft : totalCharge > 0 ? Math.round((legacy.retrofitCapex * sys.chargeKg) / totalCharge) : 0;
    capexLeft -= share;
    bySystem[sys.id] = {
      gasSwitch: {
        enabled: legacy.enabled, transitionPct: legacy.transitionPct, altRefrigerant: legacy.altRefrigerant,
        retrofitCapex: share, startYear: legacy.startYear, targetYear,
      },
      leakFix: {
        enabled: legacy.enabled, leakImprovementPct: legacy.leakImprovementPct,
        startYear: legacy.startYear, targetYear,
      },
    };
  });
  return { ...base, bySystem };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/migrate.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the store**

In `lib/store.tsx`:

5a. Extend imports: add `GasSwitchAction, LeakFixAction, SystemActions` to the types import; add `defaultSystemActions` to the segments import; change the store-helpers import to `import { allIds, migrateSettings, uniqueId } from "./store-helpers";`.

5b. In the hydration effect, replace the `if (p.settings) ...` and `if (p.scenarios) ...` lines with (note ordering — compute the systems list first):

```ts
      const sysForMigration = resolveRefrigeration(p.refrigeration ?? DEFAULT_REFRIGERATION_BY_YEAR, p.baseYear ?? DEFAULT_BASE_YEAR);
      if (p.settings) setSettingsState(migrateSettings(p.settings, sysForMigration));
      if (p.scenarios) setScenarios(p.scenarios.map((sc) => ({ ...sc, settings: migrateSettings(sc.settings, sysForMigration) })));
```

5c. Replace `addRefrigeration` with the seeded version (same ref-handoff pattern as `addCombustion`; declare the ref next to `pendingAssetRef`):

```ts
  const pendingSystemRef = useRef<RefrigerationSystem | null>(null);

  const addRefrigeration = (year: number) => {
    setRefrigeration((prev) => {
      const id = uniqueId("r", allIds(prev));
      const line: RefrigerationSystem = { id, name: "New system", systemType: "commercialHVAC", refrigerant: "R410A", chargeKg: 200, leakRatePct: 12, gasCostPerKg: 900 };
      pendingSystemRef.current = line;
      return { ...prev, [year]: [...(prev[year] ?? []), line] };
    });
    setSettingsState((p) => {
      const line = pendingSystemRef.current;
      if (!line || p.bySystem[line.id]) return p;
      return { ...p, bySystem: { ...p.bySystem, [line.id]: defaultSystemActions(line) } };
    });
  };
```

5d. Replace `copyRefrigeration` to seed missing entries (mirror `copyCombustion`):

```ts
  const copyRefrigeration = (fromYear: number, toYear: number) => {
    const src = clone(refrigeration[fromYear] ?? []);
    setRefrigeration((prev) => ({ ...prev, [toYear]: src }));
    setSettingsState((p) => {
      const bySystem = { ...p.bySystem };
      for (const sys of src) if (!bySystem[sys.id]) bySystem[sys.id] = defaultSystemActions(sys);
      return { ...p, bySystem };
    });
  };
```

5e. Add `updateSystemAction` next to `updateAction`, and expose it via `StoreShape` and the `value` object:

```ts
  const updateSystemAction = (
    systemId: string, lever: "gasSwitch" | "leakFix",
    patch: Partial<GasSwitchAction> & Partial<LeakFixAction>,
  ) =>
    setSettingsState((p) => {
      const cur = p.bySystem[systemId];
      if (!cur) return p;
      return { ...p, bySystem: { ...p.bySystem, [systemId]: { ...cur, [lever]: { ...cur[lever], ...patch } } as SystemActions } };
    });
```

StoreShape gains: `updateSystemAction: (systemId: string, lever: "gasSwitch" | "leakFix", patch: Partial<GasSwitchAction> & Partial<LeakFixAction>) => void;`

- [ ] **Step 6: Full suite + lint**

Run: `npx vitest run` and `npm run lint`
Expected: all green, lint clean.

- [ ] **Step 7: Commit**

```powershell
git add lib/store-helpers.ts lib/store.tsx lib/__tests__/migrate.test.ts
git commit -m "feat(store): migrate legacy refrigerant settings per system; seed and update system actions"
```

---

### Task 4: Builder UI — per-system cards (Switch gas | Fix leaks)

**Files:**
- Modify: `components/tabs/BuilderTab.tsx`

- [ ] **Step 1: Imports and segment metadata**

In `components/tabs/BuilderTab.tsx`:
- Add `Wrench` to the lucide-react import list.
- Extend the factors import: `import { FAMILY_COLORS, REFRIGERANTS, ALT_REFRIGERANT_IDS, RECOMMENDED_ALT_BY_SYSTEM } from "@/lib/model/factors";`
- Extend the baseline import: `import { combustionCO2e, refrigerantCO2e } from "@/lib/model/baseline";`
- Add: `import { applyRefrigerant } from "@/lib/model/levers";`
- Extend the segments import: `import { applyAssetActions, defaultActions, defaultSystemActions } from "@/lib/model/segments";`
- Extend the types import: add `RefrigerantEra, RefrigerationSystem` (keep the rest; drop `LeverSettings` if it becomes unused after Step 3 — lint will tell you).
- Extend the utils import: `import { cn, fmt, fmtK, fmtMoney, fmtNum, pct } from "@/lib/utils";`
- Update `SEG_META.refrigerant.sub` to `"Cooling — per-system plans"`.

Below `ALT_FUELS` add:

```tsx
const SYSTEM_TYPE_LABELS: Record<RefrigerationSystem["systemType"], string> = {
  commercialHVAC: "Commercial HVAC",
  industrialColdStorage: "Industrial cold storage",
  retailRefrigeration: "Retail refrigeration",
};

const ERA_BADGE: Record<RefrigerantEra, { label: string; cls: string }> = {
  legacy: { label: "legacy", cls: "bg-amber-50 text-amber-700" },
  current: { label: "current", cls: "bg-surface-muted text-ink-soft" },
  future: { label: "future", cls: "bg-brand-50 text-brand-700" },
};
```

- [ ] **Step 2: Per-system active count**

In `BuilderTab`, destructure `baseSystems` from `useScenario()` and replace the refrigerant branch of `activeCount`:

```tsx
    if (s === "refrigerant")
      return baseSystems.filter((x) => {
        const a = settings.bySystem[x.id];
        return a && (a.gasSwitch.enabled || a.leakFix.enabled);
      }).length;
```

- [ ] **Step 3: Replace `RefrigerantControls` entirely**

Replace the whole `RefrigerantControls` function (banner comment included) with:

```tsx
/* ============================================================
   Refrigerant — per-system cards (Switch gas | Fix leaks)
   ============================================================ */

function RefrigerantControls() {
  const { baseSystems, setSettings } = useScenario();
  const applyPreset = (gasOn: boolean, transitionPct: number, leakImprovementPct: number) =>
    setSettings((p) => {
      const bySystem = { ...p.bySystem };
      for (const id of Object.keys(bySystem)) {
        bySystem[id] = {
          gasSwitch: { ...bySystem[id].gasSwitch, enabled: gasOn, transitionPct },
          leakFix: { ...bySystem[id].leakFix, enabled: true, leakImprovementPct },
        };
      }
      return { ...p, bySystem };
    });

  return (
    <>
      <Card tone="muted">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-ink-faint font-bold mr-1">Presets · all systems</span>
          {[
            { label: "Leak fix only", sub: "0% · 40% leak", apply: () => applyPreset(false, 0, 40) },
            { label: "Balanced", sub: "60% · 50% leak", apply: () => applyPreset(true, 60, 50) },
            { label: "Full retrofit", sub: "100% · 70% leak", apply: () => applyPreset(true, 100, 70) },
          ].map((pr) => (
            <button key={pr.label} type="button" onClick={pr.apply} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:border-brand-300 hover:bg-brand-50/40 transition-colors">
              <span className="font-medium">{pr.label}</span><span className="text-ink-faint ml-1.5 text-xs">{pr.sub}</span>
            </button>
          ))}
        </div>
      </Card>
      {baseSystems.length === 0 ? (
        <Card><p className="text-sm text-ink-faint">No cooling systems yet — add them in Data input.</p></Card>
      ) : (
        baseSystems.map((sys) => <SystemActionCard key={sys.id} system={sys} />)
      )}
    </>
  );
}

function SystemActionCard({ system }: { system: RefrigerationSystem }) {
  const { settings, setSettings, updateSystemAction } = useScenario();
  const acts = settings.bySystem[system.id];
  const color = FAMILY_COLORS[1];

  if (!acts) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-ink">{system.name}</h3>
            <p className="text-sm text-ink-soft">No plan yet for this system.</p>
          </div>
          <button
            type="button"
            onClick={() => setSettings((p) => ({ ...p, bySystem: { ...p.bySystem, [system.id]: defaultSystemActions(system) } }))}
            className="text-sm font-medium rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600"
          >
            Add plan
          </button>
        </div>
      </Card>
    );
  }

  const gs = acts.gasSwitch;
  const lf = acts.leakFix;
  const current = REFRIGERANTS[system.refrigerant];
  const alt = REFRIGERANTS[gs.altRefrigerant];
  const era = ERA_BADGE[current.era];
  const suggested = RECOMMENDED_ALT_BY_SYSTEM[system.systemType];

  const baseT = refrigerantCO2e(system);
  const after = applyRefrigerant(system, {
    transitionPct: gs.enabled ? gs.transitionPct : 0,
    altRefrigerant: gs.altRefrigerant,
    leakImprovementPct: lf.enabled ? lf.leakImprovementPct : 0,
  });
  const afterT = Math.max(0, after.newFugitiveT);
  const gwpDelta = current.gwp > 0 ? (alt.gwp - current.gwp) / current.gwp : 0;
  const newLeakPct = system.leakRatePct * (1 - (lf.enabled ? lf.leakImprovementPct : 0) / 100);
  const gasSaving = system.chargeKg * (system.leakRatePct / 100) * ((lf.enabled ? lf.leakImprovementPct : 0) / 100) * system.gasCostPerKg;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0" style={{ background: `${color}1A` }}>
            <Snowflake size={22} style={{ color }} />
          </div>
          <div>
            <h2 className="text-lg font-extrabold leading-tight text-ink">{system.name}</h2>
            <p className="text-sm text-ink-soft mt-0.5 flex items-center gap-2 flex-wrap">
              {SYSTEM_TYPE_LABELS[system.systemType]} · {fmt(system.chargeKg)} kg charge
              <span className="font-medium text-ink">{current.label} · GWP {fmt(current.gwp)}</span>
              <span className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5", era.cls)}>{era.label}</span>
            </p>
          </div>
        </div>
        <ImpactBar base={baseT} after={afterT} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 border-t border-line/70 mt-1 pt-4">
        <ActionRow
          title="Switch gas"
          sub="Move to a low-GWP refrigerant"
          icon={Snowflake}
          color={color}
          enabled={gs.enabled}
          onToggle={() => updateSystemAction(system.id, "gasSwitch", { enabled: !gs.enabled })}
          className="lg:pr-7"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 items-end">
            <div className="md:col-span-2">
              <span className="text-sm font-medium text-ink flex items-center gap-1.5 flex-wrap">
                Alternative refrigerant
                <InfoTip text="Which low-GWP gas to switch to. Lower GWP = bigger cut; naturals also need less charge." />
                {gwpDelta < 0 && (
                  <span className="text-[11px] font-bold text-brand-600 bg-brand-50 rounded-full px-2 py-0.5">
                    {pct(gwpDelta, 1)} GWP vs {current.label}
                  </span>
                )}
              </span>
              <select
                value={gs.altRefrigerant}
                onChange={(e) => updateSystemAction(system.id, "gasSwitch", { altRefrigerant: e.target.value as RefrigerantId })}
                aria-label={`${system.name} alternative refrigerant`}
                className="mt-2 w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
              >
                {ALT_REFRIGERANT_IDS.map((rid) => { const r = REFRIGERANTS[rid]; return <option key={rid} value={rid}>{r.label} · GWP {r.gwp}</option>; })}
              </select>
              <p className="text-[11px] text-ink-faint mt-1.5">{alt.note}</p>
              {gs.altRefrigerant !== suggested && (
                <button
                  type="button"
                  onClick={() => updateSystemAction(system.id, "gasSwitch", { altRefrigerant: suggested })}
                  className="mt-1.5 text-[11px] font-semibold text-brand-600 hover:text-brand-700 rounded-md px-2 py-1 bg-brand-50 hover:bg-brand-100 transition-colors"
                >
                  Suggested for {SYSTEM_TYPE_LABELS[system.systemType].toLowerCase()}: {REFRIGERANTS[suggested].label}
                </button>
              )}
            </div>
            <Slider label="Gas transition" value={gs.transitionPct} color={color} onChange={(v) => updateSystemAction(system.id, "gasSwitch", { transitionPct: v })} hint="Share of this system's cooling moved off the current gas." />
            <YearField label="Target year" tip="The year the transition is fully in place. It ramps from the start year to here." value={gs.targetYear} min={2021} max={2050} onChange={(v) => updateSystemAction(system.id, "gasSwitch", { targetYear: v })} />
          </div>
          <AdvancedDrawer>
            <NumberField label="Retrofit CAPEX" tip="One-off cost for new compressors / safety upgrades for this system." value={gs.retrofitCapex} step={1_000_000} suffix={CURRENCY} onChange={(v) => updateSystemAction(system.id, "gasSwitch", { retrofitCapex: v })} />
            <NumberField label="Start year" tip="The year the transition begins." value={gs.startYear} step={1} onChange={(v) => updateSystemAction(system.id, "gasSwitch", { startYear: v })} />
          </AdvancedDrawer>
        </ActionRow>

        <ActionRow
          title="Fix leaks"
          sub="Maintenance & monitoring"
          icon={Wrench}
          color="#D9774B"
          enabled={lf.enabled}
          onToggle={() => updateSystemAction(system.id, "leakFix", { enabled: !lf.enabled })}
          className="max-lg:border-t max-lg:border-line/70 max-lg:mt-4 max-lg:pt-4 lg:border-l lg:border-line/70 lg:pl-7"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 items-end">
            <Slider label="Leak-rate improvement" value={lf.leakImprovementPct} max={80} color="#D9774B" onChange={(v) => updateSystemAction(system.id, "leakFix", { leakImprovementPct: v })} hint="How much you cut leaks via maintenance & monitoring — often the biggest quick win." />
            <YearField label="Target year" tip="The year the leak programme reaches full effect." value={lf.targetYear} min={2021} max={2050} onChange={(v) => updateSystemAction(system.id, "leakFix", { targetYear: v })} />
          </div>
          <p className="text-xs text-ink-soft mt-3 tabular-nums">
            Leak rate {fmtNum(system.leakRatePct, 1)}%/yr → <span className="font-semibold text-ink">{fmtNum(newLeakPct, 1)}%/yr</span>
            {gasSaving > 0 && <> · saves <span className="font-semibold text-brand-600">{fmtMoney(gasSaving)}/yr</span> in gas top-ups</>}
          </p>
          <AdvancedDrawer>
            <NumberField label="Start year" tip="The year the leak programme begins." value={lf.startYear} step={1} onChange={(v) => updateSystemAction(system.id, "leakFix", { startYear: v })} />
          </AdvancedDrawer>
          {lf.enabled && lf.leakImprovementPct > 70 && (
            <p className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0" />
              Very ambitious — sustained leak reduction above 70% needs continuous monitoring and rapid repair.
            </p>
          )}
        </ActionRow>
      </div>
      <p className="text-[11px] text-ink-faint mt-3">Carbon price is set once in <strong>Global assumptions</strong> below and applied across the scenario.</p>
    </Card>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run lint` (clean — remove the `LeverSettings` import if flagged unused) and `npx vitest run` (green).
Manual (dev server hot-reloads): Refrigerant segment shows the presets card + two system cards; Cold storage shows "R-404A · GWP 3,922 · legacy", the GWP pill reacts to the gas select, the suggestion chip appears when a non-recommended gas is chosen and disappears on click, leak slider updates the "15%/yr → x%/yr" readout and savings, the >70% advisory appears, and the live-projection bar moves.

- [ ] **Step 5: Commit**

```powershell
git add components/tabs/BuilderTab.tsx
git commit -m "feat(ui): per-system refrigerant cards with gas-switch and leak-fix actions"
```

---

### Task 5: Action-plan lines + export Scenario sheet per system

**Files:**
- Modify: `components/tabs/ActionPlanTab.tsx`
- Modify: `lib/export.ts`
- Modify: `components/Topbar.tsx`
- Modify: `lib/__tests__/export.test.ts`

- [ ] **Step 1: Update the export tests (they will fail first)**

In `lib/__tests__/export.test.ts`, add `DEFAULT_SYSTEMS` to the defaults import, change the scenario-sheet test to:

```ts
  it("scenario sheet records per-asset and per-system lever settings", () => {
    const s = scenarioSheet(DEFAULT_SETTINGS, DEFAULT_ASSETS, DEFAULT_SYSTEMS);
    expect(s.rows.some((r) => r[0] === "Diesel fleet" && r[1] === "Electrify" && r[2] === "Units to convert" && r[3] === 3)).toBe(true);
    expect(s.rows.some((r) => r[0] === "Cold storage plant" && r[1] === "Switch gas" && r[2] === "Alternative gas" && r[3] === "R-717 (Ammonia)")).toBe(true);
    expect(s.rows.some((r) => r[0] === "Office HVAC" && r[1] === "Fix leaks" && r[2] === "Leak improvement %" && r[3] === 50)).toBe(true);
  });
```

Run: `npx vitest run lib/__tests__/export.test.ts` — expected: FAIL (signature + rows).

- [ ] **Step 2: Update `lib/export.ts`**

2a. Add `RefrigerationSystem` to the types import.

2b. Change `scenarioSheet` to `(settings: LeverSettings, assets: CombustionAsset[], systems: RefrigerationSystem[])` and replace the trailing 7 `"All cooling systems"` rows with:

```ts
  for (const sys of systems) {
    const acts = settings.bySystem[sys.id];
    if (!acts) continue;
    const gsw = acts.gasSwitch;
    rows.push([sys.name, "Switch gas", "Enabled", gsw.enabled ? "yes" : "no"]);
    rows.push([sys.name, "Switch gas", "Transition %", gsw.transitionPct]);
    rows.push([sys.name, "Switch gas", "Alternative gas", REFRIGERANTS[gsw.altRefrigerant]?.label ?? gsw.altRefrigerant]);
    rows.push([sys.name, "Switch gas", "Retrofit CAPEX", gsw.retrofitCapex]);
    rows.push([sys.name, "Switch gas", "Start year", gsw.startYear]);
    rows.push([sys.name, "Switch gas", "Target year", gsw.targetYear]);
    const lfx = acts.leakFix;
    rows.push([sys.name, "Fix leaks", "Enabled", lfx.enabled ? "yes" : "no"]);
    rows.push([sys.name, "Fix leaks", "Leak improvement %", lfx.leakImprovementPct]);
    rows.push([sys.name, "Fix leaks", "Start year", lfx.startYear]);
    rows.push([sys.name, "Fix leaks", "Target year", lfx.targetYear]);
  }
```

2c. `buildWorkbookSheets` args gain `systems: RefrigerationSystem[]`; pass to `scenarioSheet(args.settings, args.assets, args.systems)`.

- [ ] **Step 3: Topbar passes systems**

In `components/Topbar.tsx`, add `baseSystems` to the `useScenario()` destructure and `systems: baseSystems` to the `buildWorkbookSheets({...})` call.

- [ ] **Step 4: Action plan per-system lines**

In `components/tabs/ActionPlanTab.tsx`:
- Add imports: `import { applyRefrigerant } from "@/lib/model/levers";` and extend the factors import to `import { FAMILY_COLORS, REFRIGERANTS } from "@/lib/model/factors";`
- Add `baseSystems` to the `useScenario()` destructure.
- Replace the refrigerant `planItems` block (`const refLever = ...` through its closing `}`) with:

```tsx
  const refLever = result.levers.find((l) => l.id === "refrigerant");
  if (refLever && refLever.abatementT > 0) {
    for (const sys of baseSystems) {
      const acts = settings.bySystem[sys.id];
      if (!acts) continue;
      const gasOn = acts.gasSwitch.enabled && acts.gasSwitch.transitionPct > 0;
      const leakOn = acts.leakFix.enabled && acts.leakFix.leakImprovementPct > 0;
      if (!gasOn && !leakOn) continue;
      const r = applyRefrigerant(sys, {
        transitionPct: gasOn ? acts.gasSwitch.transitionPct : 0,
        altRefrigerant: acts.gasSwitch.altRefrigerant,
        leakImprovementPct: leakOn ? acts.leakFix.leakImprovementPct : 0,
      });
      const parts = [
        ...(gasOn ? [`${acts.gasSwitch.transitionPct}% → ${REFRIGERANTS[acts.gasSwitch.altRefrigerant].label}`] : []),
        ...(leakOn ? [`leak −${acts.leakFix.leakImprovementPct}%`] : []),
      ];
      planItems.push({ label: sys.name, detail: parts.join(", "), tonnes: r.abatementT, color: FAMILY_COLORS[1], icon: Snowflake });
    }
  }
```

- [ ] **Step 5: Verify**

Run: `npx vitest run` (all green) and `npm run lint` (clean).
Manual: Action plan's "What this plan does" lists "Cold storage plant — 60% → R-717 (Ammonia), leak −50%" and the HVAC line; Export downloads with the per-system Scenario rows.

- [ ] **Step 6: Commit**

```powershell
git add components/tabs/ActionPlanTab.tsx lib/export.ts components/Topbar.tsx lib/__tests__/export.test.ts
git commit -m "feat(export,ui): per-system refrigerant lines in action plan and scenario sheet"
```

---

### Task 6: Delete the legacy global refrigerant config

**Files:**
- Modify: `lib/model/types.ts` (delete `RefrigerantCfg`, remove the `refrigerant` field)
- Modify: `lib/defaults.ts` (remove the `refrigerant:` block)
- Modify: `lib/store-helpers.ts` (stop emitting the legacy field)
- Modify: `lib/model/__tests__/compute.test.ts`, `lib/model/__tests__/refrigerant-compute.test.ts`, `lib/__tests__/migrate.test.ts` (fixtures)

- [ ] **Step 1: Remove the field and type**

- `lib/model/types.ts`: delete the entire `RefrigerantCfg` interface and the `refrigerant: RefrigerantCfg;` line (with its comment) from `LeverSettings`.
- `lib/defaults.ts`: delete the `refrigerant: { ... },` block from `DEFAULT_SETTINGS`.
- `lib/store-helpers.ts`: keep the local `LegacyRefrigerantCfg` interface and `DISABLED_LEGACY` constant? **No** — keep `LegacyRefrigerantCfg` (it types incoming legacy data) but delete `DISABLED_LEGACY` and remove `refrigerant: r.refrigerant ?? DISABLED_LEGACY,` from the `base` object in `migrateSettings` (the returned object simply has `byAsset`, `bySystem`, `assumptions`).
- Test fixtures: remove the `refrigerant: { ... },` line from the `settings` object in `compute.test.ts`, from `mkSettings` in `refrigerant-compute.test.ts`, and keep it ONLY inside `migrate.test.ts`'s `legacy` fixture (that one deliberately models old persisted data and is typed loosely — if TypeScript complains, type the fixture `const legacy = { ... } as const;` and pass it as-is since `migrateSettings` takes `unknown`).

- [ ] **Step 2: Sweep for stragglers**

Run: `npx tsc --noEmit` — expected clean. Then a textual sweep:

Run: `Select-String -Path lib\*.ts,lib\**\*.ts,lib\**\**\*.ts,components\**\*.tsx -Pattern "RefrigerantCfg|settings\.refrigerant|s\.refrigerant\b" `
Expected: no matches outside `migrate.test.ts`'s legacy fixture and `store-helpers.ts`'s `LegacyRefrigerantCfg`. Fix anything else found.

- [ ] **Step 3: Full suite, lint, build**

Run: `npx vitest run`, `npm run lint`, `npm run build`
Expected: all green/clean.

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "refactor(model): remove legacy global refrigerant config"
```

---

### Task 7: Final verification (runtime, migration smoke, visuals)

- [ ] **Step 1: Gates**

Run: `npx vitest run`, `npm run lint`, `npm run build` — all green.

- [ ] **Step 2: Browser verification**

Use the established headless-Chrome recipe: temp dir with `npm i puppeteer-core@24`, launch `"C:\Program Files\Google\Chrome\Application\chrome.exe"` headless against http://localhost:3000. Verify and screenshot:

1. **Migration smoke:** before loading the app, seed legacy state and confirm it migrates:

```js
await page.evaluateOnNewDocument(() => {
  const legacy = {
    combustion: null, refrigeration: null, baseYear: 2025, scenarios: [],
    settings: {
      byAsset: {},
      assumptions: { gridEf: 0.71, renewableSourcingPct: 50, recCostPerTonne: 800, carbonPricePerTonne: 2000, infraCapex: 0 },
      refrigerant: { enabled: true, transitionPct: 80, altRefrigerant: "R744", leakImprovementPct: 30, retrofitCapex: 6_000_000, startYear: 2026, rampYears: 5 },
    },
  };
  // strip nulls so defaults fill them
  const clean = JSON.parse(JSON.stringify(legacy));
  delete clean.combustion; delete clean.refrigeration;
  localStorage.setItem("osh-scope1-planner-v4", JSON.stringify(clean));
});
```

Then load the app, click the Refrigerant segment chip, and assert via DOM: both system cards exist, the gas select shows "R-744", transition slider value 80, leak slider 30 — and no console errors / pageerrors.
2. **Default-state visuals:** clear localStorage, reload, open the Refrigerant segment, screenshot at 1480px (two columns, divider, GWP pill, era badge, suggestion chip hidden because defaults match recommendations) and at 390px (stacked).
3. **Interaction:** click "Full retrofit" preset → both cards' sliders jump to 100/70 and the >70% advisory appears; live-projection KPIs move.
4. **Export:** click Export, parse the downloaded xlsx with the project's exceljs, assert the Scenario sheet contains a "Cold storage plant / Switch gas" row.

Delete the temp workspace afterwards.

- [ ] **Step 3: Commit any verification-driven fixes, then report**

`git status` — commit stragglers if any. Report results against spec §10's manual list.
