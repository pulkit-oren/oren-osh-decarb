# Source → Equipment Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the company-wide asset registry with equipment owned by one source, so a fuel entry can only ever be split across its own machines.

**Architecture:** `Equipment[]` becomes a field on `CombustionAsset`, carrying the `remainingLife`, `endUse` and `unitCount` that used to sit on the source. `resolveEquipment` (replacing `resolveAssets`) reads that nested list instead of taking a registry argument and emits one row per equipment, keeping the `sourceEntryId` stamp and `::unallocated` remainder convention every downstream consumer already understands. The whole global layer — provider, registry screen, minting, navigation — is deleted rather than filtered.

**Tech Stack:** Next.js 16.2.9 (App Router), React 19.2.4, TypeScript, Vitest + Testing Library, Tailwind v4, ESLint flat config.

**Spec:** `docs/superpowers/specs/2026-08-20-source-equipment-split-design.md` (as amended 2026-08-24; decisions D1–D10, invariants §4.2 1–7). Read it before Task 1 — this plan argues from it and does not restate it.

**Branch:** `asset-layer-port`, which already holds the 27-commit port this replaces. Work continues on it; there is no rebase.

## Global Constraints

- **Frozen test files — never edit:** `components/tabs/__tests__/activity-data.test.tsx` and `components/tabs/__tests__/empty-field-guards.test.tsx`. Both were verified untouched across all 27 commits of the port. If a change breaks one, the change is wrong.
- **Gates for every task:** `npx tsc --noEmit` (clean), `npm test` (no regressions), `npm run lint` (held at the pre-existing **3 errors / 22 warnings** — never higher), `npm run build` (clean).
- **Baseline at plan start:** 600 passed / 1 skipped across 102 files.
- **Paste real command output into each task report.** The spec exists because 600 passing tests did not surface a defect that thirty seconds of clicking did.
- **Currency and units in copy:** Indian digit grouping (`1,88,000`), `₹` for spend, `tCO₂e` for emissions — match what the surrounding component already renders.
- **Never edit a pre-existing test to make a change pass.** Zero pre-existing test files were edited across the port's 27 commits; hold that line. Task 2 is the sole, explicitly-scoped exception.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/equipment/types.ts` | **Create.** `Equipment`, `CapacityUnit`, `AllocationBasis`. Pure types. | 1 |
| `lib/equipment/migrate.ts` | **Create.** `migrateEquipment(byYear)` — the one-way upgrade of persisted state. | 1 |
| `lib/model/types.ts` | **Modify.** `CombustionAsset` gains `equipment`, `allocations`, `capacityUnit`, `allocationBasis`; loses `remainingLife`, `endUse`, `unitCount`, `allocationMode`, `assetAllocations`, `weightAttribute`. | 1 |
| `lib/equipment/allocate.ts` | **Create** (port of `lib/assets/allocate.ts`). `distribute`/`clampAllocation`/`unallocated` unchanged; `weightsFor`, `computeAllocation`, `explainAllocation` new. | 2 |
| `lib/equipment/resolve.ts` | **Create** (port of `lib/assets/resolve.ts`). `resolveEquipment(entries)` — no registry parameter, and the opex fix. | 3 |
| `lib/store.tsx` | **Modify.** Migration on hydrate; resolved memos lose the registry; the lever-minting effect is deleted. | 4 |
| `lib/assets/**`, `components/assets/**`, `AssetRegistryScreen.tsx` | **Delete.** The whole global layer. | 4 |
| `components/tabs/activity/SourceListScreen.tsx` | **Modify.** Add-a-source drops End-use; mints the first equipment. | 5 |
| `components/tabs/activity/EquipmentSection.tsx` | **Create.** Entry-screen equipment table, basis picker, explainer, unit total. | 6 |
| `components/tabs/activity/EntryScreen.tsx` | **Modify.** Mounts `EquipmentSection`; drops the source-level Remaining life and units fields. | 6 |
| `components/tabs/BuilderTab.tsx`, `activity/SegmentScreen.tsx` | **Modify.** Delete Task 9's split-entry special-casing. | 7 |

`lib/equipment/` is created new rather than renamed in place, so Tasks 1–3 land while `lib/assets/` still compiles and its tests still run. Task 4 deletes the old directory in one commit, once nothing imports it.

---

### Task 1: Equipment types and the state migration

**Files:**
- Create: `lib/equipment/types.ts`
- Create: `lib/equipment/migrate.ts`
- Modify: `lib/model/types.ts:146-166`
- Test: `lib/equipment/__tests__/migrate.test.ts`

**Interfaces:**
- Consumes: `EndUseId` from `lib/model/end-use.ts`.
- Produces: `Equipment`, `CapacityUnit`, `AllocationBasis` from `lib/equipment/types.ts`; `migrateEquipment(byYear: Record<number, CombustionAsset[]>): Record<number, CombustionAsset[]>` from `lib/equipment/migrate.ts`. Tasks 2, 3, 4 and 6 all import these.

**Why the id reuse matters (spec §3.3):** the minted first equipment reuses the entry's own id. That is the only thing preserving every saved `settings.byAsset` lever key across the migration. Step 1's first test asserts it. Any later change that mints a fresh id here must rewrite `byAsset` in the same commit.

- [ ] **Step 1: Write the failing test**

Create `lib/equipment/__tests__/migrate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { migrateEquipment } from "../migrate";
import type { CombustionAsset } from "@/lib/model/types";

/** A pre-migration entry, shaped as it sits in persisted localStorage. */
function legacy(over: Record<string, unknown> = {}): CombustionAsset {
  return {
    id: "c-1", name: "DG Set", category: "stationary", fuelType: "diesel",
    unit: "L", annualVolume: 9572631.3, opex: 22500000,
    remainingLife: 10, unitCount: 30, endUse: "process",
    ...over,
  } as unknown as CombustionAsset;
}

describe("migrateEquipment", () => {
  it("mints one equipment reusing the entry id, so lever keys survive", () => {
    const out = migrateEquipment({ 2025: [legacy()] });
    expect(out[2025][0].equipment).toHaveLength(1);
    expect(out[2025][0].equipment[0].id).toBe("c-1");
  });

  it("carries remainingLife, endUse and unitCount down onto the equipment", () => {
    const eq = migrateEquipment({ 2025: [legacy()] })[2025][0].equipment[0];
    expect(eq.remainingLife).toBe(10);
    expect(eq.endUse).toBe("process");
    expect(eq.unitCount).toBe(30);
  });

  it("allocates the whole volume to that one equipment", () => {
    const e = migrateEquipment({ 2025: [legacy()] })[2025][0];
    expect(e.allocations).toEqual({ "c-1": 9572631.3 });
  });

  it("defaults a missing remainingLife to 10 and a missing unitCount to 1", () => {
    const eq = migrateEquipment({
      2025: [legacy({ remainingLife: undefined, unitCount: undefined })],
    })[2025][0].equipment[0];
    expect(eq.remainingLife).toBe(10);
    expect(eq.unitCount).toBe(1);
  });

  it("is idempotent - an entry that already has equipment is untouched", () => {
    const once = migrateEquipment({ 2025: [legacy()] });
    const twice = migrateEquipment(once);
    expect(twice[2025][0].equipment).toEqual(once[2025][0].equipment);
    expect(twice[2025][0].equipment).toHaveLength(1);
  });

  it("discards a shipped assetAllocations map rather than translating it", () => {
    const e = migrateEquipment({
      2025: [legacy({
        allocationMode: "byAsset",
        assetAllocations: { "a-9": { volume: 500 } },
        weightAttribute: "unitCount",
      })],
    })[2025][0] as unknown as Record<string, unknown>;
    expect(e.allocationMode).toBeUndefined();
    expect(e.assetAllocations).toBeUndefined();
    expect(e.weightAttribute).toBeUndefined();
    expect(e.allocations).toEqual({ "c-1": 9572631.3 });
  });

  // Ruling A: these are absent on a RAW source. resolveEquipment stamps them
  // back onto resolved rows, which is what keeps the model consumers working.
  it("drops the source-level fields that moved down", () => {
    const e = migrateEquipment({ 2025: [legacy()] })[2025][0] as unknown as Record<string, unknown>;
    expect(e.remainingLife).toBeUndefined();
    expect(e.unitCount).toBeUndefined();
    expect(e.endUse).toBeUndefined();
  });

  it("leaves capacityUnit unset - no capacities exist yet", () => {
    expect(migrateEquipment({ 2025: [legacy()] })[2025][0].capacityUnit).toBeUndefined();
  });

  it("survives malformed persisted entries without throwing", () => {
    const out = migrateEquipment({
      2025: [
        legacy({ annualVolume: "not a number" }),
        legacy({ id: "c-2", remainingLife: null, unitCount: -4 }),
      ],
    });
    expect(out[2025][0].allocations).toEqual({ "c-1": 0 });
    expect(out[2025][1].equipment[0].remainingLife).toBe(10);
    expect(out[2025][1].equipment[0].unitCount).toBe(1);
  });

  it("migrates every year independently", () => {
    const out = migrateEquipment({ 2024: [legacy()], 2025: [legacy()] });
    expect(out[2024][0].equipment[0].id).toBe("c-1");
    expect(out[2025][0].equipment[0].id).toBe("c-1");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/equipment/__tests__/migrate.test.ts`
Expected: FAIL — `Failed to resolve import "../migrate"`.

- [ ] **Step 3: Create the types**

Create `lib/equipment/types.ts`:

```ts
/* Equipment - the machines inside ONE combustion source. Unlike the deleted
   lib/assets registry these are never company-wide: a source's split only ever
   offers its own equipment, which is what makes a diesel entry unable to be
   allocated onto "Coal" (spec section 1). Pure types. */

import type { EndUseId } from "@/lib/model/end-use";

export type CapacityUnit = "kW" | "kVA" | "TR" | "tph";

/** How a source's volume is divided across its equipment (spec 4.1). */
export type AllocationBasis =
  | "load"          // capacity x operatingHours - the default
  | "capacity"      // capacity alone
  | "units"         // unitCount (D10)
  | "even"          // 1 each
  | "carryForward"  // prior year's proportions
  | "manual";       // typed by hand

export interface Equipment {
  /** Stable across fiscal years - lever settings are keyed by this. The first
   *  equipment of a migrated source REUSES the source's id; see spec 3.3. */
  id: string;
  /** User-typed, required, non-empty. */
  name: string;
  /** Rated capacity, in the SOURCE's capacityUnit (D9 - there is deliberately
   *  no per-equipment unit). Absent => excluded from the capacity/load bases. */
  capacity?: number;
  /** Running hours per year. Absent => excluded from the load basis. */
  operatingHours?: number;
  /** Identical units this equipment stands for; one machine => 1 (D8). Moved
   *  down from the source, NOT deleted - nine consumers across segments.ts,
   *  energy-balance.ts, suggestions.ts, index.ts and export.ts read it off the
   *  resolved row. Weights the `units` basis. */
  unitCount: number;
  /** Remaining useful life, years. The retrofit guardrail
   *  (lib/model/validate.ts:10) reads this; absent would make it NaN. */
  remainingLife: number;
  /** Drives lever defaults and feasibility. Absent => unspecified. */
  endUse?: EndUseId;
}
```

- [ ] **Step 4: Change `CombustionAsset`**

In `lib/model/types.ts`, delete these three fields from `CombustionAsset`:

```ts
  /** How this entry's volume is attributed to assets. Absent => "entry" (whole-entry, no split). */
  allocationMode?: "entry" | "byAsset";
  /** byAsset: per-asset share of annualVolume, keyed by asset id. */
  assetAllocations?: Record<string, { volume: number }>;
  /** The per-asset attribute "weighted" allocation distributes by. */
  weightAttribute?: import("@/lib/assets/types").WeightAttribute;
```

**Ruling A — `remainingLife`, `unitCount` and `endUse` are NOT deleted; they become optional resolved-row stamps.** The 2026-08-24 pre-flight scan found twenty-five non-test files reading these FLAT off a resolved row — `segments.ts:62,75,156`, `energy-balance.ts:36,109`, `suggestions.ts:26`, `validate.ts:10`, `export.ts:34` among them. Deleting them outright would make spec §2.1's central claim ("every consumer keeps working untouched") false and leave Task 4's build gate unreachable. Retype them, keeping the existing `sourceEntryId?` field as the precedent for this pattern:

```ts
  /** Set on rows emitted by resolveEquipment(), copied from the row's single
   *  equipment. Absent on a RAW source - the source of truth is
   *  equipment[].remainingLife (D4). Kept flat so the nine model consumers
   *  that read it need no change. */
  remainingLife?: number;
  /** Set on rows emitted by resolveEquipment(); see remainingLife. */
  unitCount?: number;
  /** Set on rows emitted by resolveEquipment(); see remainingLife. */
  endUse?: import("./end-use").EndUseId;
```

Raw sources stop writing all three — Task 1's migration removes them, and Task 5 stops seeding them. Resolution (Task 3) is the only writer.

Add in their place:

```ts
  /** This source's equipment. Always >=1 (D8). Order is display order. A
   *  RESOLVED row emitted by resolveEquipment() carries the single equipment
   *  it descends from, so a consumer reading a resolved row sees one machine. */
  equipment: Equipment[];
  /** Per-equipment volume, keyed by Equipment.id. Sums to <= annualVolume. */
  allocations?: Record<string, number>;
  /** The unit every equipment's `capacity` is expressed in (D9). Declared once
   *  here so a source cannot hold incommensurable capacities - mixing tph with
   *  kVA is unrepresentable, not merely validated against. */
  capacityUnit?: CapacityUnit;
  /** How `allocations` should be (re)computed. Absent => "load". */
  allocationBasis?: AllocationBasis;
```

Replace the existing `allocationBasis` import-typed field if one remains, and add at the top of the file:

```ts
import type { Equipment, CapacityUnit, AllocationBasis } from "@/lib/equipment/types";
```

**Expect this step to break the typecheck across many files.** That is correct. Tasks 2–7 close them. Do not chase them here.

- [ ] **Step 5: Write the migration**

Create `lib/equipment/migrate.ts`:

```ts
/* One-way upgrade of persisted combustion state to the equipment model. Runs
   on hydrate (lib/store.tsx). Idempotent: an entry that already has a non-empty
   `equipment` array is returned by reference, so an already-migrated user pays
   nothing on every subsequent load. */

import type { CombustionAsset } from "@/lib/model/types";
import type { Equipment } from "./types";

/** Persisted JSON is untrusted - a hand-edited or half-written localStorage
 *  blob must not throw or produce NaN. */
function num(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function migrateEquipment(
  byYear: Record<number, CombustionAsset[]>,
): Record<number, CombustionAsset[]> {
  const out: Record<number, CombustionAsset[]> = {};

  for (const [year, entries] of Object.entries(byYear ?? {})) {
    out[Number(year)] = (entries ?? []).map((entry) => {
      const e = entry as unknown as Record<string, unknown>;

      if (Array.isArray(e.equipment) && e.equipment.length > 0) return entry;

      const equipment: Equipment = {
        id: String(e.id),
        name: typeof e.name === "string" && e.name ? e.name : "Equipment 1",
        unitCount: Math.max(1, Math.round(num(e.unitCount, 1))),
        remainingLife: num(e.remainingLife, 10),
        endUse: e.endUse as Equipment["endUse"],
      };

      const volume = num(e.annualVolume, 0);

      // Drop, never translate: a shipped allocation points at company-wide
      // asset ids that no longer exist, and translating a
      // diesel-allocated-to-Coal split would carry the section 1 defect forward.
      const {
        remainingLife: _rl, unitCount: _uc, endUse: _eu,
        allocationMode: _am, assetAllocations: _aa, weightAttribute: _wa,
        ...rest
      } = e;

      return {
        ...rest,
        equipment: [equipment],
        allocations: { [equipment.id]: volume },
      } as unknown as CombustionAsset;
    });
  }

  return out;
}
```

- [ ] **Step 6: Run the migration test and record the typecheck debt**

Run: `npx vitest run lib/equipment/__tests__/migrate.test.ts`
Expected: PASS, 10 tests.

Then run `npx tsc --noEmit` and **record the error count and the file list** in the task report. That is the work Tasks 2–7 have left; non-zero here is expected and is not a failure.

- [ ] **Step 7: Commit**

```bash
git add lib/equipment lib/model/types.ts
git commit -m "feat(equipment): add Equipment types and the state migration"
```

---

### Task 2: Allocation math, with the units basis

**Files:**
- Create: `lib/equipment/allocate.ts`
- Test: `lib/equipment/__tests__/allocate.test.ts`

**Interfaces:**
- Consumes: `Equipment`, `AllocationBasis` (Task 1).
- Produces:
  - `distribute(total: number, weights: number[]): number[]`
  - `unallocated(entryVolume: number, alloc: Record<string, number>): number`
  - `clampAllocation(entryVolume: number, alloc: Record<string, number>): Record<string, number>`
  - `weightsFor(equipment: Equipment[], basis: AllocationBasis, previous?: Record<string, number>): number[]`
  - `computeAllocation(input: AllocationInput): Record<string, number>` where `AllocationInput = { entryVolume: number; basis: AllocationBasis; equipment: Equipment[]; previous?: Record<string, number>; existing?: Record<string, number> }`
  - `basisAvailability(equipment: Equipment[], previous?: Record<string, number>): Record<AllocationBasis, string | null>` — `null` means available, a string is the reason it is disabled
  - `explainAllocation(input: AllocationInput): { formula: string; row: string } | null`

**The one sanctioned pre-existing-test change in this plan.** `lib/assets/allocate.ts:80` weights `even` by `unitCount`, which is not even — it is the new `units` basis. The behaviour is being renamed, not altered: `units` inherits it and `even` becomes a true weight-of-1. `lib/assets/__tests__/allocate.test.ts` stays untouched (it tests the old module, which Task 4 deletes with its tests); the new suite below asserts both behaviours separately. Do not edit the old file.

**Why `explainAllocation` shares `weightsFor` (spec §4.3):** an explainer that re-derives the arithmetic drifts from the number printed beside it, and is then worse than no explainer. Step 5's test asserts the two agree, rather than assuming it.

- [ ] **Step 1: Write the failing test**

Create `lib/equipment/__tests__/allocate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  distribute, unallocated, clampAllocation,
  weightsFor, computeAllocation, basisAvailability, explainAllocation,
} from "../allocate";
import type { Equipment } from "../types";

function eq(over: Partial<Equipment> & { id: string }): Equipment {
  return { name: over.id, unitCount: 1, remainingLife: 10, ...over };
}

/** The spec 4.3 worked example: 1,88,000 SCM across five machines. */
const BOILERS: Equipment[] = [
  eq({ id: "e1", name: "Boiler 1", capacity: 2.0, operatingHours: 6000 }),
  eq({ id: "e2", name: "Boiler 2", capacity: 1.0, operatingHours: 6000 }),
  eq({ id: "e3", name: "Kitchen range", capacity: 0.5, operatingHours: 4000 }),
  eq({ id: "e4", name: "Water heater", capacity: 0.5, operatingHours: 4000 }),
  eq({ id: "e5", name: "Genset", capacity: 1.0, operatingHours: 1000 }),
];

const FLEET: Equipment[] = [
  eq({ id: "f1", name: "City vans", unitCount: 3 }),
  eq({ id: "f2", name: "Highway vans", unitCount: 2 }),
];

describe("weightsFor", () => {
  it("load weights by capacity x operatingHours", () => {
    expect(weightsFor(BOILERS, "load")).toEqual([12000, 6000, 2000, 2000, 1000]);
  });

  it("capacity weights by capacity alone", () => {
    expect(weightsFor(BOILERS, "capacity")).toEqual([2.0, 1.0, 0.5, 0.5, 1.0]);
  });

  it("units weights by unitCount (D10)", () => {
    expect(weightsFor(FLEET, "units")).toEqual([3, 2]);
  });

  it("even weights by 1 - NOT by unitCount, which is what the old module did", () => {
    expect(weightsFor(FLEET, "even")).toEqual([1, 1]);
  });

  it("carryForward reuses prior proportions", () => {
    expect(weightsFor(FLEET, "carryForward", { f1: 900, f2: 100 })).toEqual([900, 100]);
  });

  it("carryForward falls back to even when the prior year is empty", () => {
    expect(weightsFor(FLEET, "carryForward", {})).toEqual([1, 1]);
  });
});

describe("computeAllocation", () => {
  it("splits the spec 4.3 example exactly, and the rows sum to the total", () => {
    const out = computeAllocation({ entryVolume: 188000, basis: "load", equipment: BOILERS });
    expect(out).toEqual({ e1: 98086.96, e2: 49043.48, e3: 16347.83, e4: 16347.83, e5: 8173.9 });
    const sum = Object.values(out).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(188000, 2);
  });

  it("splits a fleet by units", () => {
    expect(computeAllocation({ entryVolume: 120000, basis: "units", equipment: FLEET }))
      .toEqual({ f1: 72000, f2: 48000 });
  });

  it("consumes the whole total under every computed basis (invariant 1)", () => {
    for (const basis of ["load", "capacity", "units", "even"] as const) {
      const out = computeAllocation({ entryVolume: 188000, basis, equipment: BOILERS });
      expect(unallocated(188000, out), basis).toBe(0);
    }
  });

  it("returns the existing map untouched under manual", () => {
    const existing = { e1: 5, e2: 6 };
    expect(computeAllocation({ entryVolume: 188000, basis: "manual", equipment: BOILERS, existing }))
      .toEqual(existing);
  });

  it("returns zeros rather than NaN when a basis has no usable weights", () => {
    const bare = [eq({ id: "x1" }), eq({ id: "x2" })];
    expect(computeAllocation({ entryVolume: 1000, basis: "load", equipment: bare }))
      .toEqual({ x1: 0, x2: 0 });
  });
});

describe("basisAvailability", () => {
  it("enables load and capacity when every equipment has the values", () => {
    const a = basisAvailability(BOILERS);
    expect(a.load).toBeNull();
    expect(a.capacity).toBeNull();
  });

  it("disables load with a counted reason when running hours are missing", () => {
    const mixed = [...BOILERS.slice(0, 2), eq({ id: "e9", capacity: 1 })];
    expect(basisAvailability(mixed).load).toBe("1 equipment has no running hours");
    expect(basisAvailability(mixed).capacity).toBeNull();
  });

  it("pluralises the reason", () => {
    const bare = [eq({ id: "x1" }), eq({ id: "x2" }), eq({ id: "x3" })];
    expect(basisAvailability(bare).capacity).toBe("3 equipment have no capacity");
  });

  it("always enables units, even and manual", () => {
    const a = basisAvailability([eq({ id: "x1" })]);
    expect(a.units).toBeNull();
    expect(a.even).toBeNull();
    expect(a.manual).toBeNull();
  });

  it("disables carryForward when the prior year holds nothing", () => {
    expect(basisAvailability(FLEET, {}).carryForward).toBe("no allocation recorded for the prior year");
    expect(basisAvailability(FLEET, { f1: 10 }).carryForward).toBeNull();
  });
});

describe("explainAllocation", () => {
  it("agrees with computeAllocation on the same input (spec 4.3)", () => {
    const input = { entryVolume: 188000, basis: "load" as const, equipment: BOILERS };
    const out = computeAllocation(input);
    const ex = explainAllocation(input);
    expect(ex).not.toBeNull();
    // The worked row must quote the SAME number computeAllocation produced.
    expect(ex!.row).toContain("98,086.96");
    expect(out.e1).toBe(98086.96);
  });

  it("quotes the weight total, not a re-derived one", () => {
    const ex = explainAllocation({ entryVolume: 188000, basis: "load", equipment: BOILERS });
    expect(ex!.row).toContain("23,000");
  });

  it("explains the units basis in its own terms", () => {
    const ex = explainAllocation({ entryVolume: 120000, basis: "units", equipment: FLEET });
    expect(ex!.formula).toContain("number of units");
    expect(ex!.row).toContain("3 of 5 units");
    expect(ex!.row).toContain("→"); // Ruling D: the spec 4.3 mockup uses an arrow, not ->
  });

  it("returns null under manual - there is no formula to explain", () => {
    expect(explainAllocation({ entryVolume: 1, basis: "manual", equipment: FLEET })).toBeNull();
  });
});

describe("distribute / clampAllocation / unallocated are carried over unchanged", () => {
  it("distribute lets the last element absorb the rounding remainder", () => {
    expect(distribute(100, [1, 1, 1])).toEqual([33.33, 33.33, 33.34]);
  });

  it("distribute never returns a negative element", () => {
    expect(distribute(0.01, [1, 1, 1]).every((v) => v >= 0)).toBe(true);
  });

  it("distribute coerces NaN and negative weights to zero", () => {
    expect(distribute(100, [NaN, -5, 1])).toEqual([0, 0, 100]);
  });

  it("clampAllocation scales an overshoot back proportionally", () => {
    expect(clampAllocation(100, { a: 150, b: 50 })).toEqual({ a: 75, b: 25 });
  });

  it("unallocated is never negative", () => {
    expect(unallocated(100, { a: 150 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/equipment/__tests__/allocate.test.ts`
Expected: FAIL — `Failed to resolve import "../allocate"`.

- [ ] **Step 3: Implement**

Create `lib/equipment/allocate.ts`. `distribute`, `unallocated` and `clampAllocation` are copied verbatim from `lib/assets/allocate.ts:29-54,94-112` — including their comments — because their behaviour is unchanged and their existing tests are the regression net.

```ts
/* Pure allocation math - turns a source total plus a basis into a per-equipment
   volume map. Under a computed basis the result ALWAYS sums to the source total;
   the last equipment absorbs the rounding remainder. No mutation.

   weightsFor is the SINGLE source of truth for the weights: computeAllocation
   and explainAllocation both call it, so the explainer can never disagree with
   the number printed beside it (spec 4.3). */

import type { Equipment, AllocationBasis } from "./types";

export interface AllocationInput {
  entryVolume: number;
  basis: AllocationBasis;
  equipment: Equipment[];
  /** carryForward: the prior period's per-equipment volumes. */
  previous?: Record<string, number>;
  /** manual: the current map, returned untouched. */
  existing?: Record<string, number>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Split `total` across `weights` proportionally. The last element absorbs the
 *  rounding remainder so the returned array sums to `total` rounded to 2 decimal
 *  places - EXCEPT when earlier elements rounded up past the total, which would
 *  make that remainder negative; in that case the last element is clamped to 0
 *  instead, so a negative allocation is never returned. */
export function distribute(total: number, weights: number[]): number[] {
  const n = Number(total);
  const safeTotal = Number.isFinite(n) && n >= 0 ? n : 0;
  const roundedTotal = round2(safeTotal);
  const coercedWeights = weights.map((w) => {
    const v = Number(w) || 0;
    return Number.isFinite(v) && v >= 0 ? v : 0;
  });
  const sum = coercedWeights.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(sum) || sum <= 0) return coercedWeights.map(() => 0);
  const out: number[] = [];
  let acc = 0;
  coercedWeights.forEach((w, i) => {
    if (i === coercedWeights.length - 1) {
      out.push(Math.max(0, round2(roundedTotal - acc)));
    } else {
      const v = round2((roundedTotal * w) / sum);
      out.push(v);
      acc += v;
    }
  });
  return out;
}

/** The weights every basis distributes by. The ONLY place a basis is turned
 *  into numbers - see the module comment. */
export function weightsFor(
  equipment: Equipment[],
  basis: AllocationBasis,
  previous?: Record<string, number>,
): number[] {
  switch (basis) {
    case "load":
      return equipment.map((e) => (e.capacity ?? 0) * (e.operatingHours ?? 0));
    case "capacity":
      return equipment.map((e) => e.capacity ?? 0);
    case "units":
      return equipment.map((e) => e.unitCount || 0);
    case "carryForward": {
      const prior = equipment.map((e) => previous?.[e.id] ?? 0);
      return prior.some((p) => p > 0) ? prior : equipment.map(() => 1);
    }
    case "even":
    case "manual":
    default:
      return equipment.map(() => 1);
  }
}

export function computeAllocation(input: AllocationInput): Record<string, number> {
  const { entryVolume, basis, equipment, previous, existing } = input;
  if (basis === "manual") return { ...(existing ?? {}) };
  if (equipment.length === 0) return {};
  const volumes = distribute(entryVolume, weightsFor(equipment, basis, previous));
  return Object.fromEntries(equipment.map((e, i) => [e.id, volumes[i]]));
}

const plural = (n: number, verb: string) =>
  `${n} equipment ${n === 1 ? verb : verb === "has" ? "have" : verb}`;

/** null = available. A string is the reason the basis is disabled, shown to the
 *  user rather than silently falling back to `even` - which is how the shipped
 *  version made a wrong split look computed (spec 4.1). */
export function basisAvailability(
  equipment: Equipment[],
  previous?: Record<string, number>,
): Record<AllocationBasis, string | null> {
  const noCapacity = equipment.filter((e) => e.capacity == null).length;
  const noHours = equipment.filter((e) => e.operatingHours == null).length;
  const priorHas = equipment.some((e) => (previous?.[e.id] ?? 0) > 0);
  return {
    load: noCapacity > 0
      ? `${plural(noCapacity, "has")} no capacity`
      : noHours > 0 ? `${plural(noHours, "has")} no running hours` : null,
    capacity: noCapacity > 0 ? `${plural(noCapacity, "has")} no capacity` : null,
    units: null,
    even: null,
    carryForward: priorHas ? null : "no allocation recorded for the prior year",
    manual: null,
  };
}

const FORMULA: Partial<Record<AllocationBasis, string>> = {
  load: "capacity x running hours",
  capacity: "rated capacity",
  units: "number of units",
  even: "an equal share each",
  carryForward: "last year's split",
};

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** The "how is it done" block: the formula plus ONE worked row with real
 *  numbers, both derived from weightsFor so they cannot drift (spec 4.3). */
export function explainAllocation(
  input: AllocationInput,
): { formula: string; row: string } | null {
  const { entryVolume, basis, equipment, previous } = input;
  if (basis === "manual" || equipment.length === 0) return null;

  const weights = weightsFor(equipment, basis, previous);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  const volumes = distribute(entryVolume, weights);
  const first = equipment[0];
  const pct = ((weights[0] / total) * 100).toFixed(1);

  const formula = `Each equipment gets a share of ${fmt(entryVolume)} in proportion to ${FORMULA[basis]}.`;

  const workings = basis === "load"
    ? `${fmt(first.capacity ?? 0)} x ${fmt(first.operatingHours ?? 0)} = ${fmt(weights[0])} of ${fmt(total)} total`
    : basis === "units"
      ? `${fmt(weights[0])} of ${fmt(total)} units`
      : `${fmt(weights[0])} of ${fmt(total)} total`;

  return {
    formula,
    row: `${first.name} = ${workings} → ${pct}% → ${fmt(volumes[0])}`,
  };
}

/** Source volume not yet allocated to any equipment. Never negative. */
export function unallocated(entryVolume: number, alloc: Record<string, number>): number {
  const used = Object.values(alloc).reduce((s, v) => s + (v || 0), 0);
  return round2(Math.max(0, entryVolume - used));
}

/** Guard for the manual path: an allocation may never exceed the source volume.
 *  An overshoot is scaled back proportionally rather than rejected, so the user
 *  never loses their relative intent (invariant 3). */
export function clampAllocation(
  entryVolume: number,
  alloc: Record<string, number>,
): Record<string, number> {
  const ids = Object.keys(alloc);
  if (ids.length === 0) return {};
  const total = ids.reduce((s, id) => s + (alloc[id] || 0), 0);
  if (total <= entryVolume) return { ...alloc };
  const scaled = distribute(entryVolume, ids.map((id) => alloc[id] || 0));
  return Object.fromEntries(ids.map((id, i) => [id, scaled[i]]));
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/equipment/__tests__/allocate.test.ts`
Expected: PASS, 24 tests.

If the spec 4.3 expectation fails on the last element, read the actual output before changing the test — `distribute` gives the remainder to the last element deliberately, so `e5` may be `8173.9` rather than `8173.91`. The assertion above already expects `8173.9`. Do not "fix" this by loosening the sum assertion.

- [ ] **Step 5: Full gates**

Run `npm test`. Expected: the new 24 pass; the old `lib/assets/__tests__/allocate.test.ts` still passes untouched. Record both counts.

- [ ] **Step 6: Commit**

```bash
git add lib/equipment/allocate.ts lib/equipment/__tests__/allocate.test.ts
git commit -m "feat(equipment): allocation bases incl. units, with a shared explainer"
```

---

### Task 3: Resolution against the new model, and the spend fix

**Files:**
- Create: `lib/equipment/resolve.ts`
- Test: `lib/equipment/__tests__/resolve.test.ts`

**Interfaces:**
- Consumes: `clampAllocation`, `unallocated` (Task 2); `Equipment` (Task 1).
- Produces: `resolveEquipment(entries: CombustionAsset[]): CombustionAsset[]`, `UNALLOCATED_SUFFIX`, `isUnallocatedId(id: string): boolean`. Task 4 wires these into the store; Task 7 reads resolved rows.

**This task carries the one behavioural change in the whole resolution pipeline.** Everything else here is a re-pointing of the same logic. `lib/assets/resolve.ts:71` hands every allocated row the whole `asset.opex`, and `migrateAssets` copies the full entry spend onto each minted self-asset — so splitting a source in the shipped build **inflates** total spend. The fix is `share * e.opex`, which is what the remainder row at `:87` already does. Step 1's spend test must be seen to fail against the shipped resolver before the new one is written; a spend test that passes on day one is testing the wrong thing (spec §2.2, invariant 6).

- [ ] **Step 1: Write the failing test**

Create `lib/equipment/__tests__/resolve.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveEquipment, isUnallocatedId } from "../resolve";
import type { CombustionAsset } from "@/lib/model/types";
import type { Equipment } from "../types";

function eq(id: string, over: Partial<Equipment> = {}): Equipment {
  return { id, name: id, unitCount: 1, remainingLife: 10, ...over };
}

function source(over: Partial<CombustionAsset> = {}): CombustionAsset {
  return {
    id: "c-1", name: "PNG boiler", category: "stationary", fuelType: "png",
    unit: "m3", annualVolume: 180000, opex: 9000000, bu: "Pune",
    equipment: [eq("e1", { name: "Boiler 1", unitCount: 2, remainingLife: 12 }),
                eq("e2", { name: "Boiler 2", unitCount: 3, remainingLife: 8 })],
    allocations: { e1: 108000, e2: 72000 },
    ...over,
  } as CombustionAsset;
}

describe("resolveEquipment", () => {
  it("emits one row per equipment, keyed by equipment id", () => {
    const rows = resolveEquipment([source()]);
    expect(rows.map((r) => r.id)).toEqual(["e1", "e2"]);
  });

  it("stamps sourceEntryId on every row so roll-ups can recover the source", () => {
    expect(resolveEquipment([source()]).every((r) => r.sourceEntryId === "c-1")).toBe(true);
  });

  it("takes name, remainingLife, endUse and unitCount from the equipment", () => {
    const [a, b] = resolveEquipment([source()]);
    expect(a.name).toBe("Boiler 1");
    expect(a.equipment[0].remainingLife).toBe(12);
    expect(a.equipment[0].unitCount).toBe(2);
    expect(b.equipment[0].unitCount).toBe(3);
  });

  it("stamps remainingLife, unitCount and endUse FLAT on the row (Ruling A)", () => {
    const [a, b] = resolveEquipment([source()]);
    // The nine model consumers read these flat; equipment[0] is the truth,
    // the flat copy is what keeps them from being rewritten.
    expect(a.remainingLife).toBe(12);
    expect(a.unitCount).toBe(2);
    expect(b.unitCount).toBe(3);
    expect(b.remainingLife).toBe(8);
  });

  it("inherits fuelType, unit and bu from the source", () => {
    const [a] = resolveEquipment([source()]);
    expect(a.fuelType).toBe("png");
    expect(a.unit).toBe("m3");
    expect(a.bu).toBe("Pune");
  });

  it("VOLUME is invariant to the split (invariant 4)", () => {
    const split = resolveEquipment([source()]);
    const whole = resolveEquipment([source({
      equipment: [eq("e1")], allocations: { e1: 180000 },
    })]);
    const sum = (rs: CombustionAsset[]) => rs.reduce((s, r) => s + r.annualVolume, 0);
    expect(sum(split)).toBe(180000);
    expect(sum(whole)).toBe(180000);
  });

  it("SPEND is invariant to the split (invariant 6) - this FAILS on the shipped resolver", () => {
    const rows = resolveEquipment([source()]);
    const spend = rows.reduce((s, r) => s + r.opex, 0);
    expect(spend).toBeCloseTo(9000000, 2);
    // and it is apportioned by volume share, not copied
    expect(rows[0].opex).toBeCloseTo(5400000, 2); // 108000/180000
    expect(rows[1].opex).toBeCloseTo(3600000, 2); //  72000/180000
  });

  it("gives every row the same fossil unit price, since it is the same fuel", () => {
    const rows = resolveEquipment([source()]);
    const price = (r: CombustionAsset) => r.opex / r.annualVolume;
    expect(price(rows[0])).toBeCloseTo(price(rows[1]), 6);
  });

  it("emits a remainder row when the allocation under-covers (invariant 2)", () => {
    const rows = resolveEquipment([source({ allocations: { e1: 100000, e2: 50000 } })]);
    expect(rows).toHaveLength(3);
    const rem = rows[2];
    expect(isUnallocatedId(rem.id)).toBe(true);
    expect(rem.annualVolume).toBe(30000);
    expect(rem.opex).toBeCloseTo(1500000, 2); // 30000/180000 of 90,00,000
  });

  it("keeps spend invariant even with a remainder", () => {
    const rows = resolveEquipment([source({ allocations: { e1: 100000, e2: 50000 } })]);
    expect(rows.reduce((s, r) => s + r.opex, 0)).toBeCloseTo(9000000, 2);
  });

  it("scales an overshoot back rather than over-allocating (invariant 3)", () => {
    const rows = resolveEquipment([source({ allocations: { e1: 200000, e2: 100000 } })]);
    expect(rows.reduce((s, r) => s + r.annualVolume, 0)).toBeCloseTo(180000, 2);
  });

  it("falls back to the whole volume on the first equipment when allocations are absent", () => {
    const rows = resolveEquipment([source({ allocations: undefined })]);
    expect(rows).toHaveLength(2);
    expect(rows[0].annualVolume).toBe(180000);
    expect(rows[1].annualVolume).toBe(0);
  });

  it("ignores allocation keys naming equipment the source does not have", () => {
    const rows = resolveEquipment([source({ allocations: { e1: 90000, ghost: 90000 } })]);
    expect(rows.map((r) => r.id)).toEqual(["e1", "e2", "c-1::unallocated"]);
  });

  it("never emits a byAsset row that could be re-split", () => {
    const rows = resolveEquipment([source()]);
    expect(rows.every((r) => r.allocations === undefined)).toBe(true);
  });

  it("survives a NaN source volume without vanishing the source", () => {
    const rows = resolveEquipment([source({ annualVolume: NaN as unknown as number })]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => Number.isFinite(r.annualVolume))).toBe(true);
  });

  it("survives a source with a malformed empty equipment list", () => {
    const rows = resolveEquipment([source({ equipment: [] })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("c-1");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/equipment/__tests__/resolve.test.ts`
Expected: FAIL — `Failed to resolve import "../resolve"`.

- [ ] **Step 3: Prove the spend bug is real before fixing it**

Do not skip this. In a scratch file, run the SHIPPED resolver over an equivalent split and record the output in the task report:

```bash
npx tsx -e "
const { resolveAssets } = require('./lib/assets/resolve.ts');
const entry = { id:'c-1', name:'PNG', annualVolume:180000, opex:9000000,
  allocationMode:'byAsset', assetAllocations:{ 'a1':{volume:108000}, 'a2':{volume:72000} } };
const reg = { assets:[
  { id:'a1', name:'B1', category:'stationary', buId:'', unitCount:1, remainingLife:10, opex:9000000 },
  { id:'a2', name:'B2', category:'stationary', buId:'', unitCount:1, remainingLife:10, opex:9000000 }]};
console.log(resolveAssets([entry], reg).map(r => r.opex));
"
```

Expected output: `[ 9000000, 9000000 ]` — a total of ₹1,80,00,000 against a source that spends ₹90,00,000. Paste it into the report. If it prints something else, stop and re-read `resolve.ts:71` before continuing; the premise of this task has changed.

- [ ] **Step 4: Implement**

Create `lib/equipment/resolve.ts`:

```ts
/* Expands each combustion source into one row per equipment, plus a remainder
   row when the allocation does not cover the whole source. The emitted rows
   ALWAYS sum to the source's annualVolume AND to its opex, by construction:
   the allocation map is sanitised and clamped BEFORE any row is emitted, and
   every row - remainder included - is derived from that same clamped map.

   Unlike the deleted lib/assets/resolve.ts this takes no registry: a source's
   equipment are its own children, so there is nothing to look up and no way to
   allocate onto another source's machine. */

import type { CombustionAsset } from "@/lib/model/types";
import { clampAllocation, unallocated } from "./allocate";

export const UNALLOCATED_SUFFIX = "::unallocated";

export function isUnallocatedId(id: string): boolean {
  return id.endsWith(UNALLOCATED_SUFFIX);
}

function safeVolume(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function resolveEquipment(entries: CombustionAsset[]): CombustionAsset[] {
  const out: CombustionAsset[] = [];

  for (const e of entries) {
    const equipment = Array.isArray(e.equipment) ? e.equipment : [];

    // A source with no equipment cannot happen under D8, but persisted state
    // predates the guarantee - pass it through rather than dropping it.
    if (equipment.length === 0) {
      out.push(e);
      continue;
    }

    const entryVolume = safeVolume(e.annualVolume);

    // Only this source's own equipment ids are readable. An allocation key
    // naming anything else is ignored, not resolved - the section 1 defect
    // was precisely that a foreign id could be honoured.
    const known: Record<string, number> = {};
    for (const unit of equipment) {
      known[unit.id] = e.allocations
        ? safeVolume(e.allocations[unit.id])
        : unit.id === equipment[0].id ? entryVolume : 0;
    }

    const clamped = clampAllocation(entryVolume, known);

    for (const unit of equipment) {
      const volume = clamped[unit.id] ?? 0;
      const share = entryVolume > 0 ? volume / entryVolume : 0;
      out.push({
        ...e,
        id: unit.id,
        sourceEntryId: e.id,
        name: unit.name,
        annualVolume: volume,
        // Volume share, NOT the whole figure. The shipped resolver copied the
        // full opex onto every row and inflated company spend on every split
        // (spec 2.2). Invariant 6 is the test.
        opex: share * e.opex,
        // The row carries exactly the one machine it descends from...
        equipment: [unit],
        // ...and Ruling A stamps that machine's values FLAT, because the nine
        // model consumers (segments.ts:62,75,156, energy-balance.ts:36,109,
        // suggestions.ts:26, validate.ts:10, export.ts:34) read them flat off
        // the row. Resolution is the only writer of these three.
        remainingLife: unit.remainingLife,
        unitCount: unit.unitCount,
        endUse: unit.endUse,
        allocations: undefined,
      });
    }

    const remainder = unallocated(entryVolume, clamped);
    if (remainder > 0) {
      const share = entryVolume > 0 ? remainder / entryVolume : 0;
      out.push({
        ...e,
        id: `${e.id}${UNALLOCATED_SUFFIX}`,
        sourceEntryId: e.id,
        annualVolume: remainder,
        opex: share * e.opex,
        allocations: undefined,
      });
    }
  }

  return out;
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run lib/equipment/__tests__/resolve.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/equipment/resolve.ts lib/equipment/__tests__/resolve.test.ts
git commit -m "feat(equipment): resolve sources to equipment rows, apportioning spend

Fixes the shipped resolver's opex handling: an allocated row took the whole
asset.opex, so splitting a source inflated company spend. Rows now take their
volume share, which is what the remainder row already did."
```

---

### Task 4: Wire the store and delete the global asset layer

**Files:**
- Modify: `lib/store.tsx:28-29,119-126,147-168,179-260,332-374`
- Modify: `components/Shell.tsx:8,110,139`
- Delete: `lib/assets/` (entire directory, including `__tests__/`)
- Delete: `components/assets/AssetAllocationPanel.tsx`
- Delete: `components/tabs/activity/AssetRegistryScreen.tsx`
- Modify: `lib/store-helpers.ts` — remove `migrateAssets` and `VALID_COMBUSTION_CATEGORIES`
- Modify: `components/tabs/activity/shared.tsx` — remove the `assets` Nav case
- Modify: `components/tabs/activity/HomeScreen.tsx` — remove the Assets tile
- Modify: `components/tabs/activity/ActivityDataTab.tsx` — remove the Assets routing case
- Test: `lib/equipment/__tests__/store-wiring.test.tsx`

**Interfaces:**
- Consumes: `migrateEquipment` (Task 1), `resolveEquipment` / `isUnallocatedId` (Task 3).
- Produces: `resolvedBaseAssets` and `resolvedSelectedAssets` on the store context, unchanged in name and type. Every downstream consumer keeps its current import.

**These land together or not at all.** `lib/store.tsx:28` imports `useAssetsOptional`; deleting `AssetProvider` without rewiring the store breaks the build, and rewiring the store without deleting the provider leaves a second source of truth. A reviewer cannot approve half of this.

**Ruling C — this task also removes the `AssetAllocationPanel` import and mount from `EntryScreen.tsx` (`:19`, `:268`).** Deleting `components/assets/` while `EntryScreen` still imports it makes Step 9's build gate unreachable, and Task 6 is two tasks away. The entry screen therefore has **no** equipment UI until Task 6 adds `EquipmentSection` in the same place. That gap is deliberate; the branch is not deployed until Task 8.

**Ruling E — this task also makes the minimum mechanical edits for a green typecheck in files no other task owns:** `DataInputTab.tsx` (the two `remainingLife` sliders at `:434`, `:526`), `ActionPlanTab.tsx`, `BalanceTab.tsx`, `ActivityDataTab.tsx`, `export.ts:34`, `defaults.ts`, `import-combustion.ts:43`, `store-helpers.ts`. The plan had a hole here: Task 1 breaks the typecheck and nothing owned these files. **Mechanical only** — a field read moves to the equipment, a write is dropped. Ruling A means most of these need no change at all, since resolved rows still carry the flat fields; verify each before editing, and list in the report every file you touched with the reason. Behavioural change to `SourceListScreen` and `EntryScreen` stays with Tasks 5 and 6.

**Delete the lever-minting effect (`store.tsx:359-374`).** It is the cause of the dead "Add plan" button recorded in the port ledger: it pre-writes a default lever for *every* resolved id on mount, so the button never has anything to add. Under D8 equipment exists from creation and `addCombustion` / `copyCombustion` / `importCombustion` seed `byAsset` for the equipment id directly, so the effect has nothing left to do.

- [ ] **Step 1: Count what mounts the provider today**

Run and record in the report:

```bash
grep -rl "AssetProvider\|useAssets" --include=*.tsx --include=*.ts lib components app | sort
```

Every file listed must be either rewired or deleted by the end of this task. A file still importing from `lib/assets/` at Step 8 is a miss, not a leftover.

- [ ] **Step 2: Write the failing wiring test**

Create `lib/equipment/__tests__/store-wiring.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScenarioProvider, useScenario } from "@/lib/store";

function Probe() {
  const { resolvedBaseAssets, settings } = useScenario();
  return (
    <div>
      <span data-testid="ids">{resolvedBaseAssets.map((a) => a.id).join(",")}</span>
      <span data-testid="volume">{resolvedBaseAssets.reduce((s, a) => s + a.annualVolume, 0)}</span>
      <span data-testid="spend">{resolvedBaseAssets.reduce((s, a) => s + a.opex, 0)}</span>
      <span data-testid="levers">{Object.keys(settings.byAsset).sort().join(",")}</span>
    </div>
  );
}

/** Seeding storage explicitly is mandatory: an unseeded ScenarioProvider
 *  hydrates DEFAULT_COMBUSTION_BY_YEAR and pollutes every id assertion. This
 *  trap cost the port a review round on Task 8. */
function seed(state: unknown) {
  window.localStorage.setItem("test-key", JSON.stringify(state));
}

describe("store wiring", () => {
  it("resolves a split source to one row per equipment", () => {
    seed({
      baseYear: 2025,
      combustion: { 2025: [{
        id: "c-1", name: "PNG", category: "stationary", fuelType: "png", unit: "m3",
        annualVolume: 180000, opex: 9000000,
        equipment: [
          { id: "c-1", name: "Boiler 1", unitCount: 1, remainingLife: 12 },
          { id: "eq-2", name: "Boiler 2", unitCount: 1, remainingLife: 8 },
        ],
        allocations: { "c-1": 108000, "eq-2": 72000 },
      }] },
      settings: { byAsset: {}, bySystem: {}, assumptions: {} },
      scenarios: [],
    });
    render(<ScenarioProvider storageKey="test-key"><Probe /></ScenarioProvider>);
    expect(screen.getByTestId("ids").textContent).toBe("c-1,eq-2");
    expect(Number(screen.getByTestId("volume").textContent)).toBeCloseTo(180000, 2);
    expect(Number(screen.getByTestId("spend").textContent)).toBeCloseTo(9000000, 2);
  });

  it("migrates a legacy entry on hydrate and keeps its lever key", () => {
    seed({
      baseYear: 2025,
      combustion: { 2025: [{
        id: "c-1", name: "DG Set", category: "stationary", fuelType: "diesel", unit: "L",
        annualVolume: 250000, opex: 22500000, remainingLife: 9, unitCount: 30,
      }] },
      settings: { byAsset: { "c-1": { electrify: { enabled: true, unitsToConvert: 2 } } }, bySystem: {}, assumptions: {} },
      scenarios: [],
    });
    render(<ScenarioProvider storageKey="test-key"><Probe /></ScenarioProvider>);
    expect(screen.getByTestId("ids").textContent).toBe("c-1");
    // The saved lever survived because the minted equipment reused the entry id.
    expect(screen.getByTestId("levers").textContent).toContain("c-1");
  });

  it("does not mint a lever for the remainder row", () => {
    seed({
      baseYear: 2025,
      combustion: { 2025: [{
        id: "c-1", name: "PNG", category: "stationary", fuelType: "png", unit: "m3",
        annualVolume: 180000, opex: 9000000,
        equipment: [{ id: "c-1", name: "Boiler 1", unitCount: 1, remainingLife: 12 }],
        allocations: { "c-1": 100000 },
      }] },
      settings: { byAsset: {}, bySystem: {}, assumptions: {} },
      scenarios: [],
    });
    render(<ScenarioProvider storageKey="test-key"><Probe /></ScenarioProvider>);
    expect(screen.getByTestId("ids").textContent).toContain("::unallocated");
    expect(screen.getByTestId("levers").textContent).not.toContain("::unallocated");
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run lib/equipment/__tests__/store-wiring.test.tsx`
Expected: FAIL — the store still requires a registry, so `resolvedBaseAssets` is empty or the render throws.

- [ ] **Step 4: Rewire `lib/store.tsx`**

Replace the imports at `:28-29`:

```ts
import { isUnallocatedId, resolveEquipment } from "./equipment/resolve";
import { migrateEquipment } from "./equipment/migrate";
```

Delete the `useAssetsOptional` call and the `assetStore` object at `:119-126`, and the historical-backfill effect at `:147-168` (the whole `useEffect` gated on `assetStore.hydrated`, plus its comment block).

In the hydration effect, migrate on the way in:

```ts
    if (p.combustion) setCombustion(migrateEquipment(p.combustion));
```

Replace the resolved memos at `:340-347`:

```ts
  const resolvedBaseAssets = useMemo(() => resolveEquipment(baseAssets), [baseAssets]);
  const resolvedSelectedAssets = useMemo(() => resolveEquipment(selectedAssets), [selectedAssets]);
```

Delete the lever-minting effect at `:359-374` entirely, including its `eslint-disable` block — removing the effect removes the lint suppression it needed.

In `addCombustion` (`:179`), give the new line its equipment instead of the old scalar fields:

```ts
      const line: CombustionAsset = {
        id, name: "New fuel", category: "stationary", fuelType: "diesel", unit: "L",
        annualVolume, opex,
        equipment: [{ id, name: "New fuel", unitCount: 1, remainingLife: 10 }],
        allocations: { [id]: annualVolume },
      };
```

Delete every `addUnit` / `upsertUnit` call in `addCombustion`, `importCombustion` and `addCombustionAsset`. The `byAsset` seeding beside them stays — for a newly created source the equipment id *is* the entry id, so those call sites need no change.

`copyCombustion` (`:243-251`) **does** need changing. It currently seeds `byAsset[a.id]` — the entry id — for each copied entry. Under D8 levers key on equipment ids, so it must seed one per equipment:

```ts
    setSettingsState((p) => {
      const byAsset = { ...p.byAsset };
      for (const a of src) {
        for (const unit of a.equipment ?? []) {
          if (!byAsset[unit.id]) byAsset[unit.id] = defaultActions({ ...a, equipment: [unit] });
        }
      }
      return { ...p, byAsset };
    });
```

`clone` already deep-copies the nested equipment with stable ids, so next year's copy plans against the same machines (spec §6).

- [ ] **Step 5: Delete the global layer**

```bash
git rm -r lib/assets components/assets components/tabs/activity/AssetRegistryScreen.tsx
```

Then remove, by hand:
- `migrateAssets` and `VALID_COMBUSTION_CATEGORIES` from `lib/store-helpers.ts`
- the `AssetProvider` import and the wrapping element in `components/Shell.tsx:8,110,139`
- the `assets` case from the `Nav` union and switch in `components/tabs/activity/shared.tsx`
- the Assets tile in `components/tabs/activity/HomeScreen.tsx`
- the Assets routing branch in `components/tabs/activity/ActivityDataTab.tsx`

- [ ] **Step 6: Deal with every test that references the deleted model**

Twelve test files reference `lib/assets`, `AssetProvider`, `allocationMode` or `assetAllocations`. Leaving any of them is a broken suite, and "fixing" the wrong one destroys a real regression guard. Confirm the list first:

```bash
grep -rln "allocationMode\|assetAllocations\|AssetProvider\|@/lib/assets" --include=*.test.tsx --include=*.test.ts components lib | sort
```

**Delete — they test units that no longer exist:**

| File | Why |
|---|---|
| `lib/assets/__tests__/*` (4 files) | go with the directory, already removed by the `git rm -r` in Step 5 |
| `components/assets/__tests__/asset-allocation-panel.test.tsx` | goes with `components/assets/`, same |
| `components/tabs/__tests__/asset-registry-screen.test.tsx` | the screen is deleted |
| `components/tabs/__tests__/asset-registry-nav.test.tsx` | the nav case is deleted |
| `lib/__tests__/store-assets-wiring.test.tsx` | superseded by this task's `store-wiring.test.tsx` |
| `components/tabs/__tests__/asset-allocation-entry-screen.test.tsx` | superseded by Task 6's `equipment-section.test.tsx` |

**Port to equipment fixtures in Task 7 — the behaviour they guard survives:**

| File | What it guards |
|---|---|
| `components/tabs/__tests__/builder-split-entry.test.tsx` | the split-entry branches Task 7 removes. Most of it goes, but read it first — it is where the dead "Add plan" button was pinned |
| `components/tabs/__tests__/compare-split-asset-regression.test.tsx` | CompareTab resolved-vs-raw drift. This one caught a real bug (validated by revert, "expected 0% to be 36%"). Only its fixture shape changes — **do not delete it** |
| `lib/model/__tests__/baseline-source-entry-id.test.ts` | `sourceEntryId` on emitted rows, which survives unchanged. Fixture shape only |

Delete the first group in this task. Leave the second group **failing** at the end of this task and say so in the report — Task 7 ports them. A red suite here is expected and scoped; a red suite that nobody wrote down is not.

- [ ] **Step 7: Run the wiring test**

Run: `npx vitest run lib/equipment/__tests__/store-wiring.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 8: Run the two frozen files individually**

```bash
npx vitest run components/tabs/__tests__/activity-data.test.tsx components/tabs/__tests__/empty-field-guards.test.tsx
```

Expected: PASS, both untouched. `git status` must show neither as modified. If either fails, the rewiring is wrong — do not edit the test.

- [ ] **Step 9: Full gates and the import sweep**

```bash
grep -rn "lib/assets\|AssetProvider\|useAssets\|migrateAssets" --include=*.ts --include=*.tsx lib components app
```

Expected: no output. Then `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`. The typecheck debt recorded in Task 1 Step 6 should now be **zero**; if anything remains, it belongs to Tasks 5–7 and must be listed explicitly in the report rather than left implicit.

`npm test` will be **red** on the three files Step 6 left for Task 7 to port. Name them in the report with their failure counts. No other file may be failing.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(equipment): wire the store to nested equipment, delete the asset layer

Removes AssetProvider, the registry screen, migrateAssets, the allocation panel
and the lever-minting effect that made 'Add plan' dead for every entry."
```

---

### Task 5: Add a source — four fields, and the first equipment

**Files:**
- Modify: `components/tabs/activity/SourceListScreen.tsx:120-145` (`handleAdd`) and the End-use select at ~`:380-390`
- Test: `components/tabs/activity/__tests__/source-create.test.tsx`

**Interfaces:**
- Consumes: `Equipment` (Task 1).
- Produces: nothing new. Every source created after this task satisfies D8 — at least one equipment, from birth.

**Why this comes before the equipment section (Task 6):** Task 6's UI assumes `equipment` is non-empty. If sources can still be created without it, Task 6 has to carry an empty-state branch that D8 says should not exist.

- [ ] **Step 1: Write the failing test**

`SourceListScreen` is props-driven, not store-connected — its `Props` are `def, buUnits, combustionAssets, refrigerationSystems, year, addCombustionAsset, addRefrigerationSystem, updateCombustion, updateRefrigeration, deleteCombustion, deleteRefrigeration, setNav`. Rather than fabricate a `def`, mount through `ActivityDataTab` and navigate by clicks, which is the pattern the frozen `activity-data.test.tsx` uses and the only one that survives the hydration race. Read that file's `Wrapper` before writing this.

Create `components/tabs/activity/__tests__/source-create.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider, useScenario } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { EsgProvider } from "@/lib/esg/store";
import { CompanyProvider } from "@/lib/company/store";
import { ActivityDataTab } from "@/components/tabs/ActivityDataTab";

function Probe() {
  const { combustion, baseYear } = useScenario();
  return <span data-testid="dump">{JSON.stringify(combustion[baseYear] ?? [])}</span>;
}

function mount() {
  render(
    <CompanyProvider>
      <ScenarioProvider>
        <Scope2Provider>
          <EsgProvider>
            <ActivityDataTab />
            <Probe />
          </EsgProvider>
        </Scope2Provider>
      </ScenarioProvider>
    </CompanyProvider>,
  );
}

/** Navigate home -> a stationary category -> open the add-a-source form.
 *  Starting anywhere deeper races ScenarioProvider hydration and the
 *  not-found guard redirects home first. */
function openAddForm() {
  mount();
  fireEvent.click(screen.getByRole("button", { name: /energy & emissions|stationary/i }));
  fireEvent.click(screen.getByRole("button", { name: /add a source/i }));
}

beforeEach(() => window.localStorage.clear());

describe("adding a source", () => {
  it("no longer asks for End-use (D6)", () => {
    openAddForm();
    expect(screen.queryByLabelText(/end.?use/i)).toBeNull();
  });

  it("still asks for Name, Fuel and Business unit", () => {
    openAddForm();
    expect(screen.getByLabelText(/name/i)).toBeTruthy();
    expect(screen.getByLabelText(/fuel/i)).toBeTruthy();
    expect(screen.getByLabelText(/business unit/i)).toBeTruthy();
  });

  it("mints exactly one equipment, reusing the source id (D8)", () => {
    openAddForm();
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "New boiler" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$|^save$/i }));

    const all = JSON.parse(screen.getByTestId("dump").textContent!);
    const created = all.find((e: { name: string }) => e.name === "New boiler");
    expect(created).toBeTruthy();
    expect(created.equipment).toHaveLength(1);
    expect(created.equipment[0].id).toBe(created.id);
    expect(created.equipment[0].name).toBe("New boiler");
    expect(created.equipment[0].unitCount).toBe(1);
    expect(created.equipment[0].remainingLife).toBe(10);
    expect(Object.keys(created.allocations)).toEqual([created.id]);
  });

  it("does not put remainingLife, unitCount or endUse on the source", () => {
    openAddForm();
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Plain" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$|^save$/i }));
    const all = JSON.parse(screen.getByTestId("dump").textContent!);
    const created = all.find((e: { name: string }) => e.name === "Plain");
    expect(created.remainingLife).toBeUndefined();
    expect(created.unitCount).toBeUndefined();
    expect(created.endUse).toBeUndefined();
  });

  it("leaves capacityUnit unset - no capacity has been recorded yet (D9)", () => {
    openAddForm();
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "NoCap" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$|^save$/i }));
    const all = JSON.parse(screen.getByTestId("dump").textContent!);
    expect(all.find((e: { name: string }) => e.name === "NoCap").capacityUnit).toBeUndefined();
  });
});
```

The button and label regexes above are guesses at the current copy. **Run the test, read what actually rendered, and fix the queries to match the real UI** — do not change the component to match a guessed selector.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run components/tabs/activity/__tests__/source-create.test.tsx`
Expected: FAIL — the End-use select still renders and no `equipment` array is written.

- [ ] **Step 3: Implement**

In `SourceListScreen.tsx`, delete the End-use `<select>` and its label from the add-a-source form, and drop `endUse` from the form state. Then rewrite `handleAdd`'s entry literal:

```ts
    const id = nextId();
    const line: CombustionAsset = {
      id,
      name: form.name,
      category,
      fuelType: form.fuelType,
      unit: FUELS[form.fuelType].unit,
      bu: form.bu || undefined,
      annualVolume: 0,
      opex: 0,
      // D8: a source is never without equipment. Reusing the source id here is
      // what keeps a lever keyed to this source valid if it is later split.
      equipment: [{ id, name: form.name, unitCount: 1, remainingLife: 10 }],
      allocations: { [id]: 0 },
    };
```

Leave `capacityUnit` unset — the user picks it the first time they record a capacity (Task 6).

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/tabs/activity/__tests__/source-create.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Gates and commit**

Run `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`. Confirm the frozen files are still unmodified in `git status`.

```bash
git add components/tabs/activity/SourceListScreen.tsx components/tabs/activity/__tests__/source-create.test.tsx
git commit -m "feat(activity): add-a-source drops End-use and mints the first equipment"
```

---

### Task 6: The entry-screen equipment section

**Files:**
- Create: `components/tabs/activity/EquipmentSection.tsx`
- Modify: `components/tabs/activity/EntryScreen.tsx:19,241-275` (drop the `AssetAllocationPanel` mount, the Remaining life slider at `:259`, and the source-level units field)
- Test: `components/tabs/activity/__tests__/equipment-section.test.tsx`

**Interfaces:**
- Consumes: `computeAllocation`, `basisAvailability`, `explainAllocation`, `clampAllocation`, `unallocated` (Task 2); `Equipment`, `CapacityUnit`, `AllocationBasis` (Task 1).
- Produces: `<EquipmentSection entry={CombustionAsset} onChange={(patch: Partial<CombustionAsset>) => void} />`. Task 7 does not import it.

**Layout is specified in spec §5.2** — read both mockups there before writing markup. The source header carries the capacity-unit selector (D9); rows carry bare capacity numbers. Match `SourceListScreen.tsx`'s existing table and drawer idiom rather than inventing one.

**Invariant 7 is UI work, and it is the point of Step 1's unit-total test.** Splitting a five-van fleet into two five-unit equipment silently doubles `segments.ts:75`'s mobile capex. The running total is what makes that visible. It is advisory — do not block the edit.

- [ ] **Step 1: Write the failing test**

Create `components/tabs/activity/__tests__/equipment-section.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { EquipmentSection } from "../EquipmentSection";
import type { CombustionAsset } from "@/lib/model/types";

function entry(over: Partial<CombustionAsset> = {}): CombustionAsset {
  return {
    id: "c-1", name: "PNG boiler", category: "stationary", fuelType: "png",
    unit: "m3", annualVolume: 188000, opex: 9000000,
    capacityUnit: "tph",
    equipment: [
      { id: "e1", name: "Boiler 1", capacity: 2.0, operatingHours: 6000, unitCount: 1, remainingLife: 12 },
      { id: "e2", name: "Boiler 2", capacity: 1.0, operatingHours: 6000, unitCount: 1, remainingLife: 12 },
    ],
    allocations: { e1: 125333.33, e2: 62666.67 },
    allocationBasis: "load",
    ...over,
  } as CombustionAsset;
}

const fleet = entry({
  name: "Diesel fleet", fuelType: "diesel", unit: "L",
  annualVolume: 120000, opex: 11400000, capacityUnit: undefined,
  equipment: [
    { id: "f1", name: "City vans", unitCount: 3, remainingLife: 6 },
    { id: "f2", name: "Highway vans", unitCount: 2, remainingLife: 6 },
  ],
  allocations: { f1: 72000, f2: 48000 },
  allocationBasis: "units",
});

describe("EquipmentSection", () => {
  it("lists every equipment with its volume", () => {
    render(<EquipmentSection entry={entry()} onChange={() => {}} />);
    expect(screen.getByText("Boiler 1")).toBeTruthy();
    expect(screen.getByText("Boiler 2")).toBeTruthy();
  });

  it("shows the capacity unit once, on the source, not per row (D9)", () => {
    render(<EquipmentSection entry={entry()} onChange={() => {}} />);
    const selector = screen.getByLabelText(/capacity measured in/i);
    expect((selector as HTMLSelectElement).value).toBe("tph");
    expect(screen.queryAllByText(/2\.0\s*tph/)).toHaveLength(0);
  });

  it("shows the running unit total (invariant 7)", () => {
    render(<EquipmentSection entry={fleet} onChange={() => {}} />);
    expect(screen.getByText(/5 units total/i)).toBeTruthy();
  });

  it("updates the unit total as a count is edited, without blocking the edit", () => {
    const onChange = vi.fn();
    render(<EquipmentSection entry={fleet} onChange={onChange} />);
    const row = screen.getByTestId("equipment-row-f1");
    fireEvent.change(within(row).getByLabelText(/units/i), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalled();
    const patch = onChange.mock.calls[0][0];
    expect(patch.equipment[0].unitCount).toBe(5);
  });

  it("adds equipment", () => {
    const onChange = vi.fn();
    render(<EquipmentSection entry={entry()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /add equipment/i }));
    expect(onChange.mock.calls[0][0].equipment).toHaveLength(3);
  });

  it("blocks deleting the last equipment (D8)", () => {
    const one = entry({ equipment: [{ id: "e1", name: "Only", unitCount: 1, remainingLife: 10 }], allocations: { e1: 188000 } });
    const onChange = vi.fn();
    render(<EquipmentSection entry={one} onChange={onChange} />);
    const row = screen.getByTestId("equipment-row-e1");
    fireEvent.click(within(row).getByRole("button", { name: /remove/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/at least one/i);
  });

  it("disables a basis with its stated reason rather than hiding it", () => {
    const noHours = entry({
      equipment: [
        { id: "e1", name: "B1", capacity: 2, unitCount: 1, remainingLife: 10 },
        { id: "e2", name: "B2", capacity: 1, unitCount: 1, remainingLife: 10 },
      ],
    });
    render(<EquipmentSection entry={noHours} onChange={() => {}} />);
    const load = screen.getByRole("option", { name: /load/i }) as HTMLOptionElement;
    expect(load.disabled).toBe(true);
    expect(screen.getByText(/2 equipment have no running hours/i)).toBeTruthy();
  });

  it("shows the explainer with the same number as the row", () => {
    render(<EquipmentSection entry={fleet} onChange={() => {}} />);
    expect(screen.getByText(/number of units/i)).toBeTruthy();
    expect(screen.getByText(/3 of 5 units/i)).toBeTruthy();
  });

  it("switches to manual when a volume is typed, and writes only that row", () => {
    const onChange = vi.fn();
    render(<EquipmentSection entry={fleet} onChange={onChange} />);
    const row = screen.getByTestId("equipment-row-f1");
    fireEvent.change(within(row).getByLabelText(/volume/i), { target: { value: "60000" } });
    const patch = onChange.mock.calls[0][0];
    expect(patch.allocationBasis).toBe("manual");
    expect(patch.allocations.f1).toBe(60000);
    expect(patch.allocations.f2).toBe(48000);
  });

  it("announces a clamped overshoot through an alert (invariant 3)", () => {
    const onChange = vi.fn();
    render(<EquipmentSection entry={fleet} onChange={onChange} />);
    const row = screen.getByTestId("equipment-row-f1");
    fireEvent.change(within(row).getByLabelText(/volume/i), { target: { value: "500000" } });
    expect(screen.getByRole("alert").textContent).toMatch(/scaled back/i);
  });

  it("states the leftover under manual (invariant 2)", () => {
    const under = entry({ allocationBasis: "manual", allocations: { e1: 100000, e2: 50000 } });
    render(<EquipmentSection entry={under} onChange={() => {}} />);
    expect(screen.getByText(/unallocated/i).textContent).toMatch(/38,000/);
  });

  it("hides Redistribute under manual - there is no formula to redistribute from", () => {
    render(<EquipmentSection entry={entry({ allocationBasis: "manual" })} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /redistribute/i })).toBeNull();
  });

  it("confirms before changing the capacity unit when capacities exist (D9)", () => {
    const onChange = vi.fn();
    render(<EquipmentSection entry={entry()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/capacity measured in/i), { target: { value: "kW" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /change the unit/i }));
    expect(onChange.mock.calls[0][0].capacityUnit).toBe("kW");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run components/tabs/activity/__tests__/equipment-section.test.tsx`
Expected: FAIL — `Failed to resolve import "../EquipmentSection"`.

- [ ] **Step 3: Build the component**

Create `components/tabs/activity/EquipmentSection.tsx` implementing spec §5.2. Requirements, each with a test above:

- A source header row: name, fuel, BU, annual volume, and a `Capacity measured in` `<select>` over `CapacityUnit` plus an em-dash "not recorded" option. Changing it when any equipment has a capacity opens a `role="alertdialog"` confirm before calling `onChange`.
- A table with columns: name, capacity, hours, units, remaining life, end-use, volume. Each cell inline-editable. Each row `data-testid={`equipment-row-${id}`}` and every input labelled — the tests query by label, and so do screen readers.
- Under the units column, a running total: `{n} units total`.
- `+ Add equipment` appends `{ id: nextEquipmentId(), name: "Equipment N", unitCount: 1, remainingLife: 10 }` and recomputes under the current basis.
- `Remove` on a row is blocked when it is the only one, with a `role="alert"` saying a source must keep at least one equipment. When the row carries a lever, warn before removing.
- A `Split by` `<select>` over the six bases, each `<option>` disabled per `basisAvailability`, with the reason rendered beside it.
- `Redistribute` recomputes from the current basis; hidden under `manual`.
- A volume edit sets `allocationBasis: "manual"`, writes only that row, and runs the result through `clampAllocation`. When the clamp fires, render a `role="alert"` saying the entry was scaled back.
- The explainer block renders `explainAllocation`'s `formula` and `row` verbatim. **Do not reformat the numbers** — that would reintroduce the drift §4.3 forbids.

`onChange` takes a patch: `{ equipment?, allocations?, allocationBasis?, capacityUnit? }`. `EntryScreen` applies it via `updateCombustion(year, entry.id, patch)`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/tabs/activity/__tests__/equipment-section.test.tsx`
Expected: PASS, 13 tests.

- [ ] **Step 5: Mount it in `EntryScreen`**

Replace the `AssetAllocationPanel` mount at `EntryScreen.tsx:268` with `<EquipmentSection entry={a} onChange={(patch) => updateCombustion(year, a.id, patch)} />`, and delete the import at `:19`. Delete the source-level `Remaining life` slider at `:259` and the source-level units field — both are per-equipment now. **Keep `Annual spend` on the source** (D5) and keep the spend-to-volume estimator at `:160`.

- [ ] **Step 6: Gates**

Run `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`, then re-run both frozen files individually and confirm `git status` shows them unmodified.

- [ ] **Step 7: Commit**

```bash
git add components/tabs/activity/EquipmentSection.tsx components/tabs/activity/EntryScreen.tsx components/tabs/activity/__tests__/equipment-section.test.tsx
git commit -m "feat(activity): entry-screen equipment section with basis picker and explainer"
```

---

### Task 7: Equipment rows in the scenario modeller

**Files:**
- Modify: `components/tabs/BuilderTab.tsx` — remove the split-entry disabled branches in `SuggestionCard` and `AssetActionCard`
- Modify: `components/tabs/activity/SegmentScreen.tsx` — same, in `assetMetrics` / `buRollup`
- Test: `components/tabs/__tests__/builder-equipment.test.tsx`

**Interfaces:**
- Consumes: resolved rows from the store (Task 4).
- Produces: nothing new.

**What is being deleted and why.** Port Task 9 taught the Builder to cope with a *split* entry having no lever key of its own, by disabling the suggestion and action controls for it. Under D8 there is no unsplit case: resolution always emits equipment rows, and every row has a lever key. Those branches are now dead code that disables working controls. `resolvedRowsForEntry()` and the roll-up shape it established stay — they are how a source-level display sums its equipment.

- [ ] **Step 1: Write the failing test**

Create `components/tabs/__tests__/builder-equipment.test.tsx`:

**Ruling B — do not use `data-testid` selectors here.** `BuilderTab.tsx` contains none, and the ones written below were invented. Query by visible text and accessible role instead. Where a row genuinely cannot be addressed any other way, add the testid to the component in the same commit and say so in the report. Treat every selector in this test as a guess to be corrected against what actually renders.

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { BuilderTab } from "../BuilderTab";

function mount(equipment: unknown[], allocations: Record<string, number>) {
  window.localStorage.setItem("k", JSON.stringify({
    baseYear: 2025,
    combustion: { 2025: [{
      id: "c-1", name: "PNG boiler", category: "stationary", fuelType: "png",
      unit: "m3", annualVolume: 180000, opex: 9000000, equipment, allocations,
    }] },
    settings: { byAsset: {}, bySystem: {}, assumptions: {} },
    scenarios: [],
  }));
  return render(<ScenarioProvider storageKey="k"><BuilderTab /></ScenarioProvider>);
}

const TWO = [
  { id: "e1", name: "Boiler 1", unitCount: 1, remainingLife: 12, endUse: "process" },
  { id: "e2", name: "Boiler 2", unitCount: 1, remainingLife: 12, endUse: "process" },
];

describe("BuilderTab with equipment", () => {
  it("shows a row per equipment, named after the machine", () => {
    mount(TWO, { e1: 120000, e2: 60000 });
    expect(screen.getByText("Boiler 1")).toBeTruthy();
    expect(screen.getByText("Boiler 2")).toBeTruthy();
  });

  it("offers suggestions on a split source - the disabled branch is gone", () => {
    mount(TWO, { e1: 120000, e2: 60000 });
    const row = screen.getByTestId("asset-row-e1");
    const apply = within(row).getByRole("button", { name: /apply suggestion/i });
    expect(apply.hasAttribute("disabled")).toBe(false);
    expect(within(row).queryByText(/split across/i)).toBeNull();
  });

  it("shows no 'no plan' text for a source whose equipment carry levers", () => {
    mount(TWO, { e1: 120000, e2: 60000 });
    expect(screen.queryByText(/no plan/i)).toBeNull();
  });

  it("leaves a sibling unabated when a lever is set on one machine (D3)", () => {
    mount(TWO, { e1: 120000, e2: 60000 });
    const e2 = screen.getByTestId("asset-row-e2");
    expect(within(e2).getByTestId("abatement").textContent).toMatch(/^0/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run components/tabs/__tests__/builder-equipment.test.tsx`
Expected: FAIL — the suggestion control is disabled and the "split across assets" explanation renders.

- [ ] **Step 3: Delete the split-entry branches**

Find them first and list every hit in the report before editing:

```bash
grep -rn "split entr\|isSplit\|allocationMode\|resolvedRowsForEntry" --include=*.tsx components | grep -v __tests__
```

In `BuilderTab.tsx`, remove the `disabled` condition and its explanatory text from `SuggestionCard` and `AssetActionCard`. In `SegmentScreen.tsx`, remove the equivalent guard in `assetMetrics` / `buRollup`. **Keep `resolvedRowsForEntry()`** — the roll-up is still how a source-level display sums its equipment.

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/tabs/__tests__/builder-equipment.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Port the three test files Task 4 left red**

These are the last references to the old model, and each needs a different treatment. Read each file before touching it.

**`components/tabs/__tests__/builder-split-entry.test.tsx`** — most of it asserts the disabled branches this task deletes, so most of it goes. But `:205` pins the dead "Add plan" button:

```ts
it("shows a 'split across its assets' message instead of a dead 'Add plan' button on the per-asset editor", () => {
  expect(screen.queryByRole("button", { name: /^Add plan$/i })).toBeFalsy();
});
```

That expectation is now **inverted**, not deleted. Under D8 the button is live — that is the defect the port ledger left open. Rewrite it as `expect(...).toBeTruthy()` with an equipment fixture, and keep it: it is the only automated guard that the dead button stays dead-no-more.

**`components/tabs/__tests__/compare-split-asset-regression.test.tsx`** — **do not delete.** It caught a real bug, validated by revert with the signature `expected 0% to be 36%`. Change only its fixture shape: `allocationMode: "byAsset"` + `assetAllocations: { id: { volume } }` becomes `equipment: [...]` + `allocations: { id: volume }`. The assertions stay byte-for-byte. After porting, re-validate it the same way — revert one of Task 4's `resolvedBaseAssets` switches, confirm the test fails, then restore. Paste the failure signature into the report; a regression test nobody has seen fail is not yet a regression test.

**`lib/model/__tests__/baseline-source-entry-id.test.ts`** — fixture shape only. `sourceEntryId` behaviour is unchanged.

- [ ] **Step 6: Gates and commit**

Run all four gates plus the frozen files. `npm test` must now be **fully green** — this is the task that closes Task 4's scoped red suite. Record the final count against the 600/1 baseline.

```bash
git add -A
git commit -m "feat(builder): equipment rows; drop the split-entry disabled branches

Ports the three test files the asset-layer deletion left red. The dead
'Add plan' assertion is inverted rather than removed - the button is alive
under D8, which is the port ledger's open defect closed."
```

---

### Task 8: Browser verification, then a preview deploy

**Files:** none — this task produces evidence, not code.

**This is the task the spec exists because of.** 600 passing tests, a clean build and a clean typecheck did not surface a defect that thirty seconds of clicking did. Nothing here may be inferred from a passing suite.

- [ ] **Step 1: Full gates one more time, from clean**

```bash
npx tsc --noEmit && npm test && npm run lint && npm run build
```

Record all four outputs. Lint must be at **3 errors / 22 warnings**, not higher. Confirm `git status` shows both frozen test files unmodified across the whole branch:

```bash
git diff --stat main...HEAD -- components/tabs/__tests__/activity-data.test.tsx components/tabs/__tests__/empty-field-guards.test.tsx
```

Expected: empty output.

- [ ] **Step 2: Run it and click through the real flow**

`npm run dev`, then walk: **Activity data → Home → a fuel category → a source row → entry screen**. Record what you see at each of these, with a screenshot:

0. **Clear localStorage first**, then load. `lib/company/seed.ts` deliberately still holds legacy-shaped JSON (`remainingLife`, `unitCount` on the entry, no `equipment`) — it is not migrated at rest, it is migrated on hydrate. That makes it the best available fixture for the real upgrade path, so do not "fix" it.
1. The migrated seed company loads with all seven sources, each showing exactly one equipment.
2. The DG Set's equipment carries **30 units** — the count survived migration. This is the single most important observation in this task; it is what the whole D8 amendment was for.
3. Opening a **diesel** source offers **no** Coal, PNG, LPG or Biogas as split targets. Nothing outside this source appears at all. This is the §1 defect; confirm it is unreachable.
4. Adding a second equipment splits the volume under the default `load` basis, and the explainer's worked row quotes the same number the row shows.
5. Typing a volume switches the basis to `manual` and leaves the sibling alone.
6. Typing a volume larger than the source total scales back and announces it.
7. The unit total updates live as counts are edited.
8. Changing the capacity unit asks for confirmation.
9. Deleting down to the last equipment is refused with a visible message.
10. In the Builder, the two machines show as separate rows, and a lever on one leaves the other unabated.
11. **"Add plan" is alive** — the dead-button defect from the port ledger is gone.

- [ ] **Step 3: Check the spend arithmetic in the running app**

On a split source, confirm the sum of the equipment's apportioned spend equals the source's annual spend. This is invariant 6 in the real app rather than in a unit test — the defect it fixes was invisible to 600 tests.

- [ ] **Step 4: Preview deploy**

```bash
git push -u origin asset-layer-port
npx vercel --yes
```

Record the preview URL in the report. Do **not** promote to production: production has been serving the 26 Jun build and promoting is the owner's call, not this task's.

- [ ] **Step 5: Report**

Write the findings into `.superpowers/sdd/2026-08-24-source-equipment-split/progress.md`, including anything from Step 2 that did not behave as described. A step that behaved differently is the finding — record it rather than adjusting the expectation.

---

## Notes for the executor

**The trap that cost the port a review round.** Any test mounting `ScenarioProvider` without seeding storage hydrates `DEFAULT_COMBUSTION_BY_YEAR` and pollutes every id and count assertion. Seed `combustion` explicitly, always — every test in this plan does.

**The second trap.** Navigating straight to `initialNav {level:"entry"}` races `ScenarioProvider`'s hydration; `EntryScreen`'s not-found guard redirects home first. Start at home and navigate by clicks.

**Do not edit a pre-existing test to make a change pass.** Zero pre-existing test files were edited across the port's 27 commits. Task 2's note on the `even` / `units` rename is the only sanctioned exception in this plan, and even there the old file is left alone and deleted wholesale in Task 4.

**If a task's premise turns out to be false, stop and say so.** Task 3 Step 3 exists precisely because the 2026-08-20 spec asserted behaviour the code did not have, and nobody checked for three days.
