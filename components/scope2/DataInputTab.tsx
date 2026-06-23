"use client";

import { useState } from "react";
import { Plus, Trash2, Zap, Globe2, Wallet, Star, AlertTriangle, SlidersHorizontal, X } from "lucide-react";
import { useScope2 } from "@/lib/scope2/store";
import { M2_PER_KW } from "@/lib/scope2/model/constants";
import { FY_YEARS, fyLabel } from "@/lib/model/types";
import type { Facility } from "@/lib/scope2/model/types";
import { cn, fmt, fmtMoney, fmtNum, pct } from "@/lib/utils";
import { facilityGrade, confidenceOf } from "@/lib/data-quality";
import { Card, CardHeader } from "../ui/Card";
import { KpiCard } from "../ui/KpiCard";
import { ConfidenceGauge } from "../ui/ConfidenceGauge";
import { InfoTip } from "../ui/InfoTip";
import { CopyFrom, EmptyState, NumCell, NumField, TextCell, Toggle } from "./cells";

export function Scope2DataInputTab() {
  const {
    facilities, selectedYear, baseYear, setSelectedYear, setBaseYear,
    selectedFacilities, selectedBaseline,
    addFacility, delFacility, updateFacility, copyFacilities,
  } = useScope2();

  const [selId, setSelId] = useState<string | null>(null);
  const b = selectedBaseline;
  const isolatedShare = b.totalLoadKwh > 0 ? b.isolatedLoadKwh / b.totalLoadKwh : 0;
  const confidence = confidenceOf(
    selectedFacilities.map((f) => ({ grade: facilityGrade(f), co2eT: b.perFacility.find((p) => p.id === f.id)?.locationT ?? 0 })),
  );
  const sourceYears = FY_YEARS.filter((y) => y !== selectedYear && (facilities[y]?.length ?? 0) > 0);
  const selFacility = selectedFacilities.find((f) => f.id === selId);

  return (
    <div className="flex flex-col gap-6">
      {/* FY + base year — compact */}
      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Financial year</span>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400" aria-label="Financial year to view / edit">
              {FY_YEARS.map((y) => {
                const count = facilities[y]?.length ?? 0;
                return <option key={y} value={y}>{fyLabel(y)} · {count} facilit{count === 1 ? "y" : "ies"}{y === baseYear ? " ★ base" : ""}</option>;
              })}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Base year</span>
            <select value={baseYear} onChange={(e) => setBaseYear(Number(e.target.value))} className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400" aria-label="Base year for modelling">
              {FY_YEARS.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
            </select>
            <Star size={14} className="text-brand-500 fill-current" />
            <InfoTip text="Anchors the scenario modeller, the SBTi target and the 2050 pathway." />
          </label>
          {selectedYear !== baseYear && (
            <span className="text-xs text-ink-soft">Viewing <strong>{fyLabel(selectedYear)}</strong> · model runs on <strong>{fyLabel(baseYear)}</strong></span>
          )}
        </div>
      </Card>

      {/* baseline KPIs for the selected FY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Zap} label={`Electricity · ${fyLabel(selectedYear)}`} value={fmt(b.totalLoadKwh / 1000)} unit="MWh" hint={`${selectedFacilities.length} facilities`} />
        <KpiCard emphasis icon={Globe2} label="Location-based Scope 2" value={fmt(b.totalLocationT)} unit="tCO₂e" hint={selectedYear === baseYear ? "base year" : "view year"} />
        <KpiCard icon={Wallet} label="Annual electricity cost" value={fmtMoney(b.totalCost)} hint="grid tariff × load" />
        <KpiCard icon={AlertTriangle} label="Isolated-grid share" value={pct(isolatedShare)} hint="captive grids — no market instruments" />
      </div>

      {/* data-quality confidence for the selected FY */}
      <ConfidenceGauge confidence={confidence} />

      {/* facilities */}
      <Card>
        <CardHeader
          title={`Facilities · ${fyLabel(selectedYear)}`}
          subtitle="Every site drawing grid electricity this year. Open a row's details for tariff, load split, roof space and grid factors."
          right={
            <div className="flex items-center gap-2">
              <CopyFrom years={sourceYears} onPick={(from) => copyFacilities(from, selectedYear)} />
              <button onClick={() => addFacility(selectedYear)} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600 transition-colors">
                <Plus size={15} /> Add facility
              </button>
            </div>
          }
        />
        {selectedFacilities.length === 0 ? (
          <EmptyState label={`No facilities in ${fyLabel(selectedYear)}`} hint="Add a facility, or copy another year's list above." action={{ label: "Add your first facility", onClick: () => addFacility(selectedYear) }} />
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm min-w-[480px] table-fixed border-separate border-spacing-0">
              <colgroup>
                <col style={{ width: "48%" }} /><col style={{ width: "28%" }} /><col style={{ width: "14%" }} /><col style={{ width: "76px" }} />
              </colgroup>
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                  <Th label="Facility" hint="A short name for the site that draws grid electricity — e.g. “Pune plant”, “HQ office”, “Maldives resort”." />
                  <Th label="Load (kWh/yr)" align="right" hint="Total grid electricity this site consumes per year, in kWh. Take it from the annual utility bills." />
                  <Th label="tCO₂e" align="right" hint="Calculated location-based Scope 2 = annual load × grid emission factor. Read-only." />
                  <th className="py-2 px-2" />
                </tr>
              </thead>
              <tbody>
                {selectedFacilities.map((f) => {
                  const fb = b.perFacility.find((p) => p.id === f.id);
                  const active = selId === f.id;
                  return (
                    <tr key={f.id} className={cn("align-middle border-t border-line/60", active && "bg-brand-50/40")}>
                      <td className="py-1.5 px-2">
                        <div className="flex items-center gap-1.5">
                          <TextCell value={f.name} onChange={(v) => updateFacility(selectedYear, f.id, { name: v })} label={`${f.name} name`} />
                          {f.isolated && (
                            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-full px-1.5 py-0.5" title="Isolated grid — excluded from renewable procurement">
                              <AlertTriangle size={10} /> isolated
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 px-2"><NumCell value={f.annualLoadKwh} onChange={(v) => updateFacility(selectedYear, f.id, { annualLoadKwh: v })} label={`${f.name} annual load`} /></td>
                      <td className="py-1.5 px-2 text-right font-semibold tabular-nums">{fmt(fb?.locationT ?? 0)}</td>
                      <td className="py-1.5 px-2">
                        <div className="flex items-center gap-0.5 justify-end">
                          <button onClick={() => setSelId(f.id)} className={cn("p-1.5 rounded-lg", active ? "bg-brand-500 text-white" : "text-ink-faint hover:text-brand-600 hover:bg-brand-50")} aria-label="Edit facility details" title="Tariff, load split, roof & grid factors"><SlidersHorizontal size={15} /></button>
                          <button onClick={() => delFacility(selectedYear, f.id)} className="text-ink-faint hover:text-red-500 p-1.5" aria-label="Delete"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-line text-sm font-semibold">
                  <td className="py-2 px-2">Total</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt(b.totalLoadKwh)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmt(b.totalLocationT)}</td>
                  <td className="py-2 px-2" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-ink-faint mt-2">
          Location-based emissions = load × grid EF. Lighting + motor + HVAC may sum to less than 100% — the remainder is treated as “other” load (targeted by BMS).
        </p>
      </Card>

      {/* facility detail side panel */}
      {selFacility && (
        <FacilityDetail facility={selFacility} year={selectedYear} locationT={b.perFacility.find((p) => p.id === selFacility.id)?.locationT ?? 0} onClose={() => setSelId(null)} />
      )}
    </div>
  );
}

export function FacilityDetail({ facility: f, year, locationT, onClose }: { facility: Facility; year: number; locationT: number; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-ink/20 z-40" onClick={onClose} aria-hidden />
      <aside className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-surface shadow-card-lg z-50 overflow-y-auto p-6 tab-fade">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-50 grid place-items-center text-brand-600 shrink-0"><SlidersHorizontal size={16} /></div>
            <div className="min-w-0">
              <h3 className="font-bold text-ink truncate">{f.name}</h3>
              <p className="text-[11px] text-ink-faint">Facility details (averaged — adjust if you have exact figures)</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-muted grid place-items-center text-ink-soft hover:text-ink shrink-0" aria-label="Close"><X size={16} /></button>
        </div>
        <FacilityDetailContent f={f} year={year} locationT={locationT} />
      </aside>
    </>
  );
}

export function FacilityDetailContent({ f, year, locationT }: { f: Facility; year: number; locationT: number }) {
  const { updateFacility } = useScope2();
  const splitSum = f.loadSplit.lightingPct + f.loadSplit.motorPct + f.loadSplit.hvacPct;
  const otherPct = Math.max(0, 100 - splitSum);
  const roofCapKwp = Math.max(0, f.roofSpaceM2 / M2_PER_KW - (f.existingSolarKwp ?? 0));

  return (
        <div className="space-y-6">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-3">Cost & emissions</div>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Tariff (₹/kWh)" value={f.tariffPerKwh} onChange={(v) => updateFacility(year, f.id, { tariffPerKwh: v })} />
              <NumField label="Grid EF (kgCO₂e/kWh)" value={f.gridEf} onChange={(v) => updateFacility(year, f.id, { gridEf: v })} />
            </div>
            <p className="text-[11px] text-ink-faint mt-2 flex items-center gap-1.5">
              Grid EF <InfoTip text="Location-based grid emission factor. Coal-heavy grid ≈ 0.7; hydro grid ≈ 0.1. Drives the location-based number." />
              · this facility ≈ <strong className="text-ink">{fmtNum(locationT, 1)} tCO₂e/yr</strong>
            </p>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-3 flex items-center gap-1.5">
              Load split <InfoTip text="How the site's electricity divides across uses. Lighting drives the LED lever, motors the VFD lever, HVAC + other the BMS lever. The three may total under 100% — the rest is 'other'." />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <NumField label="Lighting %" value={f.loadSplit.lightingPct} onChange={(v) => updateFacility(year, f.id, { loadSplit: { ...f.loadSplit, lightingPct: v } })} suffix="%" />
              <NumField label="Motor %" value={f.loadSplit.motorPct} onChange={(v) => updateFacility(year, f.id, { loadSplit: { ...f.loadSplit, motorPct: v } })} suffix="%" />
              <NumField label="HVAC %" value={f.loadSplit.hvacPct} onChange={(v) => updateFacility(year, f.id, { loadSplit: { ...f.loadSplit, hvacPct: v } })} suffix="%" />
            </div>
            <p className={cn("text-[11px] mt-2", splitSum > 100 ? "text-red-600 font-medium" : "text-ink-faint")}>
              {splitSum > 100 ? `Sums to ${splitSum}% — keep it at or below 100%.` : `Other load: ${otherPct}%`}
            </p>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-3">On-site solar potential</div>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Roof space (m²)" value={f.roofSpaceM2} onChange={(v) => updateFacility(year, f.id, { roofSpaceM2: v })} suffix="m²" />
              <NumField label="Solar yield (kWh/kWp/yr)" value={f.irradiance} onChange={(v) => updateFacility(year, f.id, { irradiance: v })} />
            </div>
            <p className="text-[11px] text-ink-faint mt-2 flex items-center gap-1.5">
              Roof headroom for new solar ≈ <strong className="text-ink">{fmt(roofCapKwp)} kWp</strong> ({M2_PER_KW} m²/kW{f.existingSolarKwp ? `, after ${fmt(f.existingSolarKwp)} kWp installed` : ""})
              <InfoTip text="Solar yield is geography-specific: sunny Pune ≈ 1,500; cloudy London ≈ 950. Peak load sizes the battery inverter." />
            </p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-line/70 px-3 py-2.5">
            <span className="text-sm text-ink flex items-center gap-1.5">
              Isolated grid
              <InfoTip text="Tick for a captive / island grid where PPAs, green tariffs and RECs are physically unavailable. Excluded from procurement; feeds the RE100 footnote." />
            </span>
            <Toggle on={f.isolated} onChange={(v) => updateFacility(year, f.id, { isolated: v })} label="Isolated grid" />
          </div>

          <div className="border-t border-line/60 pt-5">
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-1">What we already have</div>
            <p className="text-[11px] text-ink-faint mb-3">Renewables already in place — so the model starts from where you really are, not from zero.</p>
            <div className="grid grid-cols-2 gap-3">
              <NumField
                label="Solar already installed (kWp)"
                value={f.existingSolarKwp ?? 0}
                onChange={(v) => updateFacility(year, f.id, { existingSolarKwp: Math.max(0, v) })}
                suffix="kWp"
              />
              <NumField
                label="Already on green contracts (%)"
                value={f.existingRenewablePct ?? 0}
                onChange={(v) => updateFacility(year, f.id, { existingRenewablePct: Math.max(0, Math.min(100, v)) })}
                suffix="%"
              />
            </div>
            <p className="text-[11px] text-ink-faint mt-2 flex items-start gap-1.5">
              <InfoTip text="Solar already installed: only frees up roof space for new panels — its generation is already netted out of your grid bill. Green contracts (existing PPAs/RECs): the share of this site's electricity already covered, which lowers the market-based starting point. Ignored for isolated grids." />
              <span>{f.isolated ? "Green contracts don't apply on an isolated grid." : "Existing solar frees roof space; existing contracts lower the market-based baseline."}</span>
            </p>
          </div>
        </div>
  );
}

/** Column header with an optional (i) explainer — keeps the grid clean. */
function Th({ label, hint, align = "left" }: { label: string; hint?: string; align?: "left" | "right" | "center" }) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className={cn("font-semibold py-2 px-2", alignClass)}>
      <span className={cn("inline-flex items-center gap-1 align-middle", justify)}>
        {label}
        {hint && <InfoTip text={hint} />}
      </span>
    </th>
  );
}
