# Mix CAPEX Breakdown & Baseline Growth — Design Spec

**Date:** 2026-08-31
**Status:** binding authority for the implementation plan that follows
**Builds on:** the same-day fix making the CAPEX cap orthogonal to mix objective
(`lib/combined-balance.ts`, uncommitted at time of writing)

**Amendment 1 (same day, after Deliverable 1 shipped and Deliverable 2's Scope 1
engine landed):** four decisions in this spec are superseded. The rows and
sections concerned are marked *(amended)* and state both the original and the
replacement — a spec that quietly rewrites itself is worse than one that
disagrees with its own history in public.

| Superseded | Was | Now | Where |
|---|---|---|---|
| D-c | Line-level rate edit flattens every source | Scales sources proportionally, preserving the spread | §5.4 |
| D-e | One BAU growth rate per scope | One rate for both scopes, derived from year-wise actuals | §6.2 |
| §6.1 | Growth lives in a fourth top-level tab | Growth lives in a fourth section tab inside Balance to target | §6.1 |
| §6.2 | Growth rate is typed, defaults 1.0, unchanged until touched | Growth rate is derived from the year-wise inventories and auto-adopted | §6.2 |

Deliverables 1 and 2 are otherwise unchanged. Plan
`docs/superpowers/plans/2026-08-31-capex-lines-engine.md` (2a of 2) remains the
authority for the engine and is unaffected except that it now has one more
consumer.

**Amendment 2 (while writing the deliverable-3 plan):** two mechanical
corrections to §6, both found by trying to write the code.

| Superseded | Was | Now | Where |
|---|---|---|---|
| §6.2 | One derived rate, from the combined series, drives both scopes | Each scope derives its **own** rate from its own store's series; the single user **override** applies to both | §6.2 |
| §6.4.1 | Chart draws the derived BAU line dashed behind the live one | Chart draws the live combined BAU from `combineTrajectories`; no second BAU line | §6.4.1 |

Neither changes what the user sees or controls — one adjustable rate, both
scopes' derived rates displayed — only where the arithmetic happens.

**Amendment 3 (after the whole-branch review, on the user's instruction):** the
derived rate is measured **like-for-like**, not on total emissions.

| Superseded | Was | Now | Where |
|---|---|---|---|
| §6.2 | CAGR between two endpoint years of **total** emissions | CAGR between the same two endpoint years, restricted to the sources present in **both** of them | §6.2 |

The measurement was reading a change in *coverage* as growth. On the shipped
fixture both scopes gain a source inside the 2021→2025 span — Petrol LCVs and an
Island resort, both FY2023 — and the total-basis CAGR projected those additions
forward forever:

| | total basis | like-for-like |
|---|---|---|
| Scope 1 | 2.84 %/yr | **2.01 %/yr** |
| Scope 2 | **7.46 %/yr** | **2.11 %/yr** |

Two things mark this as the correct basis rather than merely a smaller number.
The two scopes converge to within 0.1pp, which is the expected signature of a
fixture driven by one shared volume ramp (`lib/defaults.ts` `trend()` is
`1 + 0.025 × (year − 2025)`). And §6.3 of this spec predicted "roughly 2.5 %/yr"
— like-for-like lands there; the total basis did not.

The governing analogy is **same-store sales**: a retailer that opened a third
shop reports growth for the shops it had in both periods, and reports the opening
separately. Opening a site is not a growth rate, and neither is closing one —
removals are excluded by the same intersection, with no special case.

Consequences recorded, because this is the second time these figures moved:
required cut at 50 % by 2030 falls from 3,964 t back to roughly 3,100 t. That is
the honest number once a coverage change stops being counted as growth.

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
| D-c *(amended)* | Editing a rate **writes globally and permanently**, and **scales the line's sources proportionally** rather than flattening them | One price, one truth — consistent with `deriveDials`, which exists so two views can never drift. Amended on the flattening half: `groupCapexLines` already computes a quantity-weighted average and flags `mixed`, so a line edit can hit that average exactly while leaving per-source ratios intact. Flattening silently discards per-asset prices entered in the scope screens, and the line still reads back the number typed either way — so the destructive option buys nothing |
| D-d | Editing re-prices instantly; **never re-ranks on its own** | A plan reorganising itself under the cursor is unusable. Re-ranking is a deliberate act behind a button |
| D-e *(amended)* | BAU growth is **one rate for both scopes**, **derived** from the year-wise inventories | Was one rate per scope, typed. Two independently-typed rates were two controls with no evidence behind either number. The app already holds FY2021→FY2027 inventories and reads only the base year, so a CAGR off that history is better evidence than any typed default. Both scopes' derived rates are still *displayed* separately, so divergence stays visible; per-scope overrides become a later increment |
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

1. *(amended)* Rate edit writes to **every source in that line** (D-c), into the
   same field the Scope 1 / Scope 2 builder tabs bind — but **proportionally**:
   each source's rate is multiplied by `typed / currentWeightedAverage`, so the
   line's quantity-weighted average becomes exactly the number typed and the
   per-source spread survives. Nine trucks at ₹35 L and ₹48 L stay
   cheap-and-expensive relative to each other.

   The original decision here was to overwrite every source with the typed rate.
   That is what made the `▸` per-source expander necessary and the `mixed` marker
   a warning. Under proportional scaling `mixed` is no longer a hazard flag, only
   a statement that the figure shown is an average, and the expander becomes a
   convenience rather than the escape hatch from a destructive edit.

   Guards: a line whose current weighted average is 0 cannot be scaled (there is
   no ratio) — such a line sets its sources to the typed rate directly, which is
   flattening a set of zeros and loses nothing. A typed 0 sets every source to 0.
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

*(amended)* **The card breakdown is read-only; editing lives on the Assumptions
tab** (§6.4.3). Both render the same `capexLines`, so the card still answers the
complaint this deliverable exists for — the cards state a total and explain
nothing — while there is exactly one place a price can be typed. Two editable
surfaces over one field is not drift, but it is two sets of edit affordances,
provenance markers and reset controls to build and keep consistent, for no
reader benefit. The re-suggest notice (§5.4.3) fires wherever the edit happened.

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

## 6. Deliverable 3 — the Assumptions sub-tab

### 6.1 Placement *(amended)*

A **fourth section tab inside Balance to target**, first in the row:

```
Assumptions | Compare mixes | Fine-tune levers | Cost & capital
```

`SectionTabs` in `components/tabs/BalanceTab.tsx:594-600` gains the entry. The
default landing tab stays `levers`, so opening Balance to target looks exactly
as it does today.

This reverses the original placement — a fourth top-level tab in
`BuilderHub.tsx`, with the note *"Not a sub-tab of Balance to target: the rate is
a premise for both scopes and for Goals."* That reasoning conflated **reach**
with **location**. The reach is unchanged: one `GlobalAssumptions` field, shared
by both scopes and by Goals (§6.3). What changes is where it is typed — and every
input on this screen is an input to *Compare mixes*, whose verdict (required cut,
allocated, gap, progress) lives in the result rail. `BalanceTab.tsx:1-24` states
that keeping that rail beside the controls that move it is the entire purpose of
the layout; a top-level tab is the one placement that loses it.

### 6.2 BAU growth is derived, not typed blind *(amended)*

The original spec had the user type a growth rate against nothing. The app
already holds year-wise inventories — `CombustionByYear`, `RefrigerationByYear`,
`FacilitiesByYear`, FY2021→FY2027 on the shipped defaults — and reads exactly
one of them, the base year. A rate derived from that history is better evidence
than any typed default.

New pure module `lib/model/bau.ts`:

```
actualSeries(combustionByYear, refrigerationByYear, facilitiesByYear)
  → { year, s1T, s2T, totalT }[]           // every year that has an inventory

deriveBauGrowth(series, baseYear)
  → { pct, fromYear, toYear, years } | null
```

- `actualSeries` calls `baselineScope1()` and `baselineScope2()` per year — the
  **baseline** functions only, never the lever engine. Cheap, and structurally
  incapable of being mistaken for a plan. `baselineScope2` needs no assumptions
  argument: each `Facility` carries its own `gridEf`.
- `deriveBauGrowth` returns the **CAGR from the first year with data to the base
  year**: `(base / first) ** (1 / (baseYear − firstYear)) − 1`, as a percent.
  It returns `null` when there are fewer than two years, when the first total is
  not positive, or when the base year itself has no data — every one of which is
  a real state on a part-filled inventory, and none of which may yield a number.
- *(Amendment 3)* Those two endpoint totals are **restricted to the sources
  present in both endpoint years**. `deriveBauGrowth` keeps owning endpoint
  SELECTION and is unchanged; the per-scope entry points `deriveScope1Bau` /
  `deriveScope2Bau` take the span it chose and recompute the two totals on the
  shared sources. Scope 1 intersects its combustion assets and its refrigeration
  systems against their own id spaces separately, since an id is not unique
  across the two lists.
- *(Amendment 3)* `DerivedGrowth` carries `basis: "like-for-like" | "total"`,
  `keptCount`, and the NAMES of sources `joined` or `left` mid-span, so the rate
  is auditable on screen rather than merely asserted. When the restricted basis
  cannot carry a rate — an empty intersection, or a non-positive restricted first
  total — the total basis is returned with `basis: "total"`. It is NOT allowed to
  fall to the 1 % floor there: that would replace a flawed measurement with an
  invented one, and the `basis` field exists so the difference is visible.
- *(Amendment 3)* `scope1ActualSeries` / `scope2ActualSeries` keep returning
  **true totals**, and the chart keeps plotting them. Only the rate is measured
  like-for-like — the emissions really were what they were, and rewriting history
  so the picture matches the rate would be the wrong repair.
- **One rate for both scopes** (amends D-e) — meaning one *control*. Amendment 2
  splits where the arithmetic happens, because a single combined CAGR cannot be
  computed in either store: it needs Scope 1's fuel inventory and Scope 2's
  facilities, each store holds only its own, and Scope 2 reads Scope 1
  *optionally* (`useOptionalAssumptions`, `lib/store.tsx:402`) precisely because
  its tabs can mount without it. There is no ancestor where both year-maps exist
  before the stores do, and writing a derived value into persisted
  `GlobalAssumptions` to bridge them is the frozen copy §6.5 forbids. So:

  - **No override:** each store derives from its own series and passes its own
    rate as the fallback. Scope 1's BAU grows at the fuel inventory's CAGR,
    Scope 2's at the facilities' — which tracks history *more* closely than one
    blended rate, not less.
  - **Override set:** the single `bauGrowthPct` applies to both scopes, which is
    the one-rate behaviour the control promises.
  - Both derived rates are **displayed** side by side, so divergence stays
    visible. The implied *combined* rate may also be shown, but only labelled as
    an outcome — never as the driver, because when no override is set it is not
    driving anything.
- Years **after** the base year that hold inventories are plotted as actual
  points against the BAU line — a plan-vs-outcome read for free, and the reason
  the series is not truncated at the base year. They do not affect the derived
  rate, which ends at the base year by definition.

### 6.3 Plumbing

`TrajectoryConfig.bauGrowth` (`model/types.ts:378`) is already a parameter, so
the work is confined to sourcing its value.

1. `GlobalAssumptions` gains `bauGrowthPct?: number` — **one** field, in percent
   (2.5 means 2.5 %/yr). Absent means "use the derived rate". `??` not `||`: a
   user who sets growth to 0 means 0, and a flat BAU is a legitimate premise.
2. `compute()` and `computeScope2()` each gain a `bauGrowthFallbackPct?`
   parameter. Resolution order, identical in both:
   `assumptions.bauGrowthPct ?? fallback ?? 1`. The fallback exists because the
   engines are pure and receive only the base year's inventory; derivation needs
   every year, so it happens in the stores and is injected.
3. Each store derives its **own** scope's rate in a `useMemo` over its own year
   map and passes it as that scope's fallback (Amendment 2). No cross-store
   plumbing, and no store needs data it does not own.
4. Delete both `BAU_GROWTH` constants (B6). No reader of a hardcoded growth value
   survives.
5. **Auto-adoption.** With no `bauGrowthPct` set, the derived rate applies
   immediately — roughly 2.5 %/yr on the shipped fixture, against today's 1 %.
   This **moves every number in the app** on first load: required cut, gap, mix
   badges, Goals, CEO overview. That is deliberate — 1 % was a constant nobody
   chose — and §4.2 already establishes that a BAU above the base year makes the
   level basis require *more*. §6.5 pins the regression guard that proves the old
   numbers are still reachable.

### 6.4 Screen contents

Four sections in the work pane. The result rail is untouched.

**6.4.1 Business as usual.** The derived rate with its span (`2.1 %/yr ·
FY2021 → FY2025`) and, per Amendment 3, **the basis it was measured on** — how
many sources it covers and the name of anything excluded, e.g. "measured on the 2
facilities present in both FY2021 and FY2025; Island resort joined mid-span and
is excluded". Without that line the number cannot be audited. Both scopes' derived
rates beneath it, an override input plus
slider, and a reset-to-derived control that **clears** `bauGrowthPct` rather than
writing the derived number into it — so the field stays live as the inventory
grows. A consequence line in the §4.4 register: *"At 2.5 %/yr, business-as-usual
reaches 8,010 t by 2030 instead of 6,900 t — 1,110 t more to remove."*

Chart *(amended)*: new `components/charts/BauChart.tsx` — actual points for every
year with data, plus **one** BAU line taken straight from
`combineTrajectories(s1.result.trajectory, s2.result.trajectoryMarket)`, whose
rows already carry `bau` per year. `BalanceTab` computes those rows today
(`BalanceTab.tsx:123`), so the chart adds no BAU arithmetic of its own and cannot
disagree with the rail beside it.

The dashed second line for the derived rate is **dropped**. Drawing it would mean
recomputing a compound curve outside the trajectory engine, which omits the
grid-decline factor that engine applies to Scope 2 (`gridFactor`,
`trajectory.ts:48`) — so the two lines would not be comparable, and the
comparison was the only reason to draw the second one. Clearing the override
shows the derived path exactly, through the same engine. The rate in force and
the derived rates are stated in the caption instead.

`WedgeChart` is still **not** reused, though the original spec said to: it plots
BAU against a plan's wedges, and this chart's subject is BAU against history.
Bending it would cost more than the ~60 lines of recharts this needs, and would
put a wedge stack on a screen that has no plan on it.

**6.4.2 Mix inputs.** The CAPEX budget box moves here as its single home. Note
that by then it is the **peak single-year** capital cap, not the lifetime total:
B5 / §5.6 re-bases it in plan 2a Task 5. If §6 is built before that task lands,
the box moves as-is and is re-based in place — what must not happen is this
screen growing a second budget field on a different basis from the one in
*Compare mixes*.

Target percentage and year stay in the pinned band above the tabs — already
always visible — and are echoed read-only. *Compare mixes* keeps the Suggest button and
gains a one-line premise strip (`50 % by 2030 · cap ₹50 Cr · BAU 2.5 %/yr`) that
links back here.

**6.4.3 CAPEX rates.** The editable table over `result.capexLines` from **both**
scopes, per §5.2 presentation rules and §5.4 as amended. This is the only place a
rate is typed (§5.5 as amended). Requires plan 2a Tasks 2 and 4 to have landed —
Scope 1's contributions are uncommitted and Scope 2's are not yet written.

**6.4.4 Running costs & finance.** The `GlobalAssumptions` fields currently
reachable only via Scope 1 → segment → *Assumptions*
(`components/tabs/BuilderTab.tsx:1562`): discount rate, the three escalations,
maintenance share, EV and heat-pump maintenance ratios, REC price, carbon price,
grid EF and its decline. Same state, same writer — a second **surface**, not a
second copy, which is the distinction `lib/store.tsx:406` exists to enforce.

### 6.5 Tests

- CAGR: known series → known rate; one year → `null`; first total 0 → `null`;
  base year absent from the series → `null`.
- *(Amendment 3)* A source joining mid-span is excluded from the rate, and so is
  one leaving. **No boundary change reproduces the total-basis rate at full
  precision** — the no-op guard that proves the intersection only ever removes
  an artefact. An empty intersection falls back to `basis: "total"`, never to 1.
  And the shipped fixture is pinned: Scope 1 ≈ 2.01 %/yr, Scope 2 ≈ 2.11 %/yr,
  both like-for-like, naming Petrol LCVs and Island resort as excluded.
- A year *after* the base year appears in `actualSeries` and does not move the
  derived rate.
- `assumptions.bauGrowthPct` overrides the derived rate; clearing it restores the
  derived rate rather than a frozen copy of it.
- Growth 0 gives a flat BAU.
- **Regression guard on auto-adoption:** with `bauGrowthPct = 1` set explicitly,
  every pre-amendment trajectory number is reproduced exactly. This is what makes
  deleting the constants safe.
- An explicit `bauGrowthPct` override moves **both** scopes' BAU.
- With **no** override, each scope's BAU moves with its own derived rate, and a
  change to the Scope 2 facilities' history does not move Scope 1's BAU
  (Amendment 2). This replaces the superseded per-scope-override test, which must
  be deleted rather than left passing vacuously.
- The chart's BAU series is identical to `combineTrajectories(...).map(r => r.bau)`
  — asserted, so the chart can never grow BAU arithmetic of its own.
- Raising growth increases `requiredT` by exactly `ΔBAU(y)`, tying this to §4.2.
- Editing a mixed-rate line: per-source ratios are preserved and the line's
  weighted average equals the typed rate (the §5.4 amendment).
- Editing a line whose weighted average is 0 sets every source to the typed rate.
- `invalidate()` fires on a growth change and on a capex-rate change, so a stale
  mix set can never sit beside changed premises.

---

## 7. Out of scope

Named so they are not smuggled in: any frontier or efficient-frontier chart; a
true optimizer replacing the greedy walk; per-mix price sandboxes; per-year
per-year growth overrides (the `goals/select.ts` milestone-interpolation pattern is the
route if wanted later — note that Amendment 1 brings the year-wise *actual* series
in scope as the source of the derived rate, which is not the same thing as letting a
user set a different growth rate for each future year); scenario export; per-business-unit targets.

---

## 8. Build order *(amended)*

| # | Deliverable | State |
|---|---|---|
| 1 | Level basis | **Shipped** — commit `76b0eb9` |
| 2a | CAPEX lines engine | **In progress** — plan `2026-08-31-capex-lines-engine.md`. Task 1 committed (`b54266b`); Task 2 (Scope 1 pushes) uncommitted in the working tree; Tasks 3–5 (peak-year capital + cost-to-own, Scope 2 pushes, mixes carry their lines) not started |
| 2b | CAPEX breakdown in the mix cards | Not started. Read-only after the §5.5 amendment, which shrinks it |
| 3 | The Assumptions sub-tab (§6) | Not started |

Ordering constraints, rather than a straight sequence:

- **3's BAU half depends only on 1**, which has shipped. §6.1–§6.3 and §6.4.1–2
  can be built now, and are the part the user asked for first.
- **3's CAPEX-rates table (§6.4.3) depends on 2a Tasks 2 and 4** — it renders
  `capexLines` for *both* scopes, and Scope 2 emits none yet. Building the table
  against Scope 1 alone would ship a table that silently omits solar, battery and
  LED: the largest lines in most plans.
- **2b is now optional and should be resequenced after 3**, not before it. Under
  the §5.5 amendment the cards carry a read-only breakdown while every edit
  affordance lives on the Assumptions tab, so most of 2b's original surface area
  (in-place editing, provenance markers, reset controls, the per-source expander)
  moves to 3. Building 2b first would build that surface twice.

Recommended sequence: **finish 2a → 3 → 2b**.

Each remains independently testable.

---

## 9. Performance note

Measured this session: one `suggestMixOptions` call (three greedy walks, each up
to six families × ten steps of full-model evaluation) costs **~30 ms**, and is
**flat in portfolio size** — 100 assets / 20 systems / 25 facilities cost 30 ms
against 25 ms for 2 / 1 / 1, because the walk's step count dominates, not the
data volume. Re-suggesting on demand needs no worker, no debounce beyond the
usual input settle, and no loading state beyond a spinner.
