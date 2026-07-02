"use client";

/* Water — BRSR/GRI-grade annual entry for the selected financial year:
   withdrawal split by source, discharge split by destination, and consumption
   with a GRI 303-style calculated suggestion. Totals roll up live, mirroring
   how Energy & Emissions aggregates its per-source entries, and feed the
   Goals tab as the baseline/actuals for Water goals. */

import { ArrowLeft, Droplets, Target, ChevronRight, Calculator } from "lucide-react";
import { fyLabel } from "@/lib/model/types";
import { fmt } from "@/lib/utils";
import {
  DISCHARGE_DESTS, WATER_SOURCES, normalizeWaterYear, suggestedConsumptionKl,
  type DischargeDestId, type WaterSourceId, type WaterYear,
} from "@/lib/esg/types";
import { IconTile } from "./shared";
import { Collapsible } from "./Collapsible";

const num = (v: string) => Math.max(0, Number(v) || 0);

function SourceRow({
  emoji, label, hint, unit, value, ariaLabel, onChange,
}: {
  emoji: string; label: string; hint: string; unit: string;
  value: number; ariaLabel: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl2 border border-line/60 bg-surface px-4 py-3">
      <IconTile emoji={emoji} bg="#EAF6FE" />
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{label}</span>
        <span className="block text-xs text-ink-soft truncate">{hint}</span>
      </div>
      <span className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          min={0}
          value={value === 0 ? "" : value}
          placeholder="0"
          aria-label={ariaLabel}
          onChange={(e) => onChange(num(e.target.value))}
          className="w-36 border border-line rounded-lg px-3 py-2 text-sm bg-white tabular-nums text-right focus:outline-none focus:border-brand-400"
        />
        <span className="text-xs font-bold text-ink-faint w-6">{unit}</span>
      </span>
    </div>
  );
}

function SectionHeader({ title, sub, total }: { title: string; sub: string; total: number }) {
  return (
    <div className="flex items-end justify-between gap-3 mt-1">
      <div>
        <h2 className="text-base font-extrabold text-ink">{title}</h2>
        <p className="text-xs text-ink-soft">{sub}</p>
      </div>
      <div className="text-right">
        <div className="text-[9px] uppercase tracking-wide text-ink-soft font-bold">Total</div>
        <div className="text-base font-extrabold tabular-nums text-ink">{fmt(total)}<span className="text-[10px] text-ink-soft"> kL</span></div>
      </div>
    </div>
  );
}

export function WaterScreen({
  year, setYear, fyYears, water, setWithdrawal, setDischarge, setConsumption, onBack, onSetGoal,
}: {
  year: number;
  setYear: (y: number) => void;
  fyYears: readonly number[];
  water?: WaterYear;
  setWithdrawal: (year: number, source: WaterSourceId, kl: number) => void;
  setDischarge: (year: number, dest: DischargeDestId, kl: number) => void;
  setConsumption: (year: number, kl: number) => void;
  onBack: () => void;
  onSetGoal: () => void;
}) {
  const w = normalizeWaterYear(water);
  const suggested = suggestedConsumptionKl(w);
  const share = (v: number) => (w.withdrawalKl > 0 ? Math.round((v / w.withdrawalKl) * 100) : 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl3 border border-line/50 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60 px-5 py-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink mb-1">
            <ArrowLeft size={15} /> Back to Environment
          </button>
          <h1 className="text-xl font-extrabold text-ink flex items-center gap-2"><Droplets size={20} className="text-sky-700" /> Water</h1>
          <p className="text-sm text-ink-soft">Annual totals in kilolitres (1 kL = 1 m³), split by source and destination — the baseline for your water goals.</p>
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
          {/* Withdrawal by source */}
          <SectionHeader title="Withdrawal by source" sub="Where the water comes from — enter each source you use, leave the rest at 0." total={w.withdrawalKl} />
          {WATER_SOURCES.map((s) => (
            <SourceRow
              key={s.key}
              emoji={s.emoji}
              label={s.label}
              hint={s.hint}
              unit="kL"
              value={w.withdrawalBySource?.[s.key] ?? 0}
              ariaLabel={`${s.label} withdrawal (kL)`}
              onChange={(v) => setWithdrawal(year, s.key, v)}
            />
          ))}

          {/* Discharge by destination */}
          <SectionHeader title="Discharge by destination" sub="Where effluent and used water goes after leaving the site." total={w.dischargeKl} />
          {DISCHARGE_DESTS.map((d) => (
            <SourceRow
              key={d.key}
              emoji={d.emoji}
              label={d.label}
              hint={d.hint}
              unit="kL"
              value={w.dischargeByDest?.[d.key] ?? 0}
              ariaLabel={`${d.label} discharge (kL)`}
              onChange={(v) => setDischarge(year, d.key, v)}
            />
          ))}

          {/* Consumption */}
          <SectionHeader title="Consumption" sub="Water not returned — evaporated, embedded in product, or lost in the process." total={w.consumptionKl} />
          <div className="rounded-xl2 border border-line/60 bg-surface px-4 py-3 flex flex-wrap items-center gap-3">
            <IconTile emoji="♨️" bg="#EAF6FE" />
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink">Water consumption</span>
              <span className="block text-xs text-ink-soft">
                Calculated from your entries: withdrawal − discharge = <strong className="text-ink tabular-nums">{fmt(suggested)} kL</strong>
              </span>
            </div>
            <span className="flex items-center gap-2 shrink-0">
              {w.consumptionKl !== suggested && (
                <button
                  onClick={() => setConsumption(year, suggested)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-line bg-surface-muted px-2.5 py-2 text-ink-soft hover:text-ink hover:border-brand-300 transition-colors"
                >
                  <Calculator size={13} /> Use calculated
                </button>
              )}
              <input
                type="number"
                min={0}
                value={w.consumptionKl === 0 ? "" : w.consumptionKl}
                placeholder="0"
                aria-label="Water consumption (kL)"
                onChange={(e) => setConsumption(year, num(e.target.value))}
                className="w-36 border border-line rounded-lg px-3 py-2 text-sm bg-white tabular-nums text-right focus:outline-none focus:border-brand-400"
              />
              <span className="text-xs font-bold text-ink-faint w-6">kL</span>
            </span>
          </div>

          <Collapsible title="How this is calculated">
            <div className="text-xs text-ink-soft space-y-2 leading-relaxed">
              <p><strong className="text-ink">Total withdrawal</strong> = surface + groundwater + third-party + seawater/desalinated + others = <strong className="text-ink tabular-nums">{fmt(w.withdrawalKl)} kL</strong>.</p>
              <p><strong className="text-ink">Total discharge</strong> = discharge to surface + groundwater + sea + third parties + others = <strong className="text-ink tabular-nums">{fmt(w.dischargeKl)} kL</strong>.</p>
              <p><strong className="text-ink">Consumption</strong> (GRI 303-5) = withdrawal − discharge = {fmt(w.withdrawalKl)} − {fmt(w.dischargeKl)} = <strong className="text-ink tabular-nums">{fmt(suggested)} kL</strong>. You can override it if you meter consumption directly (e.g. stored volumes change).</p>
              <p>These follow the BRSR Principle 6 / GRI 303 water-balance structure. The totals feed the Goals tab: withdrawal for reduction and intensity goals, consumption for water neutrality, discharge for zero liquid discharge.</p>
            </div>
          </Collapsible>
        </div>

        {/* Summary aside */}
        <aside className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-sky-500 via-sky-600 to-sky-800 text-white shadow-card-lg p-6 flex flex-col gap-4">
          <span aria-hidden className="absolute -right-12 -top-12 w-52 h-52 rounded-full bg-white/10" />
          <p className="relative text-[11px] uppercase tracking-wide font-bold text-white/80">Water balance · {fyLabel(year)}</p>
          <p className="relative text-[38px] leading-none font-extrabold tabular-nums">{fmt(w.withdrawalKl)} <span className="text-base font-semibold text-white/80">kL</span></p>
          <p className="relative -mt-2 text-xs text-white/70">total withdrawal, this financial year</p>

          <div className="relative flex flex-col gap-1.5">
            {WATER_SOURCES.map((s) => {
              const v = w.withdrawalBySource?.[s.key] ?? 0;
              if (v <= 0) return null;
              return (
                <div key={s.key} className="rounded-xl bg-white/12 ring-1 ring-white/10 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-semibold text-white/85">{s.emoji} {s.label}</span>
                    <span className="text-sm font-extrabold tabular-nums">{fmt(v)} <span className="text-[9px] font-medium text-white/70">kL · {share(v)}%</span></span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-white/25 overflow-hidden"><div className="h-full bg-white" style={{ width: `${share(v)}%` }} /></div>
                </div>
              );
            })}
          </div>

          <div className="relative grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/12 ring-1 ring-white/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Consumed</p>
              <p className="text-lg font-extrabold tabular-nums leading-tight">{fmt(w.consumptionKl)} <span className="text-[10px] font-medium text-white/70">kL</span></p>
            </div>
            <div className="rounded-xl bg-white/12 ring-1 ring-white/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Discharged</p>
              <p className="text-lg font-extrabold tabular-nums leading-tight">{fmt(w.dischargeKl)} <span className="text-[10px] font-medium text-white/70">kL</span></p>
            </div>
          </div>

          <div className="relative mt-auto pt-4 border-t border-white/20">
            <p className="text-xs text-white/80 leading-relaxed">This data is the baseline and actuals for your water goals — withdrawal cuts, water neutrality, zero liquid discharge.</p>
            <button
              onClick={onSetGoal}
              className="group mt-3 w-full inline-flex items-center justify-center gap-2 text-sm font-semibold rounded-xl bg-white text-sky-800 px-4 py-2.5 hover:bg-sky-50 transition-colors"
            >
              <Target size={15} /> Set a water goal
              <ChevronRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
