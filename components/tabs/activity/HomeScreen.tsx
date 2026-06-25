"use client";

import { Leaf, ChevronRight } from "lucide-react";
import { CAT_DEFS, GRAD, CAT_ICON, ICON_COLOR, type Nav, type CatKey, type CatDef } from "./shared";
import { fyLabel, type FY_YEARS } from "@/lib/model/types";
import { fmt } from "@/lib/utils";

type Props = {
  year: number;
  setYear: (y: number) => void;
  fyYears: readonly number[];
  nav: Nav;
  setNav: (n: Nav) => void;
  openCat: (key: CatKey) => void;
  countOf: (key: CatKey) => number;
  catTotal: (d: CatDef) => number;
  scope1T: number;
  scope2T: number;
  biogenicRows: { a: unknown; t: number }[];
  biogenicT: number;
  confidence: { measuredPct: number };
  totalSources: number;
  buReg: { units: { name: string; aggregate: boolean }[] };
};

export function HomeScreen({ year, setYear, fyYears, setNav, openCat, countOf, catTotal, scope1T, scope2T, biogenicRows, biogenicT, confidence, totalSources, buReg }: Props) {
  const total = scope1T + scope2T;
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-10rem)]">
      <div className="rounded-xl3 border border-line/50 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60 px-5 py-4 flex flex-wrap items-end justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-extrabold text-ink">Activity data</h1>
          <p className="text-sm text-ink-soft">Pick a category to enter your sources — Scope 1 &amp; 2 in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setNav({ level: "bus" })} className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg border border-line bg-surface px-3 py-1.5 hover:border-brand-300 transition-colors">
            🏢 Business units{buReg.units.length > 0 ? ` · ${buReg.units.length}` : ""}
          </button>
          <label className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Financial year</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400">
              {fyYears.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-5 items-stretch lg:flex-1 lg:min-h-0">
        <div className="flex flex-col gap-3 min-h-0">
          {CAT_DEFS.map((def) => {
            const n = countOf(def.key);
            const Icon = CAT_ICON[def.meta];
            return (
              <button key={def.key} onClick={() => openCat(def.key)} style={{ background: GRAD[def.meta] }} className="group flex items-center gap-4 rounded-xl3 border border-white/60 shadow-card px-5 text-left flex-1 min-h-[72px] transition-all duration-200 hover:-translate-y-1 hover:shadow-card-lg hover:ring-2 hover:ring-white/80">
                <span className="w-12 h-12 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0 transition-all group-hover:bg-white/85 group-hover:scale-105">
                  <Icon size={24} strokeWidth={1.9} style={{ color: ICON_COLOR[def.meta] }} />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-xl font-extrabold text-ink truncate">{def.label}</span>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-xs text-ink-soft">{n} source{n === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <div className="text-right shrink-0 mr-1">
                  <div className="text-[9px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div>
                  <div className="text-base font-extrabold tabular-nums text-ink">{fmt(catTotal(def))}<span className="text-[10px] text-ink-soft"> t</span></div>
                </div>
                <ChevronRight size={20} className="text-ink-soft/70 group-hover:text-ink group-hover:translate-x-1 transition-all shrink-0" />
              </button>
            );
          })}
          {biogenicRows.length > 0 && (
            <button onClick={() => setNav({ level: "biogenic" })} className="group rounded-xl3 border border-dashed border-line/70 bg-surface-muted/40 px-5 py-2.5 shrink-0 text-left w-full hover:border-brand-300 hover:bg-surface-muted/70 transition-colors">
              <div className="flex items-center gap-2">
                <Leaf size={16} className="text-brand-600 shrink-0" />
                <span className="font-semibold text-ink text-sm">Outside of Scopes — Biogenic CO₂</span>
                <span className="ml-auto text-base font-extrabold tabular-nums">{fmt(biogenicT)} <span className="text-xs font-normal text-ink-faint">t</span></span>
                <ChevronRight size={16} className="text-ink-faint group-hover:text-ink group-hover:translate-x-0.5 transition-all shrink-0" />
              </div>
              <div className="mt-0.5 ml-6 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">View breakdown</div>
            </button>
          )}
        </div>

        <aside className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 text-white shadow-card-lg p-6 flex flex-col">
          <span aria-hidden className="absolute -right-12 -top-12 w-52 h-52 rounded-full bg-white/10" />
          <span aria-hidden className="absolute -left-12 bottom-8 w-40 h-40 rounded-full bg-white/5" />
          <p className="relative text-[11px] uppercase tracking-wide font-bold text-white/80">Total footprint · {fyLabel(year)}</p>
          <p className="relative mt-3 text-[44px] leading-none font-extrabold tabular-nums">{fmt(total)} <span className="text-lg font-semibold text-white/80">tCO₂e</span></p>
          <p className="relative mt-1 text-xs text-white/70">Scope 1 + Scope 2, this financial year</p>
          <div className="relative mt-6 flex flex-col gap-3">
            <button onClick={() => setNav({ level: "scope", scope: 1 })} aria-label="Scope 1 details" className="group rounded-2xl bg-white/12 ring-1 ring-white/10 backdrop-blur-sm px-4 py-3 text-left w-full cursor-pointer hover:bg-white/20 hover:ring-white/40 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold inline-flex items-center gap-1">Scope 1 <ChevronRight size={14} className="text-white/70 group-hover:translate-x-0.5 transition-transform" /></span>
                <span className="text-xs text-white/75">{share(scope1T)}%</span>
              </div>
              <div className="text-2xl font-extrabold tabular-nums mt-0.5">{fmt(scope1T)} <span className="text-xs font-medium text-white/75">tCO₂e</span></div>
              <div className="mt-2 h-1.5 rounded-full bg-white/25 overflow-hidden"><div className="h-full bg-white transition-all duration-500" style={{ width: `${share(scope1T)}%` }} /></div>
              <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/60">View breakdown</div>
            </button>
            <button onClick={() => setNav({ level: "scope", scope: 2 })} aria-label="Scope 2 details" className="group rounded-2xl bg-white/12 ring-1 ring-white/10 backdrop-blur-sm px-4 py-3 text-left w-full cursor-pointer hover:bg-white/20 hover:ring-white/40 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold inline-flex items-center gap-1">Scope 2 <ChevronRight size={14} className="text-white/70 group-hover:translate-x-0.5 transition-transform" /></span>
                <span className="text-xs text-white/75">{share(scope2T)}%</span>
              </div>
              <div className="text-2xl font-extrabold tabular-nums mt-0.5">{fmt(scope2T)} <span className="text-xs font-medium text-white/75">tCO₂e</span></div>
              <div className="mt-2 h-1.5 rounded-full bg-white/25 overflow-hidden"><div className="h-full bg-white transition-all duration-500" style={{ width: `${share(scope2T)}%` }} /></div>
              <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/60">View breakdown</div>
            </button>
          </div>
          <div className="relative mt-auto pt-5 border-t border-white/20 grid grid-cols-3 gap-2 text-center">
            <div><p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Measured</p><p className="text-2xl font-extrabold tabular-nums leading-tight">{Math.round(confidence.measuredPct * 100)}%</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Sources</p><p className="text-2xl font-extrabold tabular-nums leading-tight">{totalSources}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Categories</p><p className="text-2xl font-extrabold tabular-nums leading-tight">{CAT_DEFS.filter((d) => countOf(d.key) > 0).length}<span className="text-sm font-medium text-white/70">/{CAT_DEFS.length}</span></p></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
