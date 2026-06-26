"use client";

import { useState } from "react";
import {
  ChevronDown, RotateCcw, Save, Trash2,
  Lightbulb, Sun, Landmark, Scale, Info,
} from "lucide-react";
import { useScope2 } from "@/lib/scope2/store";
import { defaultFacilityActions } from "@/lib/scope2/defaults";
import { facilityTypeProfile } from "@/lib/scope2/model/facility-type";
import {
  suggestForFacility,
  capexForFacility,
  facilityImpact,
  roofCapKwp,
  efficiencyTip,
  solarTip,
} from "@/lib/scope2/model/suggestions";
import { applyDials2, energyMix2, suggestMix2, type BalanceDials2 } from "@/lib/scope2/model/energy-balance";
import { groupByBu } from "@/lib/group-by-bu";
import { cn, fmt, fmtMoney, pct } from "@/lib/utils";
import { DetailCard, SliderField, ToggleSwitch, NumField, SelectField } from "@/components/tabs/activity/fields";
import { Collapsible } from "@/components/tabs/activity/Collapsible";

/* ============================================================
   Router
   ============================================================ */

export function Scope2BuilderTab() {
  const { baseFacilities } = useScope2();
  const [view, setView] = useState<"home" | "procurement" | "balance" | { facilityId: string }>("home");
  const [name, setName] = useState("");

  if (!baseFacilities.length) {
    return (
      <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
        <p className="text-sm text-ink-faint">No facilities yet — add them on the Data input tab first.</p>
      </div>
    );
  }

  if (view === "home") return <Scope2Home setView={setView} name={name} setName={setName} />;
  if (view === "procurement") return <ProcurementScreen onBack={() => setView("home")} />;
  if (view === "balance") return <Scope2EnergyBalanceScreen onBack={() => setView("home")} />;
  return <FacilityScenarioScreen facilityId={view.facilityId} onBack={() => setView("home")} />;
}

/* ============================================================
   Home screen — facility boxes + results panel
   ============================================================ */

type SetView = (v: "home" | "procurement" | "balance" | { facilityId: string }) => void;

function Scope2Home({ setView, name, setName }: { setView: SetView; name: string; setName: (v: string) => void }) {
  const { baseFacilities, levers, result, scenarios, saveScenario, deleteScenario, resetLevers, setLevers, baseYear } = useScope2();
  const k = result.kpis;
  const gridFacilities = baseFacilities.filter((f) => !f.excluded && f.gridEf > 0);
  const groups = groupByBu(gridFacilities);

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-10rem)]">
      <div className="rounded-xl3 border border-line/50 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60 px-5 py-4 shrink-0">
        <h1 className="text-xl font-extrabold text-ink">Scope 2 scenario modeller</h1>
        <p className="text-sm text-ink-soft">Pick a facility to plan efficiency and solar levers — the live result updates on the right.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-5 items-stretch lg:flex-1 lg:min-h-0">
        {/* left: facility list + action tiles */}
        <div className="flex flex-col gap-3 min-h-0">
          {groups.length === 0 ? (
            <p className="text-sm text-ink-faint">No grid-supplied facilities.</p>
          ) : (
            groups.map(([bu, facilities]) => (
              <div key={bu || "__cw__"}>
                {groups.length > 1 && (
                  <div className="text-[10px] uppercase tracking-wider text-ink-faint font-semibold mb-1.5">{bu || "Company-wide"}</div>
                )}
                <div className="flex flex-col gap-2">
                  {facilities.map((f) => {
                    const acts = levers.byFacility[f.id] ?? defaultFacilityActions(f);
                    const { baseT, afterT } = facilityImpact(f, acts);
                    const abated = baseT - afterT;
                    const activeLevers = (acts.efficiency.enabled ? 1 : 0) + (acts.generation.enabled ? 1 : 0);
                    const prof = facilityTypeProfile(f);
                    const sub = `${prof?.label ?? "Facility"}${f.bu ? ` · ${f.bu}` : ""}`;
                    return (
                      <button
                        key={f.id}
                        data-testid={`facility-box-${f.id}`}
                        aria-label={f.name}
                        onClick={() => setView({ facilityId: f.id })}
                        className="group flex items-center gap-3 rounded-xl3 border border-line/60 bg-surface shadow-card px-5 py-4 text-left w-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lg"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-ink truncate">{f.name}</span>
                            {f.isolated && <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">Isolated</span>}
                          </div>
                          <span className="text-[11px] text-ink-soft">{sub}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-extrabold tabular-nums text-brand-600">
                            {activeLevers > 0 ? `−${fmt(abated)} t` : "—"}
                          </div>
                          <div className="text-[10px] text-ink-faint">
                            {activeLevers > 0 ? `${activeLevers} lever${activeLevers === 1 ? "" : "s"} on` : "No plan yet"}
                          </div>
                        </div>
                        <ChevronDown size={18} className="-rotate-90 text-ink-soft/70 group-hover:text-ink transition-colors shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {/* Procurement tile */}
          <button
            onClick={() => setView("procurement")}
            className="group flex items-center gap-3 rounded-xl3 border-2 border-dashed border-brand-300 bg-brand-50/40 px-5 py-3 text-left hover:border-brand-400 hover:bg-brand-50 transition-colors shrink-0"
          >
            <span className="w-9 h-9 rounded-xl bg-brand-100 grid place-items-center shrink-0">
              <Landmark size={18} className="text-brand-700" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block font-bold text-ink">Procurement</span>
              <span className="text-xs text-ink-soft">PPA, green tariff, RECs — portfolio-wide market instruments</span>
            </div>
            <ChevronDown size={18} className="-rotate-90 text-ink-soft/70 group-hover:text-ink transition-colors shrink-0" />
          </button>

          {/* Energy balance tile */}
          <button
            onClick={() => setView("balance")}
            className="group flex items-center gap-3 rounded-xl3 border-2 border-dashed border-brand-300 bg-brand-50/40 px-5 py-3 text-left hover:border-brand-400 hover:bg-brand-50 transition-colors shrink-0"
          >
            <span className="w-9 h-9 rounded-xl bg-brand-100 grid place-items-center shrink-0">
              <Scale size={18} className="text-brand-700" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block font-bold text-ink">Energy balance</span>
              <span className="text-xs text-ink-soft">Balance efficiency / solar / procurement mix to a 2030 target</span>
            </div>
            <ChevronDown size={18} className="-rotate-90 text-ink-soft/70 group-hover:text-ink transition-colors shrink-0" />
          </button>
        </div>

        {/* right: results panel */}
        <aside className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 text-white shadow-card-lg p-6 flex flex-col">
          <p className="relative text-[11px] uppercase tracking-wide font-bold text-white/80">Live projection</p>
          <p className="relative mt-3 text-[40px] leading-none font-extrabold tabular-nums">{pct(k.reduction2030)}</p>
          <p className="relative mt-1 text-xs text-white/70">reduction by 2030</p>
          <div className="relative mt-5 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Market-based net</p>
              <p className="text-xl font-extrabold tabular-nums">{fmt(k.marketNowT)} t</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">OPEX Δ / yr</p>
              <p className="text-xl font-extrabold tabular-nums">{fmtMoney(k.annualOpexDelta)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Total CAPEX</p>
              <p className="text-xl font-extrabold tabular-nums">{fmtMoney(k.totalCapex)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Status</p>
              <p className="text-xl font-extrabold">{k.onTrack2030 ? "On track" : "Behind"}</p>
            </div>
          </div>

          <div className="relative mt-auto pt-5 border-t border-white/20">
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name this scenario…"
                className="flex-1 min-w-0 text-sm rounded-lg px-3 py-2 text-ink bg-white/95 focus:outline-none"
              />
              <button
                onClick={() => { if (name.trim()) { saveScenario(name.trim()); setName(""); } }}
                disabled={!name.trim()}
                className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-white text-brand-700 px-3 py-2 hover:bg-white/90 disabled:opacity-50"
              >
                <Save size={15} /> Save
              </button>
            </div>
            {scenarios.length > 0 && (
              <div className="mt-3 space-y-1.5 max-h-28 overflow-y-auto">
                {scenarios.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg bg-white/12 px-2.5 py-1.5 text-sm">
                    <span className="flex-1 truncate">{s.name}</span>
                    <button
                      onClick={() => setLevers(() => s.levers)}
                      className="text-[11px] font-semibold rounded px-1.5 py-0.5 bg-white/20 hover:bg-white/30"
                      title="Load"
                    >
                      Load
                    </button>
                    <button onClick={() => deleteScenario(s.id)} aria-label="Delete scenario" className="text-white/70 hover:text-white">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={resetLevers} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/80 hover:text-white">
              <RotateCcw size={12} /> Reset all to default
            </button>
            <p className="mt-2 text-[10px] text-white/60">Base year FY {baseYear}–{String((baseYear + 1) % 100).padStart(2, "0")} · full pathway in Action plan.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ============================================================
   Facility scenario screen
   ============================================================ */

function FacilityScenarioScreen({ facilityId, onBack }: { facilityId: string; onBack: () => void }) {
  const { baseFacilities } = useScope2();
  const f = baseFacilities.find((x) => x.id === facilityId);
  if (!f) { onBack(); return null; }

  return (
    <div className="screen-in flex flex-col gap-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit">
        <ChevronDown size={16} className="rotate-90" /> Back to facilities
      </button>

      <div className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60">
        <h1 className="text-2xl font-extrabold text-ink leading-tight">{f.name}</h1>
        <p className="text-sm text-ink-soft mt-0.5">
          {facilityTypeProfile(f)?.label ?? "Facility"}{f.bu ? ` · ${f.bu}` : ""}
          {f.isolated && <span className="ml-2 text-[11px] font-semibold text-amber-700">· Isolated grid</span>}
        </p>
      </div>

      <Scope2SuggestionCard facilityId={facilityId} />
      <FacilityImpact facilityId={facilityId} />
      <EfficiencyCard facilityId={facilityId} />
      <SolarCard facilityId={facilityId} />
    </div>
  );
}

/* ============================================================
   Suggestion card
   ============================================================ */

function Scope2SuggestionCard({ facilityId }: { facilityId: string }) {
  const { baseFacilities, updateFacilityAction } = useScope2();
  const f = baseFacilities.find((x) => x.id === facilityId);
  if (!f) return null;
  const sug = suggestForFacility(f);

  const applyActions = (actions: typeof sug.actions) => {
    for (const a of actions) {
      updateFacilityAction(f.id, a.lever, a.patch as Parameters<typeof updateFacilityAction>[2]);
    }
  };

  return (
    <div className="rounded-xl3 border border-brand-200 bg-brand-50/60 shadow-card p-5">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg bg-brand-100 grid place-items-center shrink-0 mt-0.5">
          <Lightbulb size={16} className="text-brand-700" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink">{sug.headline}</p>
          <p className="text-sm text-ink-soft mt-0.5">{sug.why}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => applyActions(sug.actions)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-3.5 py-2 hover:bg-brand-600 transition-colors"
            >
              Apply suggestion
            </button>
            {sug.altHeadline && sug.altActions && (
              <button
                onClick={() => applyActions(sug.altActions!)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg border border-brand-300 bg-white text-brand-700 px-3.5 py-2 hover:bg-brand-50 transition-colors"
              >
                {sug.altHeadline}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Facility impact strip
   ============================================================ */

function FacilityImpact({ facilityId }: { facilityId: string }) {
  const { baseFacilities, levers } = useScope2();
  const f = baseFacilities.find((x) => x.id === facilityId);
  if (!f) return null;
  const acts = levers.byFacility[f.id] ?? defaultFacilityActions(f);
  const { baseT, afterT } = facilityImpact(f, acts);
  const capex = capexForFacility(f, acts);
  const abated = baseT - afterT;
  const cutFraction = baseT > 0 ? abated / baseT : 0;
  const barW = baseT > 0 ? Math.max(4, Math.round((afterT / baseT) * 100)) : 100;

  return (
    <div className="rounded-xl3 border border-line/60 bg-surface shadow-card px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Baseline</p>
          <p className="text-2xl font-extrabold tabular-nums text-ink">{fmt(baseT)} <span className="text-sm font-semibold text-ink-soft">tCO₂e</span></p>
        </div>
        <ChevronDown size={18} className="-rotate-90 text-ink-soft" />
        <div>
          <p className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">After levers</p>
          <p className="text-2xl font-extrabold tabular-nums text-brand-600">{fmt(afterT)} <span className="text-sm font-semibold text-ink-soft">tCO₂e</span></p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Saved</p>
          <p className="text-lg font-extrabold tabular-nums text-brand-600">−{fmt(abated)} t <span className="text-sm font-semibold text-ink-soft">({pct(cutFraction)})</span></p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">CAPEX</p>
          <p className="text-lg font-extrabold tabular-nums text-ink">{fmtMoney(capex)}</p>
        </div>
      </div>
      <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
        <div
          className="h-full bg-brand-500 transition-all duration-500 rounded-full"
          style={{ width: `${barW}%` }}
        />
      </div>
    </div>
  );
}

/* ============================================================
   Efficiency card
   ============================================================ */

function EfficiencyCard({ facilityId }: { facilityId: string }) {
  const { baseFacilities, levers, updateFacilityAction } = useScope2();
  const f = baseFacilities.find((x) => x.id === facilityId);
  if (!f) return null;
  const acts = levers.byFacility[f.id] ?? defaultFacilityActions(f);
  const eff = acts.efficiency;

  return (
    <DetailCard title="Efficiency">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb size={16} className="text-brand-600" />
          <span className="font-semibold text-ink text-sm">Energy efficiency · {f.name}</span>
        </div>
        <ToggleSwitch
          on={eff.enabled}
          onChange={(v) => updateFacilityAction(f.id, "efficiency", { enabled: v })}
          label="Enable efficiency"
        />
      </div>
      <div className={cn("space-y-5", !eff.enabled && "opacity-40 pointer-events-none")}>
        <SliderField
          label="LED lighting deployment"
          hint="Share of legacy lighting replaced. LEDs cut the lighting load ~55%."
          value={eff.ledPct} min={0} max={100} suffix="%"
          onChange={(v) => updateFacilityAction(f.id, "efficiency", { ledPct: v })}
        />
        <SliderField
          label="High-efficiency motors / VFDs"
          hint="IE1/IE2 motors moved to IE4/IE5 or fitted with variable-frequency drives. Cuts the motor load ~12.5%."
          value={eff.motorPct} min={0} max={100} suffix="%"
          onChange={(v) => updateFacilityAction(f.id, "efficiency", { motorPct: v })}
        />
        <SliderField
          label="BMS / automation"
          hint="Smart sensors optimizing HVAC schedules and idling equipment. Cuts HVAC + other load ~17.5%."
          value={eff.bmsPct} min={0} max={100} suffix="%"
          onChange={(v) => updateFacilityAction(f.id, "efficiency", { bmsPct: v })}
        />
        <Collapsible title="Advanced">
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumField
              label="LED CAPEX (full)"
              value={eff.ledCapex}
              onChange={(v) => updateFacilityAction(f.id, "efficiency", { ledCapex: v })}
            />
            <NumField
              label="Motor CAPEX (full)"
              value={eff.motorCapex}
              onChange={(v) => updateFacilityAction(f.id, "efficiency", { motorCapex: v })}
            />
            <NumField
              label="BMS CAPEX (full)"
              value={eff.bmsCapex}
              onChange={(v) => updateFacilityAction(f.id, "efficiency", { bmsCapex: v })}
            />
            <NumField
              label="Start year"
              value={eff.startYear} min={2021}
              onChange={(v) => updateFacilityAction(f.id, "efficiency", { startYear: Math.max(2021, Math.min(2050, v)), targetYear: Math.max(v, eff.targetYear) })}
            />
            <NumField
              label="Target year"
              value={eff.targetYear} min={2021}
              onChange={(v) => updateFacilityAction(f.id, "efficiency", { targetYear: Math.max(2021, Math.min(2050, v)) })}
            />
          </div>
        </Collapsible>
        <p className="text-[11px] text-ink-faint mt-1 flex items-start gap-1.5">
          <Info size={12} className="shrink-0 mt-0.5 text-ink-faint" />
          {efficiencyTip(f)}
        </p>
      </div>
    </DetailCard>
  );
}

/* ============================================================
   Solar / generation card
   ============================================================ */

function SolarCard({ facilityId }: { facilityId: string }) {
  const { baseFacilities, levers, updateFacilityAction } = useScope2();
  const f = baseFacilities.find((x) => x.id === facilityId);
  if (!f) return null;
  const acts = levers.byFacility[f.id] ?? defaultFacilityActions(f);
  const gen = acts.generation;
  const cap = Math.max(1, Math.round(roofCapKwp(f)));

  return (
    <DetailCard title="Solar / Battery">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Sun size={16} className="text-amber-500" />
          <span className="font-semibold text-ink text-sm">On-site generation · {f.name}</span>
        </div>
        <ToggleSwitch
          on={gen.enabled}
          onChange={(v) => updateFacilityAction(f.id, "generation", { enabled: v })}
          label="Enable solar / battery"
        />
      </div>
      <div className={cn("space-y-5", !gen.enabled && "opacity-40 pointer-events-none")}>
        <SliderField
          label="Solar PV capacity"
          hint={`Roof space caps the array at ${cap} kWp (5.5 m² per kW). Yield: ${f.irradiance} kWh/kWp/yr.`}
          value={Math.round(gen.solarKwp)} min={0} max={cap} suffix=" kWp"
          onChange={(v) => updateFacilityAction(f.id, "generation", { solarKwp: v })}
        />
        <SelectField
          label="Grid export mode"
          hint="Net metering: the utility credits exported solar at the tariff. Zero export: generation beyond on-site demand is curtailed."
          value={gen.exportMode}
          options={[
            { value: "netMetering", label: "Net metering allowed" },
            { value: "zeroExport", label: "Zero export (curtail)" },
          ]}
          onChange={(v) => updateFacilityAction(f.id, "generation", { exportMode: v })}
        />
        <Collapsible title="Advanced">
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumField
              label="Battery storage (kWh)"
              value={gen.batteryKwh} min={0}
              onChange={(v) => updateFacilityAction(f.id, "generation", { batteryKwh: v })}
            />
            <NumField
              label="Solar CAPEX / kW"
              value={gen.solarCapexPerKw}
              onChange={(v) => updateFacilityAction(f.id, "generation", { solarCapexPerKw: v })}
            />
            <NumField
              label="Battery CAPEX / kWh"
              value={gen.batteryCapexPerKwh}
              onChange={(v) => updateFacilityAction(f.id, "generation", { batteryCapexPerKwh: v })}
            />
            <NumField
              label="Subsidy %"
              value={gen.subsidyPct} min={0}
              onChange={(v) => updateFacilityAction(f.id, "generation", { subsidyPct: Math.max(0, Math.min(100, v)) })}
              suffix="%"
            />
            <NumField
              label="Start year"
              value={gen.startYear} min={2021}
              onChange={(v) => updateFacilityAction(f.id, "generation", { startYear: Math.max(2021, Math.min(2050, v)), targetYear: Math.max(v, gen.targetYear) })}
            />
            <NumField
              label="Target year"
              value={gen.targetYear} min={2021}
              onChange={(v) => updateFacilityAction(f.id, "generation", { targetYear: Math.max(2021, Math.min(2050, v)) })}
            />
          </div>
        </Collapsible>
        <p className="text-[11px] text-ink-faint mt-1 flex items-start gap-1.5">
          <Info size={12} className="shrink-0 mt-0.5 text-ink-faint" />
          {solarTip(f)}
        </p>
      </div>
    </DetailCard>
  );
}

/* ============================================================
   Procurement screen — portfolio-wide
   ============================================================ */

function ProcurementScreen({ onBack }: { onBack: () => void }) {
  const { levers, result, updateProcurement } = useScope2();
  const p = levers.procurement;
  const procSum = p.ppaPct + p.greenTariffPct + p.recPct;

  return (
    <div className="screen-in flex flex-col gap-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit">
        <ChevronDown size={16} className="rotate-90" /> Back to facilities
      </button>

      <div className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60">
        <h1 className="text-2xl font-extrabold text-ink leading-tight">Procurement</h1>
        <p className="text-sm text-ink-soft mt-0.5">Market instruments covering the grid draw across all facilities. Moves the market-based number only — location-based stays physical.</p>
      </div>

      <DetailCard title="Procurement (all facilities)">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Landmark size={16} className="text-brand-600" />
            <span className="font-semibold text-ink text-sm">Renewable procurement · portfolio-wide</span>
          </div>
          <ToggleSwitch
            on={p.enabled}
            onChange={(v) => updateProcurement({ enabled: v })}
            label="Enable procurement"
          />
        </div>

        <div className={cn("space-y-5", !p.enabled && "opacity-40 pointer-events-none")}>
          <SliderField
            label="PPA / VPPA coverage"
            hint="Long-term, high-volume power purchase agreements. A strike price below the grid tariff books a saving."
            value={p.ppaPct} min={0} max={100} suffix="%"
            onChange={(v) => updateProcurement({ ppaPct: v })}
          />
          <SliderField
            label="Green tariff / utility program"
            hint="Certified green power bought from the local utility at a premium on the base rate."
            value={p.greenTariffPct} min={0} max={100} suffix="%"
            onChange={(v) => updateProcurement({ greenTariffPct: v })}
          />
          <SliderField
            label="Unbundled RECs / I-RECs"
            hint="Certificates bridging the gap at year end — pure OPEX cost, no physical delivery."
            value={p.recPct} min={0} max={100} suffix="%"
            onChange={(v) => updateProcurement({ recPct: v })}
          />

          {procSum > 100 && (
            <p className="text-xs font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              Instruments sum to {procSum}% — the model clamps total coverage at 100% of the addressable load, keeping the mix ratio.
            </p>
          )}

          <Collapsible title="Advanced">
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumField
                label="PPA strike Δ / kWh"
                value={p.ppaStrikeDeltaPerKwh}
                onChange={(v) => updateProcurement({ ppaStrikeDeltaPerKwh: v })}
              />
              <NumField
                label="Green tariff premium / kWh"
                value={p.greenTariffPremiumPerKwh}
                onChange={(v) => updateProcurement({ greenTariffPremiumPerKwh: v })}
              />
              <NumField
                label="REC price / kWh"
                value={p.recPricePerKwh}
                onChange={(v) => updateProcurement({ recPricePerKwh: v })}
              />
              <NumField
                label="Start year"
                value={p.startYear} min={2021}
                onChange={(v) => updateProcurement({ startYear: Math.max(2021, Math.min(2050, v)), targetYear: Math.max(v, p.targetYear) })}
              />
              <NumField
                label="Target year"
                value={p.targetYear} min={2021}
                onChange={(v) => updateProcurement({ targetYear: Math.max(2021, Math.min(2050, v)) })}
              />
            </div>
          </Collapsible>

          <div className="flex items-center justify-between rounded-xl border border-line/70 px-3 py-2.5 mt-2">
            <span className="text-sm text-ink">RE100 exclusion flag</span>
            <ToggleSwitch
              on={p.re100Exclusion}
              onChange={(v) => updateProcurement({ re100Exclusion: v })}
              label="RE100 exclusion"
            />
          </div>

          <div className="rounded-xl bg-surface-muted px-3 py-2.5 text-xs text-ink-soft space-y-0.5">
            <p>Addressable load {fmt(result.procurement.addressableKwh)} kWh · covered {fmt(result.procurement.coveredKwh)} kWh</p>
            <p className="font-semibold text-ink">
              Procurement cost {fmtMoney(result.procurement.annualCost)} / yr
              {result.procurement.annualCost < 0 ? " (net saving — PPA hedge)" : ""}
            </p>
          </div>
        </div>
      </DetailCard>
    </div>
  );
}

/* ============================================================
   Energy balance screen (Task 4)
   ============================================================ */

export function Scope2EnergyBalanceScreen({ onBack }: { onBack: () => void }) {
  const { baseFacilities, levers, result, setLevers, baseYear } = useScope2();
  const facilities = baseFacilities.filter((f) => !f.excluded);
  const [dials, setDials] = useState<BalanceDials2>({ efficiencyPct: 0, solarPct: 0, procurementPct: 0 });
  const [targetPct, setTargetPct] = useState(50);

  const applyAndStore = (next: BalanceDials2) => {
    setDials(next);
    setLevers((p) => applyDials2(facilities, p, next));
  };
  const set = (k: keyof BalanceDials2, v: number) => applyAndStore({ ...dials, [k]: v });
  const onSuggest = () => applyAndStore(suggestMix2(facilities, levers, targetPct / 100, baseYear));

  const mix = energyMix2(facilities, levers);
  const totalKwh = mix.gridKwh + mix.renewableKwh;
  const share = (v: number) => (totalKwh > 0 ? (v / totalKwh) * 100 : 0);
  const k = result.kpis;
  const onTrack = k.reduction2030 >= targetPct / 100;

  return (
    <div className="screen-in flex flex-col gap-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit">
        <ChevronDown size={16} className="rotate-90" /> Back to facilities
      </button>

      <div className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60">
        <h1 className="text-2xl font-extrabold text-ink leading-tight">Energy balance</h1>
        <p className="text-sm text-ink-soft mt-0.5">Shift efficiency / solar / procurement and watch Scope 2 move toward your target. Dials set portfolio-wide levers — open any facility or Procurement to fine-tune.</p>
      </div>

      {/* result vs target */}
      <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-5 flex flex-wrap items-center gap-x-8 gap-y-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-soft font-medium">Target</span>
          <input
            type="number"
            value={targetPct}
            min={0}
            max={100}
            onChange={(e) => setTargetPct(Math.max(0, Math.min(100, Number(e.target.value))))}
            className="w-20 text-right tabular-nums rounded-lg border border-line px-2 py-1.5"
          />
          <span className="text-ink-faint text-sm">% by 2030</span>
        </label>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Reduction 2030</div>
          <div className={cn("text-2xl font-extrabold tabular-nums", onTrack ? "text-brand-600" : "text-amber-600")}>{pct(k.reduction2030)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Market-based net</div>
          <div className="text-2xl font-extrabold tabular-nums text-ink">{fmt(k.marketNowT)} t</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Total CAPEX</div>
          <div className="text-2xl font-extrabold tabular-nums text-ink">{fmtMoney(k.totalCapex)}</div>
        </div>
        <span className={cn("ml-auto text-xs font-bold rounded-full px-3 py-1", onTrack ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700")}>
          {onTrack ? "On track to target" : "Below target"}
        </span>
      </div>

      {/* mix bar */}
      <DetailCard title="Energy mix">
        <div className="flex h-3 rounded-full overflow-hidden bg-surface-muted">
          <div className="h-full bg-sky-500" style={{ width: `${share(mix.gridKwh)}%` }} title="Grid electricity" />
          <div className="h-full bg-brand-500" style={{ width: `${share(mix.renewableKwh)}%` }} title="Renewable" />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> Grid electricity <strong className="tabular-nums">{Math.round(share(mix.gridKwh))}%</strong></span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-500" /> Renewable (on-site + procured) <strong className="tabular-nums">{Math.round(share(mix.renewableKwh))}%</strong></span>
        </div>
        <p className="text-[11px] text-ink-faint mt-2">Indicative electricity split after efficiency and on-site generation. Procurement (PPA/RECs) shifts grid draw into the renewable share.</p>
      </DetailCard>

      {/* dials */}
      <DetailCard title="Balance dials">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          <SliderField
            label="Efficiency %"
            suffix="%"
            min={0}
            max={100}
            value={dials.efficiencyPct}
            onChange={(v) => set("efficiencyPct", v)}
            hint="Applies LED/VFD/BMS efficiency at this percentage across all facilities."
          />
          <SliderField
            label="Solar %"
            suffix="%"
            min={0}
            max={100}
            value={dials.solarPct}
            onChange={(v) => set("solarPct", v)}
            hint="Deploys solar PV at this share of each facility's roof capacity."
          />
          <SliderField
            label="Procurement clean %"
            suffix="%"
            min={0}
            max={100}
            value={dials.procurementPct}
            onChange={(v) => set("procurementPct", v)}
            hint="Covers this share of the portfolio grid draw via PPA/green-tariff/RECs."
          />
        </div>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            onClick={onSuggest}
            className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-3.5 py-2 hover:bg-brand-600 transition-colors"
          >
            Suggest a mix for {targetPct}% by 2030
          </button>
          <span className="text-[11px] text-ink-faint">Heuristic order: efficiency first, then solar, then procurement — a starting point, not an optimum.</span>
        </div>
      </DetailCard>
    </div>
  );
}
