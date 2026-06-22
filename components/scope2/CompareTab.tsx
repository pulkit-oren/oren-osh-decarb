"use client";

import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { FAMILY_COLORS } from "@/lib/model/factors";
import { computeScope2 } from "@/lib/scope2/model";
import { useScope2 } from "@/lib/scope2/store";
import { cn, fmt, fmtMoney, pct } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";
import { Scope2TrajectoryChart, type TrajectorySeries } from "./TrajectoryChart";

const SERIES_COLORS = [FAMILY_COLORS[5], FAMILY_COLORS[0], FAMILY_COLORS[7]];
const MAX_COMPARE = 3;

export function Scope2CompareTab() {
  const { baseFacilities, baseYear, result, scenarios, saveScenario, deleteScenario } = useScope2();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const togglePick = (id: string) =>
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_COMPARE ? [...prev, id] : prev,
    );

  const rows = [
    { id: "current", name: "Current levers", result },
    ...scenarios
      .filter((sc) => picked.includes(sc.id))
      .map((sc) => ({ id: sc.id, name: sc.name, result: computeScope2(baseFacilities, sc.levers, baseYear) })),
  ];

  const series: TrajectorySeries[] = rows.flatMap((r, i) => [
    { id: `${r.id}-loc`, label: `${r.name} · location`, color: SERIES_COLORS[i % SERIES_COLORS.length], rows: r.result.trajectoryLocation },
    { id: `${r.id}-mkt`, label: `${r.name} · market`, color: SERIES_COLORS[i % SERIES_COLORS.length], dashed: true, rows: r.result.trajectoryMarket },
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Saved scenarios"
          subtitle="Scenarios store lever settings only — they re-run against the current base-year facility list."
          right={
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = name.trim();
                if (n) { saveScenario(n); setName(""); }
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Scenario name…"
                aria-label="Scenario name"
                className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400 w-44"
              />
              <button type="submit" disabled={!name.trim()} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600 transition-colors disabled:opacity-50">
                <Save size={14} /> Save current
              </button>
            </form>
          }
        />
        {scenarios.length === 0 ? (
          <p className="text-sm text-ink-faint py-4 text-center">Nothing saved yet — tune the modeller, then save a snapshot here.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {scenarios.map((sc) => {
              const on = picked.includes(sc.id);
              return (
                <li key={sc.id} className="flex items-center justify-between gap-3 py-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => togglePick(sc.id)}
                      disabled={!on && picked.length >= MAX_COMPARE}
                      className="w-4 h-4 accent-brand-500"
                      aria-label={`Compare ${sc.name}`}
                    />
                    <span className={cn("font-medium truncate", on ? "text-ink" : "text-ink-soft")}>{sc.name}</span>
                    <span className="text-xs text-ink-faint shrink-0">{new Date(sc.savedAt).toLocaleDateString()}</span>
                  </label>
                  <button onClick={() => deleteScenario(sc.id)} className="text-ink-faint hover:text-red-500 p-1 shrink-0" aria-label={`Delete ${sc.name}`}>
                    <Trash2 size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="KPI comparison" subtitle="Full-ramp numbers for the live settings and each selected scenario." />
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm min-w-[760px] table-fixed border-separate border-spacing-0">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="font-semibold py-2 px-2 text-left w-[24%]">Scenario</th>
                <th className="font-semibold py-2 px-2 text-right">Location-based (t)</th>
                <th className="font-semibold py-2 px-2 text-right">Market-based (t)</th>
                <th className="font-semibold py-2 px-2 text-right">Reduction by 2030</th>
                <th className="font-semibold py-2 px-2 text-right">CAPEX</th>
                <th className="font-semibold py-2 px-2 text-right">OPEX Δ /yr</th>
                <th className="font-semibold py-2 px-2 text-right">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-line/60">
                  <td className="py-2.5 px-2 font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                      {r.name}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{fmt(r.result.kpis.locationNowT)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-semibold">{fmt(r.result.kpis.marketNowT)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{pct(r.result.kpis.reduction2030)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{fmtMoney(r.result.kpis.totalCapex)}</td>
                  <td className={cn("py-2.5 px-2 text-right tabular-nums", r.result.kpis.annualOpexDelta <= 0 ? "text-brand-600" : "text-amber-700")}>
                    {fmtMoney(r.result.kpis.annualOpexDelta)}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{pct(r.result.kpis.coveragePct / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Trajectory overlay" subtitle="Location-based solid · market-based dashed, per scenario, against BAU and the SBTi 1.5°C target." />
        <Scope2TrajectoryChart series={series} height={320} />
      </Card>
    </div>
  );
}
