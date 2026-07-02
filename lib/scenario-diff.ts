/* ============================================================
   Scenario diff — what loading a saved scenario would change vs the
   current working plan. Works on the lever maps both stores keep
   (source id → lever name → flat fields), so one engine serves
   Scope 1 (byAsset/bySystem) and Scope 2 (byFacility) plus any flat
   record (assumptions, procurement). Pure: no React, no I/O.
   ============================================================ */

import { fmt } from "@/lib/utils";

export interface DiffRow {
  source: string; // asset / facility / group name
  lever: string;  // "Electrify", "Efficiency", … or "Plan" for whole-source rows
  field: string;  // prettified field name, "" for whole-source rows
  from: string;
  to: string;
}

type Flat = Record<string, unknown>;
type LeverEntry = Record<string, unknown>;
type LeverMap = Record<string, LeverEntry>;

const fmtVal = (v: unknown): string => {
  if (v === undefined || v === null) return "—";
  if (typeof v === "boolean") return v ? "on" : "off";
  // keep decimals (grid factors, COP…) — fmt() would round 0.71 to "1"
  if (typeof v === "number") return Number.isInteger(v) ? fmt(v) : String(Number(v.toFixed(2)));
  return String(v);
};

/** camelCase / abbreviations → readable label ("leakImprovementPct" → "leak improvement %"). */
export const prettyField = (k: string): string =>
  k
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\bpct\b/g, "%")
    .replace(/\bcapex\b/g, "CAPEX")
    .replace(/\bkwh\b/g, "kWh")
    .replace(/\bkwp\b/g, "kWp")
    .replace(/\bcop\b/g, "COP");

const prettyLever = (k: string): string => prettyField(k).replace(/^./, (c) => c.toUpperCase());

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Which levers are switched on in a source's entry (for whole-source rows). */
function enabledSummary(entry: LeverEntry | undefined): string {
  if (!entry) return "no plan";
  const on = Object.entries(entry)
    .filter(([, v]) => isObj(v) && (v as Flat).enabled === true)
    .map(([k]) => prettyLever(k));
  return on.length ? `plan: ${on.join(" + ")}` : "plan with all levers off";
}

/** Field-level diff of two flat records (assumptions, procurement…). */
export function diffFlat(currentRec: object | undefined, targetRec: object | undefined, source: string, lever = ""): DiffRow[] {
  const current = currentRec as Flat | undefined;
  const target = targetRec as Flat | undefined;
  const rows: DiffRow[] = [];
  const keys = new Set([...Object.keys(current ?? {}), ...Object.keys(target ?? {})]);
  for (const k of keys) {
    const a = current?.[k], b = target?.[k];
    if (isObj(a) || isObj(b)) continue; // nested structures handled by callers
    if (a === b || (a == null && b == null)) continue;
    rows.push({ source, lever, field: prettyField(k), from: fmtVal(a), to: fmtVal(b) });
  }
  return rows;
}

/**
 * Diff two lever maps. Sources present on only one side get a single
 * whole-source row; sources on both sides get per-lever field rows.
 */
export function diffLeverMaps(
  current: LeverMap | undefined,
  target: LeverMap | undefined,
  nameOf: (id: string) => string,
): DiffRow[] {
  const rows: DiffRow[] = [];
  const ids = new Set([...Object.keys(current ?? {}), ...Object.keys(target ?? {})]);
  for (const id of ids) {
    const a = current?.[id], b = target?.[id];
    const source = nameOf(id);
    if (!a || !b) {
      const from = enabledSummary(a), to = enabledSummary(b);
      if (from !== to) rows.push({ source, lever: "Plan", field: "", from, to });
      continue;
    }
    const levers = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const lever of levers) {
      const la = a[lever], lb = b[lever];
      if (!isObj(la) && !isObj(lb)) continue;
      rows.push(...diffFlat(isObj(la) ? la : {}, isObj(lb) ? lb : {}, source, prettyLever(lever)));
    }
  }
  // enabled-flips first — they're the headline changes
  return rows.sort((x, y) => Number(y.field === "enabled") - Number(x.field === "enabled"));
}
