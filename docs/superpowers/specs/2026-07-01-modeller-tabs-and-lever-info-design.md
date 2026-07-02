# Scenario Modeller — mode tabs + lever info — design spec

Date: 2026-07-01

## Purpose

Improve discoverability/utilisation of the portfolio-wide tools in the Scenario
Modeller and explain each lever:
1. Surface **Energy balance** (top-down "balance to a target" mode) and, in
   Scope 2, **Procurement** (portfolio-wide market instruments) as first-class
   sub-tabs instead of dashed tiles at the bottom of the source list.
2. Add an **info ⓘ on every lever** with a one-line plain-English explanation.

## Decision (from brainstorming)

Approach A — a `PillNav` mode bar at the top of each modeller:
- **Scope 1:** Plan by source · Balance to target
- **Scope 2:** Plan by source · Procurement · Balance to target

"Plan by source" is the current home (segments/facilities + live projection) and
keeps its internal drill-down (segment → source / facility). Energy balance and
Procurement become peer modes. "Plan by source" stays the default; a subtle
"New here? Start with Balance to target" hint aids discovery.

Rationale: Energy balance is a *mode* (top-down vs bottom-up), Procurement is a
*portfolio-wide lever* (can't live inside one facility). Tabs match the Goals
module pattern for app consistency.

## Changes

### Scope 1 — `components/tabs/BuilderTab.tsx`
- Add `mode` state ("source" | "balance"); render a `PillNav` above the view.
- `balance` renders `EnergyBalanceScreen` (its `onBack` becomes optional / hidden
  in tab mode).
- Remove the "Energy balance" tile from `ModellerHome`.
- Add `info` to each `ActionRow` (Electrify, Fuel switch, Flex-fuel, Switch gas,
  Fix leaks) → an `InfoTip` beside the lever title.

### Scope 2 — `components/scope2/BuilderTab.tsx`
- Add `mode` state ("facilities" | "procurement" | "balance"); `PillNav` above.
- `procurement` renders `ProcurementScreen`; `balance` renders
  `Scope2EnergyBalanceScreen` (both `onBack` optional/hidden in tab mode).
- Remove the Procurement and Energy balance tiles from `Scope2Home`.
- Add `InfoTip` beside the lever titles on Efficiency, Solar/Generation, and
  Procurement cards.

### Lever info copy
- Electrify, Fuel switch, Flex-fuel, Switch gas, Fix leaks (S1); Efficiency,
  Solar, Procurement (S2) — one plain sentence each.

## Out of scope
No change to lever maths, the compute engine, or the "How this is calculated"
panels. Purely navigation + explanatory copy.

## Testing
Existing modeller render/smoke tests must still pass. Add a light check that the
mode tabs render. Typecheck + full suite + production build green.
