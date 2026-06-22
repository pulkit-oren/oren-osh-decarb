# Phase 2 — Persona Lens Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the centered PillNav a live persona switcher (ESG / CEO / Plant Head / CFO) that curates which tabs each persona sees within each scope, persisted per company. ESG = the full toolset (today's app).

**Architecture:** A pure `lib/persona.ts` module defines personas + a lens→tabs map. `Shell` holds persona state (default ESG), persists it per company, and re-homes the active tab when a persona/scope change hides it. `Sidebar`/`MobileNav` filter their nav by the lens; `Topbar` renders the persona `PillNav`.

**Tech Stack:** Next.js 16 (custom — see `AGENTS.md`), React 19, Tailwind v4, Vitest + `react-dom/server`.

## Global Constraints

- Not stock Next.js — read `node_modules/next/dist/docs/` before Next APIs (none expected here).
- ESG persona MUST show every tab (it is the escape hatch / "Full toolset").
- No git repo: replace "commit" with running tests + a manual check at `npm run dev` (http://localhost:3000).
- Run all commands from `osh-decarbonization-dashboard-master/`.

---

### Task 1: Persona model + lens→tabs map (pure)

**Files:**
- Create: `lib/persona.ts`
- Test: `lib/__tests__/persona.test.ts`

**Interfaces:**
- Produces:
  - `type Persona = "esg" | "ceo" | "plant" | "cfo"`
  - `const DEFAULT_PERSONA: Persona`
  - `const PERSONAS: { key: Persona; label: string; sub: string; dotClass: string }[]`
  - `function lensTabs(scope: Scope, persona: Persona): AnyTabKey[]`
  - `function personaLanding(scope: Scope, persona: Persona): AnyTabKey`
  - `function isPersona(v: unknown): v is Persona`
  - `const personaStorageKey: (companyId: string) => string`
- Consumes: `type { AnyTabKey, Scope }` from `@/components/Sidebar` (type-only import — erased at runtime, no module cycle).

- [ ] **Step 1: Write the failing test.**

```ts
// lib/__tests__/persona.test.ts
import { describe, expect, it } from "vitest";
import { lensTabs, personaLanding, isPersona, PERSONAS, DEFAULT_PERSONA } from "../persona";

describe("persona lens map", () => {
  it("ESG sees every tab in each scope", () => {
    expect(lensTabs("s1", "esg")).toEqual(["data", "builder", "action", "refrigerant", "compare"]);
    expect(lensTabs("s2", "esg")).toEqual(["data2", "builder2", "action2", "compare2"]);
  });
  it("CEO is a trimmed overview set", () => {
    expect(lensTabs("s1", "ceo")).toEqual(["action", "compare"]);
    expect(lensTabs("s2", "ceo")).toEqual(["action2", "compare2"]);
  });
  it("CFO is economics-focused (no raw data entry, no refrigerant advisor)", () => {
    expect(lensTabs("s1", "cfo")).toEqual(["builder", "action", "compare"]);
  });
  it("Plant Head is data + feasible levers + pipeline", () => {
    expect(lensTabs("s1", "plant")).toEqual(["data", "builder", "action"]);
  });
  it("landing is the first tab of the lens", () => {
    expect(personaLanding("s1", "ceo")).toBe("action");
    expect(personaLanding("s2", "plant")).toBe("data2");
  });
  it("default persona is ESG and is listed", () => {
    expect(DEFAULT_PERSONA).toBe("esg");
    expect(PERSONAS.map((p) => p.key)).toContain("esg");
    expect(PERSONAS).toHaveLength(4);
  });
  it("isPersona guards unknown values", () => {
    expect(isPersona("ceo")).toBe(true);
    expect(isPersona("nope")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (module missing).**

Run: `npm test -- persona`
Expected: FAIL — cannot find `../persona`.

- [ ] **Step 3: Implement `lib/persona.ts`.**

```ts
import type { AnyTabKey, Scope } from "@/components/Sidebar";

export type Persona = "esg" | "ceo" | "plant" | "cfo";

export const DEFAULT_PERSONA: Persona = "esg";

export const PERSONAS: { key: Persona; label: string; sub: string; dotClass: string }[] = [
  { key: "esg",   label: "ESG Lead",   sub: "Amit",   dotClass: "bg-oren-500" },
  { key: "ceo",   label: "CEO",        sub: "Raghav", dotClass: "bg-info" },
  { key: "plant", label: "Plant Head", sub: "Priya",  dotClass: "bg-brand-500" },
  { key: "cfo",   label: "CFO",        sub: "Neha",   dotClass: "bg-warn" },
];

// Tab keys visible per persona × scope, in display order. ESG = everything.
const LENS: Record<Persona, { s1: AnyTabKey[]; s2: AnyTabKey[] }> = {
  esg:   { s1: ["data", "builder", "action", "refrigerant", "compare"], s2: ["data2", "builder2", "action2", "compare2"] },
  plant: { s1: ["data", "builder", "action"],                            s2: ["data2", "builder2", "action2"] },
  cfo:   { s1: ["builder", "action", "compare"],                         s2: ["builder2", "action2", "compare2"] },
  ceo:   { s1: ["action", "compare"],                                    s2: ["action2", "compare2"] },
};

export function lensTabs(scope: Scope, persona: Persona): AnyTabKey[] {
  return LENS[persona][scope === "s1" ? "s1" : "s2"];
}

export function personaLanding(scope: Scope, persona: Persona): AnyTabKey {
  return lensTabs(scope, persona)[0];
}

export function isPersona(v: unknown): v is Persona {
  return v === "esg" || v === "ceo" || v === "plant" || v === "cfo";
}

export const personaStorageKey = (companyId: string) => `osh-persona-v1::${companyId}`;
```

- [ ] **Step 4: Run it — expect PASS.**

Run: `npm test -- persona`
Expected: PASS (7 tests).

---

### Task 2: Filter the Sidebar + MobileNav by persona

**Files:**
- Modify: `components/Sidebar.tsx`
- Test: `components/__tests__/sidebar-lens.test.tsx`

**Interfaces:**
- `Sidebar` and `MobileNav` gain a required prop `persona: Persona`.
- Consumes: `lensTabs`, `type Persona` from `@/lib/persona`.

- [ ] **Step 1: Write the failing test.**

```tsx
// components/__tests__/sidebar-lens.test.tsx
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Sidebar } from "../Sidebar";

describe("Sidebar persona lens", () => {
  it("CEO lens hides Data input and shows Action plan", () => {
    const html = renderToString(
      <Sidebar scope="s1" setScope={() => {}} tab="action" setTab={() => {}} persona="ceo" />,
    );
    expect(html).toContain("Action plan");
    expect(html).toContain("Compare & track");
    expect(html).not.toContain("Data input");
    expect(html).not.toContain("Refrigerant advisor");
  });
  it("ESG lens shows every Scope 1 tab", () => {
    const html = renderToString(
      <Sidebar scope="s1" setScope={() => {}} tab="builder" setTab={() => {}} persona="esg" />,
    );
    expect(html).toContain("Data input");
    expect(html).toContain("Refrigerant advisor");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (prop missing / no filtering).**

Run: `npm test -- sidebar-lens`
Expected: FAIL (TS error on missing `persona` prop, or assertion fails).

- [ ] **Step 3: Add the import and filter.**

In `components/Sidebar.tsx`, add near the top imports:

```tsx
import { lensTabs, type Persona } from "@/lib/persona";
```

Change `navFor` to take persona and filter:

```tsx
function navFor(scope: Scope, persona: Persona) {
  const all = scope === "s1" ? NAV : NAV2;
  const allowed = new Set<AnyTabKey>(lensTabs(scope, persona));
  return all.filter((n) => allowed.has(n.key));
}
```

(`NAV`/`NAV2` entry `.key` types are `TabKey`/`Scope2TabKey`, both assignable to `AnyTabKey` — the `Set<AnyTabKey>.has` call accepts them.)

- [ ] **Step 4: Thread `persona` through both components.**

In `Sidebar({ scope, setScope, tab, setTab })`, add `persona` to the destructured props and the type:

```tsx
export function Sidebar({
  scope, setScope, tab, setTab, persona,
}: {
  scope: Scope;
  setScope: (s: Scope) => void;
  tab: AnyTabKey;
  setTab: (t: AnyTabKey) => void;
  persona: Persona;
}) {
```

and change its `navFor(scope)` call (the `.map` over the nav) to `navFor(scope, persona)`.

Do the same for `MobileNav`: add `persona: Persona` to its props type + destructure, and change its `navFor(scope)` to `navFor(scope, persona)`.

- [ ] **Step 5: Run it — expect PASS.**

Run: `npm test -- sidebar-lens`
Expected: PASS (2 tests).

Note: `components/Shell.tsx` now has a TS error (Sidebar/MobileNav need `persona`) — fixed in Task 4. Do not run the full build until then.

---

### Task 3: Persona switcher in the Topbar PillNav

**Files:**
- Modify: `components/Topbar.tsx`
- Modify: `components/__tests__/shell-render.test.tsx`

**Interfaces:**
- `Topbar` gains props `persona: Persona; setPersona: (p: Persona) => void`.
- Consumes: `PERSONAS`, `type Persona` from `@/lib/persona`; `PillNav` (already imported).

- [ ] **Step 1: Import persona data.**

In `components/Topbar.tsx` add:

```tsx
import { PERSONAS, type Persona } from "@/lib/persona";
```

- [ ] **Step 2: Add props to the component signature.**

Change `export function Topbar({ scope, tab }: { scope: Scope; tab: AnyTabKey }) {` to:

```tsx
export function Topbar({ scope, tab, persona, setPersona }: {
  scope: Scope; tab: AnyTabKey; persona: Persona; setPersona: (p: Persona) => void;
}) {
```

- [ ] **Step 3: Replace the placeholder PillNav with the persona switcher.**

Replace the placeholder `<PillNav … items={[{ key: "full", … }]} />` block with:

```tsx
      <PillNav
        className="mx-auto"
        active={persona}
        onSelect={(k) => setPersona(k as Persona)}
        items={PERSONAS.map((p) => ({ key: p.key, label: p.label, sub: p.sub, dotClass: p.dotClass }))}
      />
```

- [ ] **Step 4: Update the smoke test assertions.**

In `components/__tests__/shell-render.test.tsx`, replace the line:

```tsx
    expect(html).toContain("Full view"); // centered PillNav slot rendered
```

with:

```tsx
    expect(html).toContain("ESG Lead"); // persona switcher rendered
    expect(html).toContain("CEO");
    expect(html).toContain("CFO");
```

- [ ] **Step 5:** (no run yet — Shell still needs Task 4 to supply the new props.)

---

### Task 4: Wire persona state, tab re-homing, and persistence in Shell

**Files:**
- Modify: `components/Shell.tsx`
- Test (guard): `components/__tests__/shell-render.test.tsx`

**Interfaces:**
- Consumes: `DEFAULT_PERSONA`, `isPersona`, `lensTabs`, `personaLanding`, `personaStorageKey`, `type Persona` from `@/lib/persona`.

- [ ] **Step 1: Add imports.**

In `components/Shell.tsx`, add:

```tsx
import { useEffect } from "react";
import { DEFAULT_PERSONA, isPersona, lensTabs, personaLanding, personaStorageKey, type Persona } from "@/lib/persona";
```

(Merge `useEffect` into the existing `import { useState } from "react";` → `import { useEffect, useState } from "react";`.)

- [ ] **Step 2: Add persona state + persistence + re-homing in `CompanyScopedShell`.**

After the existing `const [tabS2, setTabS2] = useState<Scope2TabKey>("builder2");` line, add:

```tsx
  const [persona, setPersonaState] = useState<Persona>(DEFAULT_PERSONA);

  // Hydrate this company's saved persona on mount / company switch.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(personaStorageKey(activeId)) : null;
    setPersonaState(isPersona(saved) ? saved : DEFAULT_PERSONA);
  }, [activeId]);

  // Persist persona per company.
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(personaStorageKey(activeId), persona);
  }, [persona, activeId]);
```

- [ ] **Step 3: Re-home the active tab when the lens hides it.**

After the `const setTab = …` definition, add an effect that runs when persona or scope changes:

```tsx
  // If the current tab isn't in this persona's lens, jump to the lens landing.
  useEffect(() => {
    const allowed = lensTabs(scope, persona);
    if (!allowed.includes(tab)) setTab(personaLanding(scope, persona));
  }, [persona, scope]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Pass persona into the chrome.**

- Change `<Sidebar scope={scope} setScope={setScope} tab={tab} setTab={setTab} />` to add `persona={persona}`.
- Change `<Topbar scope={scope} tab={tab} />` to `<Topbar scope={scope} tab={tab} persona={persona} setPersona={setPersonaState} />`.
- Change `<MobileNav scope={scope} setScope={setScope} tab={tab} setTab={setTab} />` to add `persona={persona}`.

- [ ] **Step 5: Run the full suite.**

Run: `npm test`
Expected: all pass (persona unit tests + sidebar-lens + updated shell-render + existing 166).

- [ ] **Step 6: Production build + manual check.**

Run: `npm run build`
Expected: compiles, TypeScript passes.

Then `npm run dev` → http://localhost:3000. Manual: the top-bar pill now shows ESG / CEO / Plant Head / CFO. Switching to **CEO** collapses the left rail to Action plan + Compare and lands on Action plan; switching back to **ESG** restores all five tabs. Switching company preserves each company's last persona.

---

## Self-Review

**1. Spec coverage:** Persona lens switcher (Approach 1) → Tasks 1–4. Curated tab sets per lens → Task 1 map + Task 2 filter. ESG = full escape hatch → `LENS.esg` = all. Per-company persistence → Task 4 Steps 2. Landing/re-home on hidden tab → Task 4 Step 3. Lives inside each scope (separate s1/s2 lists) → Task 1 map. Default = ESG → `DEFAULT_PERSONA`.

**2. Placeholder scan:** None. The `eslint-disable` on the re-home effect is intentional (we deliberately exclude `tab`/`setTab` to avoid re-running on every tab click — the effect should fire only on persona/scope change).

**3. Type consistency:** `Persona` defined in Task 1, imported in Tasks 2/3/4. `lensTabs(scope, persona)` / `personaLanding(scope, persona)` signatures match across tasks. `Sidebar`/`MobileNav`/`Topbar` prop additions are supplied by Shell in Task 4 (Task 2/3 note the transient TS error resolved in Task 4). `setPersonaState` (state setter) is passed as `Topbar`'s `setPersona`.

**Next phase:** Phase 3 (data-quality engine + data-input redesign) — its own plan after this lands.
