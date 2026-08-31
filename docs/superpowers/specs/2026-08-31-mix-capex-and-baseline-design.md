# Mix CAPEX Breakdown & Baseline Growth — Design Spec

**Date:** 2026-08-31
**Status:** binding authority for the implementation plan that follows
**Builds on:** the same-day fix making the CAPEX cap orthogonal to mix objective
(`lib/combined-balance.ts`, uncommitted at time of writing)

---

## 1. Why this exists

Three complaints, one screen.

**The mix cards state a total and explain nothing.** "Cheapest overall — ₹27.35 Cr"
is not a number anyone can act on. The user cannot see what is being bought, and
cannot correct a price they know to be wrong. Every capex rate in the model *is*
already editable — but only from per-asset "Advanced" collapsibles in two other
tabs, so pricing a plan means leaving the screen where the plan is.

**Two plans that differ 2,700× look like a bug.** Measured on the repo fixture at
a 50% target: "Lowest CAPEX" spends ₹1 L for 50.6%, "Cheapest overall" spends
₹27.35 Cr for 50.4%. Both are correct — the second wins on lifetime cost because
its equipment throws off fuel savings for 15 years. The cards never say so,
because the KPI grid carries `costPerTonne` (an analyst's unit) and no
cost-to-own figure.

**The baseline growth rate is invisible and hardcoded.** `BAU_GROWTH = 0.01` sits
in two files (`lib/model/index.ts:37`, `lib/scope2/model/index.ts:31`). It sets
how hard every target is and no user can see or change it.

Settling the third exposes a fourth, which must be fixed first:

**The app holds two different definitions of "cut 50%".** See §2.

---

## 2. Defect ledger

| # | Defect | Site | Effect |
|---|---|---|---|
| B1 | Balance-to-target measures reduction as *tonnes avoided ÷ base-year emissions*; Goals and the trajectory measure it as *emissions ending at (1−pct) × base* | `BalanceTab.tsx:132-136`, `combined-balance.ts:84-90` vs `goals/select.ts:199`, `trajectory.ts:10-20` | Same percentage, two meanings, one app. Divergence = `BAU(targetYear) − base`. Measured 10.8 points on the fixture |
| B2 | Mix cards show one capex total with no line items | `BalanceTab.tsx:437` | User cannot see or correct what is being bought |
| B3 | No cost-to-own on the cards | `combined-balance.ts:109-121` (`MixKpis`) | The ₹1 L vs ₹27 Cr contrast is unexplainable on screen |
| B4 | `infraCapex` (default ₹1.5 Cr) is charged once whenever any electrification is on, hidden inside the Electrification total | `model/index.ts:301`, `defaults.ts:97` | A large lump with no label |
| B5 | CAPEX budget box caps *lifetime total* capital | `combined-balance.ts` gate | Companies ration capital per year, not per programme |
| B6 | BAU growth hardcoded, duplicated across scopes | `model/index.ts:37`, `scope2/model/index.ts:31` | Unsettable premise; two constants invite silent divergence |
| B7 | Target unreachability shown only as a small badge on one card | `BalanceTab.tsx:412` | The most important negative answer is the quietest thing on screen |

---

## 3. Decisions taken

Recorded because each closes a fork that was genuinely open.

| # | Decision | Rationale |
|---|---|---|
| D-a | Reduction is measured on the **level basis** | Every framework (SBTi, BRSR, any public commitment) means "emissions end up X% below base year". Two of three subsystems already do this; Balance-to-target is the outlier |
| D-b | Capital is rationed on **peak single-year spend** | A capital committee approves an annual envelope, not a lifetime total |
| D-c | Editing a rate on a card **writes globally and permanently** | One price, one truth. Consistent with `deriveDials`, which exists so two views can never drift |
| D-d | Editing re-prices instantly; **never re-ranks on its own** | A plan reorganising itself under the cursor is unusable. Re-ranking is a deliberate act behind a button |
| D-e | BAU growth is **one rate per scope** | Matches the two constants already present. Production and electricity load do not grow at the same rate |
| D-f | Breakdown **expands in place**; no slide-over drawer | The result rail must stay visible — `BalanceTab.tsx:1-24` states that as the redesign's whole purpose |
| D-g | **No frontier chart** | Considered and rejected: a single curve collapses the three strategic postures the cards exist to distinguish, and "frontier" would claim an optimality the greedy walk does not have |

---

## 4. Deliverable 1 — the level basis

Smallest, and everything else depends on it.

### 4.1 The arithmetic

Let `base` = combined base-year emissions, `pct` = target fraction, `y` = target year.

```
committedLevel = base × (1 − pct)          // where emissions must land
requiredT      = BAU(y) − committedLevel   // tonnes to remove from the BAU path
allocatedT     = BAU(y) − net(y)           // unchanged
gapT           = requiredT − allocatedT    // zero exactly when net(y) == committedLevel
```

`gapT == 0` ⟺ `net(y) == committedLevel`. This is the property the current
formula lacks.

### 4.2 The exact size of the change

```
requiredT(level) − requiredT(avoided) = BAU(y) − base
```

Direction depends on whether BAU has grown past the base year by `y`:

- **BAU(y) > base** → level basis requires more. Occurs once activity growth
  beats the grid-EF decline.
- **BAU(y) < base** → level basis requires less. This is the current default
  case: at 1% growth and 3.5%/yr grid decline, fixture BAU 2030 = 6,156 t
  against base 6,900 t, so the screen's "50.4%" is really 61.2% on the level
  basis. **Plans will appear better, not worse, on today's defaults.**

Deliverable 3 lets a user set growth high enough to flip this, which is why
this fix precedes it.

### 4.3 Sites to change

| Site | Change |
|---|---|
| `combined-balance.ts` `reductionOf` | Return level-basis reduction: `(base − net(y)) / base` |
| `combined-balance.ts` `greedyMix` stop rule | Compare `net(y) <= committedLevel`, not avoided ≥ target |
| `BalanceTab.tsx:132-136` | `requiredT` per §4.1 |
| `BalanceTab.tsx` rail "How this is calculated" | Rewrite to the three-number sentence in §4.4 |

`goals/select.ts` and `trajectory.ts` need no change — they are already correct.

### 4.4 Rail copy

Replaces the current two-paragraph derivation. Shape, with illustrative figures
(base 6,900 t, 50% target, a BAU that has grown — not the current defaults, in
which BAU 2030 falls below base):

> Get emissions down to **3,450 t** by 2030.
> Business-as-usual puts you at **8,010 t**.
> So you must remove **4,560 t**. Your plan removes **4,100 t** — a gap of 460 t.

Every figure in that sentence is one of the four in §4.1. No derivation the
reader has to follow.

### 4.5 `achieved` changes meaning

`MixOption.achieved` is currently documented as "combined market-based reduction
at 2030". After this change it is the **level-basis** fraction below base year,
and the card badge "best reachable N%" reads on that basis. Update the doc
comment and the badge's tooltip; a stale comment here is how B1 survived.

### 4.5 Tests

- `gapT == 0` ⟺ `net(y) == base × (1 − pct)`, across growth rates 0%, 1%, 5%.
- `requiredT(level) − requiredT(avoided) == BAU(y) − base` to within 1e-6.
- A mix reported as meeting the target satisfies the Goals tab's own
  `targetValueAt` for the same goal — the cross-subsystem agreement B1 breaks.
- Regression: at growth 0 and no grid decline, level and avoided bases agree.

---

## 5. Deliverable 2 — the CAPEX breakdown

### 5.1 The capex drivers — complete enumeration

Eleven, plus one zero-capex line. Nothing else in the model consumes capital.

**Scope 2** (`lib/scope2/`)

| Line | Formula | Field | Site |
|---|---|---|---|
| LED lighting | lump × `ledPct/100` | `ledCapex` | `model/efficiency.ts:30` |
| Motors / VFD | lump × `motorPct/100` | `motorCapex` | `model/efficiency.ts:30` |
| Building mgmt system | lump × `bmsPct/100` | `bmsCapex` | `model/efficiency.ts:30` |
| Rooftop solar | `effectiveKwp × rate` | `solarCapexPerKw` | `model/generation.ts:50` |
| Battery | `batteryKwh × rate` | `batteryCapexPerKwh` | `model/generation.ts:50` |
| Solar subsidy | `× (1 − pct/100)` on the two above | `subsidyPct` | `model/generation.ts:50` |
| Green procurement | **no capital** — opex premium only | — | — |

**Scope 1** (`lib/model/`)

| Line | Formula | Field | Site |
|---|---|---|---|
| Efficiency package | lump per asset | `efficiency.capex` | `index.ts:156` |
| Electric vehicles | `units × price × premium%` (at replacement) or `units × price` (early) | `assetCapex`, `replacementPremiumPct`, `purchaseTiming` | `segments.ts:48` |
| Heat pump / electric boiler | lump per asset | `assetCapex` | `segments.ts:48` |
| Charging + grid upgrade | **one flat lump, whole company**, once if any electrification | `infraCapex` (global) | `index.ts:301` |
| Fuel-switch retrofit | lump per asset | `fuelSwitch.retrofitCapex` | `index.ts:216` |
| Flex-fuel conversion | `units × price` | `flexFuel.vehicleCapex` | `index.ts:216` |
| Leak-fix / LDAR | lump per system | `leakFix.capex` | `index.ts:249` |
| Charge reduction | lump per system | `chargeCut.capex` | `index.ts:257` |
| Gas-switch retrofit | lump per system | `gasSwitch.retrofitCapex` | `index.ts:271` |

### 5.2 Presentation rules

- **Show `quantity × rate = amount` only where the decomposition is real.**
  Solar genuinely is `500 kW × ₹45,000`. LED cost is stored as one lump per
  facility — there is no per-fixture rate. Do not invent a unit rate to make the
  table uniform.
- **Green procurement gets a row even though its capex is ₹0**, rendered as
  `no capital · + ₹18 L/yr`. This row is the on-screen answer to "why is the
  Lowest CAPEX plan ₹1 L", and omitting zero-capex lines is how that answer
  went missing (the same instinct as defect F4 in the finance spec).
- **`infraCapex` gets its own labelled row** (B4), not a silent share of
  Electrification.
- **Mixed rates across sources** show the **quantity-weighted** average marked
  `mixed` — weighted by the same quantity the rate multiplies (kW for solar,
  kWh for battery, units for vehicles), never by facility load. A `▸` expander
  sets sources individually.

### 5.3 Total rows

| Row | Source |
|---|---|
| Total capital | `programmeMetrics(...).totalCapex` — already the figure the card shows |
| Biggest single year | **new**: `max` over merged series years of `Σ capex` |
| Cost to own, whole life | **new**: **undiscounted** `Σ net` (capex + opex change) across every lever's series. Negative = the plan pays for itself over its life |
| Running cost change | `Σ annualOpexDelta` — already computed |

Cost-to-own is deliberately **undiscounted**: it is the figure a board reads as
"what this costs us in total", and a discounted one invites "discounted at
what?" mid-meeting. `programmeMetrics` already returns `npv`, so the discounted
view is one field away — show it as secondary text under cost-to-own, labelled
with the discount rate in force, never as the headline.

`peakFunding` already exists on `LeverMetrics` but is peak *cumulative* net cash
(a financing number), **not** max annual capex. Both are useful; the budget cap
(D-b) uses max annual capex. Do not conflate them.

### 5.4 Edit behaviour

1. Rate edit writes to **every source in that line** (D-c), and to the same
   field the Scope 1 / Scope 2 builder tabs bind. **It overwrites any per-source
   values already set**, including ones set from the builder tabs — that is what
   a line-level edit means. The `▸` expander is the way to set a rate without
   flattening the others, and the `mixed` marker is the warning that flattening
   would lose information.
2. Card totals recompute immediately. Dials do not move (D-d).
3. A notice appears: *"Prices changed. This plan is re-priced, but the lever
   ranking still uses the old prices."* with `[ Re-suggest with new prices ]`.
4. Edited rates carry a marker, the original value on hover, and a reset —
   mirroring the `measured | reference | unavailable` provenance tagging
   `finance/prices.ts:resolvePrice` already applies to fuel prices.
5. A standing note: *"Prices are shared across the whole model."*

### 5.5 Layout (D-f)

One card open at a time. The open card expands to the full width of the work
pane; the other two collapse to single-line bars retaining label, capital,
reduction and Apply. The result rail is untouched.

### 5.6 Also in this deliverable

- **B5** — budget box relabelled and re-based to **peak single-year capital**;
  the greedy gate compares against max annual capex.
- **B7** — unreachability stated in the **result rail**, not only as a card
  badge: when no mix reaches the committed level, the rail's headline reads
  *"Not reachable by 2030"* with the best level any mix achieves and the binding
  ceiling named from `lib/model/dial-caps.ts` (roof space, electrifiable share,
  bio-blend limit). A negative answer this important belongs in the one region
  of the screen that never scrolls away.
- **B3** — cost-to-own on the KPI grid, plus one plain-language sentence per
  card naming what it optimises and what it sacrifices.

### 5.7 Tests

- Sum of breakdown line amounts == card's `totalCapex`, for every mix, on a
  fixture exercising all eleven drivers. This is the invariant that stops the
  breakdown and the total becoming two quantities.
- `infraCapex` appears exactly once when any electrification is active, and not
  at all when none is.
- Procurement-only mix: breakdown lists procurement with ₹0 capital and a
  non-zero annual premium.
- Editing `solarCapexPerKw` writes to every facility in the line and leaves
  dials unchanged.
- Reset restores the pre-edit value.
- Budget cap on peak-year basis: no mix's max annual capex exceeds the cap
  (excepting the unavoidable-floor case already specified in
  `MixOption.budgetLimited`).

---

## 6. Deliverable 3 — Growth & baseline tab

### 6.1 Placement

A fourth top-level tab in `components/tabs/BuilderHub.tsx:26-28`, after
*Scope 2*, labelled **"Growth & baseline"**. Not a sub-tab of Balance to
target: the rate is a premise for both scopes and for Goals.

### 6.2 Contents

- **Two inputs** — Scope 1 growth %/yr, Scope 2 growth %/yr. Both default to
  1.0, so behaviour is unchanged until touched.
- **Chart** — reuse `components/charts/WedgeChart.tsx` (BAU / target / net /
  wedges, already used in four places). No new chart component.
- **Year-by-year table** — per year: BAU tonnes, planned net tonnes, committed
  target level. This is the "year-on-year BAU allocation" in numbers.
- **Live consequence line** — *"At 3% Scope 1 growth, business-as-usual reaches
  8,010 t by 2030 instead of 6,900 t — 1,110 t more to remove."*

### 6.3 Plumbing

`TrajectoryConfig.bauGrowth` (`model/types.ts:378`) is **already a parameter**.
Work is confined to sourcing its value:

1. Add `bauGrowthS1Pct`, `bauGrowthS2Pct` to `GlobalAssumptions`, default 1.0.
2. Thread to the three `buildTrajectory` call sites: `model/index.ts:391`,
   `scope2/model/index.ts:312`, `scope2/model/index.ts:316`.
3. Delete both `BAU_GROWTH` constants (B6).

### 6.4 Tests

- Growth 0 reproduces a flat BAU; 1% reproduces today's numbers exactly
  (regression guard on the default).
- Scope 1 and Scope 2 rates move their own scope's BAU and not the other's.
- Raising Scope 1 growth increases `requiredT` by exactly `ΔBAU(y)` (ties D3 to
  D1's §4.2 identity).
- Deleting the constants leaves no reader of a hardcoded growth value.

---

## 7. Out of scope

Named so they are not smuggled in: any frontier or efficient-frontier chart; a
true optimizer replacing the greedy walk; per-mix price sandboxes; per-year
growth overrides (the `goals/select.ts` milestone-interpolation pattern is the
route if wanted later); scenario export; per-business-unit targets.

---

## 8. Build order

1. **Deliverable 1** — level basis. Everything depends on it being right.
2. **Deliverable 2** — CAPEX breakdown. The main ask.
3. **Deliverable 3** — Growth & baseline. Requires 1, or its chart contradicts
   the Goals tab on screen.

Each is independently shippable and independently testable.

---

## 9. Performance note

Measured this session: one `suggestMixOptions` call (three greedy walks, each up
to six families × ten steps of full-model evaluation) costs **~30 ms**, and is
**flat in portfolio size** — 100 assets / 20 systems / 25 facilities cost 30 ms
against 25 ms for 2 / 1 / 1, because the walk's step count dominates, not the
data volume. Re-suggesting on demand needs no worker, no debounce beyond the
usual input settle, and no loading state beyond a spinner.
