import { describe, expect, it } from "vitest";
import { DEFAULT_FACILITIES_BY_YEAR, DEFAULT_BASE_YEAR, DEFAULT_PROCUREMENT } from "../defaults";
import { migrateScope2Levers, resolveFacilities } from "../store-helpers";

const facilities = resolveFacilities(DEFAULT_FACILITIES_BY_YEAR, DEFAULT_BASE_YEAR);

describe("resolveFacilities", () => {
  it("stamps the FY on each facility", () => {
    expect(facilities.every((f) => f.year === DEFAULT_BASE_YEAR)).toBe(true);
  });

  it("missing year → empty list", () => {
    expect(resolveFacilities(DEFAULT_FACILITIES_BY_YEAR, 1999)).toEqual([]);
  });
});

describe("migrateScope2Levers", () => {
  it("fills missing facility entries with defaults", () => {
    const m = migrateScope2Levers({ byFacility: {}, procurement: DEFAULT_PROCUREMENT }, facilities);
    for (const f of facilities) expect(m.byFacility[f.id]).toBeTruthy();
  });

  it("preserves existing entries", () => {
    const existing = migrateScope2Levers(null, facilities);
    existing.byFacility[facilities[0].id].efficiency.ledPct = 77;
    const m = migrateScope2Levers(existing, facilities);
    expect(m.byFacility[facilities[0].id].efficiency.ledPct).toBe(77);
  });

  it("fills procurement keys missing from old snapshots", () => {
    const m = migrateScope2Levers(
      { byFacility: {}, procurement: { enabled: true, ppaPct: 30 } }, facilities,
    );
    expect(m.procurement.ppaPct).toBe(30);
    expect(m.procurement.enabled).toBe(true);
    expect(m.procurement.recPricePerKwh).toBe(DEFAULT_PROCUREMENT.recPricePerKwh);
    expect(m.procurement.re100Exclusion).toBe(false);
  });

  it("null input → full defaults", () => {
    const m = migrateScope2Levers(null, facilities);
    expect(m.procurement).toEqual(DEFAULT_PROCUREMENT);
  });
});
