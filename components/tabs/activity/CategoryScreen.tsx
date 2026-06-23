"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import { CAT_DEFS, META, GRAD, CAT_ICON, ICON_COLOR, ELEC_TYPES, ScopeBadge, type Nav, type CatKey, type CatDef } from "./shared";
import { fmt, cn } from "@/lib/utils";
import { Zap } from "lucide-react";

type Props = {
  nav: Nav & { level: "cat" };
  setNav: (n: Nav) => void;
  year: number;
  buReg: { units: { name: string; aggregate: boolean }[] };
  catTotal: (d: CatDef) => number;
  // electricity BU helpers
  buElecEmissions: (bu: string) => number;
  elecBuExcluded: (bu: string) => boolean;
  toggleElecCentral: (bu: string, agg: boolean) => void;
};

export function CategoryScreen({ nav, setNav, year, buReg, catTotal, buElecEmissions, elecBuExcluded, toggleElecCentral }: Props) {
  const def = CAT_DEFS.find((c) => c.key === nav.key)!;
  const m = META[def.meta];
  const CatIcon = CAT_ICON[def.meta];

  return (
    <div key={`cat-${def.key}`} className="screen-in flex flex-col gap-5">
      <button onClick={() => setNav({ level: "home" })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> All activity data</button>
      <div style={{ background: GRAD[def.meta] }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-4 flex items-center gap-4">
        <span className="w-12 h-12 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><CatIcon size={26} strokeWidth={1.9} style={{ color: ICON_COLOR[def.meta] }} /></span>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-ink leading-tight">{def.label}</h1>
          <div className="mt-1"><ScopeBadge scope={def.scope} /></div>
        </div>
        <div className="text-right shrink-0"><div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Total emissions</div><div className="text-2xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(catTotal(def))}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div></div>
      </div>

      <div className="rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-brand-50 to-transparent">
          <span className="text-sm font-semibold text-ink">{buReg.units.length + 1} row{buReg.units.length === 0 ? "" : "s"} (all BUs + overall)</span>
          <span className="text-xs text-ink-faint">Purchased · VPPA · Solar · I-REC per BU</span>
        </div>

        {/* Company-wide row */}
        <div className="group flex items-center gap-3 px-4 py-3 border-t border-line/40 hover:bg-brand-50/30 transition-colors">
          <span className="w-8 h-8 rounded-lg bg-surface-muted grid place-items-center text-ink-soft font-bold text-xs shrink-0">C</span>
          <button onClick={() => setNav({ level: "elecbu", bu: "" })} className="min-w-0 flex-1 text-left font-medium text-ink truncate">Company-wide</button>
          <span className="w-20 text-right text-sm font-semibold tabular-nums shrink-0">{fmt(buElecEmissions(""))} t</span>
          <button onClick={() => setNav({ level: "elecbu", bu: "" })} aria-label="Open company electricity" className="shrink-0"><ChevronRight size={16} className="text-ink-faint" /></button>
        </div>

        {/* Per-BU rows */}
        {buReg.units.map((u) => {
          const ex = elecBuExcluded(u.name);
          return (
            <div key={u.name} className="group flex items-center gap-3 px-4 py-3 border-t border-line/40 hover:bg-brand-50/30 transition-colors">
              <span className="w-8 h-8 rounded-lg bg-surface-muted grid place-items-center text-ink-soft font-bold text-xs shrink-0">{u.name.charAt(0).toUpperCase()}</span>
              <button onClick={() => setNav({ level: "elecbu", bu: u.name })} className="min-w-0 flex-1 text-left font-medium text-ink truncate">{u.name}</button>
              <span className="w-20 text-right text-sm font-semibold tabular-nums shrink-0">{fmt(buElecEmissions(u.name))} t</span>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => toggleElecCentral(u.name, u.aggregate)} aria-label={`Include ${u.name} in central total`} className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 border", !ex ? "bg-brand-50 text-brand-700 border-brand-200" : "bg-surface-muted text-ink-faint border-line")}>{!ex ? "✓ central" : "central"}</button>
              </div>
              <button onClick={() => setNav({ level: "elecbu", bu: u.name })} aria-label={`${u.name} electricity`} className="shrink-0"><ChevronRight size={16} className="text-ink-faint" /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
