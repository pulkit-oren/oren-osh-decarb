"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown, RotateCcw, Save,
  Lightbulb, Sun, Landmark, Info,
} from "lucide-react";
import { facilityGrade } from "@/lib/data-quality";
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
import { suggestAllScope2 } from "@/lib/scope2/model/suggest-all";
import { buildScope2Pathways } from "@/lib/scope2/model/pathways";
import type { Scope2Levers } from "@/lib/scope2/model/types";
import { groupByBu } from "@/lib/group-by-bu";
import { cn, fmt, fmtMoney, pct } from "@/lib/utils";
import { DetailCard, SliderField, ToggleSwitch, NumField, SelectField } from "@/components/tabs/activity/fields";
import { Collapsible } from "@/components/tabs/activity/Collapsible";
import { Scope2CalcPanel } from "./Scope2CalcPanel";
import { PillNav } from "@/components/ui/PillNav";
import { InfoTip } from "../ui/InfoTip";
import { MiniTrajectory } from "@/components/charts/MiniTrajectory";
import { LeverImpactList } from "@/components/ui/LeverImpactList";
import { ScenarioList } from "@/components/ui/ScenarioList";
import { diffFlat, diffLeverMaps, type DiffRow } from "@/lib/scenario-diff";
import { simplePayback } from "@/lib/model/finance";

/* ============================================================
   Router
   ============================================================ */

type S2Mode = "facilities" | "procurement";

/* Per-facility Scope 2 planning + portfolio procurement. The cross-scope
   "Balance to target" dials live one level up in the BuilderHub. */
export function Scope2BuilderTab() {
  const { baseFacilities } = useScope2();
  const [mode, setMode] = useState<S2Mode>("facilities");
  const [view, setView] = useState<"home" | { facilityId: string }>("home");
  const [name, setName] = useState("");

  if (!baseFacilities.length) {
    return (
      <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
        <p className="text-sm text-ink-faint">No facilities yet — add them on the Data input tab first.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PillNav
        items={[
          { key: "facilities", label: "Plan by source" },
          { key: "procurement", label: "Procurement" },
        ]}
        active={mode}
        onSelect={(k) => setMode(k as S2Mode)}
      />

      {mode === "procurement" ? (
        <ProcurementScreen />
      ) : view === "home" ? (
        <Scope2Home setView={setView} name={name} setName={setName} />
      ) : (
        <FacilityScenarioScreen facilityId={view.facilityId} onBack={() => setView("home")} />
      )}
    </div>
  );
}

/* ============================================================
   Home screen — facility boxes + results panel
   ============================================================ */

type SetView = (v: "home" | { facilityId: string }) => void;

function Scope2Home({ setView, name, setName }: { setView: SetView; name: string; setName: (v: string) => void }) {
  const { baseFacilities, levers, result, scenarios, saveScenario, duplicateScenario, deleteScenario, resetLevers, setLevers, baseYear } = useScope2();
  const [note, setNote] = useState("");
  const k = result.kpis;
  const gridFacilities = baseFacilities.filter((f) => !f.excluded && f.gridEf > 0);
  const groups = groupByBu(gridFacilities);

  // What the suggestion engine could still add per facility (shown on unplanned rows).
  const suggestedLevers = useMemo(() => suggestAllScope2(baseFacilities, levers), [baseFacilities, levers]);

  type LM = Parameters<typeof diffLeverMaps>[0];
  const diffRowsFor = (id: string): DiffRow[] => {
    const s = scenarios.find((x) => x.id === id);
    if (!s) return [];
    const facName = (fid: string) => baseFacilities.find((f) => f.id === fid)?.name ?? fid;
    return [
      ...diffLeverMaps(levers.byFacility as unknown as LM, s.levers.byFacility as unknown as LM, facName),
      ...diffFlat(levers.procurement, s.levers.procurement, "Procurement"),
    ];
  };

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-10rem)]">
      <div className="rounded-xl3 border border-line/50 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60 px-5 py-4 shrink-0">
        <h1 className="text-xl font-extrabold text-ink">Scope 2 scenario modeller</h1>
        <p className="text-sm text-ink-soft">Pick a facility to plan efficiency and solar levers — the live result updates on the right.</p>
      </div>

      <div className="rounded-xl3 border border-brand-200 bg-brand-50/50 shadow-card px-4 py-3 shrink-0 flex items-center gap-2 flex-wrap">
        <Lightbulb size={16} className="text-brand-700 shrink-0" />
        <span className="text-sm font-bold text-ink mr-1">Quick start</span>
        <button
          onClick={() => setLevers((p) => suggestAllScope2(baseFacilities, p))}
          className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600 transition-colors"
        >
          Suggest a plan for me
        </button>
        <span className="text-[11px] text-ink-faint">
          Applies each facility&apos;s recommended efficiency + solar in one go — procurement stays yours to set.
        </span>
      </div>

      <div className="shrink-0">
        <Collapsible title="Pathway options — three strategies, scored with your data">
          <Scope2PathwaysPanel onApply={(l) => setLevers(() => l)} />
        </Collapsible>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-5 items-stretch lg:flex-1 lg:min-h-0">
        {/* left: facility list + action tiles */}
        <div className="flex flex-col gap-3 min-h-0">
          {groups.length === 0 ? (
            <p className="text-sm text-ink-faint">No grid-supplied facilities.</p>
          ) : (
            groups.map(([bu, facilities]) => {
              const groupAbated = facilities.reduce((s, f) => {
                const acts = levers.byFacility[f.id] ?? defaultFacilityActions(f);
                const { baseT, afterT } = facilityImpact(f, acts);
                return s + (baseT - afterT);
              }, 0);
              return (
              <div key={bu || "__cw__"}>
                {groups.length > 1 && (
                  <div className="text-[10px] uppercase tracking-wider text-ink-faint font-semibold mb-1.5 flex items-baseline gap-2">
                    {bu || "Company-wide"}
                    {groupAbated > 0.05 && <span className="text-brand-600 font-bold tabular-nums normal-case tracking-normal text-xs">−{fmt(groupAbated)} t</span>}
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {facilities.map((f) => {
                    const acts = levers.byFacility[f.id] ?? defaultFacilityActions(f);
                    const { baseT, afterT } = facilityImpact(f, acts);
                    const abated = baseT - afterT;
                    const activeLevers = (acts.efficiency.enabled ? 1 : 0) + (acts.generation.enabled ? 1 : 0);
                    const prof = facilityTypeProfile(f);
                    const sub = `${prof?.label ?? "Facility"}${f.bu ? ` · ${f.bu}` : ""}`;
                    const sugActs = suggestedLevers.byFacility[f.id];
                    const potential = activeLevers === 0 && sugActs
                      ? Math.max(0, facilityImpact(f, sugActs).baseT - facilityImpact(f, sugActs).afterT)
                      : 0;
                    const noData = facilityGrade(f) !== "measured";
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
                            {noData && <span className="text-[10px] font-semibold uppercase tracking-wide bg-surface-muted text-ink-faint rounded-full px-2 py-0.5">No data</span>}
                          </div>
                          <span className="text-[11px] text-ink-soft">{sub}</span>
                        </div>
                        <div className="text-right shrink-0">
                          {activeLevers > 0 ? (
                            <>
                              <div className="text-sm font-extrabold tabular-nums text-brand-600">−{fmt(abated)} t</div>
                              <div className="text-[10px] text-ink-faint">{activeLevers} lever{activeLevers === 1 ? "" : "s"} on</div>
                            </>
                          ) : potential > 0.05 ? (
                            <>
                              <div className="text-sm font-extrabold tabular-nums text-ink-soft">≈−{fmt(potential)} t</div>
                              <div className="text-[10px] text-brand-700 font-semibold">available · no plan yet</div>
                            </>
                          ) : (
                            <>
                              <div className="text-sm font-extrabold tabular-nums text-ink-faint">—</div>
                              <div className="text-[10px] text-ink-faint">No plan yet</div>
                            </>
                          )}
                        </div>
                        <ChevronDown size={18} className="-rotate-90 text-ink-soft/70 group-hover:text-ink transition-colors shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
              );
            })
          )}

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

          <div className="relative mt-4 space-y-3">
            <MiniTrajectory rows={result.trajectoryMarket} label="Market-based pathway to 2045" />
            <LeverImpactList levers={result.levers} />
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
                onClick={() => { if (name.trim()) { saveScenario(name.trim(), note); setName(""); setNote(""); } }}
                disabled={!name.trim()}
                className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-white text-brand-700 px-3 py-2 hover:bg-white/90 disabled:opacity-50"
              >
                <Save size={15} /> Save
              </button>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional) — e.g. board option A…" className="mt-1.5 w-full text-xs rounded-lg px-3 py-1.5 text-ink bg-white/80 focus:outline-none placeholder:text-ink-faint" />
            {scenarios.length > 0 && (
              <ScenarioList
                items={scenarios}
                onLoad={(id) => { const s = scenarios.find((x) => x.id === id); if (s) setLevers(() => s.levers); }}
                onDuplicate={duplicateScenario}
                onDelete={deleteScenario}
                diffRowsFor={diffRowsFor}
              />
            )}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <button onClick={resetLevers} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/80 hover:text-white">
                <RotateCcw size={12} /> Reset all to default
              </button>
              <Scope2CalcPanel tone="onDark" target={{ kind: "all" }} />
            </div>
            <p className="mt-2 text-[10px] text-white/60">Base year FY {baseYear}–{String((baseYear + 1) % 100).padStart(2, "0")} · full pathway in Action plan.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* Three auto-built Scope 2 strategies (efficiency-first / balanced / RE100),
   each scored with the real model — computed only while the collapsible is open. */
function Scope2PathwaysPanel({ onApply }: { onApply: (l: Scope2Levers) => void }) {
  const { baseFacilities, levers, baseYear } = useScope2();
  const pathways = useMemo(
    () => buildScope2Pathways(baseFacilities, levers, baseYear),
    [baseFacilities, levers, baseYear],
  );

  return (
    <div className="flex flex-col divide-y divide-line/60">
      {pathways.map((p) => (
        <div key={p.id} className="flex items-center gap-4 py-3 flex-wrap">
          <div className="min-w-[180px] flex-1">
            <div className="font-bold text-ink text-sm">{p.name}</div>
            <p className="text-[11px] text-ink-soft mt-0.5">{p.blurb}</p>
          </div>
          <div className="flex items-center gap-5 text-right">
            <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">Cut by 2030</div><div className="text-sm font-extrabold tabular-nums text-brand-600">{pct(p.kpis.reduction2030)}</div></div>
            <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">Market net</div><div className="text-sm font-extrabold tabular-nums text-ink">{fmt(p.kpis.marketNowT)} t</div></div>
            <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">CAPEX</div><div className="text-sm font-extrabold tabular-nums text-ink">{fmtMoney(p.kpis.totalCapex)}</div></div>
            <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">OPEX Δ / yr</div><div className={cn("text-sm font-extrabold tabular-nums", p.kpis.annualOpexDelta <= 0 ? "text-brand-600" : "text-ink")}>{fmtMoney(p.kpis.annualOpexDelta)}</div></div>
          </div>
          <button
            onClick={() => onApply(p.levers)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg border border-brand-300 bg-white text-brand-700 px-3 py-1.5 hover:bg-brand-50 transition-colors shrink-0"
          >
            Apply {p.name}
          </button>
        </div>
      ))}
      <p className="text-[11px] text-ink-faint pt-3">Each option replaces the current plan — save the current one first if you want to keep it. Market-based numbers include your entered VPPA / I-REC coverage.</p>
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
      <div className="flex justify-end -mt-2"><Scope2CalcPanel target={{ kind: "facility", id: facilityId }} /></div>
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
  const { baseFacilities, levers, result } = useScope2();
  const f = baseFacilities.find((x) => x.id === facilityId);
  if (!f) return null;
  const acts = levers.byFacility[f.id] ?? defaultFacilityActions(f);
  const { baseT, afterT } = facilityImpact(f, acts);
  const capex = capexForFacility(f, acts);
  const abated = baseT - afterT;
  const cutFraction = baseT > 0 ? abated / baseT : 0;
  const barW = baseT > 0 ? Math.max(4, Math.round((afterT / baseT) * 100)) : 100;
  // Live running-cost picture for THIS facility's levers (efficiency + solar).
  const pf = result.perFacility[f.id];
  const annualSaving = (acts.efficiency.enabled ? pf?.eff.opexSaving ?? 0 : 0) + (acts.generation.enabled ? pf?.gen.opexSaving ?? 0 : 0);
  const payback = simplePayback(capex, annualSaving);

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
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-ink-faint font-bold flex items-center justify-end gap-1">OPEX / yr <InfoTip text="Annual running-cost change from these levers — avoided grid electricity and export credits. Negative = saving." /></p>
          <p className={cn("text-lg font-extrabold tabular-nums", annualSaving > 0 ? "text-brand-600" : "text-ink")}>
            {annualSaving > 0 ? `saves ${fmtMoney(annualSaving)}` : "±0"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-ink-faint font-bold flex items-center justify-end gap-1">Payback <InfoTip text="Simple payback: CAPEX ÷ annual saving." /></p>
          <p className="text-lg font-extrabold tabular-nums text-ink">{payback != null ? `${payback.toFixed(1)} yr` : "—"}</p>
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
          <span className="font-semibold text-ink text-sm flex items-center gap-1">Energy efficiency · {f.name} <InfoTip text="Use less electricity for the same output — LED lighting, high-efficiency motors/VFDs, and building-management systems. Cuts both location- and market-based emissions." /></span>
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
          <span className="font-semibold text-ink text-sm flex items-center gap-1">On-site generation · {f.name} <InfoTip text="Generate your own electricity on-site with rooftop solar (plus optional battery), displacing grid power. Cuts both location- and market-based emissions." /></span>
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

function ProcurementScreen({ onBack }: { onBack?: () => void }) {
  const { levers, result, updateProcurement } = useScope2();
  const p = levers.procurement;
  const procSum = p.ppaPct + p.greenTariffPct + p.recPct;

  return (
    <div className="screen-in flex flex-col gap-5">
      {onBack && (
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit">
          <ChevronDown size={16} className="rotate-90" /> Back to facilities
        </button>
      )}

      <div className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60">
        <h1 className="text-2xl font-extrabold text-ink leading-tight">Procurement</h1>
        <p className="text-sm text-ink-soft mt-0.5">Market instruments covering the grid draw across all facilities. Moves the market-based number only — location-based stays physical.</p>
      </div>

      <div className="flex justify-end"><Scope2CalcPanel target={{ kind: "procurement" }} /></div>

      <DetailCard title="Procurement (all facilities)">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Landmark size={16} className="text-brand-600" />
            <span className="font-semibold text-ink text-sm flex items-center gap-1">Renewable procurement · portfolio-wide <InfoTip text="Buy renewable electricity via PPAs, green tariffs or RECs. Lowers your market-based emissions across all facilities without changing physical grid use." /></span>
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
            {result.kpis.existingContractedKwh > 0 && (
              <p className="text-brand-700 font-medium">
                Already contracted {fmt(result.kpis.existingContractedKwh)} kWh (VPPA / I-REC entered in Data input) — counted in the market-based baseline; the sliders below add on top.
              </p>
            )}
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

