import { describe, expect, it } from "vitest";
import { DEFAULT_PROCUREMENT, defaultFacilityActions } from "../../defaults";
import { validateScope2 } from "../validate";
import type { Facility, Scope2Levers } from "../types";

const facility = (patch: Partial<Facility> = {}): Facility => ({
  id: "a", name: "Plant", annualLoadKwh: 1_000_000, tariffPerKwh: 8,
  loadSplit: { lightingPct: 15, motorPct: 55, hvacPct: 20 },
  roofSpaceM2: 5500, peakLoadKw: 800, gridEf: 0.7, irradiance: 1500, isolated: false,
  ...patch,
});

const levers = (facilities: Facility[], patch: Partial<Scope2Levers> = {}): Scope2Levers => ({
  byFacility: Object.fromEntries(facilities.map((f) => [f.id, defaultFacilityActions(f)])),
  procurement: DEFAULT_PROCUREMENT,
  ...patch,
});

describe("validateScope2", () => {
  it("clean inputs produce no warnings", () => {
    const f = facility();
    expect(validateScope2([f], levers([f]))).toEqual([]);
  });

  it("flags load split over 100%", () => {
    const f = facility({ loadSplit: { lightingPct: 50, motorPct: 40, hvacPct: 30 } });
    expect(validateScope2([f], levers([f]))[0]).toMatch(/load split sums to 120%/);
  });

  it("flags solar above the roof cap", () => {
    const f = facility();
    const l = levers([f]);
    l.byFacility[f.id].generation.enabled = true;
    l.byFacility[f.id].generation.solarKwp = 2000; // cap = 5500/5.5 = 1000
    expect(validateScope2([f], l).some((w) => w.includes("roof headroom"))).toBe(true);
  });

  it("flags procurement sliders summing past 100", () => {
    const f = facility();
    const l = levers([f], {
      procurement: { ...DEFAULT_PROCUREMENT, enabled: true, ppaPct: 70, greenTariffPct: 50 },
    });
    expect(validateScope2([f], l).some((w) => w.includes("clamped to 100%"))).toBe(true);
  });

  it("flags negative load", () => {
    const f = facility({ annualLoadKwh: -5 });
    expect(validateScope2([f], levers([f])).some((w) => w.includes("negative"))).toBe(true);
  });
});
