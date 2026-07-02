/* ESG water/waste model — breakdown→total rollups, the GRI 303 consumption
   suggestion, the diversion rate, and migration of legacy totals-only
   entries into the "Others" buckets. */

import { describe, expect, it } from "vitest";
import {
  normalizeWasteYear, normalizeWaterYear, suggestedConsumptionKl, wasteDiversionPct,
  WASTE_CATEGORIES, WATER_SOURCES,
  type WasteYear, type WaterYear,
} from "../types";

describe("normalizeWaterYear", () => {
  it("derives totals from the per-source / per-destination breakdowns", () => {
    const w = normalizeWaterYear({
      withdrawalKl: 0, consumptionKl: 0, dischargeKl: 0,
      withdrawalBySource: { surface: 5000, thirdParty: 7000 },
      dischargeByDest: { thirdParty: 8000 },
    });
    expect(w.withdrawalKl).toBe(12000);
    expect(w.dischargeKl).toBe(8000);
  });

  it("migrates legacy totals-only entries into the Others buckets", () => {
    const legacy: WaterYear = { withdrawalKl: 12000, consumptionKl: 4000, dischargeKl: 8000 };
    const w = normalizeWaterYear(legacy);
    expect(w.withdrawalBySource?.other).toBe(12000);
    expect(w.dischargeByDest?.other).toBe(8000);
    expect(w.withdrawalKl).toBe(12000); // total preserved
    expect(w.consumptionKl).toBe(4000); // consumption untouched
  });

  it("handles undefined as an empty year", () => {
    const w = normalizeWaterYear(undefined);
    expect(w.withdrawalKl).toBe(0);
    expect(w.withdrawalBySource).toEqual({});
  });
});

describe("suggestedConsumptionKl", () => {
  it("is withdrawal − discharge, floored at zero", () => {
    expect(suggestedConsumptionKl({ withdrawalKl: 12000, consumptionKl: 0, dischargeKl: 8000 })).toBe(4000);
    expect(suggestedConsumptionKl({ withdrawalKl: 100, consumptionKl: 0, dischargeKl: 300 })).toBe(0);
    expect(suggestedConsumptionKl(undefined)).toBe(0);
  });
});

describe("normalizeWasteYear", () => {
  it("derives totals from the per-category breakdown", () => {
    const w = normalizeWasteYear({
      generatedT: 0, disposedT: 0, recoveredT: 0,
      byCategory: {
        plastic: { generatedT: 300, disposedT: 150, recoveredT: 150 },
        otherNonHaz: { generatedT: 200, disposedT: 0, recoveredT: 50 },
      },
    });
    expect(w.generatedT).toBe(500);
    expect(w.disposedT).toBe(150);
    expect(w.recoveredT).toBe(200);
    expect(wasteDiversionPct(w)).toBe(40);
  });

  it("migrates legacy totals-only entries into Other non-hazardous", () => {
    const legacy: WasteYear = { generatedT: 500, disposedT: 300, recoveredT: 200 };
    const w = normalizeWasteYear(legacy);
    expect(w.byCategory?.otherNonHaz).toEqual({ generatedT: 500, disposedT: 300, recoveredT: 200 });
    expect(w.generatedT).toBe(500);
  });
});

describe("reference lists", () => {
  it("covers the BRSR structures", () => {
    expect(WATER_SOURCES.map((s) => s.key)).toEqual(["surface", "ground", "thirdParty", "sea", "other"]);
    expect(WASTE_CATEGORIES.map((c) => c.key)).toEqual([
      "plastic", "ewaste", "biomedical", "cnd", "battery", "radioactive", "otherHaz", "otherNonHaz",
    ]);
  });
});
