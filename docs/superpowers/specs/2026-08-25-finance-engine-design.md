# Finance Engine — Design Spec

**Date:** 2026-08-25
**Status:** binding authority for the implementation plan that follows
**Supersedes:** the finance portions of the 2026-07-03 calc-logic gap analysis (items 2–5, 7)

---

## 1. Why this exists

Every rupee figure in the deployed app is computed against a ₹0 fuel price.

`lib/company/seed.ts` — the company the deployed app actually loads — carries
`"opex":0` on all seven combustion sources. The model derives fuel price as
`a.opex / a.annualVolume` (`lib/model/index.ts:165`), so the price is zero, so
every displaced-spend saving is zero, so levers that should save money render as
costs. The Balance tab reads "Fuel switch −4,998 t **+₹8.53 Cr/yr**" for exactly
this reason.

`lib/model/factors.ts` already carries `typicalPricePerUnit` for 41 fuels. The
model never reads it. Only the entry screen does, and only when the user clicks
"Use average".

**Why 619 passing tests did not catch it.** The test fixtures come from
`lib/defaults.ts`, whose assets carry real spend (₹2.25 Cr on gensets, ₹90 L on
the boiler). The financial engine is only wrong on the data a user sees. Every
requirement in this spec that can be tested against the seeded company MUST be.

---

## 2. Defect ledger

Severity order. F1 is the presenting symptom; F2–F4 are independent arithmetic
errors that survive F1's fix.

| # | Defect | Site | Effect |
|---|---|---|---|
| F1 | No price fallback when spend is absent | `model/index.ts:165`, `goals/initiatives-auto.ts:65` | All displaced-spend savings ₹0; levers invert from saving to cost |
| F2 | Efficiency credits the whole of `a.opex` | `model/index.ts:125` | `a.opex` is fuel **plus** maintenance; efficiency cuts volume only. Overstates saving by the maintenance share |
| F3 | Stationary electrification gets no maintenance add-back | `model/index.ts:143-145` | Mobile adds back 65% of displaced maintenance; stationary implies a heat pump needs none |
| F4 | Zero-abatement levers dropped from totals | `model/index.ts:307-310` | `totalCapex` / `totalOpexDelta` / `costPerTonne` all derive from `activeLevers`, so capex on a lever yielding no tonnes vanishes from the KPIs |
| F5 | Annualised and cashflow views disagree | `model/finance.ts:32` vs `model/cashflow.ts` | Annuity implies perpetual renewal; cashflow buys once, never replaces, truncates NPV with no residual value |
| F6 | Payback undiscounted while ₹/t is discounted | `model/finance.ts:45` | Two inconsistent money bases presented side by side |
| F7 | Export states an assumption the engine does not use | `export.ts:69` | Prints "CAPEX annualization = 10 years"; engine uses per-lever 7/10/15/12 plus a discount rate |
| F8 | Escalation rates hardcoded | `model/cashflow.ts:29-33` | Not in `GlobalAssumptions`, not user-editable, absent from the export |
| F9 | Leak-fix capex absent | seed + `acts.leakFix.capex ?? 0` | `simplePayback` returns its instant-payback branch, rendering "0.0 yr" as if it were a result |
| F10 | `remainingLife` read by nothing | `model/*` | No early-retirement penalty; scrapping a 9-year-old genset costs what replacing a dead one costs |
| F11 | Price divide duplicated | `goals/initiatives-auto.ts:65` | Same zero-price bug, no efficiency interaction, free to drift from the model |

---

## 3. Architecture

One module owns every money decision:

```
lib/finance/
  prices.ts      resolvePrice, splitSpend        — what a unit of fuel costs, and what of a bill is fuel
  lifetimes.ts   LEVER_LIFETIME_YEARS, horizonFor — asset lives, evaluation windows
  series.ts      buildLeverCashflow              — the one year-by-year series
  metrics.ts     levelisedCost, discountedPayback, npv, peakFunding
  assumptions.ts FinanceAssumptions, defaults, resolution from GlobalAssumptions
  index.ts       public surface
```

**Consumers.** `lib/model/index.ts`, `lib/scope2/model/index.ts` and
`lib/goals/initiatives-auto.ts` call this module and perform no money arithmetic
of their own. After this work, `grep` for `/ *annualVolume` or a bare
`capex /` outside `lib/finance/` must return nothing.

**Retained.** `lib/model/finance.ts` keeps `annuity` / `crf` as *display* helpers
for the "steady-state annual cost" line only. They stop feeding ₹/t.

**Deleted.** `weightedCostPerTonne` (levelised cost replaces it), `simplePayback`
(discounted payback replaces it), and `annualizedCapex` — which already has zero
callers and exists only to be picked up by mistake.

**Boundary rule.** `lib/finance/` imports no UI, no store, and nothing from
`lib/model/` except types. It is pure: same inputs, same output. This is what
makes it auditable, which is the stated goal.

---

## 4. Price resolution (fixes F1, F11)

```ts
type PriceBasis = "measured" | "reference" | "unavailable";

interface ResolvedPrice {
  pricePerUnit: number;
  basis: PriceBasis;
}

resolvePrice(source): ResolvedPrice
  measured    when source.opex > 0 && source.annualVolume > 0
              -> source.opex / source.annualVolume
  reference   when FUELS[source.fuelType].typicalPricePerUnit > 0
              -> that value
  unavailable otherwise -> 0
```

`basis` is not decoration. It propagates onto every figure derived from the
price, so:

- the UI marks estimated figures as estimated;
- the export names which sources were priced by assumption;
- `unavailable` is distinguishable from `reference`, so a fuel with no reference
  price does not masquerade as an estimate.

**The seed stays at `opex: 0`.** Deliberately. It is the fixture that exercises
the `reference` path, and it is the shape real user data arrives in. Do not
"fix" the seed to make numbers appear.

### Spend split (fixes F2, F3)

`a.opex` is documented on the entry screen as "Fuel cost plus related
maintenance for the year". Nothing honoured that.

```ts
splitSpend(opex, maintSharePct) -> { fuel, maintenance }
  maintenance = opex * maintSharePct / 100      // default 20
  fuel        = opex - maintenance
```

- **Efficiency** reduces volume, so it saves `fuel × effFraction` only. Never
  the maintenance component.
- **Electrification** displaces `fuel` fully, and adds back
  `maintenance × replacementMaintRatio` for **both** categories — mobile at 65%
  (`evMaintenanceRatioPct`), stationary at a new
  `heatPumpMaintenanceRatioPct`, default 70%. A displaced boiler does not
  become maintenance-free.

---

## 5. Levelised cost (fixes F5, F6)

One series per lever, evaluated over that lever's own asset life.

**Window.** A lever deploys over a ramp (`startYear .. targetYear`), so its last
tranche is installed at `targetYear` and lives until `targetYear + assetLife − 1`.
The window therefore runs:

```
years = startYear .. targetYear + LEVER_LIFETIME_YEARS[lever] - 1
```

This choice is deliberate and it is what removes reinvestment and residual value
from the design. Because the window extends to the end of the **last** tranche's
life, every tranche is evaluated over its full life: nothing is ever replaced
inside the window, and nothing is left with unused life at the edge. Both terms
would be identically zero, so neither is implemented. Specifying them would be
specifying dead code.

(Had the window been fixed at `startYear + assetLife`, the opposite holds —
later tranches get truncated and residual value becomes load-bearing. That is
the common-horizon mode, which §7 puts out of scope. If it is ever added,
residual value must be added with it.)

```
capex(y)   = capex * rampIncrement(y)          // rampAt(y) - rampAt(y-1), per cashflow.ts
opex(y)    = Σ parts: amount * ramp(y) * (1 + esc(kind))^(y - baseYear)
tonnes(y)  = fullAbatementT * ramp(y)
net(y)     = capex(y) + opex(y)                // positive = cash out

disc(y)    = 1 / (1 + discountRate)^(y - baseYear)

LCA (₹/t)  = Σ net(y)·disc(y) / Σ tonnes(y)·disc(y)
payback    = first y where Σ net(≤y)·disc(≤y) ≤ 0, else null
npv        = Σ -net(y)·disc(y)
peakFunding= max over y of undiscounted cumulative net
```

**Discounting is always to `baseYear`**, never to each lever's own start. This is
what makes summing across levers with different window lengths valid, and it is
required for the programme roll-up below.

**Discount rate** comes from `GlobalAssumptions.discountRatePct` (default 10),
one value for all levers.

**Invariants.** Testable assertions, not prose:

1. `Σ discounted tonnes > 0` whenever `fullAbatementT > 0`, so LCA never divides by zero.
2. LCA of a lever with zero capex and a pure saving is **negative** — it pays.
3. `LCA`, `payback` and `npv` are derived from one series: a test perturbs the series and asserts all three move.
4. Discounted tonnes are computed with the same `disc(y)` as discounted cost — a test asserts that setting the discount rate to 0 makes LCA equal undiscounted cost ÷ undiscounted tonnes.
5. Every rupee falls inside the window: `Σ capex(y)` equals `capex` exactly (the ramp increments sum to 1).
6. Undiscounted tonnes over the window equal `fullAbatementT × (W − (R − 1)/2)`, where `W` is the window length and `R` the ramp years. Derivation: the ramp contributes `(1 + 2 + … + R)/R = (R + 1)/2` over its `R` years, then `1` for the remaining `W − R` years, giving `(R + 1)/2 + W − R = W − (R − 1)/2`. A ramp of 1 year reduces this to `W`, which is the check to write first.

### Totals (fixes F4)

Roll-ups iterate **all** levers whose `capex > 0` or whose `opexParts` are
non-zero — not those with `abatementT > 0`. A lever that costs money and
delivers nothing must appear in `totalCapex` with an LCA of `Infinity`, rendered
as "no abatement", never silently dropped.

Programme-level LCA is `Σ discounted cost / Σ discounted tonnes` across levers —
**not** the mean of per-lever LCAs.

---

## 6. Assumptions (fixes F7, F8)

`GlobalAssumptions` gains, all optional with defaults for old saves:

| Field | Default | Note |
|---|---|---|
| `fuelEscalationPct` | 5 | moves out of `DEFAULT_CASHFLOW_ASSUMPTIONS` |
| `elecEscalationPct` | 3 | ditto |
| `heatPumpMaintenanceRatioPct` | 70 | new, §4 |
| `otherEscalationPct` | 0 | makes today's silent zero for `kind: "other"` explicit |

`discountRatePct`, `maintenanceShareOfSpendPct`, `evMaintenanceRatioPct` already
exist and are reused as-is.

`lib/export.ts` stops printing `CAPEX_LIFETIME`. It prints the assumption set
actually used: discount rate, each escalation rate, each maintenance ratio, the
per-lever lifetime table, and the horizon rule. It also prints a price-basis
column per source (`measured` / `reference` / `unavailable`). `CAPEX_LIFETIME` is
deleted from both `lib/model/index.ts` and `lib/scope2/model/index.ts`.

---

## 7. Out of scope

- **F9 (leak-fix capex defaults).** Choosing default LDAR capex figures is a data
  question, not an engine question, and is deferred. **Note the correction:**
  moving to discounted payback does *not* on its own stop "0.0 yr" appearing —
  with zero capex the cumulative is negative in year one either way. The engine
  requirement is therefore explicit: when a lever has **no capital at risk**
  (`capex === 0`) and a net saving, payback is `null` and renders as
  "immediate — no capital", never as a number. A test must pin this, because
  "0.0 yr" reads as a computed result and is not one.
- **F10 (early retirement from `remainingLife`).** A modelling decision with no
  existing code to extend. The formula must be agreed with the owner before it
  is built. `remainingLife` stays unread until then; this spec does not license
  inventing a penalty.
- **Common-horizon mode** (all levers to a fixed year such as 2030, or a flat 20
  years). The owner chose per-lever asset life on 2026-08-25. If common-horizon
  is added later it MUST bring residual value and reinvestment with it — see the
  parenthetical in §5. Do not add the horizon without those two terms.
- **Budget-constrained optimiser** (2026-07-03 item 6). Untouched.
- **Physics.** Emission factors, energy balance and abatement tonnage are not in
  scope. This spec changes what a tonne *costs*, never how many tonnes there are.
  A test must assert total abatement tonnage is byte-identical before and after.

---

## 8. Consequences the owner has accepted

- **Every rupee figure on screen changes.** Costs mostly fall, because diesel
  stops being free. Current displayed values have no baseline worth preserving.
- **₹/t is no longer comparable to previously exported reports.** The basis
  changes from annuity-plus-opex to levelised cost.
- **Levers can now show a negative ₹/t** (they pay for themselves). Any UI that
  assumes ₹/t ≥ 0 — axis floors, colour ramps, sort orders — must be checked.

---

## 9. Test strategy

Three layers, in this order:

1. **Characterisation against the seeded company.** One test per defect F1–F8,
   each asserting the *wrong* current number first (so the test is proven to
   discriminate), then flipped to the correct value. The fixture is
   `lib/company/seed.ts` — the zero-opex shape — because that is the gap the
   existing 619 tests leave.
2. **Unit tests per formula** with hand-computed expected values written into the
   test as arithmetic, not as opaque constants. Every invariant in §5 gets an
   assertion. Every new test records its killing mutation.
3. **Reconciliation test.** Scope 1, Scope 2 and `initiatives-auto` given the
   same programme must agree on ₹/t to within floating-point tolerance. This is
   the test that makes the "one engine" claim falsifiable.

**Frozen files.** `components/tabs/__tests__/activity-data.test.tsx` and
`empty-field-guards.test.tsx` stay untouched, as on the equipment branch.

**Gate.** `npx tsc --noEmit && npm test && npm run lint && npm run build`, with
lint held at 3 errors / 28 warnings and not higher.
