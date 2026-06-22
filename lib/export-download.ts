/* ============================================================
   Browser-only download helpers. exceljs is imported dynamically
   so it never lands in the initial bundle.
   ============================================================ */

import { toCsv, type SheetSpec } from "./export";

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadWorkbook(sheets: SheetSpec[], filename: string): Promise<void> {
  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    ws.addRows(s.rows);
    ws.getRow(1).font = { bold: true };
  }
  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename,
  );
}

export function downloadCsv(sheet: SheetSpec, filename: string): void {
  triggerDownload(new Blob([toCsv(sheet)], { type: "text/csv;charset=utf-8" }), filename);
}
