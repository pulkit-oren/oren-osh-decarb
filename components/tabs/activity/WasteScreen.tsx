"use client";

/* Waste — BRSR-grade annual entry for the selected financial year: the eight
   BRSR waste categories, each with generated / recovered / disposed tonnes.
   Totals and the diversion rate roll up live, mirroring how Energy & Emissions
   aggregates its per-source entries, and feed the Goals tab as the
   baseline/actuals for Waste goals. */

import { ArrowLeft, Recycle, Target, ChevronRight } from "lucide-react";
import { fyLabel } from "@/lib/model/types";
import { fmt } from "@/lib/utils";
import {
  EMPTY_WASTE_CAT, WASTE_CATEGORIES, normalizeWasteYear, wasteDiversionPct,
  type WasteCatYear, type WasteCategoryId, type WasteYear,
} from "@/lib/esg/types";
import { IconTile } from "./shared";
import { Collapsible } from "./Collapsible";

const num = (v: string) => Math.max(0, Number(v) || 0);

const METRICS: { key: keyof WasteCatYear; label: string; hint: string }[] = [
  { key: "generatedT", label: "Generated", hint: "Total produced" },
  { key: "recoveredT", label: "Recovered", hint: "Recycled / reused / co-processed" },
  { key: "disposedT", label: "Disposed", hint: "Landfill / incineration" },
];

function CategoryCard({
  emoji, label, hint, cat, ariaBase, onChange,
}: {
  emoji: string; label: string; hint: string; cat: WasteCatYear;
  ariaBase: string; onChange: (patch: Partial<WasteCatYear>) => void;
}) {
  const recovery = cat.generatedT > 0 ? Math.min(100, Math.round((cat.recoveredT / cat.generatedT) * 100)) : 0;
  return (
    <div className="rounded-xl2 border border-line/60 bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <IconTile emoji={emoji} bg="#E9FCF0" />
        <div className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink">{label}</span>
          <span className="block text-xs text-ink-soft truncate">{hint}</span>
        </div>
        {cat.generatedT > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-brand-50 text-brand-700 shrink-0">
            {recovery}% recovered
          </span>
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {METRICS.map((m) => (
          <label key={m.key} className="block">
            <span className="block text-[10px] uppercase tracking-wide text-ink-faint font-bold">{m.label}</span>
            <span className="mt-0.5 flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                value={cat[m.key] === 0 ? "" : cat[m.key]}
                placeholder="0"
                aria-label={`${ariaBase} ${m.label.toLowerCase()} (t)`}
                title={m.hint}
                onChange={(e) => onChange({ [m.key]: num(e.target.value) })}
                className="w-full border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white tabular-nums text-right focus:outline-none focus:border-brand-400"
              />
              <span className="text-[11px] font-bold text-ink-faint">t</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function WasteScreen({
  year, setYear, fyYears, waste, setCategory, onBack, onSetGoal,
}: {
  year: number;
  setYear: (y: number) => void;
  fyYears: readonly number[];
  waste?: WasteYear;
  setCategory: (year: number, cat: WasteCategoryId, patch: Partial<WasteCatYear>) => void;
  onBack: () => void;
  onSetGoal: () => void;
}) {
  const w = normalizeWasteYear(waste);
  const diversion = wasteDiversionPct(w);
  const accounted = w.disposedT + w.recoveredT;
  const share = (v: number) => (w.generatedT > 0 ? Math.round((v / w.generatedT) * 100) : 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl3 border border-line/50 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60 px-5 py-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink mb-1">
            <ArrowLeft size={15} /> Back to Environment
          </button>
          <h1 className="text-xl font-extrabold text-ink flex items-center gap-2"><Recycle size={20} className="text-green-700" /> Waste</h1>
          <p className="text-sm text-ink-soft">Annual tonnes per BRSR category — generated, recovered, disposed. Enter the categories you have; leave the rest at 0.</p>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Financial year</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400">
            {fyYears.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-5 items-start">
        <div className="flex flex-col gap-3">
          {WASTE_CATEGORIES.map((c) => (
            <CategoryCard
              key={c.key}
              emoji={c.emoji}
              label={c.label}
              hint={c.hint}
              cat={w.byCategory?.[c.key] ?? EMPTY_WASTE_CAT}
              ariaBase={c.label}
              onChange={(patch) => setCategory(year, c.key, patch)}
            />
          ))}

          {w.generatedT > 0 && accounted > w.generatedT * 1.05 && (
            <p className="text-xs text-ink-faint px-1">
              Heads-up: recovered + disposed = {fmt(accounted)} t, more than the {fmt(w.generatedT)} t generated. That can be right (e.g. stockpiles cleared) — just double-check.
            </p>
          )}

          <Collapsible title="How this is calculated">
            <div className="text-xs text-ink-soft space-y-2 leading-relaxed">
              <p><strong className="text-ink">Total generated</strong> = the sum across all eight BRSR categories = <strong className="text-ink tabular-nums">{fmt(w.generatedT)} t</strong>. Recovered ({fmt(w.recoveredT)} t) and disposed ({fmt(w.disposedT)} t) roll up the same way.</p>
              <p><strong className="text-ink">Diversion rate</strong> = recovered ÷ generated = {fmt(w.recoveredT)} ÷ {fmt(w.generatedT)} = <strong className="text-ink tabular-nums">{Math.round(diversion)}%</strong> — the share kept out of landfill and incineration.</p>
              <p>Categories follow BRSR Principle 6 Q9: plastic, e-waste, bio-medical, construction &amp; demolition, battery, radioactive, other hazardous, other non-hazardous.</p>
              <p>The totals feed the Goals tab: generated tonnes for reduction goals, the diversion rate for zero-waste-to-landfill and recovery-rate goals.</p>
            </div>
          </Collapsible>
        </div>

        {/* Summary aside */}
        <aside className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-green-600 via-green-700 to-emerald-900 text-white shadow-card-lg p-6 flex flex-col gap-4">
          <span aria-hidden className="absolute -right-12 -top-12 w-52 h-52 rounded-full bg-white/10" />
          <p className="relative text-[11px] uppercase tracking-wide font-bold text-white/80">Waste balance · {fyLabel(year)}</p>
          <p className="relative text-[38px] leading-none font-extrabold tabular-nums">{fmt(w.generatedT)} <span className="text-base font-semibold text-white/80">t</span></p>
          <p className="relative -mt-2 text-xs text-white/70">total generated, this financial year</p>

          <div className="relative flex flex-col gap-1.5">
            {WASTE_CATEGORIES.map((c) => {
              const v = w.byCategory?.[c.key]?.generatedT ?? 0;
              if (v <= 0) return null;
              return (
                <div key={c.key} className="rounded-xl bg-white/12 ring-1 ring-white/10 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-semibold text-white/85">{c.emoji} {c.label}</span>
                    <span className="text-sm font-extrabold tabular-nums">{fmt(v)} <span className="text-[9px] font-medium text-white/70">t · {share(v)}%</span></span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-white/25 overflow-hidden"><div className="h-full bg-white" style={{ width: `${share(v)}%` }} /></div>
                </div>
              );
            })}
          </div>

          <div className="relative grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/12 ring-1 ring-white/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Recovered</p>
              <p className="text-lg font-extrabold tabular-nums leading-tight">{fmt(w.recoveredT)}</p>
            </div>
            <div className="rounded-xl bg-white/12 ring-1 ring-white/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Disposed</p>
              <p className="text-lg font-extrabold tabular-nums leading-tight">{fmt(w.disposedT)}</p>
            </div>
            <div className="rounded-xl bg-white/20 ring-1 ring-white/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/80 font-bold">Diversion</p>
              <p className="text-lg font-extrabold tabular-nums leading-tight">{Math.round(diversion)}<span className="text-[10px] font-medium text-white/80">%</span></p>
            </div>
          </div>

          <div className="relative mt-auto pt-4 border-t border-white/20">
            <p className="text-xs text-white/80 leading-relaxed">This data is the baseline and actuals for your waste goals — zero waste to landfill, waste reduction, recovery rate.</p>
            <button
              onClick={onSetGoal}
              className="group mt-3 w-full inline-flex items-center justify-center gap-2 text-sm font-semibold rounded-xl bg-white text-green-800 px-4 py-2.5 hover:bg-green-50 transition-colors"
            >
              <Target size={15} /> Set a waste goal
              <ChevronRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
