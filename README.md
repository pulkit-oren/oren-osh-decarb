# Scope 1 Decarbonization Scenario Planner

An interactive dashboard for modelling **Scope 1** decarbonization on real fuel and
refrigerant data. Management pulls reduction levers and the year-by-year emissions
trajectory, cost, and position versus an SBTi 1.5°C target recompute live.

Built for Oren / OSH. Design system carried over from the Croda dashboard
(emerald `brand`, teal `oren`, Inter, soft cards). Deploys to Vercel zero-config.

## What it does

- **Data input** — editable tables of combustion assets (stationary/mobile fuels) and
  refrigeration systems. The baseline footprint is computed bottom-up: fuel volume →
  energy (kJ) → tCO₂e on DEFRA 2025 factors, and refrigerant charge × leak × GWP.
- **Scenario builder** — three lever families, each rewriting the real fuel/gas profile:
  - **Fuel switch** — bio/green fuel blend, with calorific-value + efficiency penalty and
    a separately-reported biogenic split.
  - **Electrification** — moves fossil energy to electric; computes and shows the resulting
    **Scope 2** load (cleaned by renewable sourcing).
  - **Refrigerant** — swap to low-GWP naturals + reduce leak rate.
  - Signature **wedge chart**: BAU, SBTi target, stacked abatement wedges, and a net line
    that reads green (on track) / amber (off track).
- **Refrigerant advisor** — ranks gases by GWP era and recommends swaps for your systems.
- **Compare & track** — save scenarios, compare side-by-side, track progress to the 2030 target.

## Architecture

The model engine in `lib/model/` is pure (no React) and fully unit-tested — the entire UI
is a render of `compute(assets, systems, leverSettings)`. Charts are Recharts; the wedge
chart and sparklines are hand-built. State persists to `localStorage`.

```
app/            layout, globals, page → <Shell/>
components/     Shell, Sidebar, Topbar, ui/*, charts/*, tabs/*
lib/model/      types, factors, baseline, levers, trajectory, finance, compute()
lib/            defaults, store (context), utils
```

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest — model engine + default-scenario story
npm run build    # production build
npm run lint
```

## Deploy (Vercel)

```bash
vercel           # preview
vercel --prod    # production
```

No environment variables required.

## Emission factors

Sourced from `Scope 1_GHG emission factors.xlsx` (DEFRA 2025 column) and AR5 refrigerant
GWPs. They live in `lib/model/factors.ts` as plain data — edit a number and the whole
model re-derives. Alt-fuel CVs, coal, and the grid factor use standard reference values
and are easily swapped.
