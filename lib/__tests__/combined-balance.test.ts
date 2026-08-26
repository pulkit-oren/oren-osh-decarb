/* Combined balance engine — one target across both scopes: reduction
   measurement, derived current dials, and the cheapest-first suggester. */

import { describe, expect, it } from "vitest";
import { combinedReduction2030, currentCombinedDials, suggestCombinedMix, suggestMixOptions, type CombinedInputs } from "../combined-balance";
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

describe("combinedReduction2030", () => {
  const ZERO = currentCombinedDials(inp);

  it("is ~0 with everything off and grows when dials rise", () => {
    expect(combinedReduction2030(inp, ZERO)).toBeCloseTo(0, 3);
    const withEff = { ...ZERO, s2: { ...ZERO.s2, efficiencyPct: 100 } };
    expect(combinedReduction2030(inp, withEff)).toBeGreaterThan(0.02);
  });

  it("measures at the given targetYear — a later year sees at least the 2030 reduction", () => {
    const withEff = { ...ZERO, s2: { ...ZERO.s2, efficiencyPct: 100 } };
    const at2030 = combinedReduction2030(inp, withEff);
    const at2040 = combinedReduction2030({ ...inp, targetYear: 2040 }, withEff);
    expect(at2040).toBeGreaterThanOrEqual(at2030 - 1e-9);
    // an explicit 2030 matches the default
    expect(combinedReduction2030({ ...inp, targetYear: 2030 }, withEff)).toBeCloseTo(at2030, 9);
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

  it("a CAPEX budget adds a fourth, honestly-capped option", () => {
    const withBudget = suggestMixOptions(inp, 0.5, { capexBudget: 500_000 });
    expect(withBudget).toHaveLength(4);
    const b = withBudget.find((o) => o.objective === "budget")!;
    expect(b.kpis.totalCapex).toBeLessThanOrEqual(500_000 + 1e-6);
    // an aggressive target under a tight cap reports itself as budget-capped
    if (!b.met) expect(b.budgetLimited).toBe(true);
    // without a budget the fourth option doesn't appear
    expect(suggestMixOptions(inp, 0.12)).toHaveLength(3);
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
