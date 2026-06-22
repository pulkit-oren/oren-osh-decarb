import { describe, expect, it } from "vitest";
import { defaultFacilityActions, DEFAULT_PROCUREMENT } from "../../defaults";
import { computeScope2 } from "../index";
import type { Facility, Scope2Levers } from "../types";

const BASE_YEAR = 2025;

const facilities: Facility[] = [
  {
    id: "plant", name: "Plant", annualLoadKwh: 1_000_000, tariffPerKwh: 10,
    loadSplit: { lightingPct: 20, motorPct: 50, hvacPct: 20 },
    roofSpaceM2: 5500, peakLoadKw: 800, gridEf: 0.7, irradiance: 1500, isolated: false,
  },
  {
    id: "island", name: "Island resort", annualLoadKwh: 400_000, tariffPerKwh: 22,
    loadSplit: { lightingPct: 20, motorPct: 15, hvacPct: 45 },
    roofSpaceM2: 2000, peakLoadKw: 300, gridEf: 0.65, irradiance: 1700, isolated: true,
  },
];

function leversWith(mutate: (l: Scope2Levers) => void): Scope2Levers {
  const l: Scope2Levers = {
    byFacility: Object.fromEntries(facilities.map((f) => [f.id, defaultFacilityActions(f)])),
    procurement: { ...DEFAULT_PROCUREMENT },
  };
  mutate(l);
  return l;
}

describe("computeScope2", () => {
  it("all levers off → location = market = baseline", () => {
    const r = computeScope2(facilities, leversWith(() => {}), BASE_YEAR);
    expect(r.locationNowT).toBeCloseTo(r.baseline.totalLocationT, 6);
    expect(r.marketNowT).toBeCloseTo(r.baseline.totalLocationT, 6);
  });

  it("compounds efficiency before solar before procurement", () => {
    const r = computeScope2(
      facilities,
      leversWith((l) => {
        const acts = l.byFacility.plant;
        acts.efficiency.enabled = true;
        acts.efficiency.ledPct = 100; // saves 110,000 kWh → residual 890,000
        acts.generation.enabled = true;
        acts.generation.solarKwp = 100; // 150,000 kWh gen against the REDUCED load
      }),
      BASE_YEAR,
    );
    const pf = r.perFacility.plant;
    expect(pf.eff.residualLoadKwh).toBeCloseTo(890_000, 3);
    // loadRatio = 150000/890000 → spill = 0.5 × that → selfConsumption ≈ 0.9157
    expect(pf.gen.selfConsumption).toBeCloseTo(1 - 0.5 * (150_000 / 890_000), 6);
    expect(pf.gen.gridDrawKwh).toBeCloseTo(890_000 - pf.gen.usedOnSiteKwh, 3);
  });

  it("procurement moves market-based only", () => {
    const off = computeScope2(facilities, leversWith(() => {}), BASE_YEAR);
    const on = computeScope2(
      facilities,
      leversWith((l) => {
        l.procurement.enabled = true;
        l.procurement.ppaPct = 60;
      }),
      BASE_YEAR,
    );
    expect(on.locationNowT).toBeCloseTo(off.locationNowT, 6);
    expect(on.marketNowT).toBeLessThan(off.marketNowT);
  });

  it("full procurement with no isolated load zeroes the market-based number", () => {
    const grid = [facilities[0]]; // non-isolated only
    const r = computeScope2(
      grid,
      leversWith((l) => {
        l.procurement.enabled = true;
        l.procurement.recPct = 100;
      }),
      BASE_YEAR,
    );
    expect(r.marketNowT).toBeCloseTo(0, 6);
    expect(r.locationNowT).toBeCloseTo(700, 6);
  });

  it("builds wedges per enabled lever; market trajectory includes procurement, location does not", () => {
    const r = computeScope2(
      facilities,
      leversWith((l) => {
        l.byFacility.plant.efficiency.enabled = true;
        l.byFacility.plant.efficiency.ledPct = 50;
        l.procurement.enabled = true;
        l.procurement.ppaPct = 40;
      }),
      BASE_YEAR,
    );
    expect(r.wedgesLocation.map((w) => w.id)).toEqual(["efficiency"]);
    expect(r.wedgesMarket.map((w) => w.id)).toEqual(["efficiency", "procurement"]);
    for (const w of r.wedgesMarket) expect(w.scope).toBe(2);
    const end = (rows: typeof r.trajectoryMarket) => rows[rows.length - 1];
    expect(end(r.trajectoryMarket).net).toBeLessThan(end(r.trajectoryLocation).net);
  });

  it("missing lever entries fall back to defaults (no crash, no abatement)", () => {
    const r = computeScope2(facilities, { byFacility: {}, procurement: { ...DEFAULT_PROCUREMENT } }, BASE_YEAR);
    expect(r.locationNowT).toBeCloseTo(r.baseline.totalLocationT, 6);
  });

  it("kpis: capex totals, payback from net savings, RE100 footnote", () => {
    const r = computeScope2(
      facilities,
      leversWith((l) => {
        const acts = l.byFacility.plant;
        acts.efficiency.enabled = true;
        acts.efficiency.ledPct = 100;
        acts.generation.enabled = true;
        acts.generation.solarKwp = 200;
        l.procurement.enabled = true;
        l.procurement.ppaPct = 50;
        l.procurement.re100Exclusion = true;
      }),
      BASE_YEAR,
    );
    const expectedCapex = r.levers.reduce((s, x) => s + x.capex, 0);
    expect(r.kpis.totalCapex).toBeCloseTo(expectedCapex, 3);
    expect(r.kpis.footnote).toBe(true);
    expect(r.kpis.paybackYears).not.toBeNull();
  });
});

describe("existing renewables already in place", () => {
  it("existing green contracts lower the market-based baseline, not location", () => {
    const withExisting: Facility[] = [{ ...facilities[0], existingRenewablePct: 40 }];
    const r = computeScope2(withExisting, { byFacility: {}, procurement: { ...DEFAULT_PROCUREMENT } }, BASE_YEAR);
    // location unchanged (physical grid), market reduced by 40%
    expect(r.locationNowT).toBeCloseTo(r.baseline.totalLocationT, 6);
    expect(r.marketNowT).toBeCloseTo(r.baseline.totalLocationT * 0.6, 4);
    expect(r.kpis.marketBaselineT).toBeCloseTo(r.baseline.totalLocationT * 0.6, 4);
    expect(r.kpis.existingContractedKwh).toBeCloseTo(1_000_000 * 0.4, 3);
  });

  it("existing contracts are ignored on isolated grids", () => {
    const island: Facility[] = [{ ...facilities[1], existingRenewablePct: 50 }];
    const r = computeScope2(island, { byFacility: {}, procurement: { ...DEFAULT_PROCUREMENT } }, BASE_YEAR);
    expect(r.marketNowT).toBeCloseTo(r.locationNowT, 6); // no contracts possible on captive grid
  });

  it("new procurement stacks on top of existing without double-counting", () => {
    const f: Facility[] = [{ ...facilities[0], existingRenewablePct: 30 }];
    const r = computeScope2(f, { byFacility: {}, procurement: { ...DEFAULT_PROCUREMENT, enabled: true, recPct: 100 } }, BASE_YEAR);
    // existing 30% + new procurement on the remaining 70% → market ≈ 0
    expect(r.marketNowT).toBeCloseTo(0, 4);
  });

  it("existing solar reduces the roof headroom for new solar", () => {
    // roof 5500 m² → 1000 kWp total; 600 kWp already installed → 400 kWp headroom
    const f: Facility[] = [{ ...facilities[0], existingSolarKwp: 600 }];
    const r = computeScope2(
      f,
      { byFacility: { plant: { ...defaultFacilityActions(facilities[0]), generation: { ...defaultFacilityActions(facilities[0]).generation, enabled: true, solarKwp: 900 } } }, procurement: { ...DEFAULT_PROCUREMENT } },
      BASE_YEAR,
    );
    expect(r.perFacility.plant.gen.effectiveKwp).toBeCloseTo(400, 3); // capped at headroom, not 900
  });
});
