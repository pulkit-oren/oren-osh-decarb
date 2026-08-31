/* Combined balance engine — one target across both scopes: reduction
   measurement, derived current dials, and the cheapest-first suggester. */

import { describe, expect, it } from "vitest";
import { combinedReduction2030, currentCombinedDials, suggestCombinedMix, suggestMixOptions, type CombinedDials, type CombinedInputs } from "../combined-balance";
import { compute } from "@/lib/model";
import { computeScope2 } from "@/lib/scope2/model";
import { combineTrajectories, targetPosition } from "@/lib/model/combined";
import { targetValueAt } from "@/lib/goals/select";
import type { Goal } from "@/lib/goals/types";
import { applyDials, withLeakFixes } from "@/lib/model/energy-balance";
import { applyDials2 } from "@/lib/scope2/model/energy-balance";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { CombustionAsset, LeverSettings, RefrigerationSystem } from "@/lib/model/types";
import type { Facility, Scope2Levers } from "@/lib/scope2/model/types";

const assets: CombustionAsset[] = [
  { id: "a1", name: "Boiler", category: "stationary", fuelType: "diesel", unit: "L", annualVolume: 60_000, opex: 5_000_000, remainingLife: 12, unitCount: 1 },
  { id: "a2", name: "Fleet", category: "mobile", fuelType: "diesel", unit: "L", annualVolume: 100_000, opex: 9_000_000, remainingLife: 8, unitCount: 10 },
];
const systems: RefrigerationSystem[] = [
  { id: "s1", name: "HVAC", systemType: "commercialHVAC", refrigerant: "R404A", toppedUpKg: 25, gasCostPerKg: 400 },
];
const facilities: Facility[] = [{
  id: "f1", name: "Plant", annualLoadKwh: 900_000, tariffPerKwh: 9,
  loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
  roofSpaceM2: 3_000, peakLoadKw: 0, gridEf: 0.71, irradiance: 1400,
  isolated: false, existingSolarKwp: 0, existingRenewablePct: 0,
}];

const s1Base: LeverSettings = { byAsset: {}, bySystem: {}, assumptions: DEFAULT_SETTINGS.assumptions };
const s2Base: Scope2Levers = {
  byFacility: {},
  procurement: {
    enabled: false, ppaPct: 0, greenTariffPct: 0, recPct: 0,
    ppaStrikeDeltaPerKwh: 0, greenTariffPremiumPerKwh: 0, recPricePerKwh: 0,
    re100Exclusion: false, startYear: 2026, targetYear: 2030,
  },
};

const inp: CombinedInputs = { assets, systems, s1Base, facilities, s2Base, baseYear: 2025 };

/** Run the real model for a dial set and read its position off the same function
 *  the rail uses. No mocks: this is the engine the screen runs.
 *
 *  `leakFixes` must mirror whichever call is under test — suggestMixOptions
 *  applies them, combinedReduction2030 does not. Getting that wrong compares two
 *  different plans and looks like a basis bug. */
const positionOf = (
  i: CombinedInputs, d: CombinedDials, pct: number, year = 2030, leakFixes = true,
) => {
  let s1s = applyDials(i.assets, i.systems, i.s1Base, d.s1);
  if (leakFixes) s1s = withLeakFixes(s1s, i.systems);
  const r1 = compute(i.assets, i.systems, s1s, i.baseYear);
  const r2 = computeScope2(i.facilities, applyDials2(i.facilities, i.s2Base, d.s2), i.baseYear, s1s.assumptions);
  return targetPosition(combineTrajectories(r1.trajectory, r2.trajectoryMarket), year, pct);
};

describe("combinedReduction2030", () => {
  const ZERO = currentCombinedDials(inp);

  /* These three expectations changed with the LEVEL basis, because the quantity
     measured changed — not because the engine got worse. On the avoided-tonnes
     basis, doing nothing scored exactly 0 by construction. On the level basis,
     doing nothing on a decarbonising grid still puts you below your base year,
     because the grid cleaned on your behalf. That free reduction is a real fact
     a company can and does claim, and hiding it behind a definitional zero was
     the old basis's doing. */
  it("credits the free reduction a decarbonising grid delivers even with every dial off", () => {
    const freeRide = combinedReduction2030(inp, ZERO);
    expect(freeRide).toBeGreaterThan(0.01); // 3.5%/yr grid decline, five years
    // and it is genuinely the grid, not the levers: freeze the grid and the
    // same all-off plan drifts ABOVE the base year on 1%/yr activity growth.
    const frozen: CombinedInputs = {
      ...inp,
      s1Base: { ...s1Base, assumptions: { ...s1Base.assumptions, gridEfDeclinePctPerYear: 0 } },
    };
    expect(combinedReduction2030(frozen, currentCombinedDials(frozen))).toBeLessThan(0);
  });

  it("grows when dials rise", () => {
    const withEff = { ...ZERO, s2: { ...ZERO.s2, efficiencyPct: 100 } };
    expect(combinedReduction2030(inp, withEff)).toBeGreaterThan(combinedReduction2030(inp, ZERO));
  });

  it("measures at the given targetYear, and an explicit 2030 matches the default", () => {
    const withEff = { ...ZERO, s2: { ...ZERO.s2, efficiencyPct: 100 } };
    const at2030 = combinedReduction2030(inp, withEff);
    expect(combinedReduction2030({ ...inp, targetYear: 2030 }, withEff)).toBeCloseTo(at2030, 9);
  });

  /* The old test here asserted "a later year sees at least the 2030 reduction"
     on a frozen grid. That invariant belonged to the avoided-tonnes basis: a
     fully-ramped lever's avoided tonnes grow with BAU, so later always looked
     better. On the level basis the truth is the opposite, and it matters far
     more to a company setting a target: a FIXED abatement loses to compounding
     growth. This is the fact the Growth & baseline tab exists to make visible. */
  it("a fixed abatement loses ground to growth when the grid never cleans", () => {
    const frozen: CombinedInputs = {
      ...inp,
      s1Base: { ...s1Base, assumptions: { ...s1Base.assumptions, gridEfDeclinePctPerYear: 0 } },
    };
    const withEff = { ...currentCombinedDials(frozen), s2: { ...ZERO.s2, efficiencyPct: 100 } };
    const at2030 = combinedReduction2030(frozen, withEff);
    const at2040 = combinedReduction2030({ ...frozen, targetYear: 2040 }, withEff);
    expect(at2040).toBeLessThan(at2030);
  });

  it("a fully-ramped Scope 2 lever abates FEWER tonnes later on a decarbonising grid", () => {
    /* Not a regression — the point of the grid trajectory. An efficiency lever
       saves kilowatt-hours, and a kilowatt-hour is worth fewer tonnes every year
       the grid cleans.

       Asserted on ALLOCATED TONNES (bau - net), which is what "abates" means,
       rather than through combinedReduction2030. The level basis measures the
       distance from the base year, so on a cleaning grid it RISES over time even
       as the lever itself does less work — reading a lever's output off it would
       be measuring two effects with one number. */
    const decarb: CombinedInputs = {
      ...inp,
      s1Base: { ...s1Base, assumptions: { ...s1Base.assumptions, gridEfDeclinePctPerYear: 3.5 } },
    };
    const withEff = { ...currentCombinedDials(decarb), s2: { ...ZERO.s2, efficiencyPct: 100 } };
    const allocatedAt = (year: number) => {
      const p = positionOf(decarb, withEff, 50, year, false);
      return p.allocatedT;
    };
    expect(allocatedAt(2040)).toBeLessThan(allocatedAt(2030));
    expect(allocatedAt(2040)).toBeGreaterThan(0);
  });
});

describe("currentCombinedDials", () => {
  it("derives from the live lever state on both scopes", () => {
    const s1 = applyDials(assets, systems, s1Base, { electrifyPct: 40, renewablePct: 50, bioBlendPct: 0, refrigPct: 0 });
    const s2 = applyDials2(facilities, s2Base, { efficiencyPct: 60, solarPct: 0, procurementPct: 0 });
    const d = currentCombinedDials({ ...inp, s1Base: s1, s2Base: s2 });
    expect(d.s1.electrifyPct).toBeCloseTo(40, -1);
    expect(d.s2.efficiencyPct).toBe(60);
  });
});

describe("suggestCombinedMix", () => {
  it("meets a modest target and reports the cost ranking", () => {
    const { dials, achieved, order } = suggestCombinedMix(inp, 0.1);
    expect(achieved).toBeGreaterThanOrEqual(0.1);
    expect(order.length).toBeGreaterThan(0);
    const all = [...Object.values(dials.s1), ...Object.values(dials.s2)];
    for (const v of all) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
  });

  it("returns its best reachable mix for an impossible target without hanging", () => {
    const { achieved } = suggestCombinedMix(inp, 0.99);
    expect(achieved).toBeGreaterThan(0);
    expect(achieved).toBeLessThan(0.99);
  });
});

describe("suggestMixOptions — three bases, ordered trade-offs", () => {
  const options = suggestMixOptions(inp, 0.12);
  const byId = Object.fromEntries(options.map((o) => [o.objective, o]));

  it("returns all three bases and every one meets a modest target", () => {
    expect(options.map((o) => o.objective)).toEqual(["costPerTonne", "capex", "opexSaving"]);
    for (const o of options) {
      expect(o.met).toBe(true);
      expect(o.achieved).toBeGreaterThanOrEqual(0.12);
    }
  });

  it("lowest-CAPEX basis needs the least upfront capital", () => {
    expect(byId.capex.kpis.totalCapex).toBeLessThanOrEqual(byId.costPerTonne.kpis.totalCapex + 1e-6);
    expect(byId.capex.kpis.totalCapex).toBeLessThanOrEqual(byId.opexSaving.kpis.totalCapex + 1e-6);
  });

  it("best-OPEX basis has the best running-cost position", () => {
    expect(byId.opexSaving.kpis.annualOpexDelta).toBeLessThanOrEqual(byId.capex.kpis.annualOpexDelta + 1e-6);
    expect(byId.opexSaving.kpis.annualOpexDelta).toBeLessThanOrEqual(byId.costPerTonne.kpis.annualOpexDelta + 1e-6);
  });

  /* A CAPEX budget is a constraint on every basis, not a basis of its own. It
     used to be modelled as a fourth objective whose rankKey was byte-identical
     to costPerTonne's, which meant the other three ignored the cap: at a
     500,000 budget "Cheapest overall" came back at 273,514,545 — 547x over —
     beside a fourth card that honoured it. Three cards, all capped. */
  it("a CAPEX budget caps EVERY basis, and never adds a fourth card", () => {
    for (const capexBudget of [500_000, 5_000_000, 50_000_000, 500_000_000]) {
      const capped = suggestMixOptions(inp, 0.5, { capexBudget });
      expect(capped).toHaveLength(3);
      expect(capped.map((o) => o.objective)).toEqual(["costPerTonne", "capex", "opexSaving"]);
      for (const o of capped) {
        // The displayed CAPEX is the number the gate enforced (F4 divergence).
        expect(o.kpis.totalCapex, `${o.objective} @ ${capexBudget}`).toBeLessThanOrEqual(capexBudget + 1e-6);
        // budgetLimited means the cap held the mix SHORT — never both at once.
        if (o.budgetLimited) expect(o.met).toBe(false);
      }
    }
    expect(suggestMixOptions(inp, 0.12)).toHaveLength(3);
  });

  /* Leak fixes ride along with every mix unconditionally, so their capital is a
     floor no cap can decline. A cap below that floor is not satisfiable by any
     mix; the engine says so rather than reporting a spend it did not honour. */
  it("a cap below the unavoidable floor is reported, not silently honoured", () => {
    // target 0 means the walk never runs, so this IS the floor.
    const floor = suggestMixOptions(inp, 0, { capexBudget: 1 })[0].kpis.totalCapex;
    expect(floor).toBeGreaterThan(0);

    const [tight] = suggestMixOptions(inp, 0.5, { capexBudget: 1 });
    expect(tight.met).toBe(false);
    expect(tight.budgetLimited).toBe(true);
    // it spends the floor and not a rupee more — the walk added nothing
    expect(tight.kpis.totalCapex).toBeCloseTo(floor, 6);

    // one rupee above the floor is a satisfiable cap, and is enforced exactly
    const [justAbove] = suggestMixOptions(inp, 0.5, { capexBudget: floor + 1 });
    expect(justAbove.kpis.totalCapex).toBeLessThanOrEqual(floor + 1 + 1e-6);
  });

  it("a cap loose enough to never bind leaves every mix identical to the uncapped one", () => {
    const uncapped = suggestMixOptions(inp, 0.5);
    const capped = suggestMixOptions(inp, 0.5, { capexBudget: 1e12 });
    expect(capped.map((o) => o.kpis.totalCapex)).toEqual(uncapped.map((o) => o.kpis.totalCapex));
    expect(capped.map((o) => o.achieved)).toEqual(uncapped.map((o) => o.achieved));
    expect(capped.every((o) => o.budgetLimited === false)).toBe(true);
  });

  it("leak fixes ride along with every applied mix", () => {
    const applied = withLeakFixes(applyDials(assets, systems, s1Base, byId.capex.dials.s1), systems);
    expect(applied.bySystem["s1"].leakFix.enabled).toBe(true);
    expect(applied.bySystem["s1"].leakFix.leakImprovementPct).toBeGreaterThanOrEqual(50);
  });
});

describe("the ranking basis is the SAME basis the card shows", () => {
  // priceFamily used to rank on `annualCost` — the CRF annuity lib/model marks
  // DISPLAY ONLY — while the KPI beside the options showed the programme
  // levelised figure. Two quantities, two bases, and they order the families
  // differently: on the annuity basis S2:procurementPct ranked 4th of six; on
  // the levelised basis it ranks last. So the mix the user was offered as
  // "cheapest" was cheapest by a number the screen never displayed.
  //
  // Electrification leads because its Rs/t is a SAVING and netting the Scope 2
  // spill out of its denominator divides that saving by fewer tonnes, which
  // reads as cheaper. That is a property of ranking savings by Rs/t, not of the
  // netting: for a lever that costs money, netting makes it dearer. Recorded
  // here because it is the kind of sign asymmetry that looks like a bug later.
  const order = suggestCombinedMix(inp, 0.12, "costPerTonne").order;

  it("ranks the six families in levelised order, procurement last", () => {
    expect(order).toEqual([
      "S1:electrifyPct", "S2:solarPct", "S2:efficiencyPct",
      "S1:refrigPct", "S1:bioBlendPct", "S2:procurementPct",
    ]);
  });

  it("every family is ranked — none is dropped for having no tonnes", () => {
    // The old filter was `abatementT > 0` INSIDE the price, which is F4 rebuilt:
    // spend on a zero-tonne lever left the family's own price.
    expect(order).toHaveLength(6);
    expect(new Set(order).size).toBe(6);
  });
});

/* ── B1: one meaning for one percentage ─────────────────────────────────────
   "Cut 50% by 2030" means emissions END UP at half the base year. Goals
   (targetValueAt) and the trajectory target line already meant that; this
   module meant "tonnes AVOIDED equal half the base year". The two coincide only
   while BAU sits on the base year.

   The grid is frozen in these fixtures so activity growth is the only thing
   moving BAU, which puts BAU 2030 ABOVE the base year — the case where the old
   basis was too generous and called a mix "met" some 300 t short of the level
   it had committed to. With the shipped 3.5%/yr grid decline the error runs the
   other way and the old basis was too harsh, so a test on the default
   assumptions would not have caught this. */
describe("the target is a LEVEL, not a quantity avoided", () => {
  const grown: CombinedInputs = {
    ...inp,
    s1Base: { ...s1Base, assumptions: { ...s1Base.assumptions, gridEfDeclinePctPerYear: 0 } },
  };

  it("puts BAU above the base year when the grid is frozen — the case that exposes the defect", () => {
    const p = positionOf(grown, currentCombinedDials(grown), 50);
    expect(p.bauAtYear).toBeGreaterThan(p.base);
  });

  it("a mix reported as meeting the target lands at or below the committed level", () => {
    for (const o of suggestMixOptions(grown, 0.5)) {
      if (!o.met) continue;
      const p = positionOf(grown, o.dials, 50);
      expect(p.netAtYear, `${o.objective} finished above its committed level`)
        .toBeLessThanOrEqual(p.committedLevel + 0.5);
    }
  });

  it("agrees with the Goals module on what the same percentage means", () => {
    const p = positionOf(grown, currentCombinedDials(grown), 50);
    // targetValueAt is the Goals tab's own definition. The engine's committed
    // level must equal it, or the two screens disagree about one commitment.
    const goal: Goal = {
      id: "g", name: "50% by 2030", category: "emissions", templateId: "abs_sbti",
      metric: "emissions_t", direction: "reduce", scope: "s1s2",
      baseYear: 2025, targetYear: 2030, targetPct: 50, milestones: [], createdAt: 0,
    };
    expect(p.committedLevel).toBeCloseTo(targetValueAt(goal, p.base, 2030), 6);
  });

  it("reports reduction as the fraction below the base year", () => {
    const dials = currentCombinedDials(grown);
    // leakFixes: false — combinedReduction2030 does not apply them, and
    // comparing a leak-fixed position against it measures two different plans.
    const p = positionOf(grown, dials, 50, 2030, false);
    expect(combinedReduction2030({ ...grown, targetYear: 2030 }, dials))
      .toBeCloseTo((p.base - p.netAtYear) / p.base, 6);
  });
});
