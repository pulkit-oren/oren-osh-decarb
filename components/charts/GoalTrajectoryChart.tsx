"use client";

/* Goal trajectory — a labelled, legible chart of where the metric has been
   (Actual), where committed initiatives take it (Forecast), and where the
   goal says it should be (Target), with milestone markers and a divider at
   the latest actual year. Pure render from the goals selectors. */

import { useId } from "react";
import {
  Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer,
  Scatter, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtK } from "@/lib/utils";
import type { SeriesPoint } from "@/lib/goals/select";

const C_ACTUAL = "#0F5C36";   // dark green
const C_FORECAST = "#1F9E5A"; // green
const C_TARGET = "#2E90FA";   // blue
const C_MILESTONE = "#F59E0B"; // amber

export function GoalTrajectoryChart({
  actuals, forecast, target, milestones = [], height = 320, unit = "t",
}: {
  actuals: SeriesPoint[];
  forecast: SeriesPoint[];
  target: SeriesPoint[];
  milestones?: SeriesPoint[];
  height?: number;
  unit?: string;
}) {
  const gid = useId();
  const isPct = unit === "%";
  const fmtVal = (v: number) => (isPct ? `${Math.round(v)}%` : `${fmtK(v)} ${unit}`);

  const years = Array.from(new Set([...actuals, ...forecast, ...target].map((p) => p.year))).sort((a, b) => a - b);
  const byYear = (s: SeriesPoint[]) => new Map(s.map((p) => [p.year, p.value]));
  const aMap = byYear(actuals), fMap = byYear(forecast), tMap = byYear(target), mMap = byYear(milestones);

  const data = years.map((y) => ({
    year: y,
    actual: aMap.get(y) ?? null,
    forecast: fMap.get(y) ?? null,
    target: tMap.get(y) ?? null,
    milestone: mMap.get(y) ?? null,
  }));
  if (data.length === 0) {
    return <p className="text-sm text-ink-faint py-8 text-center">Enter data in the Data input tab to chart this goal.</p>;
  }

  const lastActualYear = actuals.length ? actuals[actuals.length - 1].year : null;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 18, left: 8 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C_FORECAST} stopOpacity={0.16} />
              <stop offset="100%" stopColor={C_FORECAST} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E3DA" vertical={false} />
          <XAxis
            dataKey="year" tick={{ fontSize: 11, fill: "#8A857B" }} tickLine={false} axisLine={{ stroke: "#E7E3DA" }}
            label={{ value: "Financial year", position: "insideBottom", offset: -10, fontSize: 11, fill: "#A8A296" }}
          />
          <YAxis
            tickFormatter={(v: number) => (isPct ? `${Math.round(v)}` : fmtK(v))}
            tick={{ fontSize: 11, fill: "#8A857B" }} tickLine={false} axisLine={false} width={52}
            domain={isPct ? [0, 100] : [0, "auto"]}
            label={{ value: unit, angle: -90, position: "insideLeft", fontSize: 11, fill: "#A8A296", style: { textAnchor: "middle" } }}
          />
          <Tooltip content={<ChartTooltip fmtVal={fmtVal} />} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} iconType="plainline" />

          {lastActualYear != null && (
            <ReferenceLine
              x={lastActualYear} stroke="#C2BCB0" strokeDasharray="2 3"
              label={{ value: "latest actual", position: "top", fontSize: 10, fill: "#A8A296" }}
            />
          )}

          <Area type="monotone" dataKey="forecast" legendType="none" tooltipType="none" stroke="none" fill={`url(#${gid})`} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="target" name="Target" stroke={C_TARGET} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="forecast" name="Forecast (with initiatives)" stroke={C_FORECAST} strokeWidth={2.4} strokeLinecap="round" strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="actual" name="Actual" stroke={C_ACTUAL} strokeWidth={2.8} strokeLinecap="round" dot={{ r: 3, fill: C_ACTUAL }} connectNulls={false} isAnimationActive={false} />
          {milestones.length > 0 && <Scatter dataKey="milestone" name="Milestone" fill={C_MILESTONE} isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipEntry { name?: string; value?: number | null; color?: string; dataKey?: string; }
function ChartTooltip({ active, payload, label, fmtVal }: {
  active?: boolean; payload?: TooltipEntry[]; label?: number | string; fmtVal: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null && p.name);
  if (!rows.length) return null;
  return (
    <div style={{ borderRadius: 12, border: "1px solid #E7E3DA", background: "#fff", fontSize: 12, padding: "8px 10px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
      <div style={{ fontWeight: 700, color: "#5B564E", marginBottom: 4 }}>FY {label}</div>
      {rows.map((r) => (
        <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "1px 0" }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: r.color, display: "inline-block" }} />
          <span style={{ color: "#8A857B" }}>{r.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600, color: "#2A2620" }}>{fmtVal(Number(r.value))}</span>
        </div>
      ))}
    </div>
  );
}
