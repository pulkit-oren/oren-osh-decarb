"use client";

/* Compact BAU / target / net trajectory for the builders' dark "Live
   projection" asides — the shape of the plan without leaving the modeller.
   The full annotated chart stays in Action plan. */

import { Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrajectoryRow } from "@/lib/model/types";
import { fmt } from "@/lib/utils";

const END = 2045; // keep the mini view readable; the long tail adds nothing here

export function MiniTrajectory({ rows, label = "Pathway" }: { rows: TrajectoryRow[]; label?: string }) {
  const data = rows.filter((r) => r.year <= END);
  if (data.length < 2) return null;
  const years = [data[0].year, 2030, 2040];
  /* The axis used to be hidden entirely, so no value on this chart was legible
     without hovering — and a board pack is a screenshot, where hover does not
     exist. Two ticks and a labelled endpoint make it readable on paper. */
  const at2030 = data.find((r) => r.year === 2030);
  const compact = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));

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
            <YAxis
              width={30}
              domain={[0, "dataMax"]}
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.6)" }}
              tickFormatter={(v) => compact(Number(v))}
              axisLine={false}
              tickLine={false}
              tickCount={3}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}
              labelFormatter={(y) => `FY ${y}`}
              formatter={(v, name) => [`${fmt(Number(v ?? 0))} t`, String(name)]}
            />
            <Line name="BAU" type="monotone" dataKey="bau" stroke="rgba(255,255,255,0.45)" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line name="Target" type="monotone" dataKey="target" stroke="rgba(255,255,255,0.75)" strokeDasharray="2 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line name="Your plan" type="monotone" dataKey="net" stroke="#FFFFFF" strokeWidth={2.25} dot={false} isAnimationActive={false} />
            {/* The one value anybody quotes off this chart, printed on it. */}
            {at2030 && (
              <ReferenceDot
                x={2030} y={at2030.net} r={2.5} fill="#FFFFFF" stroke="none"
                label={{ value: `${compact(at2030.net)} t`, position: "top", fontSize: 9, fill: "#FFFFFF" }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[9px] text-white/50 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 border-t-2 border-white" /> your plan</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-white/70" /> target</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-white/40" /> BAU</span>
        <span className="text-white/40">tCO₂e</span>
      </p>
    </div>
  );
}
