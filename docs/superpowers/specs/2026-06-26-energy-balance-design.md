# Energy balance — scenario-level mix dials (Scope 1 + 2)

- **Date:** 2026-06-26
- **Status:** Draft for review — **build AFTER** the per-source suggestions feature.
- **Scope:** A new scenario-level "Energy balance" view spanning Scope 1 (fuel + refrigerant) and Scope 2 (electricity). Cross-scope by nature.

## Goal

Give the user a portfolio-level way to **balance the energy mix** — fossil fuel vs grid electricity vs renewables — and watch total emissions and cost move toward a target. A few **dials** bulk-set the real per-source levers (one source of truth), plus a **"suggest a mix"** helper that fills the dials to roughly hit a chosen target. Transparent and auditable: the cascade rule is simple and shown; "suggest" is a stated heuristic, not a black-box optimiser.

## Decisions (from brainstorming)

1. **Dials + "suggest a mix" helper** (not a pure optimiser).
2. **Cascade**: dials write to the actual per-source electrify / fuel-switch / gas-switch settings + the renewable-sourcing global assumption. Per-source screens reflect the result and stay editable.
3. Cross-scope (fuel = Scope 1, electricity = Scope 2, renewables span both).
4. Built **after** the per-source suggestions feature (which may share helpers).

## Placement

An **"Energy balance"** entry on the modeller home (a card beside the segment cards or a button in the results panel) → opens an `EnergyBalanceScreen`. It reads/writes both the Scope 1 store (`useScenario`) and Scope 2 store (`useScope2`), so it must be rendered where both providers are in scope (they are, app-wide).

## The screen

- **Target line:** a control to set the reduction target + year (default −50% by 2030), shown as a reference on the result.
- **Mix bar:** the scenario's energy split — **fossil fuel · grid electricity · renewable** — today vs after the dials. Computed by `energyMix()` (below).
- **Live result:** total emissions (S1+S2), % reduction vs baseline, and total CAPEX committed, from the existing `result.kpis` of both stores. Updates as dials move.

### Dials (portfolio-level → cascade to per-source)
1. **Electrify fossil energy %** → for each electrify-*feasible* combustion source (`endUseProfile` feasible ∈ {easy, yes}, or no end-use but not hard/no), enable `electrify` and set mobile `unitsToConvert = round(unitCount × pct/100)`, stationary `capacityPct = pct`. **Skips** hard/no-feasibility sources (kilns, heavy off-road). Even-distribution rule (same % everywhere feasible) — clearly stated in the UI.
2. **Renewable sourcing %** → sets `assumptions.renewableSourcingPct` (the existing global assumption) on both stores.
3. **Bio-blend remaining fuel %** → for each combustion source with a compatible drop-in bio fuel, enable `fuelSwitch` and set `blendPct = min(pct, maxBlendPctFor(category, altFuel))`.
4. **Low-GWP refrigerant %** → for each cooling system, enable `gasSwitch`, set `transitionPct = pct`, `altRefrigerant = class/system recommendation`.

Each dial change applies its cascade immediately via the existing `updateAction`/`updateSystemAction`/`updateAssumptions` (and Scope 2 equivalents). No new store fields — the dials are derived/transient UI; the truth lives in the per-source settings they set.

### Suggest-a-mix helper
A **"Suggest a mix for <target>"** button runs a transparent stepwise heuristic: raise **Electrify** on feasible sources until projected reduction ≥ target; if still short, raise **Renewable sourcing**, then **Bio-blend**, then **Low-GWP refrigerant**, each in steps, stopping at the target or at the dial caps. It only sets the four dial values (which then cascade). The heuristic and its order are shown ("we layer electrification first, then renewables, then bio-blend…"), so it's auditable. It is explicitly **not** a least-cost optimiser.

## `energyMix()` helper (visualization)

Compute approximate shares in a common energy unit:
- **Fossil-fuel energy** = Σ `combustionBreakdown(asset).energyGJ` for non-bio fuel actually burned (after blend), for non-excluded assets.
- **Grid electricity** = Σ electrified load + existing facility grid load, in GJ (kWh × 0.0036), times `(1 − renewableSourcingPct)`.
- **Renewable** = the renewable share of electricity + the bio-blend share of fuel energy.
Returns `{ fossilFuelGJ, gridElecGJ, renewableGJ }` for the mix bar. Documented as an indicative visualization (not an audited energy balance).

## Non-goals

- No least-cost solver / optimisation engine.
- No new persisted store fields — dials are transient and cascade to existing per-source settings.
- No change to the per-source lever math; this only *bulk-sets* existing levers.
- Carbon accounting unchanged — emissions/cost come from the existing engines.

## Open implementation notes (for the plan)

- Cross-scope read/write: the screen uses both `useScenario` and `useScope2`; confirm the Scope 2 store exposes equivalents (renewable sourcing, facility solar) before wiring dial 2/electrification adds — the plan must verify the exact Scope 2 handlers.
- The cascade is **lossy by design** (re-dragging a dial re-distributes); document that opening a source afterward shows the cascaded values, and manual per-source edits are overwritten only if the user moves that dial again.

## Testing

- Cascade helpers (pure): `applyElectrifyMix(assets, pct)` returns the expected per-source patches (feasible only; mobile units vs stationary %); bio-blend respects drop-in caps; refrigerant transition set across systems.
- `energyMix()` returns shares summing to ~100% for a seeded scenario.
- Suggest heuristic: for a seeded scenario, "suggest for −50%" raises dials in the documented order and lands at ≥ target (or maxes out with a clear "best reachable" message).
- UI: dials render, moving a dial updates the live result; "Suggest a mix" fills the dials.
- Existing tests stay green; tsc/build clean.

## Files (indicative)

- `lib/model/energy-balance.ts` — **new**: cascade helpers, `energyMix`, suggest heuristic (pure, cross-scope-input).
- `components/tabs/EnergyBalanceScreen.tsx` (or within the modeller) — the screen + dials.
- Modeller home — an "Energy balance" entry point.
- Tests for the helpers + screen.
