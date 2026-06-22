"use client";

/* Scope 2 trajectory chart — BAU, SBTi target, and any number of net
   lines (location solid, market dashed by convention). Generic so the
   Compare tab can overlay several scenarios. */

import { useId } from "react";
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { TrajectoryRow } from "@/lib/model/types";
import { fmtK } from "@/lib/utils";

export interface TrajectorySeries {
  id: string;
  label: string;
  color: string;
  dashed?: boolean;
  rows: TrajectoryRow[];
}

export function Scope2TrajectoryChart({
  series, showBau = true, showTarget = true, height = 280,
}: {
  series: TrajectorySeries[];
  showBau?: boolean;
  showTarget?: boolean;
  height?: number;
}) {
  const gid = useId();
  if (series.length === 0) return null;
  const base = series[0].rows;
  const data = base.map((r, i) => {
    const row: Record<string, number> = { year: r.year, bau: r.bau, target: r.target };
    for (const s of series) row[s.id] = s.rows[i]?.net ?? 0;
    return row;
  });
  const lead = series[0];

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lead.color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={lead.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E3DA" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#8A857B" }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v: number) => fmtK(v)} tick={{ fontSize: 11, fill: "#8A857B" }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            formatter={(value, name) => [`${fmtK(Number(value))} t`, String(name)]}
            labelFormatter={(y) => `Year ${y}`}
            contentStyle={{ borderRadius: 12, border: "1px solid #E7E3DA", fontSize: 12 }}
          />
          {showBau && (
            <Line type="monotone" dataKey="bau" name="BAU" stroke="#8A857B" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
          )}
          {showTarget && (
            <Line type="monotone" dataKey="target" name="SBTi target" stroke="#C2BCB0" strokeWidth={1.5} dot={false} />
          )}
          <Area type="monotone" dataKey={lead.id} legendType="none" tooltipType="none" name={`${lead.label} (area)`} stroke="none" fill={`url(#${gid})`} isAnimationActive={false} />
          {series.map((s) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.label}
              stroke={s.color}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeDasharray={s.dashed ? "6 4" : undefined}
              dot={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
