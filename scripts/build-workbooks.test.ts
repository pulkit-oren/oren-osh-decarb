/* ============================================================
   Workbook generator — documents the live Scenario and Goals
   calculation logic into two Excel files, pulling the REAL factor
   tables, catalog and constants from the code (not hand-copied), plus
   fill-in templates the user completes and hands back for processing.

   Run on demand (skipped in the normal suite):
     BUILD_WORKBOOKS=1 npx vitest run scripts/build-workbooks.test.ts
   Output: ../Scenario-Model.xlsx and ../Goals-Model.xlsx (project root).
   ============================================================ */

import path from "node:path";
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { FUELS, REFRIGERANTS, ALT_FUELS } from "@/lib/model/factors";
import { GOAL_TEMPLATES, CUSTOM_TEMPLATE } from "@/lib/goals/catalog";
import { M2_PER_KW, LED_REDUCTION, MOTOR_REDUCTION, BMS_REDUCTION } from "@/lib/scope2/model/constants";
import { DEFAULT_SETTINGS } from "@/lib/defaults";

const RUN = process.env.BUILD_WORKBOOKS === "1";
const OUT_DIR = path.resolve(process.cwd(), "..");

type Col = { header: string; key: string; width: number };
function addSheet(wb: ExcelJS.Workbook, name: string, columns: Col[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns;
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  columns.forEach((_, i) => { ws.getColumn(i + 1).alignment = { wrapText: true, vertical: "top" }; });
  return ws;
}
function addNotes(wb: ExcelJS.Workbook, name: string, title: string, lines: string[]) {
  const ws = wb.addWorksheet(name);
  ws.getColumn(1).width = 120;
  const t = ws.addRow([title]); t.font = { bold: true, size: 14 };
  ws.addRow([]);
  lines.forEach((l) => {
    const row = ws.addRow([l]);
    if (l.endsWith(":")) row.font = { bold: true };
    row.alignment = { wrapText: true, vertical: "top" };
  });
  return ws;
}

describe.skipIf(!RUN)("build workbooks", () => {
  it("writes Scenario-Model.xlsx and Goals-Model.xlsx", async () => {
    /* ===================== SCENARIO MODEL ===================== */
    const sc = new ExcelJS.Workbook();
    sc.creator = "Scope 1 & 2 Scenario Modeller";

    addNotes(sc, "README", "Scenario Model — calculation logic & template", [
      "This workbook documents the decarbonization scenario engine (Scope 1 + Scope 2) and gives you a template to define your own scenarios locally.",
      "",
      "How to use:",
      "1. Read 'Scope1 Levers' and 'Scope2 Levers' to see every intervention and its exact formula.",
      "2. 'Fuel Factors', 'Refrigerant Factors', 'Alt Fuel Factors' and 'Constants' are the real numbers the engine uses — do not edit if you want results to match the app.",
      "3. Fill the 'Scenario Template' sheet: one row per asset + the lever settings you want. Add as many rows / scenarios as you like.",
      "4. Save and send the file back. I will parse 'Scenario Template' and build those scenarios in the app.",
      "",
      "Template rules (so it parses cleanly):",
      "- Keep the header row exactly as given. Add rows below it.",
      "- 'Scenario' groups rows into a named scenario. Leave lever cells blank to mean 'off'.",
      "- Percentages as numbers 0-100. Years as 4-digit. Money in ₹.",
      "",
      "Units: emissions in tCO2e, energy in kWh, money in ₹.",
    ]);

    addSheet(sc, "Scope1 Levers", [
      { header: "Lever", key: "lever", width: 18 },
      { header: "Applies to", key: "applies", width: 18 },
      { header: "Inputs", key: "inputs", width: 42 },
      { header: "Calculation logic (as coded)", key: "logic", width: 80 },
    ], [
      { lever: "Electrification", applies: "Stationary & mobile", inputs: "unitsToConvert (mobile) or capacityPct (stationary), cop, tariffPerKwh, assetCapex, startYear, targetYear",
        logic: "fraction = mobile ? unitsToConvert/unitCount : capacityPct/100. Scope1 abated = baseline combustion emissions × fraction (that share leaves combustion). Electricity added (kWh) = fuel energy × fraction ÷ COP. Scope2 added (t) = kWh × gridEf × (1 − renewableSourcingPct) ÷ 1000. COP≈3 heat pump/EV, 1 = electric boiler." },
      { lever: "Fuel switch (drop-in)", applies: "Stationary & mobile", inputs: "altFuel, blendPct (0-100), efficiencyPenaltyPct, altFuelPricePerUnit, retrofitCapex, startYear, targetYear",
        logic: "bioShare = min(blendPct, maxBlendCap for category+fuel, standard fleet share left after electrify/flex). Abated = combustion emissions × bioShare, less the biogenic CO2 share (reported separately, not Scope 1). Cap: B20/E20 on vehicles, up to B100 on boilers." },
      { lever: "Flex-fuel", applies: "Mobile only", inputs: "unitsToConvert, altFuel, highBlendPct (21-100), vehicleCapex, startYear, targetYear",
        logic: "flexFrac = min(unitsToConvert/unitCount, 1 − elecFrac). bioShare = flexFrac × highBlendPct/100. Abated via fuel-switch physics on that share. Counted per converted vehicle (beyond the drop-in cap)." },
      { lever: "Refrigerant gas switch", applies: "Cooling systems", inputs: "transitionPct (0-100), altRefrigerant, retrofitCapex, startYear, targetYear",
        logic: "newFugitive = (1−g)·topUp·baseGWP/1000 + g·topUp·altVolAdj·altGWP/1000, where g = transitionPct/100 and topUp is annual leak (mass-balance). Abated = baseFugitive − newFugitive. Naturals need less charge (volAdj < 1)." },
      { lever: "Leak fix", applies: "Cooling systems", inputs: "leakImprovementPct (0-80), startYear, targetYear",
        logic: "topUp_after = topUp × (1 − leakImprovementPct/100). Because leak = annual top-up (mass-balance), abated = (topUp − topUp_after) × GWP ÷ 1000. Usually the cheapest first win." },
    ]);

    addSheet(sc, "Scope2 Levers", [
      { header: "Lever", key: "lever", width: 18 },
      { header: "Inputs", key: "inputs", width: 40 },
      { header: "Calculation logic (as coded)", key: "logic", width: 84 },
    ], [
      { lever: "Efficiency", inputs: "ledPct, motorPct, bmsPct (each 0-100 deployment), capex per measure, startYear, targetYear",
        logic: `savedKwh = led(load×lightingShare×${LED_REDUCTION}×ledPct%) + motor(load×motorShare×${MOTOR_REDUCTION}×motorPct%) + bms(load×otherShare×${BMS_REDUCTION}×bmsPct%). Abated (t) = savedKwh × gridEf ÷ 1000.` },
      { lever: "On-site generation (solar+battery)", inputs: "solarKwp (capped at roof), batteryKwh, exportMode, solarCapexPerKw, subsidyPct, startYear, targetYear",
        logic: `effectiveKwp = min(solarKwp, roofSpaceM2/${M2_PER_KW} − existingSolarKwp). solarGenKwh = effectiveKwp × irradiance. usedOnSite = min(residualLoad, gen × selfConsumption). Abated (t) = usedOnSite × gridEf ÷ 1000.` },
      { lever: "Procurement (PPA / green tariff / REC)", inputs: "ppaPct, greenTariffPct, recPct (combined ≤100 of addressable load), prices, re100Exclusion, startYear, targetYear",
        logic: "procuredKwh = coverage% × addressable grid draw (post efficiency+solar, minus already-contracted). Abated (t) = procuredKwh × gridEf ÷ 1000. Isolated sites excluded if re100Exclusion." },
    ]);

    addSheet(sc, "Fuel Factors", [
      { header: "id", key: "id", width: 16 },
      { header: "label", key: "label", width: 22 },
      { header: "unit", key: "unit", width: 8 },
      { header: "co2eFactor (kgCO2e/unit)", key: "ef", width: 22 },
      { header: "density (kg/unit)", key: "dens", width: 16 },
      { header: "calorific (kJ/kg)", key: "cv", width: 16 },
      { header: "renewable", key: "ren", width: 10 },
      { header: "EF source", key: "src", width: 10 },
    ], Object.values(FUELS).map((f) => ({
      id: f.id, label: f.label, unit: f.unit, ef: f.co2eFactor,
      dens: f.densityKgPerUnit ?? "", cv: f.cvKJperKg ?? "", ren: f.renewable ? "yes" : "no", src: f.efSource,
    })));

    addSheet(sc, "Refrigerant Factors", [
      { header: "id", key: "id", width: 12 },
      { header: "label", key: "label", width: 16 },
      { header: "GWP (kgCO2e/kg)", key: "gwp", width: 16 },
      { header: "era", key: "era", width: 10 },
      { header: "natural", key: "nat", width: 10 },
      { header: "charge adj (volAdj)", key: "vol", width: 16 },
    ], Object.values(REFRIGERANTS).map((r) => ({
      id: r.id, label: r.label, gwp: r.gwp, era: r.era, nat: r.natural ? "yes" : "no", vol: r.volAdj,
    })));

    addSheet(sc, "Alt Fuel Factors", [
      { header: "id", key: "id", width: 14 },
      { header: "label", key: "label", width: 18 },
      { header: "unit", key: "unit", width: 8 },
      { header: "co2e total (kg/unit)", key: "co2e", width: 18 },
      { header: "biogenic fraction", key: "bio", width: 16 },
      { header: "max blend % (mobile)", key: "blend", width: 18 },
      { header: "stationary max %", key: "sblend", width: 16 },
    ], Object.values(ALT_FUELS).map((a) => ({
      id: a.id, label: a.label, unit: a.unit, co2e: a.co2eTotalPerUnit, bio: a.biogenicFraction,
      blend: a.maxBlendPct, sblend: a.stationaryMaxBlendPct ?? "",
    })));

    const asm = DEFAULT_SETTINGS.assumptions;
    addSheet(sc, "Constants", [
      { header: "Constant", key: "k", width: 34 },
      { header: "Value", key: "v", width: 16 },
      { header: "Meaning", key: "m", width: 70 },
    ], [
      { k: "gridEf (default)", v: asm.gridEf, m: "kgCO2e per kWh grid electricity (location-based)." },
      { k: "renewableSourcingPct", v: asm.renewableSourcingPct, m: "Clean share assumed for NEW electricity from electrification (0-100)." },
      { k: "carbonPricePerTonne", v: asm.carbonPricePerTonne, m: "₹ per tCO2e, for finance views." },
      { k: "recCostPerTonne", v: asm.recCostPerTonne, m: "₹ per tonne offset via RECs." },
      { k: "LED_REDUCTION", v: LED_REDUCTION, m: "Fraction of lighting load LED removes at full deployment." },
      { k: "MOTOR_REDUCTION", v: MOTOR_REDUCTION, m: "Fraction of motor load IE4/VFD removes." },
      { k: "BMS_REDUCTION", v: BMS_REDUCTION, m: "Fraction of HVAC/other load a BMS removes." },
      { k: "M2_PER_KW", v: M2_PER_KW, m: "Roof area (m²) needed per kWp of solar." },
    ]);

    addSheet(sc, "Scenario Template", [
      { header: "Scenario", key: "scenario", width: 20 },
      { header: "Asset name", key: "asset", width: 22 },
      { header: "Scope (s1/s2)", key: "scope", width: 12 },
      { header: "Type (stationary/mobile/cooling/facility)", key: "type", width: 28 },
      { header: "Fuel/Refrigerant id", key: "fuel", width: 18 },
      { header: "Annual volume / load", key: "vol", width: 18 },
      { header: "Unit", key: "unit", width: 8 },
      { header: "Electrify % or units", key: "elec", width: 18 },
      { header: "Fuel switch % (altFuel)", key: "fsw", width: 22 },
      { header: "Refrigerant switch % (alt)", key: "rsw", width: 22 },
      { header: "Leak fix %", key: "leak", width: 12 },
      { header: "Solar kWp", key: "solar", width: 12 },
      { header: "Efficiency %", key: "eff", width: 12 },
      { header: "Procurement %", key: "proc", width: 14 },
      { header: "Start year", key: "start", width: 12 },
      { header: "Target year", key: "target", width: 12 },
      { header: "Notes", key: "notes", width: 30 },
    ], [
      { scenario: "Example: Board case", asset: "Diesel boiler", scope: "s1", type: "stationary", fuel: "diesel", vol: 50000, unit: "L", elec: "60% capacity", fsw: "", rsw: "", leak: "", solar: "", eff: "", proc: "", start: 2026, target: 2030, notes: "delete the example rows" },
      { scenario: "Example: Board case", asset: "Cold storage", scope: "s1", type: "cooling", fuel: "R404A", vol: 120, unit: "kg/yr leak", elec: "", fsw: "", rsw: "60% to R744", leak: 50, solar: "", eff: "", proc: "", start: 2026, target: 2030, notes: "" },
      { scenario: "Example: Board case", asset: "Plant A", scope: "s2", type: "facility", fuel: "grid", vol: 1000000, unit: "kWh", elec: "", fsw: "", rsw: "", leak: "", solar: 500, eff: 15, proc: 30, start: 2026, target: 2030, notes: "" },
    ]);

    await sc.xlsx.writeFile(path.join(OUT_DIR, "Scenario-Model.xlsx"));

    /* ===================== GOALS MODEL ===================== */
    const gm = new ExcelJS.Workbook();
    gm.creator = "Scope 1 & 2 Scenario Modeller";

    addNotes(gm, "README", "Goals Model — calculation logic & template", [
      "This workbook documents the Goals & Targets module and gives you a template to define your own goals + initiatives locally.",
      "",
      "How to use:",
      "1. 'Goal Catalog' lists the pre-configured goal types and their defaults.",
      "2. 'Metrics Logic' and 'Target & Forecast Logic' show exactly how baseline, target, forecast and verdict are computed.",
      "3. 'Auto-Initiatives Logic' shows how initiatives are derived from your data.",
      "4. Fill 'Goals Template' (one row per goal) and 'Initiatives Template' (one row per initiative, linked by Goal name).",
      "5. Save and send the file back. I will parse both template sheets and build those goals + initiatives in the app.",
      "",
      "Template rules:",
      "- Keep header rows exactly as given. Percentages 0-100, years 4-digit, money ₹.",
      "- 'Initiatives Template' links to a goal via the exact Goal name used in 'Goals Template'.",
      "- assignee is one of: esg (Amit), ceo (Raghav), plant (Priya), cfo (Neha), or blank.",
    ]);

    addSheet(gm, "Goal Catalog", [
      { header: "templateId", key: "id", width: 16 },
      { header: "category", key: "cat", width: 12 },
      { header: "title", key: "title", width: 26 },
      { header: "metric", key: "metric", width: 14 },
      { header: "direction", key: "dir", width: 10 },
      { header: "default scope", key: "scope", width: 12 },
      { header: "default target year", key: "ty", width: 16 },
      { header: "default target", key: "tpct", width: 14 },
      { header: "default milestones", key: "ms", width: 28 },
      { header: "description", key: "blurb", width: 60 },
    ], [...GOAL_TEMPLATES, CUSTOM_TEMPLATE].map((t) => ({
      id: t.id, cat: t.category, title: t.title, metric: t.metric, dir: t.direction, scope: t.defaultScope,
      ty: t.defaultTargetYear,
      tpct: t.defaultTargetPct != null ? `${t.defaultTargetPct}%` : t.defaultResidualPct != null ? `residual ${t.defaultResidualPct}%` : t.defaultTargetAbsolute != null ? `${t.defaultTargetAbsolute} kWp` : "",
      ms: (t.defaultMilestones ?? []).map((m) => `${m.year}:${m.reductionPct}%`).join(", "),
      blurb: t.blurb,
    })));

    addSheet(gm, "Metrics Logic", [
      { header: "metric", key: "metric", width: 16 },
      { header: "unit", key: "unit", width: 10 },
      { header: "baseline calculation (per year, from Data input)", key: "calc", width: 90 },
    ], [
      { metric: "emissions_t", unit: "tCO2e", calc: "Σ combustion (volume × emission factor ÷ 1000) + Σ refrigerant (leak kg × GWP ÷ 1000) + Σ facility (kWh × gridEf ÷ 1000), filtered to the goal's scope (s1 / s2 / s1+s2)." },
      { metric: "energy_kwh", unit: "kWh", calc: "Σ Scope1 fuel energy (volume × density × calorific value ÷ 3600) + Σ Scope2 metered grid load (kWh)." },
      { metric: "renewable_pct", unit: "%", calc: "(Σ contracted renewable kWh + Σ on-site solar gen [kWp × irradiance]) ÷ (Σ grid load + Σ solar gen) × 100. Isolated sites carry no contracted renewable." },
      { metric: "solar_kwp", unit: "kWp", calc: "Σ existing on-site solar capacity (kWp) across facilities." },
    ]);

    addSheet(gm, "Target & Forecast Logic", [
      { header: "Concept", key: "c", width: 20 },
      { header: "Logic (as coded)", key: "l", width: 96 },
    ], [
      { c: "Target line", l: "Linear interpolation across anchors: base year (base value) → each milestone → target year. Reduce goals: value = base × (1 − reduction%); net-zero end = base × residual%. Increase goals (renewable %, solar): anchors carry the absolute target value at each year." },
      { c: "Forecast", l: "From the latest actual year to the target year: reduce goals subtract cumulative initiative impact (floored at 0); increase goals add it (renewable % capped at 100). Each initiative ramps linearly from its start year to its target year; on-hold initiatives are excluded." },
      { c: "Verdict", l: "gapFrac = (reduce: forecastEnd − targetEnd over base) or (increase: targetEnd − forecastEnd over targetEnd). On-track ≤ 1%; at-risk ≤ 10%; else off-track." },
      { c: "Progress so far", l: "Reduce: (base − latestActual) ÷ (base × reduction%). Increase: (latest − base) ÷ (targetEnd − base). Clamped 0-100%." },
      { c: "Delivered", l: "Σ over active initiatives of metricImpact × (owner-reported progress% ÷ 100). Shown on the goal vs committed." },
      { c: "Coverage", l: "committed initiative impact ÷ impact still needed (latest → target)." },
    ]);

    addSheet(gm, "Auto-Initiatives Logic", [
      { header: "Goal metric", key: "m", width: 16 },
      { header: "How initiatives are generated from your data", key: "l", width: 96 },
    ], [
      { m: "emissions_t", l: "Scope1: per asset, apply the recommended electrify/fuel-switch plan and compute real tonnes via the asset physics; per cooling system, recommended gas-switch + leak-fix. Scope2: per facility, solar (sized to roof/load) and a 15% efficiency retrofit, each × gridEf." },
      { m: "energy_kwh", l: "Scope1: electrification energy saved = displaced fuel energy − new electricity (COP gain). Scope2: 15% efficiency saving + solar self-consumption (kWh)." },
      { m: "renewable_pct", l: "Per facility: solar self-consumption ÷ total load (percentage points). Plus a portfolio PPA/green-tariff top-up to close the remaining gap to target." },
      { m: "solar_kwp", l: "Per facility: install solar up to roof headroom (roofSpaceM2 ÷ 5.5 − existing kWp)." },
      { m: "Constants used", l: "Solar capex ₹45,000/kWp; efficiency saving 15% of load at ₹12/kWh capex; roof 5.5 m²/kWp; PPA top-up ~₹1.5/kWh addressable. Scope1 capex is exact per asset from the model." },
    ]);

    addSheet(gm, "Goals Template", [
      { header: "Goal name", key: "name", width: 26 },
      { header: "templateId", key: "tid", width: 16 },
      { header: "category", key: "cat", width: 12 },
      { header: "metric", key: "metric", width: 14 },
      { header: "scope (s1/s2/s1s2)", key: "scope", width: 16 },
      { header: "base year", key: "by", width: 10 },
      { header: "target year", key: "ty", width: 12 },
      { header: "target % (or residual/share)", key: "tpct", width: 22 },
      { header: "milestones (year:pct, …)", key: "ms", width: 24 },
      { header: "assignee", key: "assignee", width: 12 },
    ], [
      { name: "Example: Net-zero 2045", tid: "netzero", cat: "emissions", metric: "emissions_t", scope: "s1s2", by: 2025, ty: 2045, tpct: "residual 10", ms: "2030:50, 2040:75", assignee: "esg" },
      { name: "Example: RE100", tid: "re100", cat: "energy", metric: "renewable_pct", scope: "s2", by: 2025, ty: 2030, tpct: "100", ms: "2030:60, 2040:90", assignee: "plant" },
    ]);

    addSheet(gm, "Initiatives Template", [
      { header: "Goal name (links to Goals Template)", key: "goal", width: 30 },
      { header: "Initiative", key: "name", width: 28 },
      { header: "assignee", key: "assignee", width: 12 },
      { header: "status", key: "status", width: 14 },
      { header: "start year", key: "start", width: 10 },
      { header: "target year", key: "target", width: 12 },
      { header: "impact (in goal unit)", key: "impact", width: 18 },
      { header: "budget ₹", key: "budget", width: 14 },
      { header: "progress %", key: "progress", width: 12 },
      { header: "note", key: "note", width: 30 },
    ], [
      { goal: "Example: RE100", name: "5 MW rooftop solar", assignee: "plant", status: "planned", start: 2026, target: 2029, impact: 35, budget: 22500000, progress: 0, note: "percentage points" },
    ]);

    await gm.xlsx.writeFile(path.join(OUT_DIR, "Goals-Model.xlsx"));

    const fs = await import("node:fs");
    expect(fs.existsSync(path.join(OUT_DIR, "Scenario-Model.xlsx"))).toBe(true);
    expect(fs.existsSync(path.join(OUT_DIR, "Goals-Model.xlsx"))).toBe(true);
  });
});
