"use client";

import { ArrowLeft, Snowflake } from "lucide-react";
import { GRAD, CAT_ICON, ICON_COLOR, showNum, unitLabel, type Nav } from "./shared";
import { FUELS, REFRIGERANTS } from "@/lib/model/factors";
import { combustionCO2e, refrigerantCO2e } from "@/lib/model/baseline";
import { fuelFamily } from "@/lib/activity-groups";
import { displayUnits, fromRef, toRef } from "@/lib/unit-convert";
import { fyLabel, type FuelUnit } from "@/lib/model/types";
import { fmt } from "@/lib/utils";
import { CombustionDetails, CombustionCalc, RefrigerantDetailsPanel, RefrigerantCalcBlock } from "../DataInputTab";
import { FacilityDetailContent } from "../../scope2/DataInputTab";
import { Collapsible } from "./Collapsible";
import { CAT_DEFS } from "./shared";
import type { CombustionAsset, RefrigerationSystem } from "@/lib/model/types";
import type { Facility } from "@/lib/scope2/model/types";

type Props = {
  nav: Nav & { level: "entry" };
  setNav: (n: Nav) => void;
  year: number;
  combById: (id: string) => CombustionAsset | undefined;
  facById: (id: string) => Facility | undefined;
  refrigSysById: (id: string) => RefrigerationSystem | undefined;
  updateCombustion: (year: number, id: string, patch: Partial<CombustionAsset>) => void;
  updateFacility: (year: number, id: string, patch: Partial<Facility>) => void;
  updateRefrigeration: (year: number, id: string, patch: Partial<RefrigerationSystem>) => void;
  co2Fac: (id: string) => number;
};

const SECTION = "rounded-xl3 border border-line/60 bg-surface shadow-card p-6";
const LABEL = "text-[11px] uppercase tracking-wide text-ink-faint font-bold";

export function EntryScreen({ nav, setNav, year, combById, facById, refrigSysById, updateCombustion, updateFacility, updateRefrigeration, co2Fac }: Props) {
  /* ---- Refrigerant entry (full screen) ---- */
  if (nav.kind === "refrigerant") {
    const s = refrigSysById(nav.id);
    if (!s) { setNav({ level: "home" }); return null; }
    const gas = REFRIGERANTS[s.refrigerant];
    return (
      <div key={`ref-${s.id}`} className="screen-in flex flex-col gap-5">
        <button onClick={() => setNav({ level: "cat", key: "refrigerants" })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to Refrigerants &amp; cooling</button>
        <div style={{ background: GRAD.refrigerant }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4">
          <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><Snowflake size={28} strokeWidth={1.9} style={{ color: ICON_COLOR.refrigerant }} /></span>
          <div className="min-w-0 flex-1">
            <input value={s.name} onChange={(e) => updateRefrigeration(year, s.id, { name: e.target.value })} className="w-full text-2xl font-extrabold text-ink bg-transparent border-b-2 border-transparent hover:border-ink/20 focus:border-ink/40 focus:outline-none" aria-label="Source name" />
            <p className="text-sm font-medium text-ink-soft mt-0.5">{gas.label} · Refrigerant{s.bu ? ` · ${s.bu}` : ""} · {fyLabel(year)}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div>
            <div className="text-3xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(refrigerantCO2e(s))}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div>
          </div>
        </div>
        <div className={SECTION}>
          <div className={`${LABEL} mb-4`}>Consumption</div>
          <div className="flex items-end gap-3">
            <input type="number" value={s.toppedUpKg} onChange={(e) => updateRefrigeration(year, s.id, { toppedUpKg: Number(e.target.value) })} className="w-full text-4xl font-extrabold tabular-nums rounded-xl border-2 border-brand-200 bg-brand-50/40 px-4 py-3 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors" aria-label="Refrigerant topped up" />
            <span className="rounded-xl border border-line bg-surface-muted px-4 py-4 text-base text-ink-soft">kg/yr</span>
          </div>
          <p className="text-xs text-ink-faint mt-3">Refrigerant topped up over the year (= the amount that leaked).</p>
        </div>
        <div className={SECTION}>
          <div className={`${LABEL} mb-4`}>Details for the scenario modeller</div>
          <RefrigerantDetailsPanel s={s} year={year} />
        </div>
        <Collapsible title="How this is calculated">
          <RefrigerantCalcBlock s={s} />
        </Collapsible>
      </div>
    );
  }

  /* ---- Electricity is handled by ElectricityBuScreen, not here (kind 'facility' kept for legacy single-facility nav) ---- */
  if (nav.kind === "facility") {
    const f = facById(nav.id);
    if (!f) { setNav({ level: "home" }); return null; }
    const ElecIcon = CAT_ICON.electricity;
    return (
      <div key={`fac-${f.id}`} className="screen-in flex flex-col gap-5">
        <button onClick={() => setNav({ level: "cat", key: "electricity" })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to Electricity</button>
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
        <div className={SECTION}>
          <div className={`${LABEL} mb-4`}>Consumption</div>
          <div className="flex items-end gap-3">
            <input type="number" value={f.annualLoadKwh} onChange={(e) => updateFacility(year, f.id, { annualLoadKwh: Number(e.target.value) })} className="w-full text-4xl font-extrabold tabular-nums rounded-xl border-2 border-brand-200 bg-brand-50/40 px-4 py-3 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors" aria-label="Annual electricity" />
            <span className="rounded-xl border border-line bg-surface-muted px-4 py-4 text-base text-ink-soft">kWh</span>
          </div>
        </div>
        <div className={SECTION}>
          <div className={`${LABEL} mb-4`}>Details for the scenario modeller</div>
          <FacilityDetailContent f={f} year={year} locationT={co2Fac(f.id)} />
        </div>
        <Collapsible title="How this is calculated">
          <p className="text-sm text-ink-soft">Location-based Scope 2 = load × grid emission factor.</p>
          <p className="mt-2 text-sm font-mono text-ink-soft break-words">{fmt(f.annualLoadKwh)} kWh × {f.gridEf} kgCO₂e/kWh ÷ 1,000</p>
          <p className="mt-1.5 text-lg font-extrabold text-ink">→ {fmt(co2Fac(f.id))} tCO₂e</p>
        </Collapsible>
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
      <button onClick={() => setNav({ level: "cat", key: fam })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to {catLabel}</button>
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
      <div className={SECTION}>
        <div className={`${LABEL} mb-4`}>Consumption</div>
        <div className="flex items-end gap-3">
          <input type="number" value={showNum(fromRef(a.annualVolume, a.fuelType, disp))} onChange={(e) => updateCombustion(year, a.id, { annualVolume: toRef(Number(e.target.value), a.fuelType, disp) })} className="w-full text-4xl font-extrabold tabular-nums rounded-xl border-2 border-brand-200 bg-brand-50/40 px-4 py-3 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors" aria-label="Annual consumption" />
          <select value={disp} onChange={(e) => updateCombustion(year, a.id, { displayUnit: e.target.value as FuelUnit })} className="rounded-xl border border-line bg-white px-3 py-4 text-base cursor-pointer focus:outline-none focus:border-brand-400" aria-label="Unit">
            {displayUnits(a.fuelType).map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
          </select>
        </div>
        <p className="text-xs text-ink-faint mt-3">Annual {FUELS[a.fuelType].label.toLowerCase()} consumed.</p>
      </div>
      <div className={SECTION}>
        <div className={`${LABEL} mb-4`}>Details for the scenario modeller</div>
        <CombustionDetails a={a} year={year} showCalc={false} modellerOnly />
        {a.opex === 0 && (
          <p className="text-[11px] text-amber-700 mt-1">Add annual spend to see cost savings in the modeller.</p>
        )}
      </div>
      <Collapsible title="How this is calculated">
        <CombustionCalc a={a} />
      </Collapsible>
    </div>
  );
}
