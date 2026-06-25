"use client";

import { ArrowLeft, Factory, Zap } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { useScenario } from "@/lib/store";
import type { useScope2 } from "@/lib/scope2/store";
import { combustionCO2e, refrigerantCO2e } from "@/lib/model/baseline";
import { FUELS, REFRIGERANTS } from "@/lib/model/factors";
import { fuelFamily } from "@/lib/activity-groups";
import { fyLabel } from "@/lib/model/types";
import { cn, fmt } from "@/lib/utils";
import { useMounted } from "@/lib/useMounted";
import { facCO2e, unitLabel, ICON_COLOR, ScopeBadge } from "./shared";

type S1 = ReturnType<typeof useScenario>;
type S2 = ReturnType<typeof useScope2>;

type Row = { id: string; name: string; bu?: string; raw: string; t: number; excluded?: boolean };
type Group = { label: string; color: string; rows: Row[] };

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function ScopeScreen({
  scope,
  s1,
  s2,
  year,
  onBack,
}: {
  scope: 1 | 2;
  s1: S1;
  s2: S2;
  year: number;
  onBack: () => void;
}) {
  const mounted = useMounted();
  const groups: Group[] = [];

  if (scope === 1) {
    const FAM_META = { liquid: "liquid", gas: "gaseous", solid: "solid" } as const;
    for (const fam of ["liquid", "gas", "solid"] as const) {
      const rows = s1.selectedAssets
        .filter((a) => fuelFamily(a.fuelType) === fam && a.annualVolume > 0)
        .map((a) => ({
          id: a.id,
          name: FUELS[a.fuelType].label,
          bu: a.bu,
          raw: `${fmt(a.annualVolume)} ${unitLabel(a.unit)}`,
          t: combustionCO2e(a),
          excluded: a.excluded,
        }));
      if (rows.length) {
        groups.push({ label: `Fuels – ${cap(fam)}`, color: ICON_COLOR[FAM_META[fam]], rows });
      }
    }
    const otherRows = s1.selectedAssets
      .filter((a) => fuelFamily(a.fuelType) === null && a.annualVolume > 0)
      .map((a) => ({
        id: a.id,
        name: FUELS[a.fuelType].label,
        bu: a.bu,
        raw: `${fmt(a.annualVolume)} ${unitLabel(a.unit)}`,
        t: combustionCO2e(a),
        excluded: a.excluded,
      }));
    if (otherRows.length) {
      groups.push({ label: "Other Fuels", color: ICON_COLOR.biomass, rows: otherRows });
    }
    const refRows = s1.selectedSystems
      .filter((sy) => sy.toppedUpKg > 0)
      .map((sy) => ({
        id: sy.id,
        name: REFRIGERANTS[sy.refrigerant].label,
        bu: sy.bu,
        raw: `${fmt(sy.toppedUpKg)} kg`,
        t: refrigerantCO2e(sy),
        excluded: sy.excluded,
      }));
    if (refRows.length) {
      groups.push({ label: "Refrigerants", color: ICON_COLOR.refrigerant, rows: refRows });
    }
  } else {
    const rows = s2.selectedFacilities
      .filter((f) => f.annualLoadKwh > 0)
      .map((f) => ({
        id: f.id,
        name: f.name,
        bu: f.bu,
        raw: `${fmt(f.annualLoadKwh)} kWh`,
        t: facCO2e(f),
        excluded: f.excluded,
      }));
    if (rows.length) {
      groups.push({ label: "Electricity", color: ICON_COLOR.electricity, rows });
    }
  }

  const allRows = groups.flatMap((g) => g.rows.map((r) => ({ ...r, color: g.color })));
  const total = allRows.filter((r) => !r.excluded).reduce((s, r) => s + r.t, 0);
  const groupTotals = groups
    .map((g) => ({ label: g.label, color: g.color, t: g.rows.filter((r) => !r.excluded).reduce((s, r) => s + r.t, 0) }))
    .filter((g) => g.t > 0);
  const ranked = [...allRows].sort((a, b) => b.t - a.t);
  const maxT = Math.max(...ranked.map((r) => r.t), 1);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  // Scope theming — Scope 1 = brand green, Scope 2 = oren teal (matches ScopeBadge & sibling screens)
  const theme =
    scope === 1
      ? { grad: "linear-gradient(135deg,#EAF7EF,#A5E0B9)", icon: "#13633A", tint: "from-brand-50" }
      : { grad: "linear-gradient(135deg,#E6F1F0,#94C5BF)", icon: "#084D4B", tint: "from-oren-50" };
  const ThemeIcon = scope === 1 ? Factory : Zap;
  const topGroup = groupTotals.length ? groupTotals.reduce((a, b) => (b.t > a.t ? b : a)) : null;

  return (
    <div className="screen-in flex flex-col gap-5">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"
      >
        <ArrowLeft size={16} /> All activity data
      </button>

      {/* Themed gradient header (matches category screens) */}
      <div
        style={{ background: theme.grad }}
        className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4"
      >
        <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0">
          <ThemeIcon size={28} strokeWidth={1.9} style={{ color: theme.icon }} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-ink leading-tight">Scope {scope} emissions</h1>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <ScopeBadge scope={scope} />
            <span className="text-sm text-ink-soft">
              {fyLabel(year)} · {allRows.length} source{allRows.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Total</div>
          <div className="text-3xl font-extrabold tabular-nums text-ink leading-none mt-1">
            {fmt(total)} <span className="text-base font-semibold text-ink-soft">tCO₂e</span>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl3 border border-dashed border-line/70 bg-surface-muted/30 px-6 py-12 text-center">
          <p className="text-sm text-ink-faint">No Scope {scope} sources with consumption yet.</p>
          <p className="text-xs text-ink-faint mt-1">Add sources and enter values to see the breakdown.</p>
        </div>
      ) : (
        <>
          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Donut — by category group */}
            <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-5">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-4">
                Where it comes from
              </div>
              <div className="flex items-center gap-5">
                <div className="relative w-[160px] h-[160px] shrink-0">
                  {!mounted ? (
                    <div className="w-full h-full rounded-full bg-surface-muted animate-pulse" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 160, height: 160 }}>
                      <PieChart>
                        {/* Soft track ring behind the data */}
                        <Pie data={[{ v: 1 }]} dataKey="v" innerRadius={54} outerRadius={73} startAngle={90} endAngle={-270} fill="#EEF2F1" stroke="none" isAnimationActive={false} />
                        <Pie
                          data={groupTotals}
                          dataKey="t"
                          innerRadius={55}
                          outerRadius={72}
                          startAngle={90}
                          endAngle={-270}
                          paddingAngle={groupTotals.length > 1 ? 2 : 0}
                          cornerRadius={4}
                          stroke="#fff"
                          strokeWidth={2}
                          isAnimationActive={false}
                        >
                          {groupTotals.map((g) => (
                            <Cell key={g.label} fill={g.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                  <div className="absolute inset-0 grid place-items-center text-center pointer-events-none px-5">
                    <div>
                      <div className="text-[22px] font-extrabold text-ink leading-none tabular-nums">{fmt(total)}</div>
                      <div className="text-[10px] text-ink-faint mt-0.5">tCO₂e</div>
                      {topGroup && (
                        <div className="mt-1.5 text-[10px] font-semibold leading-tight" style={{ color: topGroup.color }}>
                          {Math.round(pct(topGroup.t))}% {topGroup.label.replace("Fuels – ", "")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-2.5">
                  {groupTotals.map((g) => (
                    <div key={g.label}>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: g.color }} />
                        <span className="text-ink-soft truncate">{g.label}</span>
                        <span className="ml-auto shrink-0 tabular-nums text-ink-soft text-xs">{fmt(g.t)} t</span>
                        <span className="w-9 text-right shrink-0 font-bold tabular-nums text-ink">{Math.round(pct(g.t))}%</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-surface-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(pct(g.t), 2)}%`, background: g.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Ranked horizontal bars — all sources */}
            <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-5">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-4">
                Sources by emissions
              </div>
              <div className="flex flex-col gap-2.5 max-h-[280px] overflow-y-auto pr-1">
                {ranked.map((r) => (
                  <div key={r.id} className="flex items-center gap-3">
                    <span className={cn("w-36 shrink-0 truncate text-sm text-ink", r.excluded && "opacity-50")}>
                      {r.name}
                      {r.bu ? <span className="text-ink-faint"> · {r.bu}</span> : null}
                    </span>
                    <div className="flex-1 h-5 rounded-md bg-surface-muted overflow-hidden">
                      <div
                        className="h-full rounded-md transition-all duration-500"
                        style={{ width: `${Math.max((r.t / maxT) * 100, 2)}%`, background: r.color, opacity: r.excluded ? 0.35 : 1 }}
                      />
                    </div>
                    <span className={cn("w-20 text-right text-sm font-semibold tabular-nums shrink-0", r.excluded && "opacity-50")}>
                      {fmt(r.t)} t
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Detailed grouped list */}
          {groups.map((g) => {
            const gTotal = g.rows.filter((r) => !r.excluded).reduce((s, r) => s + r.t, 0);
            return (
              <div key={g.label} className="rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden">
                <div className={cn("flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-r to-transparent", theme.tint)}>
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: g.color }} />
                  <span className="text-sm font-semibold text-ink">{g.label}</span>
                  <span className="ml-auto text-sm font-bold tabular-nums text-ink">{fmt(gTotal)} <span className="text-xs font-normal text-ink-soft">t</span></span>
                </div>
                {g.rows.map((r) => (
                  <div
                    key={r.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 border-t border-line/40",
                      r.excluded && "opacity-50",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                      {r.name}
                      {r.bu ? <span className="text-ink-faint font-normal"> · {r.bu}</span> : null}
                      {r.excluded ? <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wide"> · excl</span> : null}
                    </span>
                    <div className="hidden sm:block w-24 h-1.5 rounded-full bg-surface-muted overflow-hidden shrink-0">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(pct(r.t), 2)}%`, background: g.color }} />
                    </div>
                    <span className="text-sm tabular-nums text-ink-soft shrink-0 w-32 text-right">{r.raw}</span>
                    <span className="text-sm font-semibold tabular-nums shrink-0 w-24 text-right">{fmt(r.t)} t</span>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
