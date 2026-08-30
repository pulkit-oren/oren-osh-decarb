/* The Indian cost stack on a wheeled unit, and the demand charge no lever used
   to touch. Together these are what decide whether an open-access PPA is worth
   signing and which of two plants signs first — the comparison the model could
   not previously make, because a PPA was priced off a strike delta alone. */

import { describe, it, expect } from "vitest";
import { applyProcurement, type FacilityDraw } from "../procurement";
import { applyGeneration } from "../generation";
import { erodesSaving, openAccessAdderPerKwh, EMPTY_STACK } from "../open-access";
import type { Facility, GenerationAction, OpenAccessCharges, ProcurementSettings } from "../types";

const draws: FacilityDraw[] = [
  { id: "f1", gridDrawKwh: 10_000_000, gridEf: 0.71, isolated: false, tariffPerKwh: 9 },
];

const proc = (patch: Partial<ProcurementSettings> = {}): ProcurementSettings => ({
  enabled: true, ppaPct: 50, greenTariffPct: 0, recPct: 0,
  ppaStrikeDeltaPerKwh: -1.5, greenTariffPremiumPerKwh: 0.7, recPricePerKwh: 0.45,
  re100Exclusion: false, startYear: 2026, targetYear: 2030, ...patch,
});

const stack = (patch: Partial<OpenAccessCharges> = {}): OpenAccessCharges => ({
  ...EMPTY_STACK, ...patch,
});

describe("openAccessAdderPerKwh", () => {
  it("is zero when no stack is set, so old plans price unchanged", () => {
    expect(openAccessAdderPerKwh(undefined, 9)).toBe(0);
    expect(openAccessAdderPerKwh(EMPTY_STACK, 9)).toBe(0);
  });

  it("sums the explicit regulated charges", () => {
    const v = openAccessAdderPerKwh(
      stack({ crossSubsidySurchargePerKwh: 1.2, additionalSurchargePerKwh: 0.6, wheelingChargePerKwh: 0.4 }), 9,
    );
    expect(v).toBeCloseTo(2.2, 9);
  });

  it("prices banking loss at the GRID tariff, not the strike", () => {
    // Bank 100, draw 98, buy the missing 2 from the discom. That shortfall is
    // a quantity, so its cost scales with the tariff it is replaced at.
    expect(openAccessAdderPerKwh(stack({ bankingLossPct: 2 }), 9)).toBeCloseTo(0.18, 9);
    expect(openAccessAdderPerKwh(stack({ bankingLossPct: 2 }), 7.8)).toBeCloseTo(0.156, 9);
  });
});

describe("erodesSaving", () => {
  it("is the whole point: a cheap strike can still be a bad deal", () => {
    // Rs 1.50/kWh under the grid, against a Rs 2.60 Maharashtra-scale stack.
    expect(erodesSaving(-1.5, stack({ crossSubsidySurchargePerKwh: 2.6 }), 9)).toBe(true);
    // The same PPA against a Rs 1.40 Tamil Nadu-scale stack still saves.
    expect(erodesSaving(-1.5, stack({ crossSubsidySurchargePerKwh: 1.4 }), 9)).toBe(false);
  });
});

describe("applyProcurement with a stack", () => {
  it("charges the stack on the PPA and reports it separately", () => {
    const r = applyProcurement(draws, proc({ openAccessCharges: stack({ crossSubsidySurchargePerKwh: 1.2 }) }));
    expect(r.ppaKwh).toBeCloseTo(5_000_000, 6);
    expect(r.openAccessCost).toBeCloseTo(5_000_000 * 1.2, 6);
    // Reported separately, but still inside the PPA's own cost — a user signs
    // the contract including its charges, not excluding them.
    expect(r.costParts.ppa).toBeCloseTo(5_000_000 * -1.5 + 5_000_000 * 1.2, 6);
  });

  it("can turn a saving into a cost without changing the strike price", () => {
    const cheap = applyProcurement(draws, proc());
    const taxed = applyProcurement(draws, proc({ openAccessCharges: stack({ crossSubsidySurchargePerKwh: 2.6 }) }));
    expect(cheap.annualCost).toBeLessThan(0);   // a saving
    expect(taxed.annualCost).toBeGreaterThan(0); // a cost
  });

  it("leaves green tariff and RECs alone — neither wheels an electron", () => {
    const r = applyProcurement(
      draws,
      proc({ ppaPct: 0, greenTariffPct: 50, recPct: 50, openAccessCharges: stack({ crossSubsidySurchargePerKwh: 3 }) }),
    );
    expect(r.openAccessCost).toBe(0);
    expect(r.costParts.greenTariff).toBeGreaterThan(0);
  });

  it("weights banking losses by the tariffs of the sites actually served", () => {
    const two: FacilityDraw[] = [
      { id: "a", gridDrawKwh: 10_000_000, gridEf: 0.71, isolated: false, tariffPerKwh: 10 },
      { id: "b", gridDrawKwh: 30_000_000, gridEf: 0.71, isolated: false, tariffPerKwh: 6 },
    ];
    const r = applyProcurement(two, proc({ openAccessCharges: stack({ bankingLossPct: 10 }) }));
    // Load-weighted tariff is 7, so the adder is 0.7 — not the 8 a simple mean
    // of the two tariffs would have given.
    expect(r.openAccessAdderPerKwh).toBeCloseTo(0.7, 9);
  });
});

describe("peak shaving", () => {
  const facility: Facility = {
    id: "f1", name: "Purchased electricity", annualLoadKwh: 50_000_000, tariffPerKwh: 8.9,
    demandChargePerKvaMonth: 450,
    loadSplit: { lightingPct: 10, motorPct: 68, hvacPct: 12 },
    roofSpaceM2: 38_000, peakLoadKw: 9_500, gridEf: 0.71, irradiance: 1_550, isolated: false,
  };
  const gen = (patch: Partial<GenerationAction> = {}): GenerationAction => ({
    enabled: true, solarKwp: 3_800, batteryKwh: 5_000, exportMode: "netMetering",
    solarCapexPerKw: 41_000, batteryCapexPerKwh: 23_000, subsidyPct: 0,
    startYear: 2026, targetYear: 2029, ...patch,
  });

  it("earns the demand charge twelve months a year", () => {
    const r = applyGeneration(facility, gen({ peakShavingKw: 1_000 }), 40_000_000);
    expect(r.demandSaving).toBeCloseTo(1_000 * 450 * 12, 6);
  });

  it("cannot shave more than the site's own peak", () => {
    const r = applyGeneration(facility, gen({ peakShavingKw: 99_000 }), 40_000_000);
    expect(r.demandSaving).toBeCloseTo(9_500 * 450 * 12, 6);
  });

  it("needs a battery — solar alone does not hold a peak down after sunset", () => {
    const r = applyGeneration(facility, gen({ batteryKwh: 0, peakShavingKw: 1_000 }), 40_000_000);
    expect(r.demandSaving).toBe(0);
  });

  it("is zero by default, so nothing changes for a plan that never set it", () => {
    expect(applyGeneration(facility, gen(), 40_000_000).demandSaving).toBe(0);
  });

  it("earns money without abating a single tonne", () => {
    // The half of the business case the carbon number cannot see.
    const withShaving = applyGeneration(facility, gen({ peakShavingKw: 1_000 }), 40_000_000);
    const without = applyGeneration(facility, gen(), 40_000_000);
    expect(withShaving.usedOnSiteKwh).toBeCloseTo(without.usedOnSiteKwh, 6);
    expect(withShaving.demandSaving).toBeGreaterThan(without.demandSaving);
  });
});
