"use client";

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  Cell,
} from "recharts";
import { CURRENCY } from "@/lib/defaults";
import { fmt, fmtK } from "@/lib/utils";
import { useMounted } from "@/lib/useMounted";

export interface MaccItem {
  label: string;
  costPerTonne: number; // x
  tonnes: number; // y
  ambition: number; // z (dot size)
  color: string;
}

/** Marginal abatement: cost/tonne (x) × tonnes abated 2030 (y), dot area ∝ ambition. */
export function MaccScatter({ items }: { items: MaccItem[] }) {
  const data = items.filter((i) => i.tonnes > 0);
  const mounted = useMounted();
  if (data.length === 0) {
    return <p className="text-sm text-ink-faint">No active levers to plot.</p>;
  }
  if (!mounted) {
    return <div className="w-full h-[230px] rounded-xl bg-surface-muted animate-pulse" />;
  }
  return (
    <div className="w-full h-[230px]" role="img" aria-label="Marginal abatement scatter: cost per tonne versus tonnes abated in 2030, dot size showing ambition">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 230 }}>
        <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 4 }}>
          <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="costPerTonne"
            name="Cost"
            tick={{ fontSize: 11, fill: "#94A3B8" }}
            tickLine={false}
            axisLine={{ stroke: "#E5E7EB" }}
            tickFormatter={(v) => `${CURRENCY}${fmtK(Number(v))}`}
            label={{ value: "cost per tonne →", position: "insideBottom", offset: -12, fill: "#94A3B8", fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="tonnes"
            name="Tonnes"
            tick={{ fontSize: 11, fill: "#94A3B8" }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v) => fmtK(Number(v))}
          />
          <ZAxis type="number" dataKey="ambition" range={[120, 900]} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<MaccTooltip />} />
          <Scatter data={data} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} fillOpacity={0.6} stroke={d.color} strokeWidth={1.5} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function MaccTooltip({ active, payload }: { active?: boolean; payload?: { payload: MaccItem }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white rounded-xl border border-line shadow-card-lg px-3 py-2 text-xs">
      <div className="font-bold text-ink mb-1">{d.label}</div>
      <div className="text-ink-soft">Abatement: <span className="font-semibold text-ink">{fmt(d.tonnes)} t</span></div>
      <div className="text-ink-soft">Cost/tonne: <span className="font-semibold text-ink">{CURRENCY}{fmt(d.costPerTonne)}</span></div>
      <div className="text-ink-soft">Ambition: <span className="font-semibold text-ink">{d.ambition}%</span></div>
    </div>
  );
}
