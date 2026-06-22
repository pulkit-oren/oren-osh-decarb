/* ============================================================
   Scope 2 export shaping — pure functions that turn store state +
   the compute result into row arrays for the Excel workbook.
   No DOM, no exceljs here: everything is unit-testable.
   ============================================================ */

import type { SheetSpec } from "@/lib/export";
import { FY_YEARS, fyLabel } from "@/lib/model/types";
import type { Scope2ComputeResult } from "./model";
import type { FacilitiesByYear, Scope2Levers } from "./model/types";

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function facilitiesSheet(facilities: FacilitiesByYear): SheetSpec {
  const rows: (string | number)[][] = [[
    "FY", "Facility", "Annual load (kWh)", "Tariff (/kWh)", "Lighting %", "Motor %", "HVAC %",
    "Roof space (m2)", "Peak load (kW)", "Grid EF (kgCO2e/kWh)", "Irradiance (kWh/kWp/yr)", "Isolated grid",
    "Existing solar (kWp)", "Already on green contracts (%)",
  ]];
  for (const y of FY_YEARS) {
    for (const f of facilities[y] ?? []) {
      rows.push([
        fyLabel(y), f.name, f.annualLoadKwh, f.tariffPerKwh,
        f.loadSplit.lightingPct, f.loadSplit.motorPct, f.loadSplit.hvacPct,
        f.roofSpaceM2, f.peakLoadKw, f.gridEf, f.irradiance, f.isolated ? "Yes" : "No",
        f.existingSolarKwp ?? 0, f.existingRenewablePct ?? 0,
      ]);
    }
  }
  return { name: "Facilities", rows };
}

export function scenarioSheet(facilities: FacilitiesByYear, levers: Scope2Levers): SheetSpec {
  const rows: (string | number)[][] = [["Section", "Facility", "Field", "Value"]];
  const names = new Map(Object.values(facilities).flat().map((f) => [f.id, f.name]));
  for (const [id, acts] of Object.entries(levers.byFacility)) {
    const name = names.get(id) ?? id;
    const e = acts.efficiency;
    rows.push(["Efficiency", name, "Enabled", e.enabled ? "Yes" : "No"]);
    rows.push(["Efficiency", name, "LED deployment %", e.ledPct]);
    rows.push(["Efficiency", name, "Motor upgrade %", e.motorPct]);
    rows.push(["Efficiency", name, "BMS deployment %", e.bmsPct]);
    rows.push(["Efficiency", name, "LED CAPEX (full)", e.ledCapex]);
    rows.push(["Efficiency", name, "Motor CAPEX (full)", e.motorCapex]);
    rows.push(["Efficiency", name, "BMS CAPEX (full)", e.bmsCapex]);
    rows.push(["Efficiency", name, "Years", `${e.startYear}–${e.targetYear}`]);
    const g = acts.generation;
    rows.push(["Generation", name, "Enabled", g.enabled ? "Yes" : "No"]);
    rows.push(["Generation", name, "Solar (kWp)", g.solarKwp]);
    rows.push(["Generation", name, "Battery (kWh)", g.batteryKwh]);
    rows.push(["Generation", name, "Export mode", g.exportMode === "netMetering" ? "Net metering" : "Zero export"]);
    rows.push(["Generation", name, "Solar CAPEX (/kW)", g.solarCapexPerKw]);
    rows.push(["Generation", name, "Battery CAPEX (/kWh)", g.batteryCapexPerKwh]);
    rows.push(["Generation", name, "Subsidy %", g.subsidyPct]);
    rows.push(["Generation", name, "Years", `${g.startYear}–${g.targetYear}`]);
  }
  const p = levers.procurement;
  rows.push(["Procurement", "Portfolio", "Enabled", p.enabled ? "Yes" : "No"]);
  rows.push(["Procurement", "Portfolio", "PPA / VPPA %", p.ppaPct]);
  rows.push(["Procurement", "Portfolio", "Green tariff %", p.greenTariffPct]);
  rows.push(["Procurement", "Portfolio", "Unbundled RECs %", p.recPct]);
  rows.push(["Procurement", "Portfolio", "PPA strike delta (/kWh)", p.ppaStrikeDeltaPerKwh]);
  rows.push(["Procurement", "Portfolio", "Green tariff premium (/kWh)", p.greenTariffPremiumPerKwh]);
  rows.push(["Procurement", "Portfolio", "REC price (/kWh)", p.recPricePerKwh]);
  rows.push(["Procurement", "Portfolio", "RE100 exclusion", p.re100Exclusion ? "Yes" : "No"]);
  rows.push(["Procurement", "Portfolio", "Years", `${p.startYear}–${p.targetYear}`]);
  return { name: "Scenario", rows };
}

export function dualAccountingSheet(result: Scope2ComputeResult): SheetSpec {
  const rows: (string | number)[][] = [[
    "Facility", "Baseline load (kWh)", "Grid draw after levers (kWh)", "Procured (kWh)",
    "Location-based (tCO2e)", "Market-based (tCO2e)", "Isolated grid",
  ]];
  let locT = 0, mktT = 0;
  for (const fb of result.baseline.perFacility) {
    const pf = result.perFacility[fb.id];
    const gridDraw = pf?.gen.gridDrawKwh ?? fb.loadKwh;
    const procured = result.procurement.procuredByFacility[fb.id] ?? 0;
    const ef = fb.loadKwh > 0 ? (fb.locationT * 1000) / fb.loadKwh : 0;
    const loc = (gridDraw * ef) / 1000;
    const mkt = (Math.max(0, gridDraw - procured) * ef) / 1000;
    locT += loc;
    mktT += mkt;
    rows.push([fb.name, fb.loadKwh, round1(gridDraw), round1(procured), round1(loc), round1(mkt), fb.isolated ? "Yes" : "No"]);
  }
  rows.push(["TOTAL", result.baseline.totalLoadKwh, "", round1(result.procurement.coveredKwh), round1(locT), round1(mktT), ""]);
  if (result.kpis.footnote) {
    rows.push([]);
    rows.push([
      "Footnote: RE100 exclusion applied — facilities on isolated/captive grids are excluded from the " +
      "addressable renewable-procurement target. Progress is tracked against the Addressable Target.",
    ]);
  }
  return { name: "Dual accounting", rows };
}

export function scope2TrajectorySheet(result: Scope2ComputeResult): SheetSpec {
  const rows: (string | number)[][] = [["Year", "BAU (t)", "Location-based net (t)", "Market-based net (t)", "SBTi target (t)"]];
  result.trajectoryLocation.forEach((r, i) => {
    const m = result.trajectoryMarket[i];
    rows.push([r.year, round1(r.bau), round1(r.net), round1(m?.net ?? r.net), round1(r.target)]);
  });
  return { name: "Trajectory", rows };
}

export function buildScope2WorkbookSheets(args: {
  facilities: FacilitiesByYear;
  levers: Scope2Levers;
  result: Scope2ComputeResult;
}): SheetSpec[] {
  return [
    facilitiesSheet(args.facilities),
    scenarioSheet(args.facilities, args.levers),
    dualAccountingSheet(args.result),
    scope2TrajectorySheet(args.result),
  ];
}
