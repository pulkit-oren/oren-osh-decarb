"use client";

import { ArrowLeft, ChevronRight, Settings } from "lucide-react";
import { CAT_DEFS, GRAD, CAT_ICON, ICON_COLOR, ELEC_TYPES, type Nav, type CatDef, unitLabel, showNum } from "./shared";
import { fmt, cn } from "@/lib/utils";
import { Zap } from "lucide-react";
import { FUELS } from "@/lib/model/factors";
import { refrigerantCO2e } from "@/lib/model/baseline";
import { fromRef, toRef } from "@/lib/unit-convert";
import type { CombustionAsset, FuelId, RefrigerantId, RefrigerationSystem } from "@/lib/model/types";
import type { Facility } from "@/lib/scope2/model/types";

type Props = {
  nav: Nav & { level: "type" };
  setNav: (n: Nav) => void;
  year: number;
  buReg: { mode: "central" | "bu"; units: { name: string; aggregate: boolean }[] };
  typesFor: (d: CatDef) => { key: string; label: string; gridEf?: number; gwp?: number }[];
  typeAggTotal: (d: CatDef, t: { key: string; label: string }, cat?: "stationary" | "mobile") => number;
  entryFor: (d: CatDef, t: { key: string; label: string }, cat: "stationary" | "mobile" | undefined, bu: string) => CombustionAsset | Facility | undefined;
  emOfEntry: (d: CatDef, ex: CombustionAsset | Facility | undefined) => number;
  openEntry: (d: CatDef, t: { key: string; label: string; gridEf?: number }, cat: "stationary" | "mobile" | undefined, bu: string, agg: boolean) => void;
  ensureEntry: (d: CatDef, t: { key: string; label: string; gridEf?: number }, cat: "stationary" | "mobile" | undefined, bu: string, agg: boolean) => string;
  ensureRefrigEntry: (gasId: RefrigerantId, bu: string, agg: boolean) => string;
  combById: (id: string) => CombustionAsset | undefined;
  facById: (id: string) => Facility | undefined;
  refrigSysById: (id: string) => RefrigerationSystem | undefined;
  selectedSystems: RefrigerationSystem[];
  updateCombustion: (year: number, id: string, patch: Partial<CombustionAsset>) => void;
  updateFacility: (year: number, id: string, patch: Partial<Facility>) => void;
  updateRefrigeration: (year: number, id: string, patch: Partial<RefrigerationSystem>) => void;
};

export function TypeScreen({ nav, setNav, year, buReg, typesFor, typeAggTotal, entryFor, emOfEntry, openEntry, ensureEntry, ensureRefrigEntry, combById, facById, refrigSysById, selectedSystems, updateCombustion, updateFacility, updateRefrigeration }: Props) {
  const def = CAT_DEFS.find((c) => c.key === nav.key)!;
  const t = typesFor(def).find((x) => x.key === nav.typeKey);
  if (!t) { setNav({ level: "cat", key: nav.key }); return null; }

  const TIcon = def.kind === "electricity" ? (ELEC_TYPES.find((e) => e.key === t.key)?.icon ?? Zap) : CAT_ICON[def.meta];
  const cat = nav.cat;
  const totalEm = typeAggTotal(def, t, cat);
  const central = buReg.mode === "central";

  // For refrigerant kind: look up systems by gasId + bu
  const refrigSysFor = (bu: string) => selectedSystems.find((sy) => (sy.bu ?? "") === bu && sy.refrigerant === (t.key as RefrigerantId));

  const unitRows = [...buReg.units]
    .map((u) => {
      if (def.kind === "refrigerant") {
        const sy = refrigSysFor(u.name);
        return { u, has: !!sy, co2: sy ? refrigerantCO2e(sy) : 0 };
      }
      const ex = entryFor(def, t, cat, u.name);
      return { u, has: !!ex, co2: emOfEntry(def, ex) };
    })
    .sort((a, b) => Number(b.has) - Number(a.has) || a.u.name.localeCompare(b.u.name));
  const withData = unitRows.filter((r) => r.has).length;

  // For central mode: refrigerant central system (bu="")
  const centralRefrigSys = def.kind === "refrigerant" ? refrigSysFor("") : undefined;
  const centralEx = def.kind === "refrigerant" ? undefined : entryFor(def, t, cat, "");

  return (
    <div key={`type-${nav.key}-${nav.typeKey}`} className="screen-in flex flex-col gap-5">
      <button onClick={() => setNav({ level: "cat", key: def.key })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to {def.label}</button>
      <div style={{ background: GRAD[def.meta] }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-4 flex items-center gap-3">
        <span className="w-12 h-12 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><TIcon size={26} strokeWidth={1.9} style={{ color: ICON_COLOR[def.meta] }} /></span>
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-extrabold text-ink leading-tight">{t.label}</h1><p className="text-sm font-medium text-ink-soft">{def.label}{cat ? ` · ${cat}` : ""} · {central ? "central" : "by business unit"}</p></div>
        <div className="text-right shrink-0"><div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Total emissions</div><div className="text-2xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(totalEm)}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div></div>
      </div>

      {def.kind === "refrigerant" ? (
        // ── Refrigerant per-BU rows ──────────────────────────────────────────
        central ? (
          // Central mode: single "Central" card for the gas
          <div className="rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-t border-line/40 hover:bg-brand-50/30 transition-colors">
              <span className="w-8 h-8 rounded-lg bg-surface-muted grid place-items-center text-ink-soft font-bold text-xs shrink-0">C</span>
              <span className="min-w-0 flex-1 font-medium text-ink">Central (company-wide)</span>
              <input
                type="number"
                value={centralRefrigSys ? showNum(centralRefrigSys.toppedUpKg) : 0}
                onChange={(e) => {
                  const id = ensureRefrigEntry(t.key as RefrigerantId, "", true);
                  updateRefrigeration(year, id, { toppedUpKg: Number(e.target.value) });
                }}
                className="w-28 text-right tabular-nums rounded-lg border border-brand-200 bg-brand-50/50 px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400 focus:bg-white"
                aria-label={`Central ${t.label} topped up`}
              />
              <span className="text-xs text-ink-faint w-12 shrink-0">kg</span>
              <span className="w-20 text-right text-sm font-semibold tabular-nums shrink-0">
                {centralRefrigSys ? `${fmt(refrigerantCO2e(centralRefrigSys))} t` : "—"}
              </span>
            </div>
          </div>
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
            {unitRows.map(({ u }) => {
              const sy = refrigSysFor(u.name);
              const shownVal = sy ? showNum(sy.toppedUpKg) : 0;
              const co2 = sy ? refrigerantCO2e(sy) : 0;
              return (
                <div key={u.name} className="group flex items-center gap-3 px-4 py-3 border-t border-line/40 hover:bg-brand-50/30 transition-colors">
                  <span className="w-8 h-8 rounded-lg bg-surface-muted grid place-items-center text-ink-soft font-bold text-xs shrink-0">{u.name.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 font-medium text-ink truncate">{u.name}</span>
                  <input
                    type="number"
                    value={shownVal}
                    onChange={(e) => {
                      const id = ensureRefrigEntry(t.key as RefrigerantId, u.name, u.aggregate);
                      updateRefrigeration(year, id, { toppedUpKg: Number(e.target.value) });
                    }}
                    className="w-28 text-right tabular-nums rounded-lg border border-brand-200 bg-brand-50/50 px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400 focus:bg-white"
                    aria-label={`${u.name} ${t.label} topped up`}
                  />
                  <span className="text-xs text-ink-faint w-12 shrink-0">kg</span>
                  <span className="w-20 text-right text-sm font-semibold tabular-nums shrink-0">{sy ? `${fmt(co2)} t` : "—"}</span>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        const id = ensureRefrigEntry(t.key as RefrigerantId, u.name, u.aggregate);
                        const cur = refrigSysById(id) ?? { excluded: !u.aggregate };
                        updateRefrigeration(year, id, { excluded: !cur.excluded });
                      }}
                      aria-label={`Include ${u.name} in central total`}
                      title={sy && !sy.excluded ? "Counted in the company total — click to exclude" : "Not in the company total — click to include"}
                      className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 border", sy && !sy.excluded ? "bg-brand-50 text-brand-700 border-brand-200" : "bg-surface-muted text-ink-faint border-line")}
                    >{sy && !sy.excluded ? "✓ central" : "central"}</button>
                    <button
                      onClick={() => {
                        const id = ensureRefrigEntry(t.key as RefrigerantId, u.name, u.aggregate);
                        setNav({ level: "entry", kind: "combustion", id });
                      }}
                      aria-label={`${u.name} details`}
                      className="p-1.5 rounded-lg text-ink-faint hover:text-brand-600 hover:bg-brand-50"
                    ><Settings size={15} /></button>
                  </div>
                  {sy?.excluded && <span className="text-[10px] text-amber-700 shrink-0">Excluded from total</span>}
                </div>
              );
            })}
          </div>
        )
      ) : central ? (
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
          {def.kind === "electricity" ? (
            // ── Electricity BU rows ─────────────────────────────────────────
            unitRows.map(({ u, has, co2 }) => {
              const ex = entryFor(def, t, cat, u.name) as Facility | undefined;
              const shownVal = ex ? showNum(ex.annualLoadKwh) : 0;
              return (
                <div key={u.name} className="group flex items-center gap-3 px-4 py-3 border-t border-line/40 hover:bg-brand-50/30 transition-colors">
                  <span className="w-8 h-8 rounded-lg bg-surface-muted grid place-items-center text-ink-soft font-bold text-xs shrink-0">{u.name.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 font-medium text-ink truncate">{u.name}</span>
                  <input
                    type="number"
                    value={shownVal}
                    onChange={(e) => {
                      const id = ensureEntry(def, t, cat, u.name, u.aggregate);
                      updateFacility(year, id, { annualLoadKwh: Number(e.target.value) });
                    }}
                    className="w-28 text-right tabular-nums rounded-lg border border-brand-200 bg-brand-50/50 px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400 focus:bg-white"
                    aria-label={`${u.name} ${t.label} consumption`}
                  />
                  <span className="text-xs text-ink-faint w-12 shrink-0">kWh</span>
                  <span className="w-20 text-right text-sm font-semibold tabular-nums shrink-0">{has ? `${fmt(co2)} t` : "—"}</span>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        const id = ensureEntry(def, t, cat, u.name, u.aggregate);
                        const cur = facById(id) ?? { excluded: !u.aggregate };
                        updateFacility(year, id, { excluded: !cur.excluded });
                      }}
                      aria-label={`Include ${u.name} in central total`}
                      title={ex && !ex.excluded ? "Counted in the company total — click to exclude" : "Not in the company total — click to include"}
                      className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 border", ex && !ex.excluded ? "bg-brand-50 text-brand-700 border-brand-200" : "bg-surface-muted text-ink-faint border-line")}
                    >{ex && !ex.excluded ? "✓ central" : "central"}</button>
                    <button
                      onClick={() => {
                        const id = ensureEntry(def, t, cat, u.name, u.aggregate);
                        setNav({ level: "entry", kind: "facility", id });
                      }}
                      aria-label={`${u.name} details`}
                      className="p-1.5 rounded-lg text-ink-faint hover:text-brand-600 hover:bg-brand-50"
                    ><Settings size={15} /></button>
                  </div>
                  {ex?.excluded && <span className="text-[10px] text-amber-700 shrink-0">Excluded from total</span>}
                </div>
              );
            })
          ) : (
            // ── Fuel BU rows ────────────────────────────────────────────────
            unitRows.map(({ u, has, co2 }) => {
              const ex = entryFor(def, t, cat, u.name) as CombustionAsset | undefined;
              const disp = (ex?.displayUnit ?? ex?.unit ?? FUELS[t.key as FuelId].unit);
              const shownVal = ex ? showNum(fromRef(ex.annualVolume, t.key as FuelId, disp)) : 0;
              return (
                <div key={u.name} className="group flex items-center gap-3 px-4 py-3 border-t border-line/40 hover:bg-brand-50/30 transition-colors">
                  <span className="w-8 h-8 rounded-lg bg-surface-muted grid place-items-center text-ink-soft font-bold text-xs shrink-0">{u.name.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 font-medium text-ink truncate">{u.name}</span>
                  <input
                    type="number"
                    value={shownVal}
                    onChange={(e) => {
                      const id = ensureEntry(def, t, cat, u.name, u.aggregate);
                      updateCombustion(year, id, { annualVolume: toRef(Number(e.target.value), t.key as FuelId, disp) });
                    }}
                    className="w-28 text-right tabular-nums rounded-lg border border-brand-200 bg-brand-50/50 px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400 focus:bg-white"
                    aria-label={`${u.name} ${t.label} consumption`}
                  />
                  <span className="text-xs text-ink-faint w-12 shrink-0">{unitLabel(disp)}</span>
                  <span className="w-20 text-right text-sm font-semibold tabular-nums shrink-0">{has ? `${fmt(co2)} t` : "—"}</span>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        const id = ensureEntry(def, t, cat, u.name, u.aggregate);
                        const cur = combById(id) ?? { excluded: !u.aggregate };
                        updateCombustion(year, id, { excluded: !cur.excluded });
                      }}
                      aria-label={`Include ${u.name} in central total`}
                      title={ex && !ex.excluded ? "Counted in the company total — click to exclude" : "Not in the company total — click to include"}
                      className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 border", ex && !ex.excluded ? "bg-brand-50 text-brand-700 border-brand-200" : "bg-surface-muted text-ink-faint border-line")}
                    >{ex && !ex.excluded ? "✓ central" : "central"}</button>
                    <button
                      onClick={() => {
                        const id = ensureEntry(def, t, cat, u.name, u.aggregate);
                        setNav({ level: "entry", kind: "combustion", id });
                      }}
                      aria-label={`${u.name} details`}
                      className="p-1.5 rounded-lg text-ink-faint hover:text-brand-600 hover:bg-brand-50"
                    ><Settings size={15} /></button>
                  </div>
                  {ex?.excluded && <span className="text-[10px] text-amber-700 shrink-0">Excluded from total</span>}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
