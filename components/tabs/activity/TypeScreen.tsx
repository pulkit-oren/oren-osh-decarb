"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import { CAT_DEFS, GRAD, CAT_ICON, ICON_COLOR, ELEC_TYPES, type Nav, type CatDef } from "./shared";
import { fmt, cn } from "@/lib/utils";
import { Zap } from "lucide-react";
import type { CombustionAsset } from "@/lib/model/types";
import type { Facility } from "@/lib/scope2/model/types";

type Props = {
  nav: Nav & { level: "type" };
  setNav: (n: Nav) => void;
  buReg: { mode: "central" | "bu"; units: { name: string; aggregate: boolean }[] };
  typesFor: (d: CatDef) => { key: string; label: string; gridEf?: number }[];
  typeAggTotal: (d: CatDef, t: { key: string; label: string }, cat?: "stationary" | "mobile") => number;
  entryFor: (d: CatDef, t: { key: string; label: string }, cat: "stationary" | "mobile" | undefined, bu: string) => CombustionAsset | Facility | undefined;
  emOfEntry: (d: CatDef, ex: CombustionAsset | Facility | undefined) => number;
  openEntry: (d: CatDef, t: { key: string; label: string; gridEf?: number }, cat: "stationary" | "mobile" | undefined, bu: string, agg: boolean) => void;
};

export function TypeScreen({ nav, setNav, buReg, typesFor, typeAggTotal, entryFor, emOfEntry, openEntry }: Props) {
  const def = CAT_DEFS.find((c) => c.key === nav.key)!;
  const t = typesFor(def).find((x) => x.key === nav.typeKey);
  if (!t) { setNav({ level: "cat", key: nav.key }); return null; }

  const TIcon = def.kind === "electricity" ? (ELEC_TYPES.find((e) => e.key === t.key)?.icon ?? Zap) : CAT_ICON[def.meta];
  const cat = nav.cat;
  const totalEm = typeAggTotal(def, t, cat);
  const central = buReg.mode === "central";
  const unitRows = [...buReg.units]
    .map((u) => { const ex = entryFor(def, t, cat, u.name); return { u, has: !!ex, co2: emOfEntry(def, ex) }; })
    .sort((a, b) => Number(b.has) - Number(a.has) || a.u.name.localeCompare(b.u.name));
  const withData = unitRows.filter((r) => r.has).length;
  const centralEx = entryFor(def, t, cat, "");

  return (
    <div key={`type-${nav.key}-${nav.typeKey}`} className="screen-in flex flex-col gap-5">
      <button onClick={() => setNav({ level: "cat", key: def.key })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to {def.label}</button>
      <div style={{ background: GRAD[def.meta] }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-4 flex items-center gap-3">
        <span className="w-12 h-12 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><TIcon size={26} strokeWidth={1.9} style={{ color: ICON_COLOR[def.meta] }} /></span>
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-extrabold text-ink leading-tight">{t.label}</h1><p className="text-sm font-medium text-ink-soft">{def.label}{cat ? ` · ${cat}` : ""} · {central ? "central" : "by business unit"}</p></div>
        <div className="text-right shrink-0"><div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Total emissions</div><div className="text-2xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(totalEm)}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div></div>
      </div>

      {central ? (
        <button onClick={() => openEntry(def, t, cat, "", true)} className="rounded-xl3 border border-line/60 bg-surface shadow-card p-5 flex items-center gap-3 text-left hover:border-brand-300 hover:shadow-card-lg transition-all w-full">
          <span className="w-10 h-10 rounded-xl bg-surface-muted grid place-items-center text-ink-soft font-bold shrink-0">C</span>
          <div className="min-w-0 flex-1"><span className="block font-semibold text-ink">Central (company-wide)</span><span className="text-xs text-ink-faint">{centralEx ? "Click to edit the figure" : "Click to enter the figure"}</span></div>
          <span className="text-sm font-semibold tabular-nums shrink-0">{fmt(emOfEntry(def, centralEx))} tCO₂e</span>
          <ChevronRight size={18} className="text-ink-faint shrink-0" />
        </button>
      ) : buReg.units.length === 0 ? (
        <div className="rounded-xl3 border border-dashed border-line/70 bg-surface-muted/40 p-6 text-center">
          <p className="text-sm text-ink-soft">No business units set up yet.</p>
          <button onClick={() => setNav({ level: "bus" })} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-3.5 py-2 hover:bg-brand-600 transition-colors">Set up business units</button>
        </div>
      ) : (
        <div className="rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-brand-50 to-transparent">
            <span className="text-sm font-semibold text-ink">{buReg.units.length} business unit{buReg.units.length === 1 ? "" : "s"}</span>
            <span className="text-xs text-ink-faint">{withData} with {t.label} data</span>
          </div>
          {unitRows.map(({ u, has, co2 }) => (
            <button
              key={u.name}
              onClick={() => openEntry(def, t, cat, u.name, u.aggregate)}
              title={has ? `${u.name} has ${t.label} data — click to edit.` : `${u.name} has no ${t.label} data yet — click to add.`}
              className="w-full flex items-center gap-3 px-4 py-3 border-t border-line/40 hover:bg-brand-50/30 transition-colors text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-surface-muted grid place-items-center text-ink-soft font-bold text-xs shrink-0">{u.name.charAt(0).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink truncate">{u.name}</span>
                  {has
                    ? <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-brand-50 text-brand-700">has {t.label}</span>
                    : <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-surface-muted text-ink-faint">no data</span>}
                </div>
                <span className={cn("text-[11px] font-semibold", u.aggregate ? "text-brand-700" : "text-amber-700")}>{u.aggregate ? "Aggregated" : "Excluded from total"}</span>
              </div>
              <span className="text-sm font-semibold tabular-nums shrink-0">{has ? `${fmt(co2)} t` : "—"}</span>
              <ChevronRight size={16} className="text-ink-faint shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
