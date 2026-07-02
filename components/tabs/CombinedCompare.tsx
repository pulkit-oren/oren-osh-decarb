"use client";

/* Combined Scope 1 + 2 pathway — pair any saved Scope 1 scenario with any
   saved Scope 2 scenario (or the live plans) and see the total footprint
   against the summed science-based target. Scope 2 is market-based, and the
   Scope 1 plan's electrification spill is counted on the electricity side. */

import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { Area, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import { compute } from "@/lib/model";
import { combineTrajectories } from "@/lib/model/combined";
import { computeScope2 } from "@/lib/scope2/model";
import { Card, CardHeader } from "@/components/ui/Card";
import { cn, fmt, fmtK, fmtMoney, pct } from "@/lib/utils";

const CURRENT = "__current";

function PlanSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-soft font-medium shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400 max-w-[220px]"
      >
        <option value={CURRENT}>Current (live)</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

export function CombinedCompare() {
  const s1 = useScenario();
  const s2 = useScope2();
  const [s1Id, setS1Id] = useState(CURRENT);
  const [s2Id, setS2Id] = useState(CURRENT);

  const s1Result = useMemo(() => {
    const sc = s1Id === CURRENT ? null : s1.scenarios.find((x) => x.id === s1Id);
    if (!sc) return s1.result;
    return compute(
      s1.baseAssets.filter((a) => !a.excluded),
      s1.baseSystems.filter((x) => !x.excluded),
      sc.settings,
      s1.baseYear,
    );
  }, [s1Id, s1.scenarios, s1.result, s1.baseAssets, s1.baseSystems, s1.baseYear]);

  const s2Result = useMemo(() => {
    const sc = s2Id === CURRENT ? null : s2.scenarios.find((x) => x.id === s2Id);
    if (!sc) return s2.result;
    return computeScope2(s2.baseFacilities.filter((f) => !f.excluded), sc.levers, s2.baseYear);
  }, [s2Id, s2.scenarios, s2.result, s2.baseFacilities, s2.baseYear]);

  const rows = useMemo(
    () => combineTrajectories(s1Result.trajectory, s2Result.trajectoryMarket),
    [s1Result, s2Result],
  );
  if (rows.length === 0) return null;

  const base = rows[0].bau;
  const at2030 = rows.find((r) => r.year === 2030) ?? rows[rows.length - 1];
  const reduction2030 = base > 0 ? (at2030.bau - at2030.net) / base : 0;
  const capex = s1Result.kpis.totalCapex + s2Result.kpis.totalCapex;

  return (
    <Card>
      <CardHeader
        title="Combined Scope 1 + 2 pathway"
        subtitle="Pick a plan from each scope — the chart stacks them into your total footprint against the summed science-based line."
        right={<Layers size={18} className="text-brand-600" />}
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-4">
        <PlanSelect label="Scope 1 plan" value={s1Id} onChange={setS1Id} options={s1.scenarios} />
        <PlanSelect label="Scope 2 plan" value={s2Id} onChange={setS2Id} options={s2.scenarios} />
        <div className="ml-auto flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Net 2030</div>
            <div className="text-xl font-extrabold tabular-nums text-ink">{fmtK(at2030.net)} t</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Cut by 2030</div>
            <div className="text-xl font-extrabold tabular-nums text-brand-600">{pct(reduction2030)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Combined CAPEX</div>
            <div className="text-xl font-extrabold tabular-nums text-ink">{fmtMoney(capex)}</div>
          </div>
          <span className={cn("text-xs font-bold rounded-full px-3 py-1", at2030.onTrack ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700")}>
            {at2030.onTrack ? "On track 2030" : "Off track 2030"}
          </span>
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <XAxis dataKey="year" tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtK(Number(v))} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              labelFormatter={(y) => `FY ${y}`}
              formatter={(v, name) => [`${fmt(Number(v ?? 0))} t`, String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area name="Scope 1" type="monotone" dataKey="s1Net" stackId="net" fill="#2F7E78" fillOpacity={0.85} stroke="none" isAnimationActive={false} />
            <Area name="Scope 2 (incl. electrification)" type="monotone" dataKey="s2Net" stackId="net" fill="#7FB6E8" fillOpacity={0.8} stroke="none" isAnimationActive={false} />
            <Line name="BAU" type="monotone" dataKey="bau" stroke="#94A3B8" strokeDasharray="6 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line name="Target (SBTi)" type="monotone" dataKey="target" stroke="#2563EB" strokeDasharray="3 3" strokeWidth={1.75} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] text-ink-faint mt-2">
        Scope 2 shown market-based (your PPAs, I-RECs and procurement count). Electricity added by Scope 1 electrification is included on the Scope 2 band, so the total never hides the shift.
      </p>
    </Card>
  );
}
