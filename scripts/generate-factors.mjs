import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";

const WB = process.argv[2] ?? "C:/Users/rakes/Documents/Dashboard Module/scenario/Scope 1_GHG emission factors.xlsx";
const UNIT = { "Co2e (kg/l)": "L", "Co2 (kg/tonne)": "t", "Co2e (kg/m3)": "m3", "Co2e (kg/kg)": "kg", "Co2e (kg/tonne)": "t" };

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(WB);
const ws = wb.getWorksheet("Emission Factor 2025");
const rows = [];
ws.eachRow((row, r) => {
  if (r < 3) return;
  const a = row.getCell(1).value, b = row.getCell(2).value;
  if (!b) return;
  const num = (c) => { const v = row.getCell(c).value; return typeof v === "number" ? v : null; };
  rows.push({
    r, type: String(a ?? "").trim(), item: String(b).trim(),
    renewable: String(row.getCell(3).value ?? "").trim() === "Renewable",
    unitStr: String(row.getCell(4).value ?? "").trim(),
    densKgM3: num(5), densKgL: num(6), cv: num(7),
    defra: { 2025: num(8), 2024: num(9), 2023: num(10), 2022: num(11) },
    ipcc2014: num(15), imo2024: num(18),
  });
});
writeFileSync("data/emission-factors-2025.json", JSON.stringify(rows, null, 2));
console.log(`Wrote ${rows.length} rows to data/emission-factors-2025.json`);
