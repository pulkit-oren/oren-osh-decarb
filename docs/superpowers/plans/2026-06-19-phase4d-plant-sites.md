# Phase 4d — Plant Head Site Grouping (Scope 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Let combustion assets be tagged with a **site**, and add a **site filter** to the Scope 1 data-input tab so a plant head can work with just their site's fuels. Plus a small site chip per row.

**Architecture:** One optional `site?` field on `CombustionAsset` (backward-compatible). A pure, tested `lib/sites.ts` (`siteList`, `filterBySite`). The Scope 1 `DataInputTab` gains a site `<select>` filter (shown when ≥1 site exists) and a Site text field in the detail panel. No engine/store-action changes (`updateCombustion` already takes a partial patch).

**Tech Stack:** Next.js 16 (custom — `AGENTS.md`), React 19, Tailwind v4, Vitest + `react-dom/server`.

## Global Constraints

- `site` is OPTIONAL; absent ⇒ "unassigned" (asset shows under every filter / "All sites").
- Scope 2 site grouping + lever-by-site grouping in the Builder are OUT (later).
- No git: replace "commit" with `npm test` + manual check at http://localhost:3000.
- Run commands from `osh-decarbonization-dashboard-master/`.

---

### Task 1: Pure site helpers

**Files:**
- Create: `lib/sites.ts`
- Test: `lib/__tests__/sites.test.ts`

**Interfaces:**
- `function siteList(assets: { site?: string }[]): string[]` — sorted unique non-empty sites.
- `function filterBySite<T extends { site?: string }>(assets: T[], site: string): T[]` — `""` ⇒ all.

- [ ] **Step 1: Write the failing test.**

```ts
// lib/__tests__/sites.test.ts
import { describe, expect, it } from "vitest";
import { siteList, filterBySite } from "../sites";

const assets = [
  { id: "a", site: "Pune plant" },
  { id: "b", site: "HQ" },
  { id: "c" },
  { id: "d", site: "Pune plant" },
];

describe("siteList", () => {
  it("returns sorted unique non-empty sites", () => {
    expect(siteList(assets)).toEqual(["HQ", "Pune plant"]);
    expect(siteList([{ id: "x" }])).toEqual([]);
  });
});

describe("filterBySite", () => {
  it("filters to one site; empty string returns all", () => {
    expect(filterBySite(assets, "Pune plant").map((a) => a.id)).toEqual(["a", "d"]);
    expect(filterBySite(assets, "").map((a) => a.id)).toEqual(["a", "b", "c", "d"]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** Run: `npm test -- sites` → FAIL.

- [ ] **Step 3: Implement `lib/sites.ts`.**

```ts
export function siteList(assets: { site?: string }[]): string[] {
  const set = new Set<string>();
  for (const a of assets) {
    const s = (a.site ?? "").trim();
    if (s) set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function filterBySite<T extends { site?: string }>(assets: T[], site: string): T[] {
  if (!site) return assets;
  return assets.filter((a) => (a.site ?? "").trim() === site);
}
```

- [ ] **Step 4: Run — expect PASS.** Run: `npm test -- sites` → PASS.

---

### Task 2: Add `site` to the combustion type

**Files:**
- Modify: `lib/model/types.ts`

- [ ] **Step 1:** In `interface CombustionAsset`, after the `inputMode?` line, add:

```ts
  /** Optional site / location tag for plant-level filtering. */
  site?: string;
```

---

### Task 3: Site filter + detail field in the Scope 1 Data Input tab

**Files:**
- Modify: `components/tabs/DataInputTab.tsx`

**Interfaces:**
- Consumes: `siteList`, `filterBySite` from `@/lib/sites`; `useState` (already imported).

- [ ] **Step 1: Import the helpers.** Add:

```tsx
import { siteList, filterBySite } from "@/lib/sites";
```

- [ ] **Step 2: Add filter state + derived lists.** After the `const [sel, setSel] = useState<Sel>(null);` line in `DataInputTab`, add:

```tsx
  const [siteFilter, setSiteFilter] = useState("");
  const sites = siteList(selectedAssets);
  const shownAssets = filterBySite(selectedAssets, siteFilter);
```

- [ ] **Step 3: Render the table over `shownAssets`.** In the combustion table body, change `{selectedAssets.map((a) => {` to `{shownAssets.map((a) => {`.

- [ ] **Step 4: Add the site filter to the combustion card header.** The combustion `CardHeader`'s `right` prop is a `<div className="flex items-center gap-2"> … </div>`. Add the filter as its first child (before `<CopyFrom …>`):

```tsx
              {sites.length > 0 && (
                <select
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                  aria-label="Filter by site"
                  className="border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400"
                >
                  <option value="">All sites</option>
                  {sites.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
```

- [ ] **Step 5: Show the site chip on each row.** In the asset-name cell's flex (which holds `TextCell` + `ReliabilityBadge`), add after the badge:

```tsx
                          {a.site && <span className="shrink-0 text-[10px] text-ink-faint truncate max-w-[80px]">{a.site}</span>}
```

- [ ] **Step 6: Add a Site field to the combustion detail panel.** In `CombustionDetails`, immediately after the `<SectionLabel>Inputs (averaged …)</SectionLabel>` line and before the metered/spend toggle `<div>`, add:

```tsx
        <label className="block mb-4">
          <span className="text-xs font-medium text-ink-soft">Site / location</span>
          <input
            value={a.site ?? ""}
            onChange={(e) => updateCombustion(year, a.id, { site: e.target.value })}
            placeholder="e.g. Pune plant"
            className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
            aria-label="Site or location"
          />
        </label>
```

- [ ] **Step 7: Run the full suite.** Run: `npm test` → all pass (the existing data-input render test still green).

- [ ] **Step 8: Production build + manual check.** Run: `npm run build` → compiles, TS passes. Then `npm run dev` → http://localhost:3000, Scope 1 → Data input:
  - Open a fuel's details (⚙), type a **Site** (e.g. "Pune plant") on two rows and another site on a third.
  - A **site filter** dropdown appears in the combustion card header; picking a site narrows the table to that site; "All sites" restores it.
  - Tagged rows show a small site chip next to the reliability badge.
  - As **Plant Head**, the data-input tab is now site-filterable.

---

## Self-Review

**1. Spec coverage (Phase 4d scope):** Plant Head site-level data → `site` field + site filter + per-row chip + detail field (Tasks 2-3). Pure, tested grouping logic → `lib/sites.ts` (Task 1). Lever-by-site grouping in the Builder + Scope 2 sites + bulk upload → deferred (Global Constraints; bulk upload is Phase 3b).

**2. Placeholder scan:** None — full code in every step.

**3. Type consistency:** `site?: string` added to `CombustionAsset` (Task 2) is consumed by `siteList`/`filterBySite` (structural `{ site?: string }`, Task 1) and by `updateCombustion(year, id, { site })` (partial-patch, Task 3 Step 6) and `a.site` reads (Steps 5-6). `shownAssets` is a `CombustionAsset[]` (from `filterBySite(selectedAssets, …)`) so the table's existing per-row code is unchanged.

**Next:** Phase 3b — tile-add + paste import; Phase 5 — seeded boardroom scenarios; (optional) Builder lever-by-site grouping + Scope 2 sites.
