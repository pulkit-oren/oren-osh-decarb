import { describe, expect, it } from "vitest";
import {
  DEFAULT_BASE_YEAR, DEFAULT_FACILITIES_BY_YEAR, DEFAULT_PROCUREMENT, defaultFacilityActions,
} from "../defaults";
import { buildScope2WorkbookSheets, dualAccountingSheet } from "../export";
import { computeScope2 } from "../model";
import { resolveFacilities } from "../store-helpers";
import type { Scope2Levers } from "../model/types";

const facilities = resolveFacilities(DEFAULT_FACILITIES_BY_YEAR, DEFAULT_BASE_YEAR);

function leversWith(mutate: (l: Scope2Levers) => void = () => {}): Scope2Levers {
  const l: Scope2Levers = {
    byFacility: Object.fromEntries(facilities.map((f) => [f.id, defaultFacilityActions(f)])),
    procurement: { ...DEFAULT_PROCUREMENT },
  };
  mutate(l);
  return l;
}

describe("scope 2 export", () => {
  it("builds the four sheets with expected names", () => {
    const levers = leversWith();
    const result = computeScope2(facilities, levers, DEFAULT_BASE_YEAR);
    const sheets = buildScope2WorkbookSheets({ facilities: DEFAULT_FACILITIES_BY_YEAR, levers, result });
    expect(sheets.map((s) => s.name)).toEqual(["Facilities", "Scenario", "Dual accounting", "Trajectory"]);
    for (const s of sheets) expect(s.rows.length).toBeGreaterThan(1);
  });

  it("dual accounting totals match computeScope2", () => {
    const levers = leversWith((l) => {
      l.procurement.enabled = true;
      l.procurement.ppaPct = 50;
    });
    const result = computeScope2(facilities, levers, DEFAULT_BASE_YEAR);
    const sheet = dualAccountingSheet(result);
    const total = sheet.rows.find((r) => r[0] === "TOTAL")!;
    expect(Number(total[4])).toBeCloseTo(result.locationNowT, 0);
    expect(Number(total[5])).toBeCloseTo(result.marketNowT, 0);
  });

  it("footnote row appears only when the RE100 exclusion is active", () => {
    const without = dualAccountingSheet(computeScope2(facilities, leversWith(), DEFAULT_BASE_YEAR));
    expect(without.rows.some((r) => String(r[0] ?? "").startsWith("Footnote"))).toBe(false);

    const withFlag = dualAccountingSheet(computeScope2(
      facilities,
      leversWith((l) => {
        l.procurement.enabled = true;
        l.procurement.ppaPct = 30;
        l.procurement.re100Exclusion = true;
      }),
      DEFAULT_BASE_YEAR,
    ));
    expect(withFlag.rows.some((r) => String(r[0] ?? "").startsWith("Footnote"))).toBe(true);
  });
});
