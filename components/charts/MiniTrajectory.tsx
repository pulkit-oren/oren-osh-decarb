"use client";

/* Compact BAU / target / net trajectory for the builders' dark "Live
   projection" asides — the shape of the plan without leaving the modeller.
   The full annotated chart stays in Action plan. */

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrajectoryRow } from "@/lib/model/types";
import { fmt } from "@/lib/utils";

const END = 2045; // keep the mini view readable; the long tail adds nothing here

export function MiniTrajectory({ rows, label = "Pathway" }: { rows: TrajectoryRow[]; label?: string }) {
  const data = rows.filter((r) => r.year <= END);
  if (data.length < 2) return null;
  const years = [data[0].year, 2030, 2040];

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-white/70 font-bold mb-1">{label}</p>
      <div className="h-24 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="year"
              ticks={years}
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.6)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis hide domain={[0, "dataMax"]} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}
              labelFormatter={(y) => `FY ${y}`}
              formatter={(v, name) => [`${fmt(Number(v ?? 0))} t`, String(name)]}
            />
            <Line name="BAU" type="monotone" dataKey="bau" stroke="rgba(255,255,255,0.45)" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line name="Target" type="monotone" dataKey="target" stroke="rgba(255,255,255,0.75)" strokeDasharray="2 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line name="Your plan" type="monotone" dataKey="net" stroke="#FFFFFF" strokeWidth={2.25} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[9px] text-white/50 flex items-center gap-3">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 border-t-2 border-white" /> your plan</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-white/70" /> target</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-white/40" /> BAU</span>
      </p>
    </div>
  );
}
