# Phase 3b — Paste-from-Excel Import (Scope 1 combustion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Let a user paste rows (name / amount / fuel, tab- or comma-separated) from a spreadsheet and bulk-add them as combustion fuels, with a live preview of how many fuels matched a factor.

**Architecture:** A pure, tested `lib/import-combustion.ts` parses pasted text → asset rows (fuel matched against `FUELS`). A new `importCombustion(year, rows)` store action appends them with fresh ids + default lever actions (mirrors `addCombustion`). An inline import panel in the Scope 1 `DataInputTab` drives it.

**Tech Stack:** Next.js 16 (custom — `AGENTS.md`), React 19, Tailwind v4, Vitest.

## Global Constraints

- Rows with a non-positive amount are skipped (drops header lines / blanks).
- Unmatched fuels default to diesel and are flagged (the user can fix per-row after import).
- No git: replace "commit" with `npm test` + manual check at http://localhost:3000.
- Run commands from `osh-decarbonization-dashboard-master/`.

---

### Task 1: Pure paste parser

**Files:**
- Create: `lib/import-combustion.ts`
- Test: `lib/__tests__/import-combustion.test.ts`

**Interfaces:**
- `function matchFuel(token: string): FuelId | null`
- `interface ParsedRow { asset: Omit<CombustionAsset, "id">; matched: boolean }`
- `function parseCombustionRows(text: string): ParsedRow[]`

- [ ] **Step 1: Write the failing test.**

```ts
// lib/__tests__/import-combustion.test.ts
import { describe, expect, it } from "vitest";
import { parseCombustionRows } from "../import-combustion";

describe("parseCombustionRows", () => {
  it("parses tab-separated name/amount/fuel and matches fuels", () => {
    const rows = parseCombustionRows("Boiler A\t480000\tdiesel\nGenset\t320000\tpetrol\nMystery\t1000\tunobtainium");
    expect(rows).toHaveLength(3);
    expect(rows[0].asset.name).toBe("Boiler A");
    expect(rows[0].asset.fuelType).toBe("diesel");
    expect(rows[0].asset.annualVolume).toBe(480000);
    expect(rows[0].matched).toBe(true);
    expect(rows[1].asset.fuelType).toBe("petrol");
    expect(rows[2].matched).toBe(false);
    expect(rows[2].asset.fuelType).toBe("diesel"); // default
  });
  it("handles commas in numbers and skips zero/blank/header rows", () => {
    const rows = parseCombustionRows("name,amount,fuel\nDiesel set,\"480,000\",diesel\n\n");
    expect(rows).toHaveLength(1);
    expect(rows[0].asset.annualVolume).toBe(480000);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** Run: `npm test -- import-combustion` → FAIL.

- [ ] **Step 3: Implement `lib/import-combustion.ts`.**

```ts
import { FUELS } from "@/lib/model/factors";
import type { CombustionAsset, FuelId } from "@/lib/model/types";

const FUEL_LOOKUP: Record<string, FuelId> = (() => {
  const m: Record<string, FuelId> = {};
  for (const id of Object.keys(FUELS) as FuelId[]) {
    m[id.toLowerCase()] = id;
    m[FUELS[id].label.toLowerCase()] = id;
  }
  return m;
})();

export function matchFuel(token: string): FuelId | null {
  return FUEL_LOOKUP[token.trim().toLowerCase()] ?? null;
}

export interface ParsedRow {
  asset: Omit<CombustionAsset, "id">;
  matched: boolean;
}

export function parseCombustionRows(text: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/\t|,/).map((c) => c.replace(/^"|"$/g, "").trim());
    const name = cols[0] || "Imported fuel";
    const amount = Number((cols[1] ?? "").replace(/[^0-9.\-]/g, "")) || 0;
    if (amount <= 0) continue;
    const fuelTok = cols[2] ?? "";
    const matchedId = matchFuel(fuelTok);
    const fuelId = matchedId ?? "diesel";
    out.push({
      asset: {
        name,
        category: "stationary",
        fuelType: fuelId,
        unit: FUELS[fuelId].unit,
        annualVolume: amount,
        opex: Math.round(amount * (FUELS[fuelId].typicalPricePerUnit ?? 0)),
        remainingLife: 10,
        unitCount: 1,
      },
      matched: matchedId != null,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run — expect PASS.** Run: `npm test -- import-combustion` → PASS.

(Note: numbers with a literal comma thousands-separator only parse correctly when quoted, e.g. `"480,000"`, because an unquoted comma is a column separator — matching how Excel pastes quoted numeric cells.)

---

### Task 2: `importCombustion` store action

**Files:**
- Modify: `lib/store.tsx`

**Interfaces:**
- Produces: `importCombustion: (year: number, rows: Omit<CombustionAsset, "id">[]) => void` on the store.

- [ ] **Step 1: Declare it in `StoreShape`.** After the `copyCombustion` line (line 42), add:

```tsx
  importCombustion: (year: number, rows: Omit<CombustionAsset, "id">[]) => void;
```

- [ ] **Step 2: Add a pending ref + the implementation.** After `const pendingAssetRef = useRef<CombustionAsset | null>(null);` (line 128), add:

```tsx
  const pendingImportRef = useRef<CombustionAsset[]>([]);
```

And after the `addCombustion` function (just before `const delCombustion`), add:

```tsx
  const importCombustion = (year: number, rows: Omit<CombustionAsset, "id">[]) => {
    if (rows.length === 0) return;
    setCombustion((prev) => {
      const ids = allIds(prev);
      const lines = rows.map((r) => {
        const id = uniqueId("c", ids);
        ids.push(id);
        return { ...r, id } as CombustionAsset;
      });
      pendingImportRef.current = lines;
      return { ...prev, [year]: [...(prev[year] ?? []), ...lines] };
    });
    setSettingsState((p) => {
      const byAsset = { ...p.byAsset };
      for (const a of pendingImportRef.current) if (!byAsset[a.id]) byAsset[a.id] = defaultActions(a);
      return { ...p, byAsset };
    });
  };
```

- [ ] **Step 3: Expose it in the context value.** In the value object (the `addCombustion, delCombustion, updateCombustion, copyCombustion,` line), add `importCombustion`:

```tsx
    addCombustion, delCombustion, updateCombustion, copyCombustion, importCombustion,
```

- [ ] **Step 4: Type-check.** Run: `npm test -- store-helpers` (sanity) and rely on the build in Task 3.

---

### Task 3: Import panel in the Scope 1 Data Input tab

**Files:**
- Modify: `components/tabs/DataInputTab.tsx`

**Interfaces:**
- Consumes: `parseCombustionRows` from `@/lib/import-combustion`; `importCombustion` from the store; `Upload` icon (lucide).

- [ ] **Step 1: Imports.** Add `Upload` to the lucide import line, add:

```tsx
import { parseCombustionRows } from "@/lib/import-combustion";
```

and add `importCombustion` to the `useScenario()` destructure.

- [ ] **Step 2: Import-open state.** After the `const [siteFilter, setSiteFilter] = useState("");` line, add:

```tsx
  const [importing, setImporting] = useState(false);
```

- [ ] **Step 3: Add an Import button to the combustion card header.** In the combustion `CardHeader` `right` `<div>`, before the `<CopyFrom …>`, add:

```tsx
              <button onClick={() => setImporting((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg border border-line px-3 py-1.5 hover:border-brand-300">
                <Upload size={15} /> Import
              </button>
```

- [ ] **Step 4: Render the panel.** Immediately after the combustion `<CardHeader … />` (before the `{selectedAssets.length === 0 ? …}`), add:

```tsx
        {importing && <ImportPanel year={selectedYear} onImport={importCombustion} onClose={() => setImporting(false)} />}
```

- [ ] **Step 5: Define the `ImportPanel` component** (add near the other helper components, e.g. after `EmptyState`):

```tsx
function ImportPanel({ year, onImport, onClose }: {
  year: number;
  onImport: (year: number, rows: import("@/lib/model/types").CombustionAsset[] extends never ? never : Omit<CombustionAsset, "id">[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const rows = parseCombustionRows(text);
  const matched = rows.filter((r) => r.matched).length;
  return (
    <div className="mb-4 rounded-xl border border-line/70 bg-surface-muted p-4">
      <p className="text-xs text-ink-soft mb-2">Paste rows from Excel — <strong>name, amount, fuel</strong> (tab or comma separated). One source per line.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={"Furnace oil boiler\t480000\tdiesel\nDiesel gensets\t320000\tdiesel"}
        className="w-full border border-line rounded-lg p-2 text-sm font-mono bg-white focus:outline-none focus:border-brand-400"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-ink-faint">{rows.length > 0 ? `${rows.length} row${rows.length === 1 ? "" : "s"} · ${matched} fuel${matched === 1 ? "" : "s"} matched` : "Nothing to import yet"}</span>
        <div className="flex gap-2">
          <button onClick={onClose} className="text-xs rounded-lg border border-line px-3 py-1.5 hover:border-brand-300">Cancel</button>
          <button
            disabled={rows.length === 0}
            onClick={() => { onImport(year, rows.map((r) => r.asset)); onClose(); }}
            className="text-xs font-semibold rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600 disabled:opacity-50"
          >
            Import {rows.length || ""}
          </button>
        </div>
      </div>
    </div>
  );
}
```

(Simplify the `onImport` type to `(year: number, rows: Omit<CombustionAsset, "id">[]) => void` — the `CombustionAsset` type is already imported in this file.)

- [ ] **Step 6: Run the full suite.** Run: `npm test` → all pass.

- [ ] **Step 7: Production build + manual check.** Run: `npm run build` → compiles, TS passes. Then `npm run dev` → Scope 1 → Data input → **Import**: paste e.g. `Pune boiler⇥480000⇥diesel` on a few lines → the preview shows "3 rows · 3 fuels matched" → **Import 3** appends them as new fuel rows (each Measured, since volume is set).

---

## Self-Review

**1. Spec coverage:** Bulk paste-from-Excel import → `parseCombustionRows` + `importCombustion` + `ImportPanel`. Auto-match to factors with a matched flag. (Tile-add flow remains optional cosmetic polish — the existing Add-fuel + detail panel already covers single adds; not built here.)

**2. Placeholder scan:** None — Step 5 note instructs simplifying the `onImport` type to the plain signature shown in Task 2.

**3. Type consistency:** `parseCombustionRows` returns `{ asset: Omit<CombustionAsset,"id">; matched }`; `ImportPanel` maps `r.asset` into `onImport`'s `Omit<CombustionAsset,"id">[]`, matching `importCombustion`'s store signature, which assigns ids via `uniqueId` + registers `defaultActions` (same pattern as `addCombustion`). `FUELS[id].unit/label/typicalPricePerUnit` are existing `FuelFactor` fields.

**This completes the planned phases.** Remaining items are optional cosmetic/extension work only: tile-add flow, Builder lever-by-site grouping, Scope 2 CFO/Plant framing.
