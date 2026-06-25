"use client";

import { ArrowLeft, Snowflake } from "lucide-react";
import { GRAD, CAT_ICON, ICON_COLOR, showNum, unitLabel, type Nav } from "./shared";
import { FUELS, FUELS_BY_CATEGORY, REFRIGERANTS } from "@/lib/model/factors";
import { combustionCO2e, refrigerantCO2e } from "@/lib/model/baseline";
import { fuelFamily } from "@/lib/activity-groups";
import { displayUnits, fromRef, toRef } from "@/lib/unit-convert";
import { fyLabel, type FuelUnit, type FuelId, type RefrigerantId } from "@/lib/model/types";
import { refrigClassesFor, refrigClassProfile, type RefrigClassId } from "@/lib/model/refrigerant-class";
import { fmt, fmtMoney } from "@/lib/utils";
import { CURRENCY } from "@/lib/defaults";
import { endUsesFor, type EndUseId } from "@/lib/model/end-use";
import { CombustionCalc, RefrigerantCalcBlock } from "../DataInputTab";
import { FacilityDetailContent } from "../../scope2/DataInputTab";
import { Collapsible } from "./Collapsible";
import { CAT_DEFS } from "./shared";
import { DetailCard, TextField, NumField, SelectField, Stepper, SliderField, Segmented } from "./fields";
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

const HERO_INPUT =
  "w-full text-4xl font-extrabold tabular-nums rounded-xl border-2 border-brand-200 bg-brand-50/40 px-4 py-3 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors";

const SYSTEM_OPTIONS: { value: RefrigerationSystem["systemType"]; label: string }[] = [
  { value: "commercialHVAC", label: "Commercial HVAC" },
  { value: "industrialColdStorage", label: "Industrial Cold Storage" },
  { value: "retailRefrigeration", label: "Retail Refrigeration" },
];

export function EntryScreen({ nav, setNav, year, combById, facById, refrigSysById, updateCombustion, updateFacility, updateRefrigeration, co2Fac }: Props) {
  /* ---- Refrigerant entry ---- */
  if (nav.kind === "refrigerant") {
    const s = refrigSysById(nav.id);
    if (!s) { setNav({ level: "home" }); return null; }
    const refClass = refrigClassProfile(s);
    const gas = REFRIGERANTS[s.refrigerant];
    const gasOptions = (Object.values(REFRIGERANTS) as (typeof REFRIGERANTS)[keyof typeof REFRIGERANTS][])
      .filter((r) => r.inExcel)
      .map((r) => ({ value: r.id as RefrigerantId, label: r.label }));
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

        <DetailCard title="Consumption">
          <div className="flex items-end gap-3">
            <input type="number" value={s.toppedUpKg} onChange={(e) => updateRefrigeration(year, s.id, { toppedUpKg: Number(e.target.value) })} className={HERO_INPUT} aria-label="Refrigerant topped up" />
            <span className="rounded-xl border border-line bg-surface-muted px-4 py-4 text-base text-ink-soft">kg/yr</span>
          </div>
          <p className="text-xs text-ink-faint mt-3">Refrigerant topped up over the year (= the amount that leaked).</p>
        </DetailCard>

        <DetailCard title="System details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField label="System type" value={s.systemType} options={SYSTEM_OPTIONS} onChange={(v) => {
              const patch: Partial<RefrigerationSystem> = { systemType: v };
              if (s.equipmentClass && !refrigClassesFor(v).some((p) => p.id === s.equipmentClass)) patch.equipmentClass = undefined;
              updateRefrigeration(year, s.id, patch);
            }} hint="Sets the recommended low-GWP swap in the Refrigerant advisor." />
            <SelectField
              label="Equipment class"
              value={(s.equipmentClass ?? "") as RefrigClassId | ""}
              options={[{ value: "" as RefrigClassId | "", label: "Unspecified" }, ...refrigClassesFor(s.systemType).map((p) => ({ value: p.id as RefrigClassId | "", label: p.label }))]}
              onChange={(v) => updateRefrigeration(year, s.id, { equipmentClass: (v || undefined) as RefrigClassId | undefined })}
              hint="A finer class sharpens the recommended low-GWP swap used by the modeller."
            />
            <SelectField label="Refrigerant gas" value={s.refrigerant} options={gasOptions} onChange={(v) => updateRefrigeration(year, s.id, { refrigerant: v })} />
            <NumField label="Gas cost" suffix={`${CURRENCY}/kg`} value={s.gasCostPerKg} min={0} onChange={(v) => updateRefrigeration(year, s.id, { gasCostPerKg: v })} hint="Purchase price of replacement refrigerant. Used to value the savings from cutting leaks." />
          </div>
          {refClass && (
            <p className="text-[11px] text-ink-faint mt-3">Recommended low-GWP swap: <strong className="text-ink">{REFRIGERANTS[refClass.recommendedAlt]?.label ?? refClass.recommendedAlt}</strong></p>
          )}
        </DetailCard>

        <DetailCard title="How this is calculated">
          <RefrigerantCalcBlock s={s} />
        </DetailCard>
      </div>
    );
  }

  /* ---- Electricity (legacy single-facility nav) ---- */
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
        <DetailCard title="Consumption">
          <div className="flex items-end gap-3">
            <input type="number" value={f.annualLoadKwh} onChange={(e) => updateFacility(year, f.id, { annualLoadKwh: Number(e.target.value) })} className={HERO_INPUT} aria-label="Annual electricity" />
            <span className="rounded-xl border border-line bg-surface-muted px-4 py-4 text-base text-ink-soft">kWh</span>
          </div>
        </DetailCard>
        <DetailCard title="Details for the scenario modeller">
          <FacilityDetailContent f={f} year={year} locationT={co2Fac(f.id)} />
        </DetailCard>
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
  const mode = a.inputMode ?? "metered";
  const price = FUELS[a.fuelType].typicalPricePerUnit ?? 0;
  const avgOpex = Math.round(a.annualVolume * price);
  const estVol = price > 0 ? Math.round(a.opex / price) : 0;
  const volDisp = showNum(fromRef(a.annualVolume, a.fuelType, disp));
  const setVolDisp = (v: number) => updateCombustion(year, a.id, { annualVolume: toRef(v, a.fuelType, disp) });

  const fuelOptions = FUELS_BY_CATEGORY[a.category].map((id) => ({ value: id as FuelId, label: FUELS[id].label }));
  const onCategory = (cat: CombustionAsset["category"]) => {
    const allowed = FUELS_BY_CATEGORY[cat];
    const patch: Partial<CombustionAsset> = { category: cat };
    if (!allowed.includes(a.fuelType)) { patch.fuelType = allowed[0]; patch.unit = FUELS[allowed[0]].unit; }
    if (a.endUse && !endUsesFor(cat).some((p) => p.id === a.endUse)) patch.endUse = undefined;
    updateCombustion(year, a.id, patch);
  };
  const onFuel = (v: FuelId) => updateCombustion(year, a.id, { fuelType: v, unit: FUELS[v].unit });

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

      <DetailCard title="Consumption">
        <div className="max-w-xs mb-4">
          <Segmented
            value={mode}
            options={[{ value: "metered", label: "Metered volume" }, { value: "spend", label: `${CURRENCY} Spend` }]}
            onChange={(m) => updateCombustion(year, a.id, { inputMode: m as CombustionAsset["inputMode"] })}
          />
        </div>
        {mode === "metered" ? (
          <>
            <div className="flex items-end gap-3">
              <input type="number" value={volDisp} onChange={(e) => setVolDisp(Number(e.target.value))} className={HERO_INPUT} aria-label="Annual consumption" />
              <select value={disp} onChange={(e) => updateCombustion(year, a.id, { displayUnit: e.target.value as FuelUnit })} className="rounded-xl border border-line bg-white px-3 py-4 text-base cursor-pointer focus:outline-none focus:border-brand-400" aria-label="Unit">
                {displayUnits(a.fuelType).map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
              </select>
            </div>
            <p className="text-xs text-ink-faint mt-3">Annual {FUELS[a.fuelType].label.toLowerCase()} consumed.</p>
          </>
        ) : (
          <>
            <div className="flex items-end gap-3">
              <input type="number" value={a.opex} onChange={(e) => updateCombustion(year, a.id, { opex: Number(e.target.value) })} className={HERO_INPUT} aria-label="Annual spend" />
              <span className="rounded-xl border border-line bg-surface-muted px-4 py-4 text-base text-ink-soft">{CURRENCY}/yr</span>
            </div>
            <p className="text-xs text-ink-faint mt-3 flex flex-wrap items-center gap-2">
              {price > 0 ? (
                <button type="button" onClick={() => setVolDisp(fromRef(estVol, a.fuelType, disp))} className="text-brand-600 font-medium hover:underline">
                  Estimate volume from spend → {fmt(estVol)} {a.unit}/yr
                </button>
              ) : <span>Enter spend; add a fuel price to estimate volume.</span>}
              <span className="text-ink-faint">Current: {fmt(volDisp)} {unitLabel(disp)}/yr</span>
            </p>
          </>
        )}
      </DetailCard>

      <DetailCard title="Asset details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <TextField label="Site / location" value={a.site ?? ""} onChange={(v) => updateCombustion(year, a.id, { site: v })} placeholder="e.g. Pune plant" />
          </div>
          <SelectField label="Category" value={a.category} options={[{ value: "stationary", label: "Stationary" }, { value: "mobile", label: "Mobile" }]} onChange={onCategory} />
          <SelectField label="Fuel" value={a.fuelType} options={fuelOptions} onChange={onFuel} />
          <SelectField
            label="Equipment / end-use"
            value={(a.endUse ?? "") as EndUseId | ""}
            options={[{ value: "" as EndUseId | "", label: "Unspecified" }, ...endUsesFor(a.category).map((p) => ({ value: p.id as EndUseId | "", label: p.label }))]}
            onChange={(v) => updateCombustion(year, a.id, { endUse: (v || undefined) as EndUseId | undefined })}
            hint="What kind of equipment this is. Pre-fills realistic scenario-modeller assumptions (EV cost, heat-pump COP, bio-blend)."
          />
          {mode === "metered" ? (
            <NumField
              label="Annual spend" suffix={`${CURRENCY}/yr`} value={a.opex} min={0}
              onChange={(v) => updateCombustion(year, a.id, { opex: v })}
              hint="Fuel cost plus related maintenance for the year. Drives payback and cost-per-tonne in the action plan."
              footer={price > 0 && a.opex !== avgOpex ? (
                <button type="button" onClick={() => updateCombustion(year, a.id, { opex: avgOpex })} className="text-brand-600 hover:underline">
                  Use average ≈ {fmtMoney(avgOpex)} ({CURRENCY}{fmt(price)}/{a.unit})
                </button>
              ) : price > 0 ? `≈ average at ${CURRENCY}${fmt(price)}/${a.unit}` : null}
            />
          ) : (
            <NumField
              label="Annual volume" suffix={`${unitLabel(disp)}/yr`} value={volDisp} min={0}
              onChange={setVolDisp}
              hint="Metered fuel volume for the year. Edit directly or estimate it from spend above."
            />
          )}
          <Stepper label="Number of units" value={a.unitCount} min={1} onChange={(v) => updateCombustion(year, a.id, { unitCount: v })} hint="How many of this asset are represented by this entry." />
          <div className="sm:col-span-2">
            <SliderField label="Remaining life" value={a.remainingLife} min={0} max={40} suffix="yrs" onChange={(v) => updateCombustion(year, a.id, { remainingLife: v })} hint="Remaining useful life of the equipment. Guards against retrofits that would outlive the asset." />
          </div>
        </div>
        {a.opex === 0 && (
          <p className="text-[11px] text-amber-700 mt-3">Add annual spend to see cost savings in the modeller.</p>
        )}
      </DetailCard>

      <DetailCard title="How this is calculated">
        <CombustionCalc a={a} />
      </DetailCard>
    </div>
  );
}
