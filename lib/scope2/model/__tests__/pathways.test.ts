/* Scope 2 pathway options — efficiency-first is cheapest, RE100 cuts the
   deepest market-based, and procurement stays untouched except in RE100. */

import { describe, expect, it } from "vitest";
import { buildScope2Pathways } from "../pathways";
import type { Facility, Scope2Levers } from "../types";

const fac = (over: Partial<Facility>): Facility => ({
  id: "f1", name: "Plant", annualLoadKwh: 800_000, tariffPerKwh: 9,
  loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
  roofSpaceM2: 3_000, peakLoadKw: 0, gridEf: 0.71, irradiance: 1400,
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

describe("buildScope2Pathways", () => {
  const [eff, balanced, re100] = buildScope2Pathways([fac({}), fac({ id: "f2", roofSpaceM2: 0 })], PREV, 2025);

  it("returns the three strategies in order", () => {
    expect([eff.id, balanced.id, re100.id]).toEqual(["efficiency-first", "balanced", "re100"]);
  });

  it("efficiency-first skips solar and costs the least", () => {
    for (const a of Object.values(eff.levers.byFacility)) expect(a?.generation.enabled).toBe(false);
    expect(eff.kpis.totalCapex).toBeLessThanOrEqual(balanced.kpis.totalCapex);
  });

  it("RE100 covers the remaining draw and cuts the deepest market-based", () => {
    expect(re100.levers.procurement.enabled).toBe(true);
    expect(re100.levers.procurement.ppaPct).toBe(100);
    expect(re100.kpis.marketNowT).toBeLessThanOrEqual(balanced.kpis.marketNowT + 1e-9);
    // the other two never touch procurement
    expect(eff.levers.procurement.enabled).toBe(false);
    expect(balanced.levers.procurement.enabled).toBe(false);
  });
});
