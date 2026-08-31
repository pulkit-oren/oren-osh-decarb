/* Scope 2 CAPEX lines. Same load-bearing invariant as Scope 1 — lines sum to
   lever capex — plus two Scope 2 specifics: the subsidy is a negative line, and
   green procurement is a line with no capital that must still appear. */

import { describe, expect, it } from "vitest";
import { computeScope2 } from "../index";
import { sumCapexLines } from "@/lib/model/capex";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { Facility, Scope2Levers } from "../types";

const facilities: Facility[] = [
  { id: "p1", name: "Plant 1", annualLoadKwh: 4_000_000, tariffPerKwh: 9, loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 }, roofSpaceM2: 11_000, peakLoadKw: 0, gridEf: 0.71, irradiance: 1400, isolated: false, existingSolarKwp: 0, existingRenewablePct: 0 },
  { id: "p2", name: "Plant 2", annualLoadKwh: 2_000_000, tariffPerKwh: 8, loadSplit: { lightingPct: 20, motorPct: 30, hvacPct: 30 }, roofSpaceM2: 5_500, peakLoadKw: 0, gridEf: 0.71, irradiance: 1400, isolated: false, existingSolarKwp: 0, existingRenewablePct: 0 },
];

const eff = (over: Partial<Scope2Levers["byFacility"][string]["efficiency"]> = {}) => ({
  enabled: true, ledPct: 100, motorPct: 50, bmsPct: 0,
  ledCapex: 1_000_000, motorCapex: 2_000_000, bmsCapex: 500_000,
  startYear: 2026, targetYear: 2030, ...over,
});
const gen = (over: Partial<Scope2Levers["byFacility"][string]["generation"]> = {}) => ({
  enabled: true, solarKwp: 500, batteryKwh: 200, exportMode: "netMetering" as const,
  solarCapexPerKw: 45_000, batteryCapexPerKwh: 28_000, subsidyPct: 20,
  startYear: 2026, targetYear: 2030, ...over,
});

const levers: Scope2Levers = {
  byFacility: {
    p1: { efficiency: eff(), generation: gen() },
    // A different solar rate, so the mixed-rate path is exercised.
    p2: { efficiency: eff({ ledCapex: 400_000 }), generation: gen({ solarKwp: 300, solarCapexPerKw: 38_000 }) },
  },
  procurement: {
    enabled: true, ppaPct: 30, greenTariffPct: 0, recPct: 0,
    ppaStrikeDeltaPerKwh: 0.4, greenTariffPremiumPerKwh: 0, recPricePerKwh: 0.45,
    re100Exclusion: false, startYear: 2026, targetYear: 2030,
  },
};

describe("Scope 2 capexLines", () => {
  const r = computeScope2(facilities, levers, 2025, DEFAULT_SETTINGS.assumptions);

  it("sums to the same capital the levers report", () => {
    const leverTotal = r.levers.reduce((s, l) => s + l.capex, 0);
    expect(sumCapexLines(r.capexLines)).toBeCloseTo(leverTotal, 6);
  });

  it("sums to each lever's own capex", () => {
    for (const lever of r.levers) {
      const mine = r.capexLines.filter((l) => l.leverId === lever.id);
      expect(sumCapexLines(mine), lever.id).toBeCloseTo(lever.capex, 6);
    }
  });

  it("splits efficiency into LED, motors and BMS, scaled by their own sliders", () => {
    const led = r.capexLines.find((l) => l.driverId === "s2-led")!;
    // p1 1,000,000 x 100% + p2 400,000 x 100%
    expect(led.amount).toBeCloseTo(1_400_000, 6);
    const motor = r.capexLines.find((l) => l.driverId === "s2-motor")!;
    // both at 50% of 2,000,000
    expect(motor.amount).toBeCloseTo(2_000_000, 6);
    // bmsPct is 0 on both, so the line is dropped rather than shown as zero
    expect(r.capexLines.some((l) => l.driverId === "s2-bms")).toBe(false);
  });

  it("reports the solar subsidy as a negative line", () => {
    const subsidy = r.capexLines.find((l) => l.driverId === "s2-solar-subsidy")!;
    expect(subsidy.amount).toBeLessThan(0);
    const solar = r.capexLines.find((l) => l.driverId === "s2-solar")!;
    const battery = r.capexLines.find((l) => l.driverId === "s2-battery")!;
    // gross x (1 - 20%) == the net figure generation.ts computes
    expect(solar.amount + battery.amount + subsidy.amount)
      .toBeCloseTo((solar.amount + battery.amount) * 0.8, 6);
  });

  it("flags the solar rate as mixed and weights it by kW", () => {
    const solar = r.capexLines.find((l) => l.driverId === "s2-solar")!;
    expect(solar.mixed).toBe(true);
    expect(solar.unit!.unitLabel).toBe("kW");
    expect(solar.unit!.rate).toBeGreaterThan(38_000);
    expect(solar.unit!.rate).toBeLessThan(45_000);
  });

  it("keeps green procurement as a line with no capital", () => {
    const proc = r.capexLines.find((l) => l.driverId === "s2-procurement")!;
    expect(proc.amount).toBe(0);
    expect(proc.edit).toBeNull();
  });
});
