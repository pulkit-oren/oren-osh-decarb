"use client";

import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { GRAD, CAT_ICON, ICON_COLOR, ELEC_TYPES, type Nav } from "./shared";
import { fyLabel } from "@/lib/model/types";
import { fmt, fmtNum } from "@/lib/utils";
import { M2_PER_KW } from "@/lib/scope2/model/constants";
import { DetailCard, NumField, SliderField, SplitBar, ToggleSwitch, FieldLabel, SelectField } from "./fields";
import { FACILITY_TYPES, FACILITY_TYPE_LIST, facilityTypeProfile, type FacilityTypeId } from "@/lib/scope2/model/facility-type";
import type { Facility } from "@/lib/scope2/model/types";

const SPLIT = { lighting: "#F59E0B", motor: "#0369A1", hvac: "#0E7490", other: "#94A3B8" };

type Props = {
  bu: string;
  year: number;
  ensureFacility: (instrumentKey: string) => string;
  facFor: (instrumentKey: string) => Facility | undefined;
  updateFacility: (year: number, id: string, patch: Partial<Facility>) => void;
  co2Fac: (id: string) => number;
  setNav: (n: Nav) => void;
};

export function ElectricityBuScreen({ bu, year, ensureFacility, facFor, updateFacility, co2Fac, setNav }: Props) {
  const Icon = CAT_ICON.electricity;

  // Create the 4 facilities after commit (not during render) to avoid the
  // "Cannot update a component while rendering a different component" warning.
  useEffect(() => {
    ELEC_TYPES.forEach((t) => ensureFacility(t.key));
  }, [bu, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const gridFac = facFor("grid");
  const total = ELEC_TYPES.reduce((s, t) => {
    const f = facFor(t.key);
    return s + (f ? co2Fac(f.id) : 0);
  }, 0);
  const title = bu || "Central (company-wide)";

  return (
    <div key={`elecbu-${bu}`} className="screen-in flex flex-col gap-5">
      <button onClick={() => setNav({ level: "cat", key: "electricity" })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to Electricity</button>
      <div style={{ background: GRAD.electricity }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4">
        <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><Icon size={28} strokeWidth={1.9} style={{ color: ICON_COLOR.electricity }} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-ink truncate">{title}</h1>
          <p className="text-sm font-medium text-ink-soft mt-0.5">Electricity · Scope 2 · {fyLabel(year)}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div>
          <div className="text-3xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(total)}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div>
        </div>
      </div>

      <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-4">Electricity by source (kWh/yr)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ELEC_TYPES.map((t) => {
            const f = facFor(t.key);
            return (
              <label key={t.key} className="block rounded-xl border border-line/70 p-4">
                <span className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{t.label}</span>
                  <span className="text-xs font-semibold tabular-nums text-brand-600">{fmt(f ? co2Fac(f.id) : 0)} t</span>
                </span>
                <span className="text-[11px] text-ink-faint">{t.sub}</span>
                <span className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    value={f?.annualLoadKwh ?? 0}
                    onChange={(e) => {
                      const id = ensureFacility(t.key);
                      updateFacility(year, id, { annualLoadKwh: Number(e.target.value) });
                    }}
                    className="w-full text-right tabular-nums rounded-lg border border-brand-200 bg-brand-50/50 px-2.5 py-2 text-base focus:outline-none focus:border-brand-400 focus:bg-white"
                    aria-label={`${title} ${t.label}`}
                  />
                  <span className="text-xs text-ink-faint w-10">kWh</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-ink-faint mt-3">Only purchased grid electricity carries emissions; VPPA, solar and I-REC are clean (0 tCO₂e).</p>
      </div>

      {gridFac && (() => {
        const f = gridFac;
        const ftProfile = facilityTypeProfile(f);
        const splitSum = f.loadSplit.lightingPct + f.loadSplit.motorPct + f.loadSplit.hvacPct;
        const otherPct = Math.max(0, 100 - splitSum);
        const roofCapKwp = Math.max(0, f.roofSpaceM2 / M2_PER_KW - (f.existingSolarKwp ?? 0));
        const setSplit = (patch: Partial<Facility["loadSplit"]>) => updateFacility(year, f.id, { loadSplit: { ...f.loadSplit, ...patch } });
        return (
          <>
            <DetailCard title="Facility type">
              <SelectField
                label="Facility type"
                value={(f.facilityType ?? "") as FacilityTypeId | ""}
                options={[{ value: "" as FacilityTypeId | "", label: "Unspecified" }, ...FACILITY_TYPE_LIST.map((p) => ({ value: p.id as FacilityTypeId | "", label: p.label }))]}
                onChange={(v) => {
                  if (!v) { updateFacility(year, f.id, { facilityType: undefined }); return; }
                  const prof = FACILITY_TYPES[v as FacilityTypeId];
                  updateFacility(year, f.id, { facilityType: v as FacilityTypeId, loadSplit: { ...prof.loadSplit } });
                }}
                hint="Pre-fills a typical load split for this kind of site and flags on-site-solar potential. You can still adjust the sliders."
              />
              {ftProfile && (
                <p className="text-[11px] text-ink-faint mt-2">Applied the typical {ftProfile.label.toLowerCase()} load split — adjust below if you have actuals.</p>
              )}
            </DetailCard>

            <DetailCard title="Cost & grid factor">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumField label="Tariff" suffix="₹/kWh" value={f.tariffPerKwh} min={0} onChange={(v) => updateFacility(year, f.id, { tariffPerKwh: v })} />
                <NumField label="Grid emission factor" suffix="kgCO₂e/kWh" value={f.gridEf} min={0} step={0.01} onChange={(v) => updateFacility(year, f.id, { gridEf: v })} hint="Location-based grid emission factor. Coal-heavy grid ≈ 0.7; hydro grid ≈ 0.1." />
              </div>
              <p className="text-[11px] text-ink-faint mt-3">Purchased grid ≈ <strong className="text-ink">{fmtNum(co2Fac(f.id), 1)} tCO₂e/yr</strong> at this factor.</p>
            </DetailCard>

            <DetailCard title="Load split">
              <SplitBar segments={[
                { label: "Lighting", pct: f.loadSplit.lightingPct, color: SPLIT.lighting },
                { label: "Motor", pct: f.loadSplit.motorPct, color: SPLIT.motor },
                { label: "HVAC", pct: f.loadSplit.hvacPct, color: SPLIT.hvac },
                { label: "Other", pct: otherPct, color: SPLIT.other },
              ]} />
              <p className={splitSum > 100 ? "text-[11px] mt-2 text-red-600 font-medium" : "text-[11px] mt-2 text-ink-faint"}>
                {splitSum > 100 ? `Lighting + Motor + HVAC sum to ${splitSum}% — keep at or below 100%.` : `Other load: ${otherPct}%`}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-4">
                <SliderField label="Lighting" suffix="%" min={0} max={100} value={f.loadSplit.lightingPct} accent={SPLIT.lighting} onChange={(v) => setSplit({ lightingPct: v })} />
                <SliderField label="Motor" suffix="%" min={0} max={100} value={f.loadSplit.motorPct} accent={SPLIT.motor} onChange={(v) => setSplit({ motorPct: v })} />
                <SliderField label="HVAC" suffix="%" min={0} max={100} value={f.loadSplit.hvacPct} accent={SPLIT.hvac} onChange={(v) => setSplit({ hvacPct: v })} />
              </div>
              <p className="text-[11px] text-ink-faint mt-3">Lighting drives the LED lever, motors the VFD lever, HVAC + other the BMS lever.</p>
            </DetailCard>

            <DetailCard title="On-site solar potential">
              {ftProfile && (
                <p className={
                  "mb-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium border " +
                  (ftProfile.solar.feasible === "strong" || ftProfile.solar.feasible === "good"
                    ? "bg-brand-50 text-brand-700 border-brand-200"
                    : ftProfile.solar.feasible === "limited"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-surface-muted text-ink-soft border-line")
                }>
                  {ftProfile.solar.feasible === "limited" ? "⚠ " : ""}Solar: {ftProfile.solar.feasible} — {ftProfile.solar.note}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumField label="Roof space" suffix="m²" value={f.roofSpaceM2} min={0} onChange={(v) => updateFacility(year, f.id, { roofSpaceM2: v })} />
                <NumField label="Solar yield" suffix="kWh/kWp/yr" value={f.irradiance} min={0} onChange={(v) => updateFacility(year, f.id, { irradiance: v })} hint="Geography-specific: sunny Pune ≈ 1,500; cloudy London ≈ 950." />
              </div>
              <p className="text-[11px] text-ink-faint mt-3">Roof headroom for new solar ≈ <strong className="text-ink">{fmt(roofCapKwp)} kWp</strong> ({M2_PER_KW} m²/kW{f.existingSolarKwp ? `, after ${fmt(f.existingSolarKwp)} kWp installed` : ""}).</p>
              {f.gridEf > 0 && f.roofSpaceM2 === 0 && <p className="text-[11px] text-amber-700 mt-1">Set roof space to size the on-site solar option.</p>}
            </DetailCard>

            <DetailCard title="Grid type">
              <div className="flex items-center justify-between gap-3">
                <FieldLabel hint="Tick for a captive / island grid where PPAs, green tariffs and RECs are physically unavailable.">Isolated grid</FieldLabel>
                <ToggleSwitch on={f.isolated} onChange={(v) => updateFacility(year, f.id, { isolated: v })} label="Isolated grid" />
              </div>
            </DetailCard>

            <DetailCard title="How this is calculated">
              <p className="text-sm text-ink-soft">Location-based Scope 2 = purchased grid load × grid emission factor.</p>
              <p className="mt-2 text-sm font-mono text-ink-soft break-words">{fmt(f.annualLoadKwh)} kWh × {f.gridEf} kgCO₂e/kWh ÷ 1,000</p>
              <p className="mt-1.5 text-lg font-extrabold text-ink">→ {fmt(co2Fac(f.id))} tCO₂e</p>
            </DetailCard>
          </>
        );
      })()}
    </div>
  );
}
