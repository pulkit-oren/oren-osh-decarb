# Phase 1 — Quixotic Restyle + Chrome Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the app shell into the "Quixotic" design language (light-grey page, rounded white app frame, floating left icon rail, soft very-rounded cards, green gradient hero card, delta pills) without changing any behaviour, and add the presentational `PillNav` slot that Phase 2's persona switcher will fill.

**Architecture:** Pure restyle. Tailwind v4 `@theme` tokens in `app/globals.css` drive everything; we add a couple of tokens and lightly restyle `Shell`, `Sidebar`, `Topbar`, `Card`, plus two new presentational primitives (`HeroCard`, `PillNav`). No store, model, or persona logic changes. The existing smoke test (`components/__tests__/shell-render.test.tsx`) stays the guard that the app still server-renders.

**Tech Stack:** Next.js (custom build — see `AGENTS.md`; read `node_modules/next/dist/docs/` before touching Next APIs), React 19, Tailwind CSS v4 (`@theme` tokens), TypeScript, Vitest + `react-dom/server` for smoke tests, lucide-react icons.

## Global Constraints

- This is NOT stock Next.js — read the relevant guide in `node_modules/next/dist/docs/` before writing any Next-specific code (per `AGENTS.md`). Phase 1 touches no Next APIs, so this should not come up.
- Tailwind v4: design tokens live in `@theme` in `app/globals.css` and generate utilities (e.g. `--radius-xl2` → `rounded-xl2`, `--color-brand-500` → `bg-brand-500`). Do not add a `tailwind.config.js`.
- Keep the emerald `brand` palette as-is (`brand-500 = #1F9E5A`). Do NOT recolor; only add surface/radius/status tokens.
- Every task ends with `npm test` green and the app still rendering. Run from `osh-decarbonization-dashboard-master/`.
- No git: this project is not a git repository. Replace the "commit" step in each task with running the test suite and (where visual) a manual check via the `run` skill / `npm run dev`.

---

### Task 1: Add Quixotic surface, radius, and status tokens

**Files:**
- Modify: `app/globals.css:10-67` (the `@theme` block)
- Test (guard): `components/__tests__/shell-render.test.tsx` (unchanged — must still pass)

**Interfaces:**
- Produces: new Tailwind utilities available app-wide:
  - `rounded-xl3` (28px) from `--radius-xl3`
  - `bg-good`/`text-good`, `bg-warn`/`text-warn`, `bg-bad`/`text-bad`, `bg-info`/`text-info` from `--color-good|warn|bad|info`
  - `bg-surface-page` stays but is retuned to a cleaner cool grey.

- [ ] **Step 1: Add the new tokens to the `@theme` block.**

In `app/globals.css`, inside `@theme { … }`, add after the `--color-line` line (line 51):

```css
  /* Status accents (data-quality + on/off-track) */
  --color-good: #1F9E5A;   /* = brand-500, measured / on-track */
  --color-warn: #F0A020;   /* estimated / off-track */
  --color-bad:  #EF4444;   /* missing / dilutive */
  --color-info: #6366F1;   /* CEO lens / "ahead of curve" */
```

And add after the existing `--radius-xl2: 20px;` line:

```css
  --radius-xl3: 28px;
```

- [ ] **Step 2: Retune the page surface to the Quixotic cool grey.**

Change the existing token (was `#ECEBE4` warm):

```css
  --color-surface-page:  #E7E9ED;
```

- [ ] **Step 3: Soften the warm atmosphere for the flatter Quixotic look.**

In the `body` background-image rule (lines 80-86), reduce the gradient-mesh opacity so the page reads as clean grey. Replace the three `radial-gradient` alpha values `0.10 / 0.08 / 0.07` with `0.05 / 0.04 / 0.035`. Leave the grain `body::before` as-is (it's already subtle at 0.5 opacity × 0.028 slope).

- [ ] **Step 4: Run the smoke test to confirm nothing broke.**

Run: `npm test -- shell-render`
Expected: PASS (1 test). Tokens are CSS-only; the server-rendered HTML is unaffected.

- [ ] **Step 5: Visual check.**

Run `npm run dev`, open http://localhost:3000. Expected: page background is a cleaner cool grey; everything else unchanged. (No commit — not a git repo.)

---

### Task 2: `HeroCard` primitive (green gradient stat card)

**Files:**
- Create: `components/ui/HeroCard.tsx`
- Test: `components/ui/__tests__/HeroCard.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  function HeroCard(props: {
    tag: string;          // small uppercase eyebrow, e.g. "Target · 2030"
    value: string;        // big number, e.g. "2,465"
    unit?: string;        // e.g. "tCO₂e"
    note?: string;        // line under the value, e.g. "▼ 42% vs baseline"
    footLeft?: string;    // bottom-left caption
    footRight?: string;   // bottom-right chip
    className?: string;
  }): JSX.Element
  ```

- [ ] **Step 1: Write the failing test.**

```tsx
// components/ui/__tests__/HeroCard.test.tsx
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { HeroCard } from "../HeroCard";

describe("HeroCard", () => {
  it("renders tag, value, unit and footer chip", () => {
    const html = renderToString(
      <HeroCard tag="Target · 2030" value="2,465" unit="tCO₂e" note="▼ 42%" footLeft="Baseline" footRight="4,250 t" />,
    );
    expect(html).toContain("Target · 2030");
    expect(html).toContain("2,465");
    expect(html).toContain("tCO₂e");
    expect(html).toContain("4,250 t");
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `npm test -- HeroCard`
Expected: FAIL — cannot find module `../HeroCard`.

- [ ] **Step 3: Implement the component.**

```tsx
// components/ui/HeroCard.tsx
import { cn } from "@/lib/utils";

export function HeroCard({
  tag, value, unit, note, footLeft, footRight, className,
}: {
  tag: string; value: string; unit?: string; note?: string;
  footLeft?: string; footRight?: string; className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl3 p-5 text-white",
        "bg-gradient-to-br from-brand-500 to-brand-700",
        "shadow-[0_18px_36px_-18px_rgba(19,99,58,0.65)]",
        className,
      )}
    >
      <span aria-hidden className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-white/10" />
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-85">{tag}</p>
      <p className="mt-3 text-[34px] font-extrabold leading-none tracking-tight">
        {value}{unit && <span className="ml-1.5 text-[15px] font-semibold opacity-85">{unit}</span>}
      </p>
      {note && <p className="mt-1 text-[13px] font-semibold opacity-90">{note}</p>}
      {(footLeft || footRight) && (
        <div className="mt-3.5 flex items-center justify-between text-xs opacity-90">
          <span>{footLeft}</span>
          {footRight && <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-bold">{footRight}</span>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: `npm test -- HeroCard`
Expected: PASS (1 test).

- [ ] **Step 5: Verify the suite is still green.**

Run: `npm test`
Expected: all tests pass.

---

### Task 3: `PillNav` primitive (centered segmented pill — the lens-switcher slot)

**Files:**
- Create: `components/ui/PillNav.tsx`
- Test: `components/ui/__tests__/PillNav.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  type PillNavItem = { key: string; label: string; sub?: string; dotClass?: string };
  function PillNav(props: {
    items: PillNavItem[];
    active: string;
    onSelect: (key: string) => void;
    className?: string;
  }): JSX.Element
  ```
- Consumed by: Task 4 (rendered in `Shell`, initially with a single static item so layout is correct); Phase 2 wires it to persona state.

- [ ] **Step 1: Write the failing test.**

```tsx
// components/ui/__tests__/PillNav.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { PillNav } from "../PillNav";

describe("PillNav", () => {
  it("renders each item's label and marks the active one", () => {
    const html = renderToString(
      <PillNav
        active="ceo"
        onSelect={() => {}}
        items={[
          { key: "ceo", label: "CEO", sub: "Raghav" },
          { key: "cfo", label: "CFO" },
        ]}
      />,
    );
    expect(html).toContain("CEO");
    expect(html).toContain("Raghav");
    expect(html).toContain("CFO");
    expect(html).toContain('aria-current="true"'); // active item flagged
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `npm test -- PillNav`
Expected: FAIL — cannot find module `../PillNav`.

- [ ] **Step 3: Implement the component.**

```tsx
// components/ui/PillNav.tsx
"use client";
import { cn } from "@/lib/utils";

export type PillNavItem = { key: string; label: string; sub?: string; dotClass?: string };

export function PillNav({
  items, active, onSelect, className,
}: {
  items: PillNavItem[]; active: string; onSelect: (key: string) => void; className?: string;
}) {
  return (
    <div className={cn("inline-flex gap-1 rounded-full bg-surface-muted p-1.5", className)}>
      {items.map((it) => {
        const on = it.key === active;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onSelect(it.key)}
            aria-current={on}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors",
              on ? "bg-surface text-brand-700 shadow-card" : "text-ink-soft hover:text-ink",
            )}
          >
            {it.dotClass && <span className={cn("w-2 h-2 rounded-full", it.dotClass)} />}
            {it.label}
            {it.sub && <span className="font-medium text-ink-faint">{it.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes.**

Run: `npm test -- PillNav`
Expected: PASS (1 test).

- [ ] **Step 5: Verify the suite is still green.**

Run: `npm test`
Expected: all tests pass.

---

### Task 4: Restyle the app frame and rail rounding

**Files:**
- Modify: `components/Shell.tsx:44-63` (the layout wrapper)
- Modify: `components/ui/Card.tsx:15-19` (card radius)
- Test (guard): `components/__tests__/shell-render.test.tsx`

**Interfaces:**
- Consumes: `rounded-xl3` token from Task 1.

- [ ] **Step 1: Bump the main panel to the Quixotic rounded frame.**

In `components/Shell.tsx`, change the `<div className="bg-surface/90 …">` (line 47) — replace `rounded-xl2` with `rounded-xl3` and soften the panel so cards read as floating:

```tsx
            <div className="bg-surface/90 backdrop-blur-md rounded-xl3 shadow-card-lg p-4 md:p-7 min-h-[calc(100vh-2rem)] pb-24 md:pb-7">
```

- [ ] **Step 2: Round the cards a touch more.**

In `components/ui/Card.tsx`, change the class string (line 16) from `rounded-xl2` to `rounded-xl3`:

```tsx
        "rounded-xl3 shadow-card border border-line/40 p-5 lift",
```

- [ ] **Step 3: Round the sidebar rail groups.**

In `components/Sidebar.tsx`, the three rail containers use `rounded-2xl` (logo line 75, nav line 83, footer line 108) and the scope switch (line 38) uses `rounded-2xl`. These already match the look — leave them. (No change; documented so the implementer doesn't go hunting.)

- [ ] **Step 4: Run the smoke test.**

Run: `npm test -- shell-render`
Expected: PASS — server HTML still contains "Acme Industries Ltd" and is >1000 chars.

- [ ] **Step 5: Visual check.**

Run `npm run dev`. Expected: the main content panel and cards have a larger, softer corner radius; layout otherwise identical.

---

### Task 5: Reserve the centered PillNav slot in the Topbar

**Files:**
- Modify: `components/Topbar.tsx:71-114`
- Test (guard): `components/__tests__/shell-render.test.tsx`

**Interfaces:**
- Consumes: nothing yet — renders a single static `PillNav` item so the centered layout is correct and ready for Phase 2 to feed persona items. Keeps the title on the left and the action cluster on the right.

- [ ] **Step 1: Import PillNav.**

At the top of `components/Topbar.tsx`, add:

```tsx
import { PillNav } from "./ui/PillNav";
```

- [ ] **Step 2: Insert the centered PillNav between the title and the action cluster.**

In the `<header>` (line 73), after the title `<div>…</div>` block (closes at line 77) and before `<div className="flex items-center gap-2">` (line 79), add:

```tsx
      <PillNav
        className="mx-auto"
        active="full"
        onSelect={() => {}}
        items={[{ key: "full", label: "Full view", sub: "all tools", dotClass: "bg-brand-500" }]}
      />
```

This is a placeholder single-item nav; Phase 2 replaces `items`/`active`/`onSelect` with the persona lens state.

- [ ] **Step 3: Run the smoke test.**

Run: `npm test -- shell-render`
Expected: PASS. The header now also contains "Full view" — assert it as a regression guard in Step 4.

- [ ] **Step 4: Strengthen the smoke test to cover the new chrome.**

In `components/__tests__/shell-render.test.tsx`, add one assertion inside the existing `it(...)`:

```tsx
    expect(html).toContain("Full view"); // centered PillNav slot rendered
```

- [ ] **Step 5: Run the full suite.**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Visual check.**

Run `npm run dev`. Expected: a centered "Full view" pill appears in the top bar between the page title and the export/search/avatar cluster — matching the Quixotic centered-nav placement. (Wired to real personas in Phase 2.)

---

## Self-Review

**1. Spec coverage (Phase 1 scope only):** Spec §4 design-system tokens → Task 1. Green gradient hero card → Task 2. Centered pill nav (lens slot) → Tasks 3+5. Rounded frame/cards → Task 4. Floating left rail → already present (noted in Task 4 Step 3). Delta pills → existing `components/ui/DeltaPill.tsx` is reused as-is (no task needed; confirm it matches the `bg-good/text-good`-style during Phase 4 usage). Persona logic, data-quality, per-tab tailoring → deliberately deferred to Phases 2-6 (separate plans).

**2. Placeholder scan:** No TBD/TODO. The single-item PillNav in Task 5 is an intentional, fully-specified placeholder slot (real code shown), not an unfinished step.

**3. Type consistency:** `HeroCard` props, `PillNavItem`/`PillNav` props used consistently across Tasks 2, 3, 5. `PillNav` is imported and called with exactly its defined props in Task 5. `rounded-xl3` defined in Task 1 and consumed in Tasks 2 & 4.

**Note for later phases:** Phase 2 (PersonaContext + wiring PillNav to curate tabs) gets its own plan after Phase 1 lands, since its task code depends on the restyled `Shell`/`Topbar` produced here.
