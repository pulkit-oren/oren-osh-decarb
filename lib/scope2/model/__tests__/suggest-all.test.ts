/* Scope 2 portfolio-wide suggestions — grid facilities get efficiency (and
   solar where the roof allows); excluded / clean records are untouched;
   procurement is never changed. */

import { describe, expect, it } from "vitest";
import { suggestAllScope2 } from "../suggest-all";
import type { Facility, Scope2Levers } from "../types";

const fac = (over: Partial<Facility>): Facility => ({
  id: "f1", name: "Plant", annualLoadKwh: 500_000, tariffPerKwh: 9,
  loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
  roofSpaceM2: 2_000, peakLoadKw: 0, gridEf: 0.71, irradiance: 1400,
  isolated: false, existingSolarKwp: 0, existingRenewablePct: 0,
  ...over,
});

const PREV: Scope2Levers = {
  byFacility: {},
  procurement: {
    enabled: false, ppaPct: 0, greenTariffPct: 0, recPct: 0,
    ppaStrikeDeltaPerKwh: 0, greenTariffPremiumPerKwh: 0, recPricePerKwh: 0,
    re100Exclusion: false, startYear: 2026, targetYear: 2030,
  },
};

describe("suggestAllScope2", () => {
  it("enables efficiency (and solar with roof space) on every grid facility", () => {
    const next = suggestAllScope2([fac({}), fac({ id: "f2", roofSpaceM2: 0 })], PREV);
    expect(next.byFacility.f1.efficiency.enabled).toBe(true);
    expect(next.byFacility.f1.generation.enabled).toBe(true); // roof available
    expect(next.byFacility.f2.efficiency.enabled).toBe(true);
  });

  it("skips excluded and zero-EF (clean instrument) records, leaves procurement alone", () => {
    const next = suggestAllScope2([fac({ excluded: true }), fac({ id: "vppa", gridEf: 0 })], PREV);
    expect(next.byFacility.f1).toBeUndefined();
    expect(next.byFacility.vppa).toBeUndefined();
    expect(next.procurement).toBe(PREV.procurement);
  });
});
