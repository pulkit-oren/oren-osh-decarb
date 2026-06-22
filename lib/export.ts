/* ============================================================
   Export shaping — pure functions that turn store state + the
   compute result into row arrays for the assurance-ready Excel
   workbook and CSV download (spec step 7). No DOM, no exceljs
   here: everything is unit-testable.
   ============================================================ */

import { ALT_FUELS, DEFRA_YEARS, FUELS, REFRIGERANTS } from "./model/factors";
import { CAPEX_LIFETIME } from "./model";
import { rampFraction } from "./model/trajectory";
import { FY_YEARS, fyLabel } from "./model/types";
import type {
  CombustionAsset, CombustionByYear, LeverSettings, RefrigerationByYear, RefrigerationSystem,
} from "./model/types";
import type { ComputeResult } from "./model";

export interface SheetSpec {
  name: string;
  rows: (string | number)[][];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function inputsSheet(
  combustion: CombustionByYear,
  refrigeration: RefrigerationByYear,
): SheetSpec {
  const rows: (string | number)[][] = [[
    "FY", "Kind", "Name", "Category / system", "Fuel / refrigerant", "Unit",
    "Annual volume / topped-up kg", "—", "OPEX / gas cost per kg", "Remaining life (yrs)", "Unit count",
  ]];
  for (const y of FY_YEARS) {
    for (const a of combustion[y] ?? []) {
      rows.push([fyLabel(y), "Combustion", a.name, a.category, FUELS[a.fuelType].label, a.unit, a.annualVolume, "", a.opex, a.remainingLife, a.unitCount]);
    }
    for (const s of refrigeration[y] ?? []) {
      rows.push([fyLabel(y), "Refrigeration", s.name, s.systemType, REFRIGERANTS[s.refrigerant].label, "kg", s.toppedUpKg, "", s.gasCostPerKg, "", ""]);
    }
  }
  return { name: "Inputs", rows };
}

export function factorsSheet(settings: LeverSettings): SheetSpec {
  const rows: (string | number)[][] = [["Section", "Item", "Field", "Value", "Unit"]];
  for (const f of Object.values(FUELS)) {
    rows.push(["Fuel", f.label, "Density", f.densityKgPerUnit ?? "", `kg/${f.unit}`]);
    rows.push(["Fuel", f.label, "Calorific value", f.cvKJperKg ?? "", "kJ/kg"]);
    for (const y of DEFRA_YEARS) {
      rows.push(["Fuel", f.label, `EF ${y}`, f.co2eByYear[y] ?? f.co2eFactor, `kgCO2e/${f.unit}`]);
    }
  }
  for (const f of Object.values(ALT_FUELS)) {
    rows.push(["Alt fuel", f.label, "Density", f.densityKgPerUnit, `kg/${f.unit}`]);
    rows.push(["Alt fuel", f.label, "Calorific value", f.cvKJperKg, "kJ/kg"]);
    rows.push(["Alt fuel", f.label, "Total combustion CO2e", f.co2eTotalPerUnit, `kg/${f.unit}`]);
    rows.push(["Alt fuel", f.label, "Biogenic fraction", f.biogenicFraction, ""]);
  }
  for (const r of Object.values(REFRIGERANTS)) {
    rows.push(["Refrigerant", r.label, "GWP (AR5 100-yr)", r.gwp, "kgCO2e/kg"]);
    rows.push(["Refrigerant", r.label, "Charge adjustment", r.volAdj, "ratio"]);
    rows.push(["Refrigerant", r.label, "Era", r.era, ""]);
  }
  const g = settings.assumptions;
  rows.push(["Assumption", "Grid emission factor", "Value", g.gridEf, "kgCO2e/kWh"]);
  rows.push(["Assumption", "Renewable sourcing", "Value", g.renewableSourcingPct, "%"]);
  rows.push(["Assumption", "REC cost", "Value", g.recCostPerTonne, "per tCO2e"]);
  rows.push(["Assumption", "Carbon price", "Value", g.carbonPricePerTonne, "per tCO2e"]);
  rows.push(["Assumption", "Infrastructure CAPEX", "Value", g.infraCapex, "currency"]);
  rows.push(["Assumption", "CAPEX annualization", "Value", CAPEX_LIFETIME, "years"]);
  return { name: "Factors", rows };
}

export function scenarioSheet(settings: LeverSettings, assets: CombustionAsset[], systems: RefrigerationSystem[]): SheetSpec {
  const rows: (string | number)[][] = [["Asset", "Lever", "Field", "Value"]];
  const name = (id: string) => assets.find((a) => a.id === id)?.name ?? `${id} [unresolved]`;
  for (const [id, acts] of Object.entries(settings.byAsset)) {
    const e = acts.electrify;
    rows.push([name(id), "Electrify", "Enabled", e.enabled ? "yes" : "no"]);
    rows.push([name(id), "Electrify", "Units to convert", e.unitsToConvert]);
    rows.push([name(id), "Electrify", "Capacity %", e.capacityPct]);
    rows.push([name(id), "Electrify", "COP / EV efficiency", e.cop]);
    rows.push([name(id), "Electrify", "Tariff per kWh", e.tariffPerKwh]);
    rows.push([name(id), "Electrify", "Asset CAPEX", e.assetCapex]);
    rows.push([name(id), "Electrify", "Start year", e.startYear]);
    rows.push([name(id), "Electrify", "Target year", e.targetYear]);
    const f = acts.fuelSwitch;
    rows.push([name(id), "Fuel switch", "Enabled", f.enabled ? "yes" : "no"]);
    rows.push([name(id), "Fuel switch", "Alt fuel", ALT_FUELS[f.altFuel]?.label ?? f.altFuel]);
    rows.push([name(id), "Fuel switch", "Blend %", f.blendPct]);
    rows.push([name(id), "Fuel switch", "Efficiency penalty %", f.efficiencyPenaltyPct]);
    rows.push([name(id), "Fuel switch", "Alt-fuel price per unit", f.altFuelPricePerUnit]);
    rows.push([name(id), "Fuel switch", "Retrofit CAPEX", f.retrofitCapex]);
    rows.push([name(id), "Fuel switch", "Start year", f.startYear]);
    rows.push([name(id), "Fuel switch", "Target year", f.targetYear]);
  }
  for (const sys of systems) {
    const acts = settings.bySystem[sys.id];
    if (!acts) continue;
    const gsw = acts.gasSwitch;
    rows.push([sys.name, "Switch gas", "Enabled", gsw.enabled ? "yes" : "no"]);
    rows.push([sys.name, "Switch gas", "Transition %", gsw.transitionPct]);
    rows.push([sys.name, "Switch gas", "Alternative gas", REFRIGERANTS[gsw.altRefrigerant]?.label ?? gsw.altRefrigerant]);
    rows.push([sys.name, "Switch gas", "Retrofit CAPEX", gsw.retrofitCapex]);
    rows.push([sys.name, "Switch gas", "Start year", gsw.startYear]);
    rows.push([sys.name, "Switch gas", "Target year", gsw.targetYear]);
    const lfx = acts.leakFix;
    rows.push([sys.name, "Fix leaks", "Enabled", lfx.enabled ? "yes" : "no"]);
    rows.push([sys.name, "Fix leaks", "Leak improvement %", lfx.leakImprovementPct]);
    rows.push([sys.name, "Fix leaks", "Start year", lfx.startYear]);
    rows.push([sys.name, "Fix leaks", "Target year", lfx.targetYear]);
  }
  return { name: "Scenario", rows };
}

export function trajectorySheet(result: ComputeResult): SheetSpec {
  const fuelWedge = result.wedges.find((w) => w.id === "fuelSwitch");
  const rows: (string | number)[][] = [[
    "Year", "BAU tCO2e", "Target tCO2e",
    ...result.wedges.map((w) => `${w.label} abatement t`),
    "Scope 2 spill t", "Net Scope 1 t", "Biogenic CO2 t", "On track",
  ]];
  for (const r of result.trajectory) {
    const biogenic = fuelWedge
      ? result.biogenicT * rampFraction(r.year, fuelWedge.startYear, fuelWedge.rampYears)
      : 0;
    rows.push([
      r.year, round1(r.bau), round1(r.target),
      ...result.wedges.map((w) => round1(r.wedges[w.id] ?? 0)),
      round1(r.scope2Spill), round1(r.net), round1(biogenic), r.onTrack ? "yes" : "no",
    ]);
  }
  return { name: "Trajectory", rows };
}

export function kpiFinanceSheet(result: ComputeResult): SheetSpec {
  const k = result.kpis;
  const rows: (string | number)[][] = [
    ["KPI", "Value"],
    ["Reduction by 2030 (%)", round1(k.reduction2030 * 100)],
    ["Reduction by 2050 (%)", round1(k.reduction2050 * 100)],
    ["Weighted cost per tonne", Math.round(k.costPerTonne)],
    ["Total CAPEX", k.totalCapex],
    ["Years to target", k.yearsToTarget ?? "off track"],
    ["Scenario payback (yrs)", k.paybackYears != null ? round1(k.paybackYears) : "no payback"],
    ["Scope 2 spillover t (full ramp)", round1(result.scope2SpillFullT)],
    ["Biogenic CO2 t (full ramp)", round1(result.biogenicT)],
    [],
    ["Lever", "Abatement t/yr", "CAPEX", "Annual OPEX delta", "Annualized cost", "Cost per tonne", "Payback (yrs)"],
  ];
  for (const l of result.levers.filter((x) => x.enabled)) {
    rows.push([
      l.label, round1(l.abatementT), l.capex, Math.round(l.annualOpexDelta),
      Math.round(l.annualCost), Math.round(l.costPerTonne),
      l.paybackYears != null ? round1(l.paybackYears) : "no payback",
    ]);
    for (const p of l.opexParts) {
      rows.push([`  ${l.label} — ${p.label}`, "", "", Math.round(p.amount), "", "", ""]);
    }
  }
  return { name: "KPIs & Finance", rows };
}

export function buildWorkbookSheets(args: {
  combustion: CombustionByYear;
  refrigeration: RefrigerationByYear;
  settings: LeverSettings;
  assets: CombustionAsset[];
  systems: RefrigerationSystem[];
  result: ComputeResult;
}): SheetSpec[] {
  return [
    inputsSheet(args.combustion, args.refrigeration),
    factorsSheet(args.settings),
    scenarioSheet(args.settings, args.assets, args.systems),
    trajectorySheet(args.result),
    kpiFinanceSheet(args.result),
  ];
}

export function toCsv(sheet: SheetSpec): string {
  const esc = (v: string | number): string => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return sheet.rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
