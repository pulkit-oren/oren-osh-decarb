/* 24/7 CFE. An annual percentage is silent about the thing that decides
   whether consumption caused emissions: when. These tests pin the behaviours
   that make the two numbers diverge — and the one case where they don't. */

import { describe, it, expect } from "vitest";
import { cfeScore, LOAD_SHAPES, SOLAR_SHAPE, WIND_SHAPE, type CfeInput } from "../hourly";

const base: CfeInput = {
  loadKwh: 8_760_000, // a flat-ish 1 MW site
  facilityType: "dataCentre",
  solarKwh: 0,
  contractedKwh: 0,
};

describe("shapes", () => {
  it("solar generates nothing at night, which is the whole problem", () => {
    for (const h of [0, 1, 2, 3, 4, 22, 23]) expect(SOLAR_SHAPE[h]).toBe(0);
    expect(SOLAR_SHAPE[11]).toBe(1);
  });

  it("wind is night-biased, which is why a hybrid scores better", () => {
    const night = [0, 1, 2, 3, 22, 23].reduce((s, h) => s + WIND_SHAPE[h], 0) / 6;
    const midday = [10, 11, 12, 13].reduce((s, h) => s + WIND_SHAPE[h], 0) / 4;
    expect(night).toBeGreaterThan(midday);
  });

  it("gives a data centre the flattest load and an office the peakiest", () => {
    const spread = (a: number[]) => Math.max(...a) / Math.min(...a);
    expect(spread(LOAD_SHAPES.dataCentre)).toBeLessThan(spread(LOAD_SHAPES.factory));
    expect(spread(LOAD_SHAPES.office)).toBeGreaterThan(spread(LOAD_SHAPES.factory));
  });
});

describe("cfeScore", () => {
  it("scores zero on both measures with no clean supply", () => {
    const r = cfeScore(base);
    expect(r.annualMatchedPct).toBe(0);
    expect(r.hourlyMatchedPct).toBe(0);
  });

  it("shows the gap the annual claim hides: 100% annual, far less hourly", () => {
    // Buy a year's worth of solar for a 24x7 load. Annual accounting calls
    // this fully renewable. The clock does not.
    const r = cfeScore({ ...base, contractedKwh: base.loadKwh });
    expect(r.annualMatchedPct).toBeCloseTo(100, 6);
    expect(r.hourlyMatchedPct).toBeLessThan(60);
    expect(r.gapPct).toBeGreaterThan(40);
  });

  it("closes much of that gap with wind in the mix, at the same annual volume", () => {
    // Not one extra kilowatt-hour bought — only bought at different hours.
    const solarOnly = cfeScore({ ...base, contractedKwh: base.loadKwh, contractWindPct: 0 });
    const hybrid = cfeScore({ ...base, contractedKwh: base.loadKwh, contractWindPct: 50 });
    expect(hybrid.annualMatchedPct).toBeCloseTo(solarOnly.annualMatchedPct, 6);
    expect(hybrid.hourlyMatchedPct).toBeGreaterThan(solarOnly.hourlyMatchedPct + 10);
  });

  it("closes more of it with storage", () => {
    const noBattery = cfeScore({ ...base, contractedKwh: base.loadKwh });
    const battery = cfeScore({ ...base, contractedKwh: base.loadKwh, batteryKwh: 12_000 });
    expect(battery.hourlyMatchedPct).toBeGreaterThan(noBattery.hourlyMatchedPct);
  });

  it("does not let a battery create energy — round-trip losses are real", () => {
    // Capacity must NOT be the binding constraint here, or efficiency is
    // invisible: a battery that saturates stores the same amount either way.
    const big = 60_000;
    const lossless = cfeScore({ ...base, contractedKwh: base.loadKwh, batteryKwh: big, batteryEfficiency: 1 });
    const lossy = cfeScore({ ...base, contractedKwh: base.loadKwh, batteryKwh: big, batteryEfficiency: 0.8 });
    expect(lossy.hourlyMatchedPct).toBeLessThan(lossless.hourlyMatchedPct);
    expect(lossless.hourlyMatchedPct).toBeLessThanOrEqual(100.0001);
  });

  it("has two regimes, and efficiency only bites in one of them", () => {
    /* A small store fills long before the midday surplus runs out, so what
       limits it is how much it can HOLD, not how much it loses holding it —
       and efficiency is invisible. Past that size the surplus becomes the
       constraint and every lost kilowatt-hour shows up. Worth pinning because
       reading a null efficiency effect as a bug is how the cyclic-dispatch
       defect above got written in the first place. */
    const cap = (kwh: number, eff: number) =>
      cfeScore({ ...base, contractedKwh: base.loadKwh, batteryKwh: kwh, batteryEfficiency: eff }).hourlyMatchedPct;

    // Capacity-bound: same answer at either efficiency.
    expect(cap(6_000, 0.8)).toBeCloseTo(cap(6_000, 1), 9);
    // Energy-bound: losses are real and the curve plateaus below 100%.
    expect(cap(60_000, 0.8)).toBeLessThan(cap(60_000, 1));
    // Monotonic in size, and a big enough lossless store fully covers a flat load.
    expect(cap(12_000, 1)).toBeGreaterThan(cap(6_000, 1));
    expect(cap(60_000, 1)).toBeCloseTo(100, 6);
  });

  it("serves the pre-dawn hours from the previous afternoon", () => {
    /* The defect the cyclic pass fixes. Without wrap-around the day starts
       empty at midnight, so the hours solar can never reach are unservable by
       construction, and a 60 MWh battery scores exactly the same as a 12 MWh
       one. Both facts are checked: the early hours are covered, and size
       matters. */
    const r = cfeScore({ ...base, contractedKwh: base.loadKwh, batteryKwh: 60_000, batteryEfficiency: 1 });
    const preDawn = r.byHour.slice(0, 5);
    for (const h of preDawn) {
      expect(h.cleanKwh).toBe(0);            // no generation at all in these hours
      expect(h.matchedKwh).toBeGreaterThan(0); // yet they are covered
    }
  });

  it("matches an office better than a data centre on the same solar", () => {
    // An office's load is when the sun is up. This is the one case where
    // annual and hourly nearly agree, and it should not be flattened away.
    const office = cfeScore({ ...base, facilityType: "office", contractedKwh: base.loadKwh });
    const dc = cfeScore({ ...base, facilityType: "dataCentre", contractedKwh: base.loadKwh });
    expect(office.hourlyMatchedPct).toBeGreaterThan(dc.hourlyMatchedPct);
  });

  it("caps the annual claim at 100 — over-buying is not over-covering", () => {
    const r = cfeScore({ ...base, contractedKwh: base.loadKwh * 3 });
    expect(r.annualMatchedPct).toBe(100);
    expect(r.hourlyMatchedPct).toBeLessThan(100);
  });

  it("never reports hourly above annual", () => {
    for (const wind of [0, 25, 50, 75, 100]) {
      for (const battery of [0, 5_000, 40_000]) {
        const r = cfeScore({ ...base, contractedKwh: base.loadKwh * 0.8, contractWindPct: wind, batteryKwh: battery });
        expect(r.hourlyMatchedPct).toBeLessThanOrEqual(r.annualMatchedPct + 1e-9);
      }
    }
  });

  it("balances: matched + deficit = load, and matched + surplus = clean", () => {
    const r = cfeScore({ ...base, contractedKwh: base.loadKwh * 0.7, solarKwh: 500_000, batteryKwh: 8_000 });
    const load = r.byHour.reduce((s, h) => s + h.loadKwh, 0);
    const clean = r.byHour.reduce((s, h) => s + h.cleanKwh, 0);
    const matched = r.byHour.reduce((s, h) => s + h.matchedKwh, 0);
    expect(matched + r.deficitKwhPerDay).toBeCloseTo(load, 6);
    expect(matched + r.surplusKwhPerDay).toBeCloseTo(clean, 6);
  });

  it("declares its own simplification in the result, not just the docs", () => {
    expect(cfeScore(base).representativeDayOnly).toBe(true);
  });

  it("covers all 24 hours", () => {
    expect(cfeScore(base).byHour).toHaveLength(24);
  });
});
