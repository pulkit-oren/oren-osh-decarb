"use client";

/* Business-as-usual against the company's own history.

   The BAU line is HANDED IN, from the same `combineTrajectories` rows the
   result rail reads. This component derives no growth and draws no second
   curve: a compound curve computed here would miss the grid-decline factor the
   trajectory engine applies to Scope 2, so the comparison it was meant to
   support would have been false. Clearing the override shows the derived path
   through the real engine instead. */

import {
  CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer,
  Scatter, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtK } from "@/lib/utils";
import type { YearPoint } from "@/lib/bau";

const C_ACTUAL = "#0F5C36"; // dark green — the same actual colour the goal chart uses
const C_BAU = "#B45309";    // amber — BAU is the path being argued against

/** One row per year in the union of both series, each value carried through
 *  UNCHANGED. Exported so the carry-through is assertable: this component's
 *  contract is that it plots what it is handed and derives no BAU of its own,
 *  and a rendering smoke test cannot check that under jsdom, where recharts
 *  has no layout and draws no marks. */
export function bauChartRows(
  actuals: YearPoint[],
  bau: { year: number; bau: number }[],
): { year: number; actual: number | null; bau: number | null }[] {
  const years = [...new Set([...actuals.map((p) => p.year), ...bau.map((r) => r.year)])].sort((a, b) => a - b);
  const aMap = new Map(actuals.map((p) => [p.year, p.totalT]));
  const bMap = new Map(bau.map((r) => [r.year, r.bau]));
  return years.map((year) => ({
    year,
    actual: aMap.get(year) ?? null,
    bau: bMap.get(year) ?? null,
  }));
}

interface TooltipEntry { name?: string; value?: number | null; color?: string; }
function BauTooltip({ active, payload, label }: {
  active?: boolean; payload?: TooltipEntry[]; label?: number | string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null && p.name);
  if (!rows.length) return null;
  return (
    <div style={{ borderRadius: 8, border: "1px solid var(--color-line)", background: "white", fontSize: 12, padding: "6px 10px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>FY {label}</div>
      {rows.map((r) => (
        <div key={r.name} style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "#666" }}>
          <span>{r.name}</span>
          <span style={{ fontWeight: 600, color: "#333" }}>{fmtK(Number(r.value))} t</span>
        </div>
      ))}
    </div>
  );
}

export function BauChart({
  actuals, bau, baseYear, height = 260,
}: {
  actuals: YearPoint[];
  bau: { year: number; bau: number }[];
  baseYear: number;
  height?: number;
}) {
  const data = bauChartRows(actuals, bau);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v: number) => fmtK(v)} tick={{ fontSize: 11 }} width={44} />
          <Tooltip content={<BauTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {/* The base year is the pivot: history to the left, premise to the right. */}
          <ReferenceLine x={baseYear} stroke="var(--color-ink-faint)" strokeDasharray="4 4" />
          <Line
            type="monotone" dataKey="bau" name="Business as usual"
            stroke={C_BAU} strokeWidth={2} dot={false} connectNulls
          />
          <Scatter dataKey="actual" name="Actual" fill={C_ACTUAL} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
