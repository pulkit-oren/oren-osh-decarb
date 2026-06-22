"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { fmtK } from "@/lib/utils";
import { useMounted } from "@/lib/useMounted";

const S1 = "#1F6F54";
const S2 = "#0F7873";

/** Net Scope 1 vs Scope 2 spillover share of the 2030 footprint. */
export function ScopeDonut({ scope1, scope2 }: { scope1: number; scope2: number }) {
  const total = scope1 + scope2;
  const data = [
    { name: "Scope 1 (net)", value: Math.max(0, scope1), color: S1 },
    { name: "Scope 2 spillover", value: Math.max(0, scope2), color: S2 },
  ];
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  const mounted = useMounted();

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-[150px] h-[150px] shrink-0">
        {!mounted ? (
          <div className="w-full h-full rounded-full bg-surface-muted animate-pulse" />
        ) : (
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 150, height: 150 }}>
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={48} outerRadius={68} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        )}
        <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
          <div>
            <div className="text-xl font-extrabold text-ink leading-none">{fmtK(total)}</div>
            <div className="text-[10px] text-ink-faint mt-1">tCO₂e · 2030</div>
          </div>
        </div>
      </div>
      <div className="space-y-2 text-sm min-w-0">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: d.color }} />
            <span className="text-ink-soft truncate">{d.name}</span>
            <span className="font-semibold text-ink ml-auto tabular-nums">{share(d.value)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
