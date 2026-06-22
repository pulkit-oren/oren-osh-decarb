"use client";

import { ArrowLeft, ChevronRight, ChevronDown, Check } from "lucide-react";
import { useState } from "react";
import { CAT_DEFS, META, GRAD, CAT_ICON, ICON_COLOR, ELEC_TYPES, ScopeBadge, type Nav, type CatKey, type CatDef, type Sel } from "./shared";
import { FUELS, FUELS_BY_CATEGORY } from "@/lib/model/factors";
import { fuelFamily, type FuelFamily } from "@/lib/activity-groups";
import { fmt, cn } from "@/lib/utils";
import { DetailPanel } from "../DataInputTab";
import type { FuelId, RefrigerationSystem } from "@/lib/model/types";
import { Zap } from "lucide-react";
import { IconTile, unitLabel } from "./shared";

type Props = {
  nav: Nav & { level: "cat" };
  setNav: (n: Nav) => void;
  year: number;
  buReg: { mode: "central" | "bu"; units: { name: string; aggregate: boolean }[] };
  sel: Sel;
  setSel: (s: Sel) => void;
  typesFor: (d: CatDef) => { key: string; label: string; gridEf?: number; gwp?: number }[];
  typeAggTotal: (d: CatDef, t: { key: string; label: string }, cat?: "stationary" | "mobile") => number;
  catTotal: (d: CatDef) => number;
  nWithData: (d: CatDef, t: { key: string; label: string }, cat?: "stationary" | "mobile") => number;
  // gas list passed from container
  refrigGases: { key: string; label: string; gwp: number }[];
  // store access for refrigerant ops
  selectedSystems: RefrigerationSystem[];
  updateRefrigeration: (year: number, id: string, patch: Partial<RefrigerationSystem>) => void;
  delRefrigeration: (year: number, id: string) => void;
  co2Ref: (id: string) => number;
};

export function CategoryScreen({ nav, setNav, year, buReg, sel, setSel, typesFor, typeAggTotal, catTotal, nWithData, refrigGases, selectedSystems, updateRefrigeration, delRefrigeration, co2Ref }: Props) {
  const [catMode, setCatMode] = useState<"stationary" | "mobile">("stationary");
  const [fuelFilter, setFuelFilter] = useState<Set<string>>(new Set());
  const [fuelMenuOpen, setFuelMenuOpen] = useState(false);

  const def = CAT_DEFS.find((c) => c.key === nav.key)!;
  const m = META[def.meta];
  const CatIcon = CAT_ICON[def.meta];

  const fuelsInFamily = (fam: FuelFamily) =>
    (Object.keys(FUELS) as FuelId[]).filter((id) => fuelFamily(id) === fam).map((id) => ({ id, label: FUELS[id].label }));

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

      {def.kind === "refrigerant" ? (
        <>
          <p className="text-xs text-ink-soft -mt-1">Each refrigerant shows its total fugitive emissions, aggregated from the business units. Click one to add units &amp; enter topped-up kg.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {refrigGases.map((r) => {
              const totalEm = typeAggTotal(def, { key: r.key, label: r.label });
              const nbu = nWithData(def, { key: r.key, label: r.label });
              return (
                <button key={r.key} onClick={() => setNav({ level: "type", key: def.key, typeKey: r.key })} style={{ background: GRAD[def.meta] }} className="group rounded-xl3 border border-white/60 shadow-card p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-card-lg hover:ring-2 hover:ring-white/80">
                  <div className="flex items-start justify-between gap-2">
                    <span className="w-12 h-12 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center transition-all group-hover:bg-white/85 group-hover:scale-105"><CatIcon size={24} strokeWidth={1.9} style={{ color: ICON_COLOR[def.meta] }} /></span>
                    <div className="text-right"><div className="text-[9px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div><div className="text-lg font-extrabold tabular-nums text-ink leading-none mt-0.5">{fmt(totalEm)}<span className="text-[10px] text-ink-soft"> t</span></div></div>
                  </div>
                  <div className="mt-3 text-sm font-bold text-ink leading-tight">{r.label}</div>
                  <div className="text-[10px] text-ink-soft mt-0.5">GWP {r.gwp.toLocaleString()}</div>
                  <div className="text-[11px] text-ink-soft mt-0.5 inline-flex items-center gap-0.5">{buReg.mode === "central" ? "Central" : `${nbu}/${buReg.units.length} BUs`} <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" /></div>
                </button>
              );
            })}
          </div>
        </>
      ) : def.kind === "electricity" ? (
        <>
          <p className="text-xs text-ink-soft -mt-1">Each source shows its total emissions, aggregated from the business units. Click one to add units &amp; enter values.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {typesFor(def).map((t) => {
              const TIcon = ELEC_TYPES.find((e) => e.key === t.key)?.icon ?? Zap;
              const totalEm = typeAggTotal(def, t);
              const nbu = nWithData(def, t);
              return (
                <button key={t.key} onClick={() => setNav({ level: "type", key: def.key, typeKey: t.key })} style={{ background: GRAD[def.meta] }} className="group rounded-xl3 border border-white/60 shadow-card p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-card-lg hover:ring-2 hover:ring-white/80">
                  <div className="flex items-start justify-between gap-2">
                    <span className="w-12 h-12 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center transition-all group-hover:bg-white/85 group-hover:scale-105"><TIcon size={24} strokeWidth={1.9} style={{ color: ICON_COLOR[def.meta] }} /></span>
                    <div className="text-right"><div className="text-[9px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div><div className="text-lg font-extrabold tabular-nums text-ink leading-none mt-0.5">{fmt(totalEm)}<span className="text-[10px] text-ink-soft"> t</span></div></div>
                  </div>
                  <div className="mt-3 text-sm font-bold text-ink leading-tight">{t.label}</div>
                  <div className="text-[11px] text-ink-soft mt-0.5 inline-flex items-center gap-0.5">{buReg.mode === "central" ? "Central" : `${nbu}/${buReg.units.length} BUs`} <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" /></div>
                </button>
              );
            })}
          </div>
        </>
      ) : (() => {
        const famFuels = fuelsInFamily(def.key as FuelFamily).filter((f) => FUELS_BY_CATEGORY[catMode].includes(f.id));
        const shown = fuelFilter.size === 0 ? famFuels : famFuels.filter((f) => fuelFilter.has(f.id));
        return (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="inline-flex gap-1 rounded-full bg-surface-muted p-1 w-fit">
                {(["stationary", "mobile"] as const).map((mode) => (
                  <button key={mode} onClick={() => { setCatMode(mode); setFuelFilter(new Set()); }} title={mode === "stationary" ? "Stationary — fuel burned by fixed equipment that stays in one place: boilers, generators, ovens, furnaces, process heaters." : "Mobile — fuel burned by things that move: cars, trucks, forklifts, buses, ships."} className={cn("px-5 py-2 rounded-full text-sm font-semibold capitalize transition-colors", catMode === mode ? "bg-surface text-brand-700 shadow-card" : "text-ink-soft hover:text-ink")}>{mode}</button>
                ))}
              </div>
              {famFuels.length > 0 && (
                <div className="relative">
                  <button onClick={() => setFuelMenuOpen((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg border border-line bg-surface px-3 py-2 hover:border-brand-300 transition-colors">
                    {fuelFilter.size === 0 ? "All fuels" : `${fuelFilter.size} fuel${fuelFilter.size === 1 ? "" : "s"}`} <ChevronDown size={14} className={cn("transition-transform", fuelMenuOpen && "rotate-180")} />
                  </button>
                  {fuelMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setFuelMenuOpen(false)} aria-hidden />
                      <div className="pop-in absolute right-0 mt-2 w-56 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface shadow-card-lg z-50 p-1.5">
                        <button onClick={() => setFuelFilter(new Set())} className={cn("w-full text-left rounded-lg px-2.5 py-2 text-sm font-medium flex items-center gap-2", fuelFilter.size === 0 ? "bg-brand-50 text-brand-700" : "hover:bg-surface-muted")}>{fuelFilter.size === 0 ? <Check size={14} /> : <span className="w-3.5" />}All fuels</button>
                        {famFuels.map((f) => { const on = fuelFilter.has(f.id); return (
                          <button key={f.id} onClick={() => setFuelFilter((prev) => { const n = new Set(prev); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })} className={cn("w-full text-left rounded-lg px-2.5 py-2 text-sm flex items-center gap-2", on ? "bg-brand-50 text-brand-700 font-semibold" : "hover:bg-surface-muted")}>{on ? <Check size={14} /> : <span className="w-3.5" />}{f.label}</button>
                        ); })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-ink-soft -mt-1">{catMode === "stationary" ? "Fixed equipment (boilers, gensets, ovens…)." : "Vehicles & movable machines (fleet, forklifts…)."} Click a fuel to add business units &amp; enter values.</p>
            {shown.length === 0 ? (
              <p className="text-sm text-ink-faint">No {catMode} fuels available in this group.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {shown.map((f) => {
                  const totalEm = typeAggTotal(def, { key: f.id, label: f.label }, catMode);
                  const nbu = nWithData(def, { key: f.id, label: f.label }, catMode);
                  return (
                    <button key={f.id} onClick={() => setNav({ level: "type", key: def.key, typeKey: f.id, cat: catMode })} style={{ background: GRAD[def.meta] }} className="group rounded-xl3 border border-white/60 shadow-card p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-card-lg hover:ring-2 hover:ring-white/80">
                      <div className="flex items-start justify-between gap-2">
                        <span className="w-12 h-12 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center transition-all group-hover:bg-white/85 group-hover:scale-105"><CatIcon size={24} strokeWidth={1.9} style={{ color: ICON_COLOR[def.meta] }} /></span>
                        <div className="text-right"><div className="text-[9px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div><div className="text-lg font-extrabold tabular-nums text-ink leading-none mt-0.5">{fmt(totalEm)}<span className="text-[10px] text-ink-soft"> t</span></div></div>
                      </div>
                      <div className="mt-3 text-sm font-bold text-ink leading-tight">{f.label}</div>
                      <div className="text-[11px] text-ink-soft mt-0.5 inline-flex items-center gap-0.5">{buReg.mode === "central" ? "Central" : `${nbu}/${buReg.units.length} BUs`} <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" /></div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        );
      })()}

      {sel?.kind === "refrigerant" && (() => {
        const sys = selectedSystems.find((s) => s.id === sel.id);
        return sys ? <DetailPanel onClose={() => setSel(null)} refrigerant={sys} year={year} /> : null;
      })()}
    </div>
  );
}
