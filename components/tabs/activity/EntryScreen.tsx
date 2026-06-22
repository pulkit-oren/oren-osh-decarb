"use client";

import { ArrowLeft } from "lucide-react";
import { GRAD, CAT_ICON, ICON_COLOR, ELEC_TYPES, showNum, unitLabel, type Nav } from "./shared";
import { FUELS } from "@/lib/model/factors";
import { combustionCO2e } from "@/lib/model/baseline";
import { fuelFamily } from "@/lib/activity-groups";
import { displayUnits, fromRef, toRef } from "@/lib/unit-convert";
import { fyLabel, type FuelUnit } from "@/lib/model/types";
import { fmt } from "@/lib/utils";
import { CombustionDetails, CombustionCalc } from "../DataInputTab";
import { FacilityDetailContent } from "../../scope2/DataInputTab";
import type { CombustionAsset } from "@/lib/model/types";
import type { Facility } from "@/lib/scope2/model/types";
import { CAT_DEFS } from "./shared";
import { Zap } from "lucide-react";

type Props = {
  nav: Nav & { level: "entry" };
  setNav: (n: Nav) => void;
  year: number;
  combById: (id: string) => CombustionAsset | undefined;
  facById: (id: string) => Facility | undefined;
  updateCombustion: (year: number, id: string, patch: Partial<CombustionAsset>) => void;
  updateFacility: (year: number, id: string, patch: Partial<Facility>) => void;
  co2Fac: (id: string) => number;
};

export function EntryScreen({ nav, setNav, year, combById, facById, updateCombustion, updateFacility, co2Fac }: Props) {
  /* ---- Electricity (facility) entry ---- */
  if (nav.kind === "facility") {
    const f = facById(nav.id);
    if (!f) { setNav({ level: "home" }); return null; }
    const ElecIcon = CAT_ICON.electricity ?? Zap;
    return (
      <div key={`fac-${f.id}`} className="screen-in flex flex-col gap-5">
        <button onClick={() => setNav({ level: "type", key: "electricity", typeKey: ELEC_TYPES.find((e) => e.label === f.name)?.key ?? "grid" })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to {f.name}</button>
        <div style={{ background: GRAD.electricity }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4">
          <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><ElecIcon size={28} strokeWidth={1.9} style={{ color: ICON_COLOR.electricity }} /></span>
          <div className="min-w-0 flex-1">
            <input value={f.name} onChange={(e) => updateFacility(year, f.id, { name: e.target.value })} className="w-full text-2xl font-extrabold text-ink bg-transparent border-b-2 border-transparent hover:border-ink/20 focus:border-ink/40 focus:outline-none" aria-label="Source name" />
            <p className="text-sm font-medium text-ink-soft mt-0.5">Electricity · Scope 2{f.bu ? ` · ${f.bu}` : ""} · {fyLabel(year)}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div>
            <div className="text-3xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(co2Fac(f.id))}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div className="flex flex-col gap-5">
            <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-4">Consumption</div>
              <div className="flex items-end gap-3">
                <input type="number" value={f.annualLoadKwh} onChange={(e) => updateFacility(year, f.id, { annualLoadKwh: Number(e.target.value) })} className="w-full text-4xl font-extrabold tabular-nums rounded-xl border-2 border-brand-200 bg-brand-50/40 px-4 py-3 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors" aria-label="Annual electricity" />
                <span className="rounded-xl border border-line bg-surface-muted px-4 py-4 text-base text-ink-soft">kWh</span>
              </div>
              <p className="text-xs text-ink-faint mt-3">Annual electricity drawn under this instrument.</p>
              <div className="mt-5 rounded-xl bg-surface-muted px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-ink-soft">This source emits</span>
                <span className="text-xl font-extrabold tabular-nums text-brand-600">{fmt(co2Fac(f.id))} tCO₂e</span>
              </div>
            </div>
            <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-3">How this is calculated</div>
              <p className="text-sm text-ink-soft">Location-based Scope 2 = load × grid emission factor.</p>
              <p className="mt-2 text-sm font-mono text-ink-soft break-words">{fmt(f.annualLoadKwh)} kWh × {f.gridEf} kgCO₂e/kWh ÷ 1,000</p>
              <p className="mt-1.5 text-lg font-extrabold text-ink">→ {fmt(co2Fac(f.id))} tCO₂e</p>
            </div>
          </div>
          <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
            <FacilityDetailContent f={f} year={year} locationT={co2Fac(f.id)} />
          </div>
        </div>
      </div>
    );
  }

  /* ---- Fuel (combustion) entry ---- */
  const a = combById(nav.id);
  if (!a) { setNav({ level: "home" }); return null; }
  const disp = a.displayUnit ?? a.unit;
  const fam = fuelFamily(a.fuelType) ?? "liquid";
  const Icon = CAT_ICON[fam] ?? CAT_ICON.liquid;
  const catLabel = CAT_DEFS.find((c) => c.key === fam)?.label ?? "fuels";
  return (
    <div key={`entry-${a.id}`} className="screen-in flex flex-col gap-5">
      <button onClick={() => setNav({ level: "type", key: fam, typeKey: a.fuelType, cat: a.category })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to {FUELS[a.fuelType].label}</button>
      <div style={{ background: GRAD[fam] }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4">
        <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><Icon size={28} strokeWidth={1.9} style={{ color: ICON_COLOR[fam] }} /></span>
        <div className="min-w-0 flex-1">
          <input value={a.name} onChange={(e) => updateCombustion(year, a.id, { name: e.target.value })} className="w-full text-2xl font-extrabold text-ink bg-transparent border-b-2 border-transparent hover:border-ink/20 focus:border-ink/40 focus:outline-none" aria-label="Source name" />
          <p className="text-sm font-medium text-ink-soft mt-0.5">{FUELS[a.fuelType].label} · {catLabel}{a.bu ? ` · ${a.bu}` : ""} · {fyLabel(year)}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div>
          <div className="text-3xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(combustionCO2e(a))}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <div className="flex flex-col gap-5">
          <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-4">Consumption</div>
            <div className="flex items-end gap-3">
              <input type="number" value={showNum(fromRef(a.annualVolume, a.fuelType, disp))} onChange={(e) => updateCombustion(year, a.id, { annualVolume: toRef(Number(e.target.value), a.fuelType, disp) })} className="w-full text-4xl font-extrabold tabular-nums rounded-xl border-2 border-brand-200 bg-brand-50/40 px-4 py-3 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors" aria-label="Annual consumption" />
              <select value={disp} onChange={(e) => updateCombustion(year, a.id, { displayUnit: e.target.value as FuelUnit })} className="rounded-xl border border-line bg-white px-3 py-4 text-base cursor-pointer focus:outline-none focus:border-brand-400" aria-label="Unit">
                {displayUnits(a.fuelType).map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
              </select>
            </div>
            <p className="text-xs text-ink-faint mt-3">Annual {FUELS[a.fuelType].label.toLowerCase()} consumed.</p>
            <div className="mt-5 rounded-xl bg-surface-muted px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-ink-soft">This source emits</span>
              <span className="text-xl font-extrabold tabular-nums text-brand-600">{fmt(combustionCO2e(a))} tCO₂e</span>
            </div>
          </div>
          <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-3">How this is calculated</div>
            <CombustionCalc a={a} />
          </div>
        </div>
        <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
          <CombustionDetails a={a} year={year} showCalc={false} showSource={false} />
        </div>
      </div>
    </div>
  );
}
