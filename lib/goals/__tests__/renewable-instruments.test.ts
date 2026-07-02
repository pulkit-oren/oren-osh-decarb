/* Renewable-% and energy goals must recognize the Data-input electricity
   instrument records: VPPA/I-REC raise the renewable share (contract
   coverage), Solar onsite counts as renewable self-consumption, and neither
   contract record inflates the energy-consumption metric. */

import { describe, expect, it } from "vitest";
import { renewablePctForYear, s2EnergyKwh, type Inventories } from "../select";
import { INSTRUMENTS } from "@/lib/scope2/model/instruments";
import type { Facility } from "@/lib/scope2/model/types";

const fac = (over: Partial<Facility>): Facility => ({
  id: "f-x", name: "Plant", annualLoadKwh: 0, tariffPerKwh: 9,
  loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
  roofSpaceM2: 0, peakLoadKw: 0, gridEf: 0.71, irradiance: 1400,
  isolated: false, existingSolarKwp: 0, existingRenewablePct: 0,
  ...over,
});

const inv: Inventories = {
  combustion: {},
  refrigeration: {},
  facilities: {
    2025: [
      fac({ id: "g1", name: INSTRUMENTS.grid, bu: "Pune", annualLoadKwh: 100_000 }),
      fac({ id: "v1", name: INSTRUMENTS.vppa, bu: "Pune", annualLoadKwh: 30_000, gridEf: 0 }),
      fac({ id: "s1", name: INSTRUMENTS.solar, bu: "Pune", annualLoadKwh: 20_000, gridEf: 0 }),
    ],
  },
};

describe("instrument records in goal metrics", () => {
  it("VPPA and solar-onsite entries raise the renewable share", () => {
    // (30k contracted + 20k solar) / (100k grid + 20k solar) = 41.67%
    expect(renewablePctForYear(inv, 2025)).toBeCloseTo((50_000 / 120_000) * 100, 3);
  });

  it("energy consumption counts grid + solar but not contract records", () => {
    expect(s2EnergyKwh(inv, 2025)).toBe(120_000);
  });

  it("renewable share is 0 with no clean instruments", () => {
    const plain: Inventories = {
      combustion: {}, refrigeration: {},
      facilities: { 2025: [fac({ id: "g1", name: "HQ", annualLoadKwh: 100_000 })] },
    };
    expect(renewablePctForYear(plain, 2025)).toBe(0);
  });
});
