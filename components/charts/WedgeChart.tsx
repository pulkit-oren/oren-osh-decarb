"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FAMILY_COLORS } from "@/lib/model/factors";
import type { ComputeResult } from "@/lib/model";
import { fmt, fmtK } from "@/lib/utils";
import { useMounted } from "@/lib/useMounted";

const BAU_COLOR = "#9AA9A1";
const TARGET_COLOR = "#2E5E8C";
const NET_ON = "#1F9E5A";
const NET_OFF = "#E8A33D";
const SPILL_COLOR = "#0F7873";

interface Row {
  year: number;
  net: number;
  bau: number;
  target: number;
  scope2: number;
  netOn: number | null;
  netOff: number | null;
  [wedgeId: string]: number | null;
}

export function WedgeChart({ result }: { result: ComputeResult }) {
  const { trajectory, wedges } = result;

  const data: Row[] = trajectory.map((r) => {
    const row: Row = {
      year: r.year,
      net: r.net,
      bau: r.bau,
      target: r.target,
      scope2: r.scope2Spill,
      netOn: r.onTrack ? r.net : null,
      netOff: r.onTrack ? null : r.net,
    };
    for (const w of wedges) row[w.id] = r.wedges[w.id] ?? 0;
    return row;
  });

  const hasSpill = trajectory.some((r) => r.scope2Spill > 0);
  const mounted = useMounted();

  // ticks every 5 years from the base year, always including the last year
  const firstYear = trajectory[0]?.year ?? 2025;
  const lastYear = trajectory[trajectory.length - 1]?.year ?? 2050;
  const ticks: number[] = [];
  for (let y = firstYear; y <= lastYear; y += 5) ticks.push(y);
  if (ticks[ticks.length - 1] !== lastYear) ticks.push(lastYear);

  return (
    <div>
      <div className="w-full h-[340px]" role="img" aria-label="Emissions pathway to 2050: business-as-usual, SBTi target line, abatement wedges and the net emissions line">
        {!mounted ? (
          <div className="w-full h-full rounded-xl bg-surface-muted animate-pulse" />
        ) : (
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 340 }}>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="wedge-net" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={NET_ON} stopOpacity={0.22} />
                <stop offset="100%" stopColor={NET_ON} stopOpacity={0.04} />
              </linearGradient>
              {wedges.map((w) => (
                <linearGradient key={w.id} id={`wedge-${w.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={FAMILY_COLORS[w.colorIdx]} stopOpacity={0.92} />
                  <stop offset="100%" stopColor={FAMILY_COLORS[w.colorIdx]} stopOpacity={0.55} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="#E3E2DA" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="year"
              ticks={ticks}
              tick={{ fontSize: 12, fill: "#94A3B8" }}
              tickLine={false}
              axisLine={{ stroke: "#E5E7EB" }}
            />
            <YAxis
              tickFormatter={(v) => fmtK(Number(v))}
              tick={{ fontSize: 12, fill: "#94A3B8" }}
              tickLine={false}
              axisLine={false}
              width={44}
              label={{ value: "tCO₂e", angle: -90, position: "insideLeft", fill: "#94A3B8", fontSize: 11, dy: 20 }}
            />
            <Tooltip content={<WedgeTooltip wedges={wedges} />} />

            {/* net region (bottom of the stack) */}
            <Area type="monotone" dataKey="net" stackId="w" stroke="none" fill="url(#wedge-net)" isAnimationActive={false} />
            {/* abatement wedges, stacked above net up to BAU */}
            {wedges.map((w) => (
              <Area
                key={w.id}
                type="monotone"
                dataKey={w.id}
                stackId="w"
                stroke="#FFFFFF"
                strokeWidth={0.6}
                fill={`url(#wedge-${w.id})`}
                isAnimationActive={false}
              />
            ))}

            {/* BAU + target reference lines */}
            <Line type="monotone" dataKey="bau" stroke={BAU_COLOR} strokeWidth={1.6} strokeDasharray="6 5" strokeLinecap="round" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="target" stroke={TARGET_COLOR} strokeWidth={1.8} strokeDasharray="7 5" strokeLinecap="round" dot={false} isAnimationActive={false} />

            {/* bold net line, coloured by on/off track */}
            <Line type="monotone" dataKey="netOn" stroke={NET_ON} strokeWidth={3} strokeLinecap="round" dot={false} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="netOff" stroke={NET_OFF} strokeWidth={3} strokeLinecap="round" dot={false} connectNulls isAnimationActive={false} />

            {hasSpill && (
              <Line type="monotone" dataKey="scope2" stroke={SPILL_COLOR} strokeWidth={1.6} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </div>

      <Legend wedges={wedges} hasSpill={hasSpill} />
    </div>
  );
}

function Legend({
  wedges,
  hasSpill,
}: {
  wedges: ComputeResult["wedges"];
  hasSpill: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 pt-3 border-t border-dashed border-line text-xs text-ink-soft">
      <LegendItem line dashed color={BAU_COLOR} label="Business as usual" />
      <LegendItem line dashed color={TARGET_COLOR} label="SBTi 1.5°C target" />
      <LegendItem line color={NET_ON} label="Net emissions" />
      {wedges.map((w) => (
        <LegendItem key={w.id} color={FAMILY_COLORS[w.colorIdx]} label={w.label} />
      ))}
      {hasSpill && <LegendItem line dashed color={SPILL_COLOR} label="Scope 2 spillover" />}
    </div>
  );
}

function LegendItem({ color, label, line, dashed }: { color: string; label: string; line?: boolean; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {line ? (
        <span
          className="inline-block w-4"
          style={{ borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }}
        />
      ) : (
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color, opacity: 0.82 }} />
      )}
      {label}
    </span>
  );
}

interface TooltipProps {
  active?: boolean;
  label?: number;
  payload?: { dataKey: string; value: number }[];
  wedges: ComputeResult["wedges"];
}

function WedgeTooltip({ active, label, payload, wedges }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? 0;
  const bau = get("bau");
  const target = get("target");
  const net = get("netOn") || get("netOff") || get("net");
  return (
    <div className="bg-white rounded-xl border border-line shadow-card-lg px-3 py-2.5 text-xs">
      <div className="font-bold text-ink mb-1.5 tabular-nums">{label}</div>
      <Row label="BAU" value={bau} color={BAU_COLOR} />
      <Row label="Net" value={net} color={net <= target ? NET_ON : NET_OFF} />
      <Row label="Target" value={target} color={TARGET_COLOR} />
      {wedges.length > 0 && <div className="border-t border-line mt-1.5 pt-1.5" />}
      {wedges.map((w) => {
        const v = get(w.id);
        if (!v) return null;
        return <Row key={w.id} label={w.label} value={v} color={FAMILY_COLORS[w.colorIdx]} />;
      })}
    </div>
  );

  function Row({ label, value, color }: { label: string; value: number; color: string }) {
    return (
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-ink-soft">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: color }} />
          {label}
        </span>
        <span className="font-semibold text-ink tabular-nums">{fmt(value)}</span>
      </div>
    );
  }
}
