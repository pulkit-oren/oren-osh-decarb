// lib/finance/__tests__/export-assumptions.test.ts
import { describe, expect, it } from "vitest";
import { factorsSheet, inputsSheet } from "@/lib/export";
import { financeAssumptionsFrom } from "@/lib/finance";
import type { CombustionByYear, RefrigerationByYear } from "@/lib/model/types";
import { seedScope1 } from "./seed-fixture";

/** The Value cell of the first row whose Item cell starts with `label`.
 *
 *  Deliberately NOT a regex. An earlier draft asserted with
 *  `new RegExp("Discount rate[^\n]*\|" + x + "\|")` built in a template
 *  literal, and one backslash level was lost writing the file, so the pipes
 *  became ALTERNATION with an empty branch — a pattern matching every possible
 *  string. It passed against a sheet containing none of the rows it named.
 *  Exact cell lookups cannot fail that way. */
const valueOf = (rows: (string | number)[][], label: string): string | number | undefined =>
  rows.find((r) => String(r[1]).startsWith(label))?.[3];

const items = (rows: (string | number)[][]) => rows.map((r) => String(r[1]));

// inputsSheet takes ByYear maps, so lift the seeded base year back into one.
const byYear = () => {
  const { raw, systems, baseYear } = seedScope1();
  return {
    combustion: { [baseYear]: raw } as CombustionByYear,
    refrigeration: { [baseYear]: systems } as RefrigerationByYear,
    baseYear,
  };
};

describe("export states the assumptions the engine actually used", () => {
  it("F7: the stale flat-10-year CAPEX annualization row is gone", () => {
    const { settings } = seedScope1();
    expect(items(factorsSheet(settings).rows)).not.toContain("CAPEX annualization");
  });

  it("prints the discount rate, every escalation rate and the maintenance shares", () => {
    const { settings } = seedScope1();
    const rows = factorsSheet(settings).rows;
    const fa = financeAssumptionsFrom(settings.assumptions);
    expect(valueOf(rows, "Discount rate")).toBe(fa.discountRatePct);
    expect(valueOf(rows, "Fuel escalation")).toBe(fa.fuelEscalationPct);
    expect(valueOf(rows, "Electricity escalation")).toBe(fa.elecEscalationPct);
    expect(valueOf(rows, "Other escalation")).toBe(fa.otherEscalationPct);
    expect(valueOf(rows, "Maintenance share")).toBe(fa.maintenanceShareOfSpendPct);
    expect(valueOf(rows, "EV maintenance retained")).toBe(fa.evMaintenanceRatioPct);
    expect(valueOf(rows, "Heat-pump maintenance retained")).toBe(fa.heatPumpMaintenanceRatioPct);
  });

  it("prints the per-lever asset lives, not one flat figure", () => {
    const rows = factorsSheet(seedScope1().settings).rows;
    const expected: Record<string, number> = { efficiency: 7, electrification: 10, fuelSwitch: 15, refrigerant: 12 };
    for (const [family, years] of Object.entries(expected)) {
      expect(valueOf(rows, "Asset life - " + family), "asset life for " + family).toBe(years);
    }
  });

  it("prints the VALUES the engine resolved, not the raw optional fields", () => {
    // The seven finance assumptions are OPTIONAL on GlobalAssumptions, so a
    // settings blob that omits them still runs on defaults. Printing
    // `settings.assumptions.discountRatePct` would emit a blank while the
    // engine used 10 — F7's complaint restated rather than fixed.
    const { settings } = seedScope1();
    const stripped = { ...settings, assumptions: { ...settings.assumptions } };
    for (const k of ["discountRatePct", "fuelEscalationPct", "maintenanceShareOfSpendPct"]) {
      delete (stripped.assumptions as Record<string, unknown>)[k];
    }
    const fa = financeAssumptionsFrom(stripped.assumptions);
    const rows = factorsSheet(stripped).rows;
    // Non-vacuous by construction: these must be the DEFAULTS, and a blank or
    // undefined cell fails the toBe.
    expect(valueOf(rows, "Discount rate")).toBe(fa.discountRatePct);
    expect(valueOf(rows, "Fuel escalation")).toBe(fa.fuelEscalationPct);
    expect(valueOf(rows, "Maintenance share")).toBe(fa.maintenanceShareOfSpendPct);
    expect(typeof valueOf(rows, "Discount rate")).toBe("number");
  });

  it("names the cost basis, so a reader knows what the currency-per-tonne figures mean", () => {
    const v = valueOf(factorsSheet(seedScope1().settings).rows, "Cost basis");
    expect(String(v)).toContain("levelised");
  });
});

// The plan directed the price basis to "whichever of inputsSheet / scenarioSheet
// carries one row per combustion source" — that is inputsSheet. Its own example
// test then read scenarioSheet, which is long-format (one row per asset x lever
// x field) with no per-source row to hang a basis column on. Following the
// instruction rather than the example: see Ruling U.
describe("the export names which sources were priced by assumption", () => {
  it("adds a price-basis column with one entry per source", () => {
    const { combustion, refrigeration } = byYear();
    const sheet = inputsSheet(combustion, refrigeration);
    const header = sheet.rows[0].map(String);
    expect(header).toContain("Price basis");
    expect(header).toContain("Price per unit");

    const basisCol = header.indexOf("Price basis");
    const dg = sheet.rows.find((r) => String(r[2]) === "DG Set");
    expect(dg, "the seeded DG Set must appear").toBeDefined();
    // Every seeded source has opex: 0, so all of them resolve by reference.
    expect(dg![basisCol]).toBe("reference");
  });

  it("a source with real spend is marked measured, with its derived unit price", () => {
    const { refrigeration } = byYear();
    const measured = {
      id: "m-1", name: "Metered genset", category: "stationary", fuelType: "diesel",
      unit: "L", annualVolume: 1_000, opex: 115_000, unitCount: 1, remainingLife: 10,
    };
    const sheet = inputsSheet({ 2025: [measured] } as unknown as CombustionByYear, refrigeration);
    const header = sheet.rows[0].map(String);
    const row = sheet.rows.find((r) => String(r[2]) === "Metered genset")!;
    expect(row[header.indexOf("Price basis")]).toBe("measured");
    expect(row[header.indexOf("Price per unit")]).toBe(115);   // 115,000 / 1,000 L
  });

  it("a fuel with no reference price is marked unavailable, not silently zero", () => {
    const { refrigeration } = byYear();
    const odd = {
      id: "u-1", name: "Mystery fuel", category: "stationary", fuelType: "biodieselX",
      unit: "L", annualVolume: 1_000, opex: 0, unitCount: 1, remainingLife: 10,
    };
    const sheet = inputsSheet({ 2025: [odd] } as unknown as CombustionByYear, refrigeration);
    const header = sheet.rows[0].map(String);
    const row = sheet.rows.find((r) => String(r[2]) === "Mystery fuel");
    // If an unknown fuel cannot render at all, say so rather than pretending
    // this case is covered.
    expect(row, "unknown-fuel row did not render; the unavailable basis is untested").toBeDefined();
    expect(row![header.indexOf("Price basis")]).toBe("unavailable");
  });

  it("an unknown fuel id does not crash the whole export", () => {
    // Found while making the "unavailable" case above reachable: inputsSheet
    // read `FUELS[a.fuelType].label` unguarded, so a retired or renamed fuel id
    // in a saved plan threw "Cannot read properties of undefined" and took the
    // entire export down — not just that row. scenarioSheet already guarded the
    // same lookup (`ALT_FUELS[f.altFuel]?.label ?? f.altFuel`); inputsSheet did
    // not, which is the same two-lines-treating-one-thing-differently shape as
    // Rulings P, R and T, in the export layer.
    const { refrigeration } = byYear();
    const ghost = {
      id: "g-1", name: "Retired fuel", category: "stationary", fuelType: "someOldId",
      unit: "L", annualVolume: 10, opex: 0, unitCount: 1, remainingLife: 1,
    };
    expect(() => inputsSheet({ 2025: [ghost] } as unknown as CombustionByYear, refrigeration)).not.toThrow();
    const row = inputsSheet({ 2025: [ghost] } as unknown as CombustionByYear, refrigeration)
      .rows.find((r) => String(r[2]) === "Retired fuel")!;
    // It falls back to the raw id rather than inventing a label.
    expect(row[4]).toBe("someOldId");
  });
});
