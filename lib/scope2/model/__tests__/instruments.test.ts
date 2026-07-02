/* Electricity instruments — VPPA / I-REC records entered in Data input must
   act as existing renewable coverage: lower the market-based baseline, stay
   out of physical load and the procurement pool, and show up as the
   "Already contracted" wedge. Solar-onsite records count as renewable
   self-consumption. */

import { describe, expect, it } from "vitest";
import { baselineScope2 } from "../baseline";
import { computeScope2 } from "../index";
import { contractCoverageByFacility, INSTRUMENTS, totalContractKwh } from "../instruments";
import type { Facility, Scope2Levers } from "../types";

const fac = (over: Partial<Facility>): Facility => ({
  id: "f-x", name: "Plant", annualLoadKwh: 0, tariffPerKwh: 9,
  loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
  roofSpaceM2: 0, peakLoadKw: 0, gridEf: 0.71, irradiance: 1400,
  isolated: false, existingSolarKwp: 0, existingRenewablePct: 0,
  ...over,
});

const NO_LEVERS: Scope2Levers = {
  byFacility: {},
  procurement: {
    enabled: false, ppaPct: 0, greenTariffPct: 0, recPct: 0,
    ppaStrikeDeltaPerKwh: 0, greenTariffPremiumPerKwh: 0, recPricePerKwh: 0,
    re100Exclusion: false, startYear: 2026, targetYear: 2030,
  },
};

const PUNE = {
  grid: fac({ id: "g1", name: INSTRUMENTS.grid, bu: "Pune", annualLoadKwh: 100_000 }),
  vppa: fac({ id: "v1", name: INSTRUMENTS.vppa, bu: "Pune", annualLoadKwh: 30_000, gridEf: 0 }),
  irec: fac({ id: "r1", name: INSTRUMENTS.irec, bu: "Pune", annualLoadKwh: 10_000, gridEf: 0 }),
  solar: fac({ id: "s1", name: INSTRUMENTS.solar, bu: "Pune", annualLoadKwh: 20_000, gridEf: 0 }),
};

describe("contractCoverageByFacility", () => {
  it("allocates a BU's VPPA + I-REC kWh to its grid record", () => {
    const cov = contractCoverageByFacility([PUNE.grid, PUNE.vppa, PUNE.irec, PUNE.solar]);
    expect(cov["g1"]).toBe(40_000);
    expect(cov["v1"]).toBeUndefined(); // never allocated to instrument records
    expect(totalContractKwh([PUNE.vppa, PUNE.irec])).toBe(40_000);
  });

  it("caps coverage at the grid load and keeps BUs separate", () => {
    const bigVppa = fac({ id: "v2", name: INSTRUMENTS.vppa, bu: "Pune", annualLoadKwh: 500_000, gridEf: 0 });
    const otherBuGrid = fac({ id: "g2", name: INSTRUMENTS.grid, bu: "Goa", annualLoadKwh: 50_000 });
    const cov = contractCoverageByFacility([PUNE.grid, bigVppa, otherBuGrid]);
    expect(cov["g1"]).toBe(100_000); // capped at Pune's grid load
    expect(cov["g2"]).toBeUndefined(); // Goa entered no contracts
  });

  it("gives isolated facilities nothing", () => {
    const isolatedGrid = fac({ id: "g3", name: INSTRUMENTS.grid, bu: "Pune", annualLoadKwh: 100_000, isolated: true });
    const cov = contractCoverageByFacility([isolatedGrid, PUNE.vppa]);
    expect(cov["g3"]).toBeUndefined();
  });
});

describe("baselineScope2 with instrument records", () => {
  const facilities = [PUNE.grid, PUNE.vppa, PUNE.irec, PUNE.solar];

  it("keeps location-based physical and lowers market-based by the contracts", () => {
    const b = baselineScope2(facilities);
    expect(b.totalLocationT).toBeCloseTo(71, 5); // 100k × 0.71 / 1000
    expect(b.marketBaselineT).toBeCloseTo(42.6, 5); // (100k − 40k) × 0.71 / 1000
    expect(b.existingContractedKwh).toBe(40_000);
  });

  it("excludes contract records from physical load and cost, keeps solar in", () => {
    const b = baselineScope2(facilities);
    expect(b.totalLoadKwh).toBe(120_000); // grid 100k + solar 20k, no VPPA/I-REC
    expect(b.totalCost).toBe(120_000 * 9);
  });

  it("changes nothing when no instrument records exist (legacy behavior)", () => {
    const plain = [fac({ id: "p1", name: "HQ", annualLoadKwh: 100_000, existingRenewablePct: 20 })];
    const b = baselineScope2(plain);
    expect(b.marketBaselineT).toBeCloseTo((100_000 * 0.8 * 0.71) / 1000, 5);
    expect(b.totalLoadKwh).toBe(100_000);
  });
});

describe("computeScope2 with instrument records", () => {
  const facilities = [PUNE.grid, PUNE.vppa, PUNE.irec, PUNE.solar];

  it("market-now reflects the contracts and shows the Already-contracted wedge", () => {
    const r = computeScope2(facilities, NO_LEVERS, 2025);
    expect(r.locationNowT).toBeCloseTo(71, 5);
    expect(r.marketNowT).toBeCloseTo(42.6, 5);
    expect(r.wedgesMarket.some((w) => w.id === "existing")).toBe(true);
  });

  it("keeps contract records out of the procurement pool", () => {
    const withProc: Scope2Levers = {
      ...NO_LEVERS,
      procurement: { ...NO_LEVERS.procurement, enabled: true, ppaPct: 100 },
    };
    const r = computeScope2(facilities, withProc, 2025);
    // Addressable = grid draw minus already-contracted (60k) + solar record (20k, gridEf 0).
    expect(r.procurement.addressableKwh).toBe(80_000);
    // Full new PPA coverage on top of contracts → market-based reaches 0.
    expect(r.marketNowT).toBeCloseTo(0, 5);
  });
});
