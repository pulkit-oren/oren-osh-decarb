import { describe, it, expect } from "vitest";
import {
  factorsSheet, inputsSheet, kpiFinanceSheet, scenarioSheet, toCsv, trajectorySheet,
} from "../export";
import { compute } from "../model";
import {
  DEFAULT_ASSETS, DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR,
  DEFAULT_SETTINGS, DEFAULT_SYSTEMS,
} from "../defaults";

const result = compute(DEFAULT_ASSETS, DEFAULT_SYSTEMS, DEFAULT_SETTINGS, 2025);

describe("export sheets", () => {
  it("inputs sheet has one row per asset/system per FY plus a header", () => {
    const s = inputsSheet(DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR);
    const expected =
      1 +
      Object.values(DEFAULT_COMBUSTION_BY_YEAR).reduce((n, rows) => n + rows.length, 0) +
      Object.values(DEFAULT_REFRIGERATION_BY_YEAR).reduce((n, rows) => n + rows.length, 0);
    expect(s.rows.length).toBe(expected);
    expect(s.rows[0][0]).toBe("FY");
  });

  it("factors sheet carries the DEFRA 2025 diesel EF actually used", () => {
    const s = factorsSheet(DEFAULT_SETTINGS);
    expect(s.rows.some((r) => r[1] === "Diesel" && r[2] === "EF 2025" && r[3] === 2.57082)).toBe(true);
    expect(s.rows.some((r) => r[0] === "Assumption" && r[1] === "Grid emission factor")).toBe(true);
  });

  it("scenario sheet records per-asset and per-system lever settings", () => {
    const s = scenarioSheet(DEFAULT_SETTINGS, DEFAULT_ASSETS, DEFAULT_SYSTEMS);
    expect(s.rows.some((r) => r[0] === "Diesel fleet" && r[1] === "Electrify" && r[2] === "Units to convert" && r[3] === 3)).toBe(true);
    expect(s.rows.some((r) => r[0] === "Cold storage plant" && r[1] === "Switch gas" && r[2] === "Alternative gas" && r[3] === "R-717 (Ammonia)")).toBe(true);
    expect(s.rows.some((r) => r[0] === "Office HVAC" && r[1] === "Fix leaks" && r[2] === "Leak improvement %" && r[3] === 50)).toBe(true);
  });

  it("trajectory sheet covers base year to 2050 with a ramped biogenic column", () => {
    const s = trajectorySheet(result);
    expect(result.biogenicT).toBeGreaterThan(0);
    expect(s.rows.length).toBe(1 + result.trajectory.length); // header + 2025..2050
    const header = s.rows[0];
    const bioIdx = header.indexOf("Biogenic CO2 t");
    expect(bioIdx).toBeGreaterThan(-1);
    const first = s.rows[1][bioIdx] as number;
    const last = s.rows[s.rows.length - 1][bioIdx] as number;
    expect(first).toBeLessThanOrEqual(last);
    expect(last).toBeCloseTo(Math.round(result.biogenicT * 10) / 10, 1);
  });

  it("kpi & finance sheet has the KPI block and a row per active lever", () => {
    const s = kpiFinanceSheet(result);
    expect(s.rows.some((r) => r[0] === "Reduction by 2030 (%)")).toBe(true);
    const leverHeaderIdx = s.rows.findIndex((r) => r[0] === "Lever");
    expect(leverHeaderIdx).toBeGreaterThan(0);
    expect(s.rows.length).toBeGreaterThan(leverHeaderIdx + 1);
  });
});

describe("toCsv", () => {
  it("escapes quotes, commas and newlines", () => {
    const csv = toCsv({ name: "T", rows: [["a,b", 'say "hi"', 3]] });
    expect(csv).toBe('"a,b","say ""hi""",3');
  });

  it("escapes carriage returns and keeps empty rows as blank lines", () => {
    expect(toCsv({ name: "T", rows: [["a\rb"]] })).toBe('"a\rb"');
    expect(toCsv({ name: "T", rows: [["x"], [], ["y"]] })).toBe("x\r\n\r\ny");
  });
});
