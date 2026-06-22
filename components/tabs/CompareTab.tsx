"use client";

/* Compare & track — board view. Save snapshots, see which option wins on
   each headline metric, and check year-by-year whether the live plan
   stays on the science-based line. Explanations live behind ⓘ buttons. */

import { useId, useState } from "react";
import { Save, Trash2, Check, X } from "lucide-react";
import { useScenario } from "@/lib/store";
import { compute } from "@/lib/model";
import { CURRENCY } from "@/lib/defaults";
import type { ComputeResult } from "@/lib/model";
import { cn, fmt, fmtK, fmtMoney, fmtNum, pct } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";
import { HowTo } from "../ui/HowTo";

interface Col {
  id: string;
  name: string;
  result: ComputeResult;
  current?: boolean;
  savedAt?: number;
}

export function CompareTab() {
  const { baseAssets, baseSystems, baseYear, scenarios, saveScenario, deleteScenario, result } = useScenario();
  const [name, setName] = useState("");

  const cols: Col[] = [
    { id: "__current", name: "Current (live)", result, current: true },
    ...[...scenarios]
      .sort((a, b) => b.savedAt - a.savedAt)
      .map((s) => ({
        id: s.id,
        name: s.name,
        savedAt: s.savedAt,
        result: compute(baseAssets.filter((a) => !a.excluded), baseSystems.filter((s) => !s.excluded), s.settings, baseYear),
      })),
  ];

  // The five numbers a board compares options on — best value gets the tick.
  const rows: { label: string; render: (c: Col) => string; best?: "max" | "min" }[] = [
    { label: "Emissions cut by 2030", render: (c) => pct(c.result.kpis.reduction2030), best: "max" },
    { label: "Emissions cut by 2050", render: (c) => pct(c.result.kpis.reduction2050), best: "max" },
    { label: "Investment needed", render: (c) => fmtMoney(c.result.kpis.totalCapex), best: "min" },
    { label: "Cost per tonne", render: (c) => `${CURRENCY}${fmt(c.result.kpis.costPerTonne)}`, best: "min" },
    { label: "Payback", render: (c) => (c.result.kpis.paybackYears != null ? `${fmtNum(c.result.kpis.paybackYears, 1)} yrs` : "—"), best: "min" },
    { label: "On the target line from", render: (c) => String(c.result.kpis.yearsToTarget ?? "not by 2050") },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* save */}
      <Card>
        <CardHeader title="Save this plan as an option" subtitle="Snapshot the current settings so you can put alternatives side by side." />
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Board case, aggressive electrification…"
            className="flex-1 min-w-[200px] text-sm border border-line rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400"
          />
          <button
            onClick={() => { if (name.trim()) { saveScenario(name.trim()); setName(""); } }}
            disabled={!name.trim()}
            className="inline-flex items-center gap-2 text-sm font-medium rounded-lg bg-brand-500 text-white px-4 py-2 hover:bg-brand-600 transition-colors disabled:opacity-40"
          >
            <Save size={15} /> Save option
          </button>
        </div>
        {scenarios.length === 0 && (
          <p className="text-sm text-ink-faint mt-3">
            Nothing saved yet — tune the plan in the Scenario Modeller (step 2), then save it here.
          </p>
        )}
      </Card>

      {/* comparison table */}
      <Card>
        <CardHeader
          title="Which option wins?"
          subtitle="The live plan and every saved option, on the numbers a board compares"
          right={<HowTo points={[
            "Each column is one plan option; “Current (live)” is whatever the Scenario Modeller is set to right now.",
            "The green ✓ marks the best value in each row — most emissions cut, least money, fastest payback.",
            "“On the target line from” is the first year the plan meets the SBTi 1.5°C pathway.",
            "Saved options re-run against today's base-year data, so the comparison is always like-for-like.",
          ]} />}
        />
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr>
                <th className="text-left text-[11px] uppercase tracking-wide text-ink-faint font-semibold py-2 px-2">Metric</th>
                {cols.map((c) => (
                  <th key={c.id} className="text-left py-2 px-2">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-semibold", c.current ? "text-brand-600" : "text-ink")}>{c.name}</span>
                      {!c.current && (
                        <button onClick={() => deleteScenario(c.id)} className="text-ink-faint hover:text-red-500" aria-label="Delete scenario">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    {!c.current && !!c.savedAt && (
                      <div className="text-[10px] text-ink-faint font-normal tabular-nums">
                        {new Date(c.savedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const vals = cols.map((c) => valueFor(r.label, c));
                const rawBest = r.best ? (r.best === "max" ? Math.max(...vals) : Math.min(...vals)) : null;
                const best = rawBest === 9999 ? null : rawBest;
                return (
                  <tr key={r.label} className="border-t border-line/70">
                    <td className="py-2.5 px-2 text-ink-soft">{r.label}</td>
                    {cols.map((c, i) => {
                      const isBest = best !== null && vals[i] === best && cols.length > 1;
                      return (
                        <td key={c.id} className="py-2.5 px-2">
                          <span className={cn("tabular-nums", isBest ? "font-bold text-brand-600" : "text-ink")}>
                            {r.render(c)}
                          </span>
                          {isBest && <Check size={13} className="inline ml-1 text-brand-500" />}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* year-over-year target tracking (live scenario) */}
      <TargetTracking result={result} />

      {/* one mini-card per option */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {cols.map((c, idx) => (
          <Card key={c.id}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-ink text-sm">{c.name}</h3>
              <span className="flex items-center gap-1.5">
                {c.result.kpis.onTrack2030 ? (
                  <span className="text-[11px] font-semibold text-brand-600 flex items-center gap-1"><Check size={12} /> on track 2030</span>
                ) : (
                  <span className="text-[11px] font-semibold text-amber-600 flex items-center gap-1"><X size={12} /> behind 2030</span>
                )}
                {idx === 0 && (
                  <HowTo points={[
                    "Green line: emissions under this option. Blue dashed: the 1.5°C target line. Grey dashed: doing nothing.",
                    "On track = the green line sits on or below the blue one in 2030.",
                    "The bar shows how much of the cut required by 2030 this option delivers.",
                  ]} />
                )}
              </span>
            </div>
            <Sparkline result={c.result} />
            <Progress result={c.result} />
          </Card>
        ))}
      </div>
    </div>
  );
}

function valueFor(label: string, c: Col): number {
  const map: Record<string, number> = {
    "Emissions cut by 2030": c.result.kpis.reduction2030,
    "Emissions cut by 2050": c.result.kpis.reduction2050,
    "Investment needed": c.result.kpis.totalCapex,
    "Cost per tonne": c.result.kpis.costPerTonne,
    "Payback": c.result.kpis.paybackYears ?? 9999,
    "On the target line from": c.result.kpis.yearsToTarget ?? 9999,
  };
  return map[label] ?? 0;
}

function Sparkline({ result }: { result: ComputeResult }) {
  const gid = useId();
  const t = result.trajectory;
  const W = 280, H = 80, pad = 4;
  const maxY = Math.max(...t.map((r) => r.bau)) || 1;
  const x = (i: number) => pad + (i / (t.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - (v / maxY) * (H - 2 * pad);
  const path = (key: "net" | "target" | "bau") => t.map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(" ");
  const area = `${path("net")} L${x(t.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20 mt-1" role="img" aria-label="Emissions under this option vs the target line">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1F9E5A" stopOpacity={0.22} />
          <stop offset="100%" stopColor="#1F9E5A" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={path("bau")} fill="none" stroke="#9AA9A1" strokeWidth={1.2} strokeDasharray="4 3" />
      <path d={path("target")} fill="none" stroke="#2E5E8C" strokeWidth={1.4} strokeDasharray="5 3" />
      <path d={path("net")} fill="none" stroke="#1F9E5A" strokeWidth={2.4} strokeLinecap="round" className="draw-in" />
    </svg>
  );
}

function Progress({ result }: { result: ComputeResult }) {
  const k = result.kpis;
  const required = k.bau2030 - k.target2030;
  const achieved = k.bau2030 - k.net2030;
  const ratio = required > 0 ? Math.max(0, Math.min(1.3, achieved / required)) : 1;
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[11px] text-ink-faint mb-1">
        <span>Of the cut needed by 2030</span>
        <span className="font-semibold text-ink">{pct(ratio)}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
        <div className="h-full rounded-full bar-in transition-all duration-500" style={{ width: `${Math.min(100, ratio * 100)}%`, background: ratio >= 1 ? "linear-gradient(90deg,#3FB76E,#1F9E5A)" : "linear-gradient(90deg,#F0BD6B,#E8A33D)" }} />
      </div>
      <div className="text-[11px] text-ink-soft mt-1 tabular-nums">
        {fmtK(achieved)} of {fmtK(required)} tCO₂e delivered
      </div>
    </div>
  );
}

/** Year-over-year net vs the SBTi line for the live scenario. */
function TargetTracking({ result }: { result: ComputeResult }) {
  const first = result.kpis.yearsToTarget;
  const milestones = [2027, 2030, 2035, 2040, 2045, 2050];
  const rowFor = (y: number) => result.trajectory.find((r) => r.year === y);
  return (
    <Card>
      <CardHeader
        title="Is the live plan on target, year by year?"
        subtitle="One block per year to 2050 — green means at or below the 1.5 °C line"
        right={
          <span className="flex items-center gap-2">
            {first ? (
              <span className="text-[11px] font-semibold text-brand-600">on target from {first}</span>
            ) : (
              <span className="text-[11px] font-semibold text-amber-600">not on target by 2050</span>
            )}
            <HowTo points={[
              "Each block is one year. Green: emissions that year are at or below the SBTi 1.5°C target line. Amber: above it.",
              "The outlined block is the first on-target year.",
              "The table picks out milestone years with the exact gap in tonnes — a minus gap means you're beating the target.",
            ]} />
          </span>
        }
      />
      <div className="flex gap-[3px]" role="img" aria-label="On-target status for each year to 2050">
        {result.trajectory.map((r) => (
          <div
            key={r.year}
            title={`${r.year} — plan ${fmt(r.net)} t · target ${fmt(r.target)} t`}
            className="flex-1 h-9 rounded-sm"
            style={{
              background: r.onTrack ? "#1F9E5A" : "#E8A33D",
              opacity: 0.85,
              outline: r.year === first ? "2px solid #14503D" : undefined,
              outlineOffset: r.year === first ? 1 : undefined,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-ink-faint tabular-nums mt-1 mb-4">
        <span>{result.trajectory[0]?.year}</span>
        {first && <span className="font-semibold text-brand-700">first on-target year: {first}</span>}
        <span>2050</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
            <th className="font-semibold text-left py-1.5 px-2">Milestone</th>
            <th className="font-semibold text-right py-1.5 px-2">Plan</th>
            <th className="font-semibold text-right py-1.5 px-2">Target</th>
            <th className="font-semibold text-right py-1.5 px-2">Gap</th>
            <th className="font-semibold text-right py-1.5 px-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {milestones.map((y) => {
            const r = rowFor(y);
            if (!r) return null;
            const gap = r.net - r.target;
            return (
              <tr key={y} className="border-t border-line/60">
                <td className="py-2 px-2 font-medium tabular-nums">{y}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt(r.net)} t</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmt(r.target)} t</td>
                <td className={cn("py-2 px-2 text-right tabular-nums font-semibold", gap <= 0 ? "text-brand-600" : "text-amber-600")}>
                  {gap <= 0 ? "−" : "+"}{fmt(Math.abs(gap))} t
                </td>
                <td className="py-2 px-2 text-right">
                  {r.onTrack ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600"><Check size={12} /> on target</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600"><X size={12} /> above target</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
