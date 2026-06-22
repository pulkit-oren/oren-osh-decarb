# Persona-Lens Dashboard + Quixotic Restyle — Design

- **Date:** 2026-06-18
- **Status:** Approved (mockups reviewed in the visual companion)
- **Author:** brainstormed with Pulkit

## 1. Goal

Reorganise the Scope 1 & Scope 2 decarbonisation dashboard so that the **same
underlying data** is presented through four **persona lenses**, and restyle the
whole app in the "Quixotic" fintech design language (green, soft, rounded,
left icon rail + centered pill nav). Also redesign the **data-input model** to be
fewer-field, visual, and honest about data quality.

This serves the four personas in `User_Persona___Mapping.xlsx`:

| Persona | Role | Home stage | Depth | Lens |
|---|---|---|---|---|
| Raghav | CEO / MD | Overview | review / approve | headline, risk, target & budget |
| Priya | Plant Head | Data Input | primary contributor | site data, feasible levers, site pipeline |
| Amit | ESG Lead | all three | **power user** | full toolset (≈ today's app) |
| Neha | CFO | Scenario + Action | light on data | MACC, cost/tonne, payback, NPV |

## 2. Locked decisions

1. **Nav model — Approach 1: curated tab sets per lens.** A persona/lens switcher
   re-lays-out the same data; each lens shows its own subset/ordering/layout of
   the existing tabs. Nothing is permanently hidden — switching to **Amit (Full
   toolset)** reveals everything. Lenses *curate*, they do **not** lock.
2. **Single user, switchable lenses.** No login / access control. One person
   (Amit) drives and switches lens to present to others.
3. **Scope 1 and Scope 2 stay separate.** The lens switcher lives **inside** each
   scope section. Top-level Scope 1 ⇄ Scope 2 switch is retained.
4. **Visual language = "Quixotic".** Light-grey page, rounded white app frame,
   floating left icon rail (active = solid green), centered pill nav (= the lens
   switcher), big bold titles, very rounded white cards, green gradient hero
   cards, rounded-top bars, smooth green area charts, delta pills, status dots.
   Built on the existing emerald `brand` palette — a restyle, not a recolor.

## 3. Current architecture (reuse map)

From the architecture survey:

- **Shell** (`components/Shell.tsx`): holds `scope: "s1"|"s2"` + per-scope tab
  state (`tabS1`, `tabS2`); mounts `ScenarioProvider` + `Scope2Provider`
  simultaneously. **This is where persona/lens state will be threaded.**
- **Sidebar** (`components/Sidebar.tsx`): `NAV` (Scope 1) / `NAV2` (Scope 2) tab
  arrays + `ScopeSwitch`. **Lens switcher slots here / in a new Topbar pill nav.**
- **Topbar / CompanySwitcher**: company context, base year, export.
- **Stores**: `useScenario()` (Scope 1) and `useScope2()` (Scope 2) — full state +
  actions, localStorage-persisted per company. Pure engines `compute()` /
  `computeScope2()`.
- **Existing, reusable as-is:** glide path (`WedgeChart`, `Scope2TrajectoryChart`),
  Scope 2 MACC (`MaccScatter`), lever economics (`LeverSummary` capex/opex/payback/
  costPerTonne), saved scenarios (`scenarios[]`), KPI/Card/Slider/Stepper/DeltaPill/
  InfoTip UI primitives.
- **Net-new building blocks needed:**
  - `PersonaContext` (lens state, default = Amit/Full).
  - Quixotic chrome: `AppFrame`, `IconRail`, `PillNav`, restyled `Card`/buttons,
    design tokens.
  - **Data-quality layer**: per-asset / per-facility grade (`measured` |
    `estimated` | `missing`) + a year-level confidence score; derive from whether
    the driving quantity is metered vs spend-derived vs blank.
  - **Spend ⇄ metered** input for combustion fuels (and bill-amount ⇄ kWh for
    facilities), with back-calc via typical price; choosing spend marks the row
    `estimated`.
  - **Tile-based "add" flow** + **bulk import** (paste-from-Excel first; file/OCR
    later) writing into the existing stores.
  - **Scope 1 MACC** view (data already in `LeverSummary`; needs a chart — can
    reuse `MaccScatter` or a bar-style MACC).
  - **Seeded boardroom scenarios** (BAU / Balanced / Accelerated) so the CEO lens
    has 2–3 ready pathways without the user building them.

## 4. Design system (Quixotic)

Tokens (layered onto existing emerald brand):

- **Surface:** page `#e7e9ed`; app frame `#fbfbfc` radius 30px; cards `#ffffff`
  radius 22px, soft shadow `0 10px 30px -22px rgba(20,30,40,.3)`, border `#eef0f3`.
- **Green:** `g500 #1fa15c` (primary), `g600 #16894c`, `g700 #0e6e3c`, tints
  `g100 #d3f0e0`, `g50 #eaf7f0`. Reconcile with existing `brand-*` (keep brand
  vars; map Quixotic greens onto them so charts/components inherit).
- **Ink:** `#15191f` / soft `#5b6573` / faint `#98a1ad`; lines `#eef0f3`/`#e4e7ec`.
- **Accents:** amber `#f0a020` (off-track / estimated), indigo `#6366f1` (CEO lens
  / "ahead"), red `#ef4444` (missing).
- **Chrome:** floating left **IconRail** (rounded 13px buttons, active solid
  green); centered **PillNav** = lens switcher (active = white pill + shadow);
  big bold title row with date/scope pill controls.
- **Components:** green gradient **hero card**; **delta pills** (green on g100);
  **status dots**; rounded-top bars with light/dark green + dark **tooltip pill**;
  smooth area charts with green gradient fill; pill buttons (filled + ghost);
  payment-history-style tables with row hover-pill.

## 5. Persona lens architecture

- `PersonaContext` provides `persona` + `setPersona`, default **Amit (Full)**.
  Persisted per company in localStorage alongside scope/tab state.
- Each scope defines a **lens config**: for a given persona, which tabs are shown,
  their order, and the landing tab. Lenses curate the *same* tab components, but
  tab components read `usePersona()` to adjust layout/emphasis/read-only-ness.
- **Escape hatch:** the Amit/Full lens always lists every tab. Other lenses keep a
  subtle "Full view" affordance so nothing is trapped.

### Lens → tab maps (Scope 1)

- **Amit (Full):** Data Input · Builder · Compare · Action Plan · Refrigerant — full depth (today's app + new chrome/data-quality).
- **Priya (Site ops):** *Site Data* (data input, grouped/filtered per site, bulk upload, data ownership) → *Feasible Levers* (Builder filtered to her sites, grouped by ease, downtime/feasibility) → *Site Pipeline* (Action Plan as her project list).
- **Neha (Finance):** *Cost Assumptions* (financial inputs: capex budget, hurdle rate, carbon price + escalation, fuel price, incentives) → *Lever Economics / MACC* (Scope 1 MACC + ranked table: capex, ₹/t, payback, NPV) → *Investment Plan* (Action Plan as phased capital + approve envelope). Activity data read-only.
- **Raghav (Boardroom):** single **Overview** screen — target glide path, headline KPIs, data-confidence gauge, peer benchmark, risk-shielded list, 2–3 seeded scenarios, approve target/budget + export board pack.

Scope 2 mirrors this with its tabs (Data Input / Builder / Action Plan / Compare),
the CFO lens leaning on the existing `MaccScatter`, the CEO lens on the
location/market trajectory.

## 6. Data-input redesign

(Confirmed earlier: **C + reliability**, with bulk import alongside.)

- **Two fields per source:** *what* (tile / picker: fuel, refrigerant, facility) +
  *how much* (the one emission-driving quantity). All other fields move behind a
  details panel with smart defaults — keeps the existing store shape.
- **Tile add flow:** tap an icon tile to pick fuel/gas/facility, one large amount
  field, live tCO₂e, "Add to list".
- **Metered ⇄ ₹ Spend toggle** (fuels) / **kWh ⇄ bill** (facilities): spend/bill
  back-calc via typical price/tariff and flag the row **Estimated**.
- **Reliability cues:** per-row badge **Measured / Estimated / Needs data**; a
  year-level **data-confidence gauge** ("% of tCO₂e from metered data"). This gauge
  is what the CEO lens surfaces.
- **Bulk import:** paste-from-Excel → auto-match fuels/facilities to factors →
  preview with flagged fixes → confirm into store. (Bill/OCR upload is a later
  enhancement, out of scope for v1.)

## 7. Phasing (build order)

1. **Design system + chrome** — tokens, `AppFrame`/`IconRail`/`PillNav`, restyle
   `Card`/buttons/`KpiCard`. App keeps all current tabs working; only the shell
   skin changes. *Verifies: app renders, tests green.*
2. **Persona lens infrastructure** — `PersonaContext`, lens configs, wire PillNav
   to switch lenses, curate tab lists per persona (Amit = full). No per-tab
   tailoring yet beyond which tabs show.
3. **Data-quality + data-input redesign** — add grade derivation to the model/store
   helpers, the confidence gauge, the Metered/Spend toggle, tile add flow, and
   paste import. Scope 1 first, then Scope 2.
4. **Per-persona tab tailoring** — CEO Overview screen (new), CFO finance framing
   (+ Scope 1 MACC), Priya site grouping/filtering. Amit unchanged (full).
5. **Seeded boardroom scenarios** — generate BAU/Balanced/Accelerated for the CEO
   lens from the current baseline.
6. **Carry to Scope 2** — apply lens configs + chrome + data-quality to the Scope 2
   tabs, reusing existing MACC/trajectory.

Each phase keeps `npm test` green (pure model engine is unit-tested) and the app
runnable.

## 8. Out of scope (YAGNI for v1)

- Login / roles / access control (single-user, switchable lenses).
- Bill / invoice OCR upload (paste-from-Excel only in v1).
- Unifying Scope 1 + Scope 2 into one journey (kept separate).
- Multi-year auto-projection of activity data.
- New finance maths beyond surfacing existing `LeverSummary` numbers (NPV shown
  uses existing payback/opex inputs; a full DCF is a later enhancement).

## 9. Assumptions / open questions

- **Default lens = Amit (Full)** on first load; remembered per company. (Confirm.)
- "Site" grouping for Priya: the stores key assets/facilities per year, not per
  site. v1 derives "site" from a name prefix or an added optional `site` field on
  assets/facilities — **needs a small store/type addition**; flag in the plan.
- NPV figures in the CFO view: shown from existing payback/opex unless a DCF is
  requested.
