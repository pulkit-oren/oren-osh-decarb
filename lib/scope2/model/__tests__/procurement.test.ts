import { describe, expect, it } from "vitest";
import { applyProcurement, type FacilityDraw } from "../procurement";
import type { ProcurementSettings } from "../types";

const draws: FacilityDraw[] = [
  { id: "a", gridDrawKwh: 600_000, gridEf: 0.7, isolated: false },
  { id: "b", gridDrawKwh: 300_000, gridEf: 0.2, isolated: false },
  { id: "c", gridDrawKwh: 100_000, gridEf: 0.65, isolated: true },
];

const settings = (patch: Partial<ProcurementSettings> = {}): ProcurementSettings => ({
  enabled: true, ppaPct: 0, greenTariffPct: 0, recPct: 0,
  ppaStrikeDeltaPerKwh: -0.5, greenTariffPremiumPerKwh: 0.8, recPricePerKwh: 0.45,
  re100Exclusion: false, startYear: 2026, targetYear: 2030, ...patch,
});

describe("applyProcurement", () => {
  it("disabled → nothing covered, no cost", () => {
    const r = applyProcurement(draws, settings({ enabled: false, ppaPct: 50 }));
    expect(r.coveredKwh).toBe(0);
    expect(r.annualCost).toBe(0);
  });

  it("exclusion OFF: addressable includes isolated load, allocation skips it", () => {
    const r = applyProcurement(draws, settings({ ppaPct: 50 }));
    expect(r.addressableKwh).toBe(1_000_000);
    expect(r.coveredKwh).toBeCloseTo(500_000, 3);
    expect(r.procuredByFacility.a).toBeCloseTo((600_000 / 900_000) * 500_000, 3);
    expect(r.procuredByFacility.b).toBeCloseTo((300_000 / 900_000) * 500_000, 3);
    expect(r.procuredByFacility.c).toBe(0);
    expect(r.footnote).toBe(false);
  });

  it("RE100 exclusion ON: isolated load leaves the denominator, footnote set", () => {
    const r = applyProcurement(draws, settings({ ppaPct: 50, re100Exclusion: true }));
    expect(r.addressableKwh).toBe(900_000);
    expect(r.coveredKwh).toBeCloseTo(450_000, 3);
    expect(r.footnote).toBe(true);
  });

  it("sliders summing past 100 scale down proportionally", () => {
    const r = applyProcurement(draws, settings({ ppaPct: 80, greenTariffPct: 40 }));
    expect(r.coveredKwh).toBeCloseTo(900_000, 3); // min(100% of addressable, non-isolated draw)
    expect(r.ppaKwh / r.greenTariffKwh).toBeCloseTo(2, 6);
  });

  it("covered kWh never exceeds the non-isolated draw", () => {
    const r = applyProcurement(draws, settings({ ppaPct: 100 }));
    expect(r.coveredKwh).toBeLessThanOrEqual(900_000 + 1e-6);
  });

  it("PPA below grid price books a saving; GT and RECs cost extra", () => {
    const r = applyProcurement(draws, settings({ ppaPct: 30, greenTariffPct: 20, recPct: 10 }));
    expect(r.costParts.ppa).toBeLessThan(0);
    expect(r.costParts.greenTariff).toBeGreaterThan(0);
    expect(r.costParts.rec).toBeGreaterThan(0);
    expect(r.annualCost).toBeCloseTo(r.costParts.ppa + r.costParts.greenTariff + r.costParts.rec, 6);
  });
});
