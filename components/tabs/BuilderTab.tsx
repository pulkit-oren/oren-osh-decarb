"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Factory, Truck, Snowflake, RotateCcw, ChevronDown, Save,
  Zap, Fuel, AlertTriangle, Wrench, Info, Lightbulb, Search,
} from "lucide-react";
import { combustionGrade, refrigerantGrade, type Grade } from "@/lib/data-quality";
import { suggestForAsset, suggestForSystem, capexForAsset, capexForSystem, electrifyTip, fuelSwitchTip, flexFuelTip, gasSwitchTip, leakFixTip, type Suggestion, type SuggestedAction } from "@/lib/model/suggestions";
import { outlivesAsset, retirementYear } from "@/lib/model/validate";
import { useScenario } from "@/lib/store";
import { FUELS, ALT_FUELS, ALT_FUELS_BY_FUEL, maxBlendPctFor, FAMILY_COLORS, REFRIGERANTS, ALT_REFRIGERANT_IDS, RECOMMENDED_ALT_BY_SYSTEM } from "@/lib/model/factors";
import { applyAssetActions, defaultActions, defaultFlexFuel, defaultSystemActions, flexFuelCapable } from "@/lib/model/segments";
import { endUseProfile, endUsesFor, type EndUseId } from "@/lib/model/end-use";
import { refrigClassProfile } from "@/lib/model/refrigerant-class";
import { combustionCO2e, refrigerantCO2e } from "@/lib/model/baseline";
import { applyRefrigerant } from "@/lib/model/levers";
import { CURRENCY } from "@/lib/defaults";
import type { CombustionAsset, FlexFuelAction, FuelSwitchAction, RefrigerantEra, RefrigerantId, RefrigerationSystem } from "@/lib/model/types";
import { cn, fmt, fmtK, fmtMoney, fmtNum, pct } from "@/lib/utils";
import { InfoTip } from "../ui/InfoTip";
import { Collapsible } from "@/components/tabs/activity/Collapsible";
import { DetailCard, ToggleSwitch, Stepper, SliderField, NumField, Segmented, SelectField } from "@/components/tabs/activity/fields";
import { groupByBu } from "@/lib/group-by-bu";
import { suggestAllSettings } from "@/lib/model/suggest-all";
import { buildPathways } from "@/lib/model/pathways";
import type { LeverSettings } from "@/lib/model/types";
import { boardroomVariants } from "@/lib/boardroom-scenarios";
import { ScenarioCalcPanel } from "./ScenarioCalcPanel";
import { MiniTrajectory } from "@/components/charts/MiniTrajectory";
import { LeverImpactList } from "@/components/ui/LeverImpactList";
import { ScenarioList } from "@/components/ui/ScenarioList";
import { diffFlat, diffLeverMaps, type DiffRow } from "@/lib/scenario-diff";

type Seg = "mobile" | "stationary" | "refrigerant";

const SEG_META: Record<Seg, { label: string; sub: string; icon: React.ElementType; colorIdx: number }> = {
  mobile: { label: "Mobile", sub: "Vehicles & fleets", icon: Truck, colorIdx: 5 },
  stationary: { label: "Stationary", sub: "Boilers, gensets, process", icon: Factory, colorIdx: 6 },
  refrigerant: { label: "Refrigerant", sub: "Cooling — per-system plans", icon: Snowflake, colorIdx: 1 },
};

const SYSTEM_TYPE_LABELS: Record<RefrigerationSystem["systemType"], string> = {
  commercialHVAC: "Commercial HVAC",
  industrialColdStorage: "Industrial cold storage",
  retailRefrigeration: "Retail refrigeration",
};

const ERA_BADGE: Record<RefrigerantEra, { label: string; cls: string }> = {
  legacy: { label: "legacy", cls: "bg-amber-50 text-amber-700" },
  current: { label: "current", cls: "bg-surface-muted text-ink-soft" },
  future: { label: "future", cls: "bg-brand-50 text-brand-700" },
};

type SegStats = { count: number; active: number; abated: number };

function segStats(
  seg: Seg,
  baseAssets: CombustionAsset[],
  baseSystems: RefrigerationSystem[],
  settings: ReturnType<typeof useScenario>["settings"],
): SegStats {
  if (seg === "refrigerant") {
    let active = 0, abated = 0;
    for (const s of baseSystems) {
      const acts = settings.bySystem[s.id];
      if (!acts) continue;
      if (acts.gasSwitch.enabled || acts.leakFix.enabled) active++;
      const after = applyRefrigerant(s, {
        transitionPct: acts.gasSwitch.enabled ? acts.gasSwitch.transitionPct : 0,
        altRefrigerant: acts.gasSwitch.altRefrigerant,
        leakImprovementPct: acts.leakFix.enabled ? acts.leakFix.leakImprovementPct : 0,
      });
      abated += Math.max(0, refrigerantCO2e(s) - Math.max(0, after.newFugitiveT));
    }
    return { count: baseSystems.length, active, abated };
  }
  const assets = baseAssets.filter((a) => a.category === seg);
  let active = 0, abated = 0;
  for (const a of assets) {
    const acts = settings.byAsset[a.id];
    if (!acts) continue;
    if (acts.electrify.enabled || acts.fuelSwitch.enabled || acts.flexFuel?.enabled) active++;
    const res = applyAssetActions(a, acts, settings.assumptions);
    abated += res.scope1AbatementT + res.fuelAbatementT;
  }
  return { count: assets.length, active, abated };
}

/** What the suggestion engine could still cut on a source with no plan (t/yr). */
function suggestedAbatementFor(seg: Seg, source: CombustionAsset | RefrigerationSystem, assumptions: ReturnType<typeof useScenario>["settings"]["assumptions"]): number {
  if (seg === "refrigerant") {
    const sys = source as RefrigerationSystem;
    const st = suggestAllSettings([], [sys], { byAsset: {}, bySystem: {}, assumptions });
    const acts = st.bySystem[sys.id];
    if (!acts) return 0;
    const after = applyRefrigerant(sys, {
      transitionPct: acts.gasSwitch.enabled ? acts.gasSwitch.transitionPct : 0,
      altRefrigerant: acts.gasSwitch.altRefrigerant,
      leakImprovementPct: acts.leakFix.enabled ? acts.leakFix.leakImprovementPct : 0,
    });
    return Math.max(0, refrigerantCO2e(sys) - Math.max(0, after.newFugitiveT));
  }
  const a = source as CombustionAsset;
  const st = suggestAllSettings([a], [], { byAsset: {}, bySystem: {}, assumptions });
  const acts = st.byAsset[a.id];
  if (!acts) return 0;
  const res = applyAssetActions(a, acts, assumptions);
  return res.scope1AbatementT + res.fuelAbatementT;
}

/** Small amber/grey pill when the underlying data isn't metered. */
function GradeBadge({ grade }: { grade: Grade }) {
  if (grade === "measured") return null;
  return (
    <span className={cn(
      "text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5",
      grade === "estimated" ? "bg-amber-50 text-amber-700" : "bg-surface-muted text-ink-faint",
    )}>
      {grade === "estimated" ? "Estimated" : "No data"}
    </span>
  );
}

function SourceBox({ seg, source, onOpen }: { seg: Seg; source: CombustionAsset | RefrigerationSystem; onOpen: () => void }) {
  const { settings } = useScenario();
  let sub: string;
  let abated = 0;
  let active = 0;
  const excluded = source.excluded ?? false;

  if (seg === "refrigerant") {
    const sys = source as RefrigerationSystem;
    const acts = settings.bySystem[sys.id];
    const cls = refrigClassProfile(sys);
    sub = `${SYSTEM_TYPE_LABELS[sys.systemType]}${cls ? ` · ${cls.label}` : ""}`;
    if (acts) {
      if (acts.gasSwitch.enabled) active++;
      if (acts.leakFix.enabled) active++;
      const after = applyRefrigerant(sys, {
        transitionPct: acts.gasSwitch.enabled ? acts.gasSwitch.transitionPct : 0,
        altRefrigerant: acts.gasSwitch.altRefrigerant,
        leakImprovementPct: acts.leakFix.enabled ? acts.leakFix.leakImprovementPct : 0,
      });
      abated = Math.max(0, refrigerantCO2e(sys) - Math.max(0, after.newFugitiveT));
    }
  } else {
    const a = source as CombustionAsset;
    const acts = settings.byAsset[a.id];
    const eu = endUseProfile(a);
    sub = `${FUELS[a.fuelType].label} · ${a.category}${eu ? ` · ${eu.label}` : ""}`;
    if (acts) {
      if (acts.electrify.enabled) active++;
      if (acts.fuelSwitch.enabled) active++;
      if (acts.flexFuel?.enabled) active++;
      const res = applyAssetActions(a, acts, settings.assumptions);
      abated = res.scope1AbatementT + res.fuelAbatementT;
    }
  }
  const hasPlan = !!(seg === "refrigerant" ? settings.bySystem[(source as RefrigerationSystem).id] : settings.byAsset[(source as CombustionAsset).id]);
  const grade = seg === "refrigerant" ? refrigerantGrade(source as RefrigerationSystem) : combustionGrade(source as CombustionAsset);
  const potential = !hasPlan && !excluded ? suggestedAbatementFor(seg, source, settings.assumptions) : 0;

  return (
    <button
      onClick={onOpen}
      className={cn(
        "group flex items-center gap-3 rounded-xl3 border border-line/60 bg-surface shadow-card px-5 py-4 text-left w-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lg",
        excluded && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-ink truncate">{source.name}</span>
          {excluded && <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">Excluded</span>}
          <GradeBadge grade={grade} />
        </div>
        <span className="text-[11px] text-ink-soft">{sub}</span>
      </div>
      <div className="text-right shrink-0">
        {hasPlan ? (
          <>
            <div className="text-sm font-extrabold tabular-nums text-brand-600">−{fmt(abated)} t</div>
            <div className="text-[10px] text-ink-faint">{active} lever{active === 1 ? "" : "s"} on</div>
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
}

/* Per-source Scope 1 planning. The cross-scope "Balance to target" dials live
   one level up in the BuilderHub. */
export function BuilderTab() {
  const [view, setView] = useState<"home" | Seg | { seg: Seg; sourceId: string }>("home");
  const [name, setName] = useState("");

  return (
    <div className="flex flex-col gap-4">
      {view === "home" ? (
        <ModellerHome onOpen={setView} name={name} setName={setName} />
      ) : typeof view === "string" ? (
        <SegmentScreen seg={view} onBack={() => setView("home")} onOpenSource={(id) => setView({ seg: view, sourceId: id })} />
      ) : (
        <SourceScenarioScreen seg={view.seg} sourceId={view.sourceId} onBack={() => setView(view.seg)} />
      )}
    </div>
  );
}

function ModellerHome({ onOpen, name, setName }: { onOpen: (s: Seg) => void; name: string; setName: (v: string) => void }) {
  const { baseAssets, baseSystems, settings, result, scenarios, saveScenario, duplicateScenario, deleteScenario, setSettings, resetSettings, baseYear } = useScenario();
  const [note, setNote] = useState("");
  const k = result.kpis;
  const segs = Object.keys(SEG_META) as Seg[];

  const suggestAll = () => setSettings((p) => suggestAllSettings(baseAssets, baseSystems, p));
  const applyVariant = (id: "bau" | "accelerated") => {
    const v = boardroomVariants(settings).find((x) => x.id === id);
    if (v) setSettings(() => v.settings);
  };

  // What the suggestion engine could still add on top of the current plan, per segment.
  const suggestedSettings = useMemo(
    () => suggestAllSettings(baseAssets, baseSystems, settings),
    [baseAssets, baseSystems, settings],
  );

  type LM = Parameters<typeof diffLeverMaps>[0];
  const diffRowsFor = (id: string): DiffRow[] => {
    const s = scenarios.find((x) => x.id === id);
    if (!s) return [];
    const assetName = (aid: string) => baseAssets.find((a) => a.id === aid)?.name ?? aid;
    const sysName = (sid: string) => baseSystems.find((sy) => sy.id === sid)?.name ?? sid;
    return [
      ...diffLeverMaps(settings.byAsset as unknown as LM, s.settings.byAsset as unknown as LM, assetName),
      ...diffLeverMaps(settings.bySystem as unknown as LM, s.settings.bySystem as unknown as LM, sysName),
      ...diffFlat(settings.assumptions, s.settings.assumptions, "Global assumptions"),
    ];
  };

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-10rem)]">
      <div className="rounded-xl3 border border-line/50 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60 px-5 py-4 shrink-0">
        <h1 className="text-xl font-extrabold text-ink">Scenario modeller</h1>
        <p className="text-sm text-ink-soft">Pick a segment to plan its levers — the live result updates on the right.</p>
      </div>

      <div className="rounded-xl3 border border-brand-200 bg-brand-50/50 shadow-card px-4 py-3 shrink-0 flex items-center gap-2 flex-wrap">
        <Lightbulb size={16} className="text-brand-700 shrink-0" />
        <span className="text-sm font-bold text-ink mr-1">Quick start</span>
        <button onClick={suggestAll} className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600 transition-colors">
          Suggest a plan for me
        </button>
        <button onClick={() => applyVariant("accelerated")} className="text-sm font-medium rounded-lg border border-brand-300 bg-white text-brand-700 px-3 py-1.5 hover:bg-brand-50 transition-colors" title="Push every enabled lever to full tilt by 2030">
          Accelerated · 2030
        </button>
        <button onClick={() => applyVariant("bau")} className="text-sm font-medium rounded-lg border border-line bg-white text-ink-soft px-3 py-1.5 hover:border-brand-300 transition-colors" title="Switch every lever off — the do-nothing baseline">
          Business as usual
        </button>
        <span className="text-[11px] text-ink-faint">
          Suggest applies each source&apos;s recommended levers in one go — then fine-tune below.
        </span>
      </div>

      <div className="shrink-0">
        <Collapsible title="Pathway options — three strategies, scored with your data">
          <PathwaysPanel onApply={(s) => setSettings(() => s)} />
        </Collapsible>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-5 items-stretch lg:flex-1 lg:min-h-0">
        <div className="flex flex-col gap-3 min-h-0">
          {segs.map((key) => {
            const m = SEG_META[key];
            const Icon = m.icon;
            const st = segStats(key, baseAssets, baseSystems, settings);
            const potential = Math.max(0, segStats(key, baseAssets, baseSystems, suggestedSettings).abated - st.abated);
            const color = FAMILY_COLORS[m.colorIdx];
            return (
              <button
                key={key}
                onClick={() => onOpen(key)}
                className="group flex items-center gap-4 rounded-xl3 border border-line/60 bg-surface shadow-card px-5 text-left flex-1 min-h-[84px] transition-all duration-200 hover:-translate-y-1 hover:shadow-card-lg"
              >
                <span className="w-12 h-12 rounded-2xl grid place-items-center shrink-0" style={{ background: `${color}1A` }}>
                  <Icon size={24} style={{ color }} />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-xl font-extrabold text-ink truncate">{m.label}</span>
                  <span className="text-xs text-ink-soft">{st.count} asset{st.count === 1 ? "" : "s"} · {st.active} with a plan</span>
                  {potential > 0.05 && (
                    <span className="block text-[11px] font-semibold text-brand-700">≈−{fmt(potential)} t more available via suggestions</span>
                  )}
                </div>
                <div className="text-right shrink-0 mr-1">
                  <div className="text-[9px] uppercase tracking-wide text-ink-soft font-bold">Abatement</div>
                  <div className="text-base font-extrabold tabular-nums text-brand-600">−{fmt(st.abated)}<span className="text-[10px] text-ink-soft"> t</span></div>
                </div>
                <ChevronDown size={20} className="-rotate-90 text-ink-soft/70 group-hover:text-ink group-hover:-translate-x-0 transition-all shrink-0" />
              </button>
            );
          })}
        </div>

        <aside className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 text-white shadow-card-lg p-6 flex flex-col">
          <p className="relative text-[11px] uppercase tracking-wide font-bold text-white/80">Live projection</p>
          <p className="relative mt-3 text-[40px] leading-none font-extrabold tabular-nums">{pct(k.reduction2030)}</p>
          <p className="relative mt-1 text-xs text-white/70">reduction by 2030</p>
          <div className="relative mt-5 grid grid-cols-2 gap-3">
            <div><p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Net 2030</p><p className="text-xl font-extrabold tabular-nums">{fmtK(k.net2030)} t</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Cost / t</p><p className="text-xl font-extrabold tabular-nums">{CURRENCY}{fmt(k.costPerTonne)}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Years to target</p><p className="text-xl font-extrabold tabular-nums">{k.yearsToTarget ? String(k.yearsToTarget) : "—"}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Status</p><p className="text-xl font-extrabold">{k.onTrack2030 ? "On track" : "Behind"}</p></div>
          </div>

          <div className="relative mt-4 space-y-3">
            <MiniTrajectory rows={result.trajectory} label="Pathway to 2045" />
            <LeverImpactList levers={result.levers} />
          </div>

          <div className="relative mt-auto pt-5 border-t border-white/20">
            <div className="flex items-center gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this scenario…" className="flex-1 min-w-0 text-sm rounded-lg px-3 py-2 text-ink bg-white/95 focus:outline-none" />
              <button onClick={() => { if (name.trim()) { saveScenario(name.trim(), note); setName(""); setNote(""); } }} disabled={!name.trim()} className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-white text-brand-700 px-3 py-2 hover:bg-white/90 disabled:opacity-50">
                <Save size={15} /> Save
              </button>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional) — e.g. board option A…" className="mt-1.5 w-full text-xs rounded-lg px-3 py-1.5 text-ink bg-white/80 focus:outline-none placeholder:text-ink-faint" />
            {scenarios.length > 0 && (
              <ScenarioList
                items={scenarios}
                onLoad={(id) => { const s = scenarios.find((x) => x.id === id); if (s) setSettings(() => s.settings); }}
                onDuplicate={duplicateScenario}
                onDelete={deleteScenario}
                diffRowsFor={diffRowsFor}
              />
            )}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <button onClick={resetSettings} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/80 hover:text-white">
                <RotateCcw size={12} /> Reset all to default
              </button>
              <ScenarioCalcPanel tone="onDark" />
            </div>
            <p className="mt-2 text-[10px] text-white/60">Base year FY {baseYear}-{String((baseYear + 1) % 100).padStart(2, "0")} · full pathway in Action plan.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* Three auto-built strategies (quick wins / balanced / max), each scored with
   the real model — computed only while the collapsible is open. */
function PathwaysPanel({ onApply }: { onApply: (s: LeverSettings) => void }) {
  const { baseAssets, baseSystems, settings, baseYear } = useScenario();
  const pathways = useMemo(
    () => buildPathways(baseAssets, baseSystems, settings, baseYear),
    [baseAssets, baseSystems, settings, baseYear],
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
            <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">CAPEX</div><div className="text-sm font-extrabold tabular-nums text-ink">{fmtMoney(p.kpis.totalCapex)}</div></div>
            <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">Cost / t</div><div className="text-sm font-extrabold tabular-nums text-ink">{CURRENCY}{fmt(p.kpis.costPerTonne)}</div></div>
            <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">Payback</div><div className="text-sm font-extrabold tabular-nums text-ink">{p.kpis.paybackYears != null ? `${fmtNum(p.kpis.paybackYears, 1)} yr` : "—"}</div></div>
          </div>
          <button
            onClick={() => onApply(p.settings)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg border border-brand-300 bg-white text-brand-700 px-3 py-1.5 hover:bg-brand-50 transition-colors shrink-0"
          >
            Apply {p.name}
          </button>
        </div>
      ))}
      <p className="text-[11px] text-ink-faint pt-3">Each option replaces the current plan — save the current one first if you want to keep it. Numbers use your entered data and assumptions.</p>
    </div>
  );
}

type SourceSort = "baseline" | "abatement" | "name";

function SegmentScreen({ seg, onBack, onOpenSource }: { seg: Seg; onBack: () => void; onOpenSource: (id: string) => void }) {
  const { baseAssets, baseSystems, settings } = useScenario();
  const m = SEG_META[seg];
  const Icon = m.icon;
  const color = FAMILY_COLORS[m.colorIdx];
  const st = segStats(seg, baseAssets, baseSystems, settings);
  const segAssets = baseAssets.filter((a) => a.category === seg);

  const [q, setQ] = useState("");
  const [onlyUnplanned, setOnlyUnplanned] = useState(false);
  const [sort, setSort] = useState<SourceSort>("baseline");

  const assetMetrics = (a: CombustionAsset) => {
    const acts = settings.byAsset[a.id];
    const planned = !!acts && (acts.electrify.enabled || acts.fuelSwitch.enabled || !!acts.flexFuel?.enabled);
    const res = acts ? applyAssetActions(a, acts, settings.assumptions) : null;
    return { baseline: combustionCO2e(a), abated: res ? res.scope1AbatementT + res.fuelAbatementT : 0, planned };
  };
  const visibleAssets = (assets: CombustionAsset[]) =>
    assets
      .filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase()))
      .filter((a) => !onlyUnplanned || !assetMetrics(a).planned)
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        const ma = assetMetrics(a), mb = assetMetrics(b);
        return sort === "abatement" ? mb.abated - ma.abated : mb.baseline - ma.baseline;
      });
  const buRollup = (assets: CombustionAsset[]) => {
    const ms = assets.map(assetMetrics);
    return { abated: ms.reduce((s2, x) => s2 + x.abated, 0), planned: ms.filter((x) => x.planned).length, n: assets.length };
  };

  return (
    <div className="screen-in flex flex-col gap-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit">
        <ChevronDown size={16} className="rotate-90" /> All segments
      </button>

      <div className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${color}22, ${color}0D)` }}>
        <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><Icon size={28} style={{ color }} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-ink leading-tight">{m.label}</h1>
          <p className="text-sm font-medium text-ink-soft mt-0.5">{m.sub} · {st.count} asset{st.count === 1 ? "" : "s"} · {st.active} with a plan</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Abatement</div>
          <div className="text-3xl font-extrabold tabular-nums text-brand-600 leading-none mt-1">−{fmt(st.abated)} <span className="text-base font-semibold text-ink-soft">t</span></div>
        </div>
      </div>

      <div className="flex justify-end">
        <ScenarioCalcPanel target={{ kind: "segment", seg }} />
      </div>

      {seg === "refrigerant" ? (
        <RefrigerantControls onOpenSource={onOpenSource} />
      ) : segAssets.length === 0 ? (
        <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6"><p className="text-sm text-ink-faint">No {m.label.toLowerCase()} assets yet — add them in Data input.</p></div>
      ) : (
        <>
          {segAssets.length > 5 && (
            <div className="rounded-xl3 border border-line/60 bg-surface shadow-card px-4 py-3 flex items-center gap-4 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search sources…"
                  aria-label="Search sources"
                  className="text-sm border border-line rounded-lg pl-8 pr-3 py-1.5 bg-white focus:outline-none focus:border-brand-400 w-52"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-soft cursor-pointer">
                <input type="checkbox" checked={onlyUnplanned} onChange={(e) => setOnlyUnplanned(e.target.checked)} className="w-4 h-4 accent-brand-500" />
                No plan yet only
              </label>
              <label className="flex items-center gap-2 text-sm ml-auto">
                <span className="text-ink-faint text-xs font-semibold uppercase tracking-wide">Sort</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as SourceSort)} aria-label="Sort sources" className="text-sm border border-line rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-brand-400">
                  <option value="baseline">Biggest baseline</option>
                  <option value="abatement">Biggest abatement</option>
                  <option value="name">Name</option>
                </select>
              </label>
            </div>
          )}
          {groupByBu(segAssets).map(([bu, assets]) => {
            const shown = visibleAssets(assets);
            if (shown.length === 0) return null;
            const roll = buRollup(assets);
            return (
              <Collapsible
                key={bu}
                title={bu || "Company-wide"}
                right={
                  <span className="text-xs font-bold tabular-nums text-brand-600 normal-case tracking-normal">
                    −{fmt(roll.abated)} t <span className="text-ink-faint font-medium">· {roll.planned}/{roll.n} planned</span>
                  </span>
                }
                defaultOpen
              >
                <div className="flex flex-col gap-3">
                  {shown.map((a) => <SourceBox key={a.id} seg={seg} source={a} onOpen={() => onOpenSource(a.id)} />)}
                </div>
              </Collapsible>
            );
          })}
        </>
      )}
    </div>
  );
}

function SourceScenarioScreen({ seg, sourceId, onBack }: { seg: Seg; sourceId: string; onBack: () => void }) {
  const { baseAssets, baseSystems, updateCombustion, baseYear } = useScenario();
  const label = SEG_META[seg].label;
  const back = (
    <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit">
      <ChevronDown size={16} className="rotate-90" /> Back to {label}
    </button>
  );

  if (seg === "refrigerant") {
    const sys = baseSystems.find((s) => s.id === sourceId);
    if (!sys) { onBack(); return null; }
    return (
      <div className="screen-in flex flex-col gap-5">
        {back}
        <SuggestionCard kind="system" id={sys.id} />
        <SourceImpact kind="system" id={sys.id} />
        <div className="flex justify-end -mt-2"><ScenarioCalcPanel target={{ kind: "system", id: sys.id }} /></div>
        <SystemActionCard system={sys} />
        <AssumptionsCard seg="refrigerant" />
      </div>
    );
  }
  const a = baseAssets.find((x) => x.id === sourceId);
  if (!a) { onBack(); return null; }
  return (
    <div className="screen-in flex flex-col gap-5">
      {back}
      <DetailCard title="Equipment / vehicle type">
        <SelectField
          label="Type"
          value={(a.endUse ?? "") as EndUseId | ""}
          options={[{ value: "" as EndUseId | "", label: "Unspecified" }, ...endUsesFor(a.category).map((p) => ({ value: p.id as EndUseId | "", label: p.label }))]}
          onChange={(v) => updateCombustion(baseYear, a.id, { endUse: (v || undefined) as EndUseId | undefined })}
          hint="Changing the type updates the suggestion and the lever defaults below — click Apply suggestion to adopt the new type's numbers. It does not change your baseline or any lever you've already set."
        />
      </DetailCard>
      <SuggestionCard kind="asset" id={a.id} />
      <SourceImpact kind="asset" id={a.id} />
      <div className="flex justify-end -mt-2"><ScenarioCalcPanel target={{ kind: "asset", id: a.id }} /></div>
      <AssetActionCard asset={a} />
      <AssumptionsCard seg={seg} />
    </div>
  );
}

/* ============================================================
   Per-asset action card
   ============================================================ */

function AssetActionCard({ asset }: { asset: CombustionAsset }) {
  const { settings, setSettings, updateAction, baseYear } = useScenario();
  const acts = settings.byAsset[asset.id];

  if (!acts) {
    return (
      <div className={cn("rounded-xl3 border border-line/60 bg-surface shadow-card p-6", asset.excluded && "opacity-60")}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-ink">{asset.name}</h3>
            {asset.excluded && (
              <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 mt-1">
                Excluded from totals
              </span>
            )}
            <p className="text-sm text-ink-soft">No plan yet for this asset.</p>
          </div>
          <button
            onClick={() => setSettings((p) => ({ ...p, byAsset: { ...p.byAsset, [asset.id]: defaultActions(asset) } }))}
            className="text-sm font-medium rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600"
          >
            Add plan
          </button>
        </div>
      </div>
    );
  }

  const res = applyAssetActions(asset, acts, settings.assumptions);
  const totalAbate = res.scope1AbatementT + res.fuelAbatementT;
  const baseT = combustionCO2e(asset);
  const afterT = Math.max(0, baseT - totalAbate);
  const isMobile = asset.category === "mobile";
  const e = acts.electrify;
  const eu = endUseProfile(asset);
  const electrifyWarn = !!eu && (eu.electrify.feasible === "hard" || eu.electrify.feasible === "no");
  const eColor = FAMILY_COLORS[isMobile ? 5 : 6];

  return (
    <div className={cn("rounded-xl3 border border-line/60 bg-surface shadow-card p-6", asset.excluded && "opacity-60")}>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0" style={{ background: `${eColor}1A` }}>
            {isMobile ? <Truck size={22} style={{ color: eColor }} /> : <Factory size={22} style={{ color: eColor }} />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-extrabold leading-tight text-ink">{asset.name}</h2>
              {asset.excluded && (
                <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                  Excluded from totals
                </span>
              )}
            </div>
            <p className="text-sm text-ink-soft mt-0.5">
              {isMobile ? `${asset.unitCount} vehicles` : "1 unit"} · {fmt(asset.annualVolume)} {asset.unit}/yr{(() => { const eu = endUseProfile(asset); return eu ? <> · <span className="font-medium text-ink">{eu.label}</span></> : null; })()}
            </p>
            {!asset.excluded && asset.annualVolume === 0 && (
              <p className="text-[11px] text-ink-faint mt-0.5">No consumption entered yet</p>
            )}
          </div>
        </div>
      </div>

      {/* electrify + fuel switch, side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 border-t border-line/70 mt-1 pt-4">
      <ActionRow
        title="Electrify"
        sub={isMobile ? "Swap to EVs" : "Heat pump / electric"}
        icon={Zap}
        color={eColor}
        enabled={e.enabled}
        onToggle={() => updateAction(asset.id, "electrify", { enabled: !e.enabled })}
        info="Replace fuel-burning equipment or vehicles with electric ones (heat pump, electric boiler, EV). Emissions move off your fuel (Scope 1) onto electricity (Scope 2), which is cleaner and can be greened."
        className="lg:pr-7"
        warning={electrifyWarn ? (
          <p className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 text-[11px] font-medium">
            ⚠ {eu!.electrify.note ?? "Limited electrification potential for this equipment."}
          </p>
        ) : undefined}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 items-end">
          {isMobile ? (
            <Stepper
              label="Vehicles to convert"
              hint="How many of this fleet's vehicles become EVs. Higher = bigger Scope 1 cut, more electricity to source."
              value={e.unitsToConvert}
              max={asset.unitCount}
              onChange={(v) => updateAction(asset.id, "electrify", { unitsToConvert: v })}
            />
          ) : (
            <SliderField label="Electrify capacity" value={e.capacityPct} min={0} max={100} suffix="%" accent={eColor} onChange={(v) => updateAction(asset.id, "electrify", { capacityPct: v })} hint="Share of this asset's thermal/process demand moved to electric (heat pump or electric boiler)." />
          )}
          <NumField label="Target year" value={e.targetYear} hint="The year this conversion is fully in place. It ramps from the start year to here." min={2021} onChange={(v) => updateAction(asset.id, "electrify", { targetYear: Math.max(2021, Math.min(2050, v)) })} />
        </div>
        <Collapsible title="Advanced">
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumField
              label={isMobile ? "EV efficiency (× ICE)" : "Heat-pump COP"}
              hint={isMobile ? "How many times more efficient an EV is than the engine it replaces. ~3 means it needs a third of the energy." : "Coefficient of performance: 1 = electric boiler, 3–4 = heat pump. Higher = far less electricity needed."}
              value={e.cop} step={0.1} onChange={(v) => updateAction(asset.id, "electrify", { cop: v })}
            />
            <NumField label="Electricity tariff" hint="What you pay for power. Sets the new running cost." value={e.tariffPerKwh} step={0.5} suffix={`${CURRENCY}/kWh`} onChange={(v) => updateAction(asset.id, "electrify", { tariffPerKwh: v })} />
            <NumField label={isMobile ? "CAPEX per vehicle" : "Asset CAPEX"} hint="Up-front cost of the electric kit (per vehicle for fleets)." value={e.assetCapex} step={500_000} suffix={CURRENCY} onChange={(v) => updateAction(asset.id, "electrify", { assetCapex: v })} />
            <NumField label="Start year" hint="The year the conversion begins." value={e.startYear} step={1} min={2021} onChange={(v) => updateAction(asset.id, "electrify", { startYear: Math.max(2021, Math.min(2050, v)) })} />
          </div>
        </Collapsible>
        {e.enabled && outlivesAsset(asset, baseYear, e.targetYear) && (
          <LifespanWarning asset={asset} baseYear={baseYear} />
        )}
        <p className="text-[11px] text-ink-faint mt-2">{electrifyTip(isMobile)}</p>
      </ActionRow>

      <FuelSwitchControls asset={asset} />
      </div>
      {flexFuelCapable(asset) && <FlexFuelControls asset={asset} />}
    </div>
  );
}

/* Fuel switch — only offers drop-in bio fuels that match the asset's
   engine/burner, and caps the blend at what existing equipment can take
   (E20 / B20). Beyond that needs flex-fuel / new vehicles. */
function FuelSwitchControls({ asset }: { asset: CombustionAsset }) {
  const { settings, updateAction, baseYear } = useScenario();
  const f = settings.byAsset[asset.id].fuelSwitch;
  const compatible = ALT_FUELS_BY_FUEL[asset.fuelType] ?? [];
  const hasBio = compatible.length > 0;
  const effectiveAlt = hasBio ? (compatible.includes(f.altFuel) ? f.altFuel : compatible[0]) : null;
  const maxBlend = effectiveAlt ? maxBlendPctFor(asset.category, effectiveAlt) : 100;
  const blendNote = effectiveAlt
    ? (effectiveAlt === "biodiesel" && asset.category === "stationary"
        ? "Boilers & burners can run high biodiesel blends with a burner retrofit (set Retrofit CAPEX in Advanced). Diesel gensets are engine-limited to ~B20."
        : ALT_FUELS[effectiveAlt].blendNote)
    : undefined;

  // Keep stored values valid if the asset's fuel changes after the plan was set.
  useEffect(() => {
    if (!hasBio) return;
    const patch: Partial<FuelSwitchAction> = {};
    if (!compatible.includes(f.altFuel)) patch.altFuel = compatible[0];
    const cap = maxBlendPctFor(asset.category, patch.altFuel ?? f.altFuel);
    if (f.blendPct > cap) patch.blendPct = cap;
    if (Object.keys(patch).length) updateAction(asset.id, "fuelSwitch", patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, asset.fuelType, f.altFuel, f.blendPct, hasBio]);

  const rowClass = "max-lg:border-t max-lg:border-line/70 max-lg:mt-4 max-lg:pt-4 lg:border-l lg:border-line/70 lg:pl-7";

  if (!hasBio || !effectiveAlt) {
    return (
      <ActionRow title="Fuel switch" sub="Bio / green blend" icon={Fuel} color={FAMILY_COLORS[2]} enabled={false} onToggle={() => {}} disabled className={rowClass} info="Blend a drop-in bio-fuel (biodiesel, ethanol, bio-CNG) into the existing equipment, up to the safe blend limit — cuts fossil CO₂ with no new kit.">
        <p className="text-sm text-ink-soft">
          No drop-in bio fuel for <strong>{FUELS[asset.fuelType].label}</strong>. Consider <strong>Electrification</strong>
          {asset.category === "mobile" ? " — or moving these vehicles to CNG / bio-CNG" : " — or biomass co-firing"}.
        </p>
      </ActionRow>
    );
  }

  return (
    <ActionRow
      title="Fuel switch"
      sub="Bio / green blend"
      icon={Fuel}
      color={FAMILY_COLORS[2]}
      enabled={f.enabled}
      onToggle={() => updateAction(asset.id, "fuelSwitch", { enabled: !f.enabled })}
      className={rowClass}
      info="Blend a drop-in bio-fuel (biodiesel, ethanol, bio-CNG) into the existing equipment, up to the safe blend limit — cuts fossil CO₂ with no new kit."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 items-end">
        <SliderField label="Blend percentage" value={Math.min(f.blendPct, maxBlend)} min={0} max={maxBlend} suffix="%" accent={FAMILY_COLORS[2]} onChange={(v) => updateAction(asset.id, "fuelSwitch", { blendPct: Math.min(maxBlend, v) })} hint={`Share of this asset's fuel energy replaced with ${ALT_FUELS[effectiveAlt].label}. Capped at ${maxBlend}% for existing equipment.`} />
        <NumField label="Target year" hint="The year the blend is fully in place. It ramps from the start year to here." value={f.targetYear} min={2021} onChange={(v) => updateAction(asset.id, "fuelSwitch", { targetYear: Math.max(2021, Math.min(2050, v)) })} />
        <div className="md:col-span-2">
          <span className="text-xs font-semibold text-ink-soft flex items-center gap-1.5 mb-1.5">Alternative fuel <InfoTip text="Matched to this asset's engine/burner — only compatible drop-in fuels are shown (ethanol for petrol, biodiesel for diesel, bio-CNG for CNG, biomethane for PNG)." /></span>
          <Segmented
            value={effectiveAlt}
            options={compatible.map((id) => ({ value: id, label: ALT_FUELS[id].label }))}
            onChange={(id) => updateAction(asset.id, "fuelSwitch", { altFuel: id, blendPct: Math.min(maxBlendPctFor(asset.category, id), f.blendPct) })}
          />
          <p className="text-[11px] text-ink-faint mt-2">{fuelSwitchTip(ALT_FUELS[effectiveAlt].label, maxBlend, asset.category)}</p>
        </div>
      </div>
      <Collapsible title="Advanced">
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumField label="Efficiency penalty" hint="Bio-fuels carry less energy, so a bit more is burned. Adds the extra volume." value={f.efficiencyPenaltyPct} step={0.5} suffix="%" onChange={(v) => updateAction(asset.id, "fuelSwitch", { efficiencyPenaltyPct: v })} />
          <NumField label="Alt-fuel price" hint="Cost per unit of the bio-fuel. Sets the new fuel bill." value={f.altFuelPricePerUnit} step={1} suffix={`${CURRENCY}/unit`} onChange={(v) => updateAction(asset.id, "fuelSwitch", { altFuelPricePerUnit: v })} />
          <NumField label="Retrofit CAPEX" hint="One-off cost to make this asset run the new fuel." value={f.retrofitCapex} step={500_000} suffix={CURRENCY} onChange={(v) => updateAction(asset.id, "fuelSwitch", { retrofitCapex: v })} />
          <NumField label="Start year" hint="The year the blend begins." value={f.startYear} step={1} min={2021} onChange={(v) => updateAction(asset.id, "fuelSwitch", { startYear: Math.max(2021, Math.min(2050, v)) })} />
        </div>
      </Collapsible>
      {f.enabled && outlivesAsset(asset, baseYear, f.targetYear) && (
        <LifespanWarning asset={asset} baseYear={baseYear} />
      )}
    </ActionRow>
  );
}

/* Flex-fuel vehicle conversion — for mobile petrol/diesel fleets only.
   Converts specific vehicles to run a high blend (E85/E100) beyond the
   E20/B20 drop-in limit. Counted per vehicle, with its own purchase cost. */
function FlexFuelControls({ asset }: { asset: CombustionAsset }) {
  const { settings, updateAction } = useScenario();
  const acts = settings.byAsset[asset.id];
  const flex = acts.flexFuel ?? defaultFlexFuel(asset);
  const set = (patch: Partial<FlexFuelAction>) => updateAction(asset.id, "flexFuel", { ...flex, ...patch });
  const res = applyAssetActions(asset, { ...acts, flexFuel: flex }, settings.assumptions);
  const altLabel = ALT_FUELS[flex.altFuel].label;

  return (
    <div className="border-t border-line/70 mt-4 pt-4">
      <ActionRow
        title="Flex-fuel vehicles"
        sub={`Beyond E20/B20 · high ${altLabel} blend`}
        icon={Fuel}
        color={FAMILY_COLORS[3]}
        enabled={flex.enabled}
        onToggle={() => set({ enabled: !flex.enabled })}
        info="Replace specific vehicles with flex-fuel models that run high bio blends (E85/B100) beyond the normal drop-in limit. Counted per vehicle."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4 items-end">
          <Stepper
            label="Vehicles to convert"
            hint="Vehicles physically replaced with flex-fuel models that run high ethanol/biodiesel blends. Beyond E20/B20 you can't just blend — these are new vehicles, so they're counted one by one."
            value={flex.unitsToConvert}
            max={asset.unitCount}
            onChange={(v) => set({ unitsToConvert: v })}
          />
          <SliderField label="High blend" value={flex.highBlendPct} min={25} max={100} suffix="%" accent={FAMILY_COLORS[3]} onChange={(v) => set({ highBlendPct: v })} hint={`The blend the flex vehicles run — e.g. 85 = E85. Only flex-fuel vehicles can run blends this high.`} />
          <NumField label="Target year" hint="The year all the conversions are in place. It ramps from the start year to here." value={flex.targetYear} min={2021} onChange={(v) => set({ targetYear: Math.max(2021, Math.min(2050, v)) })} />
        </div>
        <Collapsible title="Advanced">
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumField label="CAPEX per vehicle" hint="Extra cost of a flex-fuel vehicle over a standard one (or the full replacement cost)." value={flex.vehicleCapex} step={50_000} suffix={CURRENCY} onChange={(v) => set({ vehicleCapex: v })} />
            <NumField label="Start year" hint="The year conversions begin." value={flex.startYear} step={1} min={2021} onChange={(v) => set({ startYear: Math.max(2021, Math.min(2050, v)) })} />
          </div>
        </Collapsible>
        <p className="text-[11px] text-ink-soft mt-3 flex items-start gap-1.5 bg-surface-muted rounded-lg px-2.5 py-1.5">
          <Info size={12} className="text-ink-faint shrink-0 mt-0.5" />
          {flex.enabled && flex.unitsToConvert > 0
            ? <>Removes <span className="font-semibold text-brand-600">{fmt(res.flexAbatementT)} tCO₂e/yr</span> with {flex.unitsToConvert} of {asset.unitCount} vehicles on {altLabel} at {flex.highBlendPct}%.</>
            : <>Use this only for blends above E20/B20 — it buys flex-fuel vehicles. For low blends, use Fuel switch instead.</>}
        </p>
        <p className="text-[11px] text-ink-faint mt-2">{flexFuelTip()}</p>
      </ActionRow>
    </div>
  );
}

function ActionRow({
  title, sub, icon: Icon, color, enabled, onToggle, children, className, disabled, warning, info,
}: {
  title: string; sub: string; icon: React.ElementType; color: string;
  enabled: boolean; onToggle: () => void; children: ReactNode; className?: string; disabled?: boolean;
  warning?: ReactNode; info?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: `${color}1A` }}><Icon size={16} style={{ color }} /></div>
          <div>
            <div className="font-semibold text-ink text-sm flex items-center gap-1">{title}{info && <InfoTip text={info} />}</div>
            <div className="text-[11px] text-ink-faint">{sub}</div>
          </div>
        </div>
        {!disabled && <ToggleSwitch on={enabled} onChange={onToggle} label={`Toggle ${title}`} />}
      </div>
      {warning && <div className="mb-2">{warning}</div>}
      <div className={cn(!disabled && !enabled && "opacity-40 pointer-events-none")}>{children}</div>
    </div>
  );
}

/* ============================================================
   Refrigerant — per-system cards (Switch gas | Fix leaks)
   ============================================================ */

function RefrigerantControls({ onOpenSource }: { onOpenSource: (id: string) => void }) {
  const { baseSystems, settings, setSettings } = useScenario();

  const sysRollup = (systems: RefrigerationSystem[]) => {
    let abated = 0, planned = 0;
    for (const sys of systems) {
      const acts = settings.bySystem[sys.id];
      if (!acts) continue;
      if (acts.gasSwitch.enabled || acts.leakFix.enabled) planned++;
      const after = applyRefrigerant(sys, {
        transitionPct: acts.gasSwitch.enabled ? acts.gasSwitch.transitionPct : 0,
        altRefrigerant: acts.gasSwitch.altRefrigerant,
        leakImprovementPct: acts.leakFix.enabled ? acts.leakFix.leakImprovementPct : 0,
      });
      abated += Math.max(0, refrigerantCO2e(sys) - Math.max(0, after.newFugitiveT));
    }
    return { abated, planned, n: systems.length };
  };
  const applyPreset = (gasOn: boolean, transitionPct: number, leakImprovementPct: number) =>
    setSettings((p) => {
      const bySystem = { ...p.bySystem };
      for (const id of Object.keys(bySystem)) {
        bySystem[id] = {
          gasSwitch: { ...bySystem[id].gasSwitch, enabled: gasOn, transitionPct },
          leakFix: { ...bySystem[id].leakFix, enabled: true, leakImprovementPct },
        };
      }
      return { ...p, bySystem };
    });

  return (
    <>
      <DetailCard title="Presets · all systems">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: "Leak fix only", sub: "0% · 40% leak", apply: () => applyPreset(false, 0, 40) },
            { label: "Balanced", sub: "60% · 50% leak", apply: () => applyPreset(true, 60, 50) },
            { label: "Full retrofit", sub: "100% · 70% leak", apply: () => applyPreset(true, 100, 70) },
          ].map((pr) => (
            <button key={pr.label} type="button" onClick={pr.apply} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:border-brand-300 hover:bg-brand-50/40 transition-colors">
              <span className="font-medium">{pr.label}</span><span className="text-ink-faint ml-1.5 text-xs">{pr.sub}</span>
            </button>
          ))}
        </div>
      </DetailCard>
      {baseSystems.length === 0 ? (
        <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6"><p className="text-sm text-ink-faint">No cooling systems yet — add them in Data input.</p></div>
      ) : (
        groupByBu(baseSystems).map(([bu, systems]) => {
          const roll = sysRollup(systems);
          return (
            <Collapsible
              key={bu}
              title={bu || "Company-wide"}
              right={
                <span className="text-xs font-bold tabular-nums text-brand-600 normal-case tracking-normal">
                  −{fmt(roll.abated)} t <span className="text-ink-faint font-medium">· {roll.planned}/{roll.n} planned</span>
                </span>
              }
              defaultOpen
            >
              <div className="flex flex-col gap-3">
                {systems.map((sys) => <SourceBox key={sys.id} seg="refrigerant" source={sys} onOpen={() => onOpenSource(sys.id)} />)}
              </div>
            </Collapsible>
          );
        })
      )}
    </>
  );
}

function SystemActionCard({ system }: { system: RefrigerationSystem }) {
  const { settings, setSettings, updateSystemAction } = useScenario();
  const acts = settings.bySystem[system.id];
  const color = FAMILY_COLORS[1];

  if (!acts) {
    return (
      <div className={cn("rounded-xl3 border border-line/60 bg-surface shadow-card p-6", system.excluded && "opacity-60")}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-ink">{system.name}</h3>
            {system.excluded && (
              <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 mt-1">
                Excluded from totals
              </span>
            )}
            <p className="text-sm text-ink-soft">No plan yet for this system.</p>
          </div>
          <button
            type="button"
            onClick={() => setSettings((p) => ({ ...p, bySystem: { ...p.bySystem, [system.id]: defaultSystemActions(system) } }))}
            className="text-sm font-medium rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600"
          >
            Add plan
          </button>
        </div>
      </div>
    );
  }

  const gs = acts.gasSwitch;
  const lf = acts.leakFix;
  const current = REFRIGERANTS[system.refrigerant];
  const alt = REFRIGERANTS[gs.altRefrigerant];
  const era = ERA_BADGE[current.era];
  const suggested = RECOMMENDED_ALT_BY_SYSTEM[system.systemType];

  const baseT = refrigerantCO2e(system);
  const after = applyRefrigerant(system, {
    transitionPct: gs.enabled ? gs.transitionPct : 0,
    altRefrigerant: gs.altRefrigerant,
    leakImprovementPct: lf.enabled ? lf.leakImprovementPct : 0,
  });
  const afterT = Math.max(0, after.newFugitiveT);
  const gwpDelta = current.gwp > 0 ? (alt.gwp - current.gwp) / current.gwp : 0;
  const newTopUpKg = system.toppedUpKg * (1 - (lf.enabled ? lf.leakImprovementPct : 0) / 100);
  const gasSaving = system.toppedUpKg * ((lf.enabled ? lf.leakImprovementPct : 0) / 100) * system.gasCostPerKg;

  return (
    <div className={cn("rounded-xl3 border border-line/60 bg-surface shadow-card p-6", system.excluded && "opacity-60")}>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0" style={{ background: `${color}1A` }}>
            <Snowflake size={22} style={{ color }} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-extrabold leading-tight text-ink">{system.name}</h2>
              {system.excluded && (
                <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                  Excluded from totals
                </span>
              )}
            </div>
            <p className="text-sm text-ink-soft mt-0.5 flex items-center gap-2 flex-wrap">
              {SYSTEM_TYPE_LABELS[system.systemType]}{(() => { const c = refrigClassProfile(system); return c ? <> · <span className="font-medium text-ink">{c.label}</span></> : null; })()} · {fmt(system.toppedUpKg)} kg topped up/yr
              <span className="font-medium text-ink">{current.label} · GWP {fmt(current.gwp)}</span>
              <span className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5", era.cls)}>{era.label}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 border-t border-line/70 mt-1 pt-4">
        <ActionRow
          title="Switch gas"
          sub="Move to a low-GWP refrigerant"
          icon={Snowflake}
          color={color}
          enabled={gs.enabled}
          onToggle={() => updateSystemAction(system.id, "gasSwitch", { enabled: !gs.enabled })}
          className="lg:pr-7"
          info="Move a cooling system to a lower-GWP refrigerant, so each kilogram that leaks causes far less warming."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 items-end">
            <div className="md:col-span-2">
              <SelectField
                label="Alternative refrigerant"
                hint="Which low-GWP gas to switch to. Lower GWP = bigger cut; naturals also need less charge."
                value={gs.altRefrigerant}
                options={ALT_REFRIGERANT_IDS.map((rid) => ({ value: rid, label: `${REFRIGERANTS[rid].label} · GWP ${REFRIGERANTS[rid].gwp}` }))}
                onChange={(v) => updateSystemAction(system.id, "gasSwitch", { altRefrigerant: v as RefrigerantId })}
              />
              {gwpDelta < 0 && (
                <span className="mt-1.5 inline-flex text-[11px] font-bold text-brand-600 bg-brand-50 rounded-full px-2 py-0.5">
                  {pct(gwpDelta, 1)} GWP vs {current.label}
                </span>
              )}
              <p className="text-[11px] text-ink-faint mt-1.5">{alt.note}</p>
              {gs.altRefrigerant !== suggested && (
                <button
                  type="button"
                  onClick={() => updateSystemAction(system.id, "gasSwitch", { altRefrigerant: suggested })}
                  className="mt-1.5 text-[11px] font-semibold text-brand-600 hover:text-brand-700 rounded-md px-2 py-1 bg-brand-50 hover:bg-brand-100 transition-colors"
                >
                  Suggested for {SYSTEM_TYPE_LABELS[system.systemType].toLowerCase()}: {REFRIGERANTS[suggested].label}
                </button>
              )}
            </div>
            <SliderField label="Gas transition" value={gs.transitionPct} min={0} max={100} suffix="%" accent={color} onChange={(v) => updateSystemAction(system.id, "gasSwitch", { transitionPct: v })} hint="Share of this system's cooling moved off the current gas." />
            <NumField label="Target year" hint="The year the transition is fully in place. It ramps from the start year to here." value={gs.targetYear} min={2021} onChange={(v) => updateSystemAction(system.id, "gasSwitch", { targetYear: Math.max(2021, Math.min(2050, v)) })} />
          </div>
          <Collapsible title="Advanced">
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumField label="Retrofit CAPEX" hint="One-off cost for new compressors / safety upgrades for this system." value={gs.retrofitCapex} step={1_000_000} suffix={CURRENCY} onChange={(v) => updateSystemAction(system.id, "gasSwitch", { retrofitCapex: v })} />
              <NumField label="Start year" hint="The year the transition begins." value={gs.startYear} step={1} min={2021} onChange={(v) => updateSystemAction(system.id, "gasSwitch", { startYear: Math.max(2021, Math.min(2050, v)) })} />
            </div>
          </Collapsible>
          <p className="text-[11px] text-ink-faint mt-2">{gasSwitchTip(alt.label, alt.gwp)}</p>
        </ActionRow>

        <ActionRow
          title="Fix leaks"
          sub="Maintenance & monitoring"
          icon={Wrench}
          color="#D9774B"
          enabled={lf.enabled}
          onToggle={() => updateSystemAction(system.id, "leakFix", { enabled: !lf.enabled })}
          info="Better maintenance and monitoring cut how much refrigerant leaks each year — usually the cheapest win."
          className="max-lg:border-t max-lg:border-line/70 max-lg:mt-4 max-lg:pt-4 lg:border-l lg:border-line/70 lg:pl-7"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 items-end">
            <SliderField label="Leak-rate improvement" value={lf.leakImprovementPct} min={0} max={80} suffix="%" accent="#D9774B" onChange={(v) => updateSystemAction(system.id, "leakFix", { leakImprovementPct: v })} hint="How much you cut leaks via maintenance & monitoring — often the biggest quick win." />
            <NumField label="Target year" hint="The year the leak programme reaches full effect." value={lf.targetYear} min={2021} onChange={(v) => updateSystemAction(system.id, "leakFix", { targetYear: Math.max(2021, Math.min(2050, v)) })} />
          </div>
          <p className="text-xs text-ink-soft mt-3 tabular-nums">
            Top-up {fmtNum(system.toppedUpKg, 1)} kg/yr → <span className="font-semibold text-ink">{fmtNum(newTopUpKg, 1)} kg/yr</span>
            {gasSaving > 0 && <> · saves <span className="font-semibold text-brand-600">{fmtMoney(gasSaving)}/yr</span> in gas top-ups</>}
          </p>
          <Collapsible title="Advanced">
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumField label="Start year" hint="The year the leak programme begins." value={lf.startYear} step={1} min={2021} onChange={(v) => updateSystemAction(system.id, "leakFix", { startYear: Math.max(2021, Math.min(2050, v)) })} />
            </div>
          </Collapsible>
          {lf.enabled && lf.leakImprovementPct > 70 && (
            <p className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0" />
              Very ambitious — sustained leak reduction above 70% needs continuous monitoring and rapid repair.
            </p>
          )}
          <p className="text-[11px] text-ink-faint mt-2">{leakFixTip()}</p>
        </ActionRow>
      </div>
      <p className="text-[11px] text-ink-faint mt-3">Carbon price is set once in <strong>Global assumptions</strong> below and applied across the scenario.</p>
    </div>
  );
}

/* ============================================================
   Global assumptions
   ============================================================ */

function SuggestionCard({ kind, id }: { kind: "asset" | "system"; id: string }) {
  const { baseAssets, baseSystems, setSettings } = useScenario();
  const asset = kind === "asset" ? baseAssets.find((a) => a.id === id) : undefined;
  const system = kind === "system" ? baseSystems.find((s) => s.id === id) : undefined;
  if (!asset && !system) return null;
  const sug: Suggestion = asset ? suggestForAsset(asset) : suggestForSystem(system!);

  const apply = (actions: SuggestedAction[]) => {
    setSettings((p) => {
      if (asset) {
        const cur = p.byAsset[asset.id] ?? defaultActions(asset);
        const next: typeof cur = { ...cur };
        for (const a of actions) (next as unknown as Record<string, unknown>)[a.lever] = { ...(next as unknown as Record<string, Record<string, unknown>>)[a.lever], ...a.patch };
        return { ...p, byAsset: { ...p.byAsset, [asset.id]: next } };
      }
      const cur = p.bySystem[system!.id] ?? defaultSystemActions(system!);
      const next: typeof cur = { ...cur };
      for (const a of actions) (next as unknown as Record<string, unknown>)[a.lever] = { ...(next as unknown as Record<string, Record<string, unknown>>)[a.lever], ...a.patch };
      return { ...p, bySystem: { ...p.bySystem, [system!.id]: next } };
    });
  };

  return (
    <div className="rounded-xl3 border border-brand-200 bg-brand-50/50 shadow-card p-5">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-brand-100 grid place-items-center shrink-0"><Lightbulb size={18} className="text-brand-700" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-brand-700 font-bold">Suggested for this source</div>
          <div className="mt-0.5 font-bold text-ink">{sug.headline}</div>
          <p className="text-xs text-ink-soft mt-1">{sug.why}</p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button onClick={() => apply(sug.actions)} className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-3.5 py-2 hover:bg-brand-600 transition-colors">Apply suggestion</button>
            {sug.altHeadline && sug.altActions && (
              <button onClick={() => apply(sug.altActions!)} className="text-sm font-medium text-brand-700 hover:underline">{sug.altHeadline}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceImpact({ kind, id }: { kind: "asset" | "system"; id: string }) {
  const { baseAssets, baseSystems, settings } = useScenario();
  let baseT = 0, afterT = 0, capex = 0, spillT = 0;
  if (kind === "asset") {
    const a = baseAssets.find((x) => x.id === id); if (!a) return null;
    baseT = combustionCO2e(a);
    const acts = settings.byAsset[a.id];
    if (acts) { const res = applyAssetActions(a, acts, settings.assumptions); afterT = Math.max(0, baseT - res.scope1AbatementT - res.fuelAbatementT); capex = capexForAsset(a, acts); spillT = res.scope2AddedT; }
    else afterT = baseT;
  } else {
    const s = baseSystems.find((x) => x.id === id); if (!s) return null;
    baseT = refrigerantCO2e(s);
    const acts = settings.bySystem[s.id];
    if (acts) {
      const after = applyRefrigerant(s, { transitionPct: acts.gasSwitch.enabled ? acts.gasSwitch.transitionPct : 0, altRefrigerant: acts.gasSwitch.altRefrigerant, leakImprovementPct: acts.leakFix.enabled ? acts.leakFix.leakImprovementPct : 0 });
      afterT = Math.max(0, after.newFugitiveT); capex = capexForSystem(acts);
    } else afterT = baseT;
  }
  const abated = Math.max(0, baseT - afterT);
  const cut = baseT > 0 ? abated / baseT : 0;
  return (
    <div className="sticky top-2 z-20 rounded-xl3 border border-line/60 bg-surface shadow-card p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Impact</span>
          <span className="text-2xl font-extrabold tabular-nums text-ink">{fmt(baseT)} <span className="text-sm text-ink-faint">→</span> {fmt(afterT)} <span className="text-sm font-semibold text-ink-soft">tCO₂e</span></span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right"><div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Cut</div><div className="text-lg font-extrabold tabular-nums text-brand-600">−{fmt(abated)} t · {pct(cut)}</div></div>
          {spillT > 0.05 && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold flex items-center justify-end gap-1">Scope 2 added <InfoTip text="Electrification moves this energy onto electricity — after your renewable-sourcing assumption, this much lands as Scope 2. Green the supply to shrink it." /></div>
              <div className="text-lg font-extrabold tabular-nums text-amber-600">+{fmt(spillT)} t</div>
            </div>
          )}
          <div className="text-right"><div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">CAPEX</div><div className="text-lg font-extrabold tabular-nums text-ink">{fmtMoney(capex)}</div></div>
        </div>
      </div>
      <div className="mt-3 h-2.5 rounded-full bg-surface-muted overflow-hidden flex">
        <div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${cut * 100}%` }} />
        <div className="h-full bg-ink/10" style={{ width: `${(1 - cut) * 100}%` }} />
      </div>
    </div>
  );
}

function AssumptionsCard({ seg }: { seg: Seg }) {
  const { settings, updateAssumptions } = useScenario();
  const a = settings.assumptions;
  const isRefrigerant = seg === "refrigerant";
  return (
    <DetailCard title="Global assumptions">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isRefrigerant ? (
          <NumField label="Carbon price" hint="Internal carbon price. Because refrigerant GWPs are huge, even a small price makes retrofits look worthwhile." value={a.carbonPricePerTonne} step={250} suffix={`${CURRENCY}/t`} onChange={(v) => updateAssumptions({ carbonPricePerTonne: v })} />
        ) : (
          <>
            <NumField label="Renewable sourcing" hint="Share of new electricity that is clean (solar/PPA) — cuts the Scope 2 electrification adds." value={a.renewableSourcingPct} step={5} suffix="%" onChange={(v) => updateAssumptions({ renewableSourcingPct: v })} />
            <NumField label="Grid emission factor" hint="How dirty the local grid is per unit of electricity." value={a.gridEf} step={0.01} suffix="kgCO₂e/kWh" onChange={(v) => updateAssumptions({ gridEf: v })} />
            <NumField label="REC cost" hint="Price of a renewable certificate per tonne, if offsetting leftover grid power." value={a.recCostPerTonne} step={100} suffix={`${CURRENCY}/t`} onChange={(v) => updateAssumptions({ recCostPerTonne: v })} />
            <NumField label="Infrastructure CAPEX" hint="One-off charging / grid-upgrade cost for electrification." value={a.infraCapex} step={1_000_000} suffix={CURRENCY} onChange={(v) => updateAssumptions({ infraCapex: v })} />
          </>
        )}
      </div>
    </DetailCard>
  );
}

/** Amber advisory when an action's target year is past the asset's retirement. */
function LifespanWarning({ asset, baseYear }: { asset: CombustionAsset; baseYear: number }) {
  const retire = retirementYear(asset, baseYear);
  return (
    <p className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
      <AlertTriangle size={14} className="shrink-0" />
      {asset.name} retires in FY{retire} — before this action completes. Bring the target year forward, or plan a like-for-like low-carbon replacement at retirement instead.
    </p>
  );
}
