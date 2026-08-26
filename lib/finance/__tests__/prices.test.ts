import { describe, expect, it } from "vitest";
import { DEFAULT_FINANCE_ASSUMPTIONS } from "@/lib/finance/assumptions";
import { resolveFuelSpend, resolvePrice, splitSpend } from "@/lib/finance/prices";
import type { FuelId } from "@/lib/model/types";

const src = (over: Partial<{ opex: number; annualVolume: number; fuelType: FuelId }> = {}) =>
  ({ opex: 0, annualVolume: 1000, fuelType: "diesel" as FuelId, ...over });

describe("resolvePrice", () => {
  it("measured when spend and volume are both present", () => {
    expect(resolvePrice(src({ opex: 100_000, annualVolume: 1000 }))).toEqual({ pricePerUnit: 100, basis: "measured" });
  });

  it("reference when spend is missing — the seeded shape", () => {
    expect(resolvePrice(src({ opex: 0 }))).toEqual({ pricePerUnit: 92, basis: "reference" });
  });

  it("reference when volume is missing, so no divide-by-zero reaches a caller", () => {
    const r = resolvePrice(src({ opex: 500, annualVolume: 0 }));
    expect(r.basis).toBe("reference");
    expect(Number.isFinite(r.pricePerUnit)).toBe(true);
  });

  it("the DG Set anchor: the reference price reproduces the figure the UI offers", () => {
    const r = resolvePrice(src({ opex: 0, annualVolume: 9_572_631.3 }));
    expect(r.pricePerUnit).toBe(92);
    expect(r.pricePerUnit * 9_572_631.3).toBeCloseTo(880_682_079.6, 1);
  });
});

describe("splitSpend", () => {
  it("splits a measured bill into fuel and maintenance", () => {
    expect(splitSpend(1_000_000, 20)).toEqual({ fuel: 800_000, maintenance: 200_000 });
  });
  it("a zero maintenance share puts the whole bill in fuel", () => {
    expect(splitSpend(1_000_000, 0)).toEqual({ fuel: 1_000_000, maintenance: 0 });
  });
});

describe("resolveFuelSpend", () => {
  const a = DEFAULT_FINANCE_ASSUMPTIONS;

  it("measured: maintenance is the stated share of the TOTAL bill", () => {
    const s = resolveFuelSpend(src({ opex: 1_000_000, annualVolume: 1000 }), a);
    expect(s).toEqual({ fuel: 800_000, maintenance: 200_000, basis: "measured" });
    expect(s.maintenance / (s.fuel + s.maintenance)).toBeCloseTo(0.2, 12);
  });

  it("reference: the pump price is fuel, and maintenance grosses up to the SAME share", () => {
    const s = resolveFuelSpend(src({ opex: 0, annualVolume: 1000 }), a);
    expect(s.basis).toBe("reference");
    expect(s.fuel).toBe(92_000);                       // 1000 L × ₹92
    expect(s.maintenance).toBeCloseTo(23_000, 6);       // 92,000 × 0.2/0.8
    expect(s.maintenance / (s.fuel + s.maintenance)).toBeCloseTo(0.2, 12); // the invariant
  });

  it("unavailable: no spend and no reference price yields zeros, flagged, never NaN", () => {
    const s = resolveFuelSpend(src({ opex: 0, fuelType: "__nope__" as FuelId }), a);
    expect(s).toEqual({ fuel: 0, maintenance: 0, basis: "unavailable" });
  });

  it("a 100% maintenance share cannot divide by zero on the reference path", () => {
    const s = resolveFuelSpend(src({ opex: 0, annualVolume: 1000 }), { ...a, maintenanceShareOfSpendPct: 100 });
    expect(Number.isFinite(s.fuel)).toBe(true);
    expect(Number.isFinite(s.maintenance)).toBe(true);
  });
});

describe("splitSpend clamps the share, because the field it comes from is free text", () => {
  it("a share above 100 does not make the fuel half NEGATIVE", () => {
    // maintenanceShareOfSpendPct is a number input with no max. Without the
    // clamp, 150 gives maintenance 1,500,000 out of a 1,000,000 bill and fuel
    // of -500,000 — and a negative fuel bill makes every efficiency saving on
    // that source a cost.
    expect(splitSpend(1_000_000, 150)).toEqual({ fuel: 0, maintenance: 1_000_000 });
    expect(splitSpend(1_000_000, 150).fuel).toBeGreaterThanOrEqual(0);
  });

  it("a negative share does not credit maintenance back", () => {
    expect(splitSpend(1_000_000, -40)).toEqual({ fuel: 1_000_000, maintenance: 0 });
  });

  it("the two halves always sum to the bill, at any share", () => {
    for (const pct of [-40, 0, 20, 100, 150]) {
      const { fuel, maintenance } = splitSpend(1_000_000, pct);
      expect(fuel + maintenance).toBeCloseTo(1_000_000, 6);
      expect(fuel).toBeGreaterThanOrEqual(0);
      expect(maintenance).toBeGreaterThanOrEqual(0);
    }
  });
});
