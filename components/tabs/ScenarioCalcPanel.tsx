"use client";

/* "How this is calculated" for the Scenario Modeller — a right-side drawer,
   scoped to what you're looking at:
     • all       → the whole scenario's 2030 reduction + per-lever cut
     • segment   → how that segment (mobile / stationary / refrigerant) cuts
     • asset/system → how that single source's cut is computed
   Info tooltip on every line. */

import { useEffect, useState } from "react";
import { Calculator, X } from "lucide-react";
import { useScenario } from "@/lib/store";
import { FAMILY_COLORS, ALT_FUELS, REFRIGERANTS } from "@/lib/model/factors";
import { applyAssetActions } from "@/lib/model/segments";
import { applyRefrigerant } from "@/lib/model/levers";
import { combustionCO2e, refrigerantCO2e } from "@/lib/model/baseline";
import type { CombustionAsset, RefrigerationSystem } from "@/lib/model/types";
import { InfoTip } from "../ui/InfoTip";
import { cn, fmt, pct } from "@/lib/utils";

type Seg = "mobile" | "stationary" | "refrigerant";
export type CalcTarget =
  | { kind: "all" }
  | { kind: "segment"; seg: Seg }
  | { kind: "asset"; id: string }
  | { kind: "system"; id: string };

interface Row { label: string; formula: string; value: string; info: string; color?: string; emphasis?: boolean; }
interface Content { title: string; subtitle: string; rows: Row[]; footer: string; }

const LEVER_FORMULA: Record<string, string> = {
  electrify: "Each electrified unit leaves combustion. Cut = asset baseline emissions × share converted. Electricity it draws moves to Scope 2 (energy ÷ COP × grid factor).",
  fuelSwitch: "Cut = asset fuel emissions × bio-blend share, capped at the fuel's blend limit, excluding the biogenic CO₂ share.",
  flexFuel: "Cut = converted vehicles' emissions × their high-blend share — beyond the E20/B20 drop-in cap.",
  refrigerant: "Cut = current leak × current GWP − reduced leak × new-gas GWP (after leak-fix and gas-switch), ÷ 1000.",
};
const SEG_LABEL: Record<Seg, string> = { mobile: "Mobile", stationary: "Stationary", refrigerant: "Refrigerant" };

export function ScenarioCalcPanel({ tone = "light", target = { kind: "all" } }: { tone?: "light" | "onDark"; target?: CalcTarget }) {
  const [open, setOpen] = useState(false);
  const store = useScenario();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const content = buildContent(store, target);

  const trigger = tone === "onDark"
    ? "inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/85 hover:text-white rounded-lg border border-white/25 px-2.5 py-1.5"
    : "inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700";

  return (
    <>
      <button onClick={() => setOpen(true)} className={trigger}>
        <Calculator size={13} /> How this is calculated
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={content.title}>
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-surface shadow-card-lg border-l border-line flex flex-col tab-fade">
            <header className="flex items-center gap-2 px-5 py-4 border-b border-line/60 shrink-0">
              <Calculator size={17} className="text-brand-600" />
              <div className="min-w-0">
                <h3 className="font-bold text-ink leading-tight">{content.title}</h3>
                <p className="text-xs text-ink-faint">{content.subtitle}</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="ml-auto w-8 h-8 rounded-lg grid place-items-center text-ink-faint hover:text-ink hover:bg-surface-muted">
                <X size={17} />
              </button>
            </header>

            <div className="overflow-y-auto flex-1 px-5 py-4">
              {content.rows.length === 0 ? (
                <p className="text-sm text-ink-faint">No levers switched on yet — turn on actions to see how the cut is calculated.</p>
              ) : (
                <div className="space-y-2.5">
                  {content.rows.map((r, i) => (
                    <div key={i} className={r.emphasis ? "rounded-xl2 border border-brand-200 bg-brand-50 p-3" : "rounded-xl2 border border-line/50 bg-surface-muted/40 p-3"}>
                      <div className="flex items-center gap-1.5">
                        {r.color && <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.color }} />}
                        <span className={r.emphasis ? "text-sm font-bold text-brand-800" : "text-sm font-medium text-ink"}>{r.label}</span>
                        <InfoTip text={r.info} />
                        <span className={cn("ml-auto text-sm font-bold tabular-nums", r.emphasis ? "text-brand-800" : "text-brand-600")}>{r.value}</span>
                      </div>
                      {r.formula && <code className="text-[11px] text-ink-soft leading-snug block mt-1">{r.formula}</code>}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-ink-faint mt-4 leading-relaxed">{content.footer}</p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function buildContent(store: ReturnType<typeof useScenario>, target: CalcTarget): Content {
  const { result, baseAssets, baseSystems, settings } = store;

  if (target.kind === "all") {
    const k = result.kpis;
    const rows: Row[] = [
      { label: "Reduction by 2030", value: pct(k.reduction2030), emphasis: true, formula: "(BAU₂₀₃₀ − Net₂₀₃₀) ÷ base-year emissions",
        info: "The headline. Business-as-usual emissions in 2030 minus your plan's net 2030 emissions, over the base year." },
      { label: "Base-year emissions", value: `${fmt(result.baseTotalT)} t`, formula: "", info: "Total Scope 1 in the base year, from the Data input baseline. Everything is measured against this." },
      { label: "Net emissions 2030", value: `${fmt(k.net2030)} t`, formula: "", info: "BAU 2030 minus every active lever's abatement ramped to 2030, floored at zero." },
    ];
    for (const l of result.levers.filter((x) => x.enabled && x.abatementT > 0).sort((a, b) => b.abatementT - a.abatementT)) {
      rows.push({ label: l.label, value: `−${fmt(l.abatementT)} t/yr`, color: FAMILY_COLORS[l.colorIdx], formula: LEVER_FORMULA[l.id] ?? "", info: LEVER_FORMULA[l.id] ?? "Abatement from this lever." });
    }
    return {
      title: "How the emissions cut is calculated",
      subtitle: "Whole scenario · live",
      rows,
      footer: "Levers ramp linearly from start to target year; total abatement is capped so net never goes below zero. Electrification adds Scope 2 electricity (managed separately); biogenic CO₂ is reported separately.",
    };
  }

  if (target.kind === "segment") {
    const seg = target.seg;
    const rows: Row[] = [];
    let total = 0;
    if (seg === "refrigerant") {
      for (const s of baseSystems.filter((x) => !x.excluded)) {
        const acts = settings.bySystem[s.id];
        if (!acts || (!acts.gasSwitch.enabled && !acts.leakFix.enabled)) continue;
        const cut = systemCut(s, acts);
        total += cut;
        rows.push({ label: s.name, value: `−${fmt(cut)} t/yr`, color: FAMILY_COLORS[1], formula: describeSystem(s, acts), info: LEVER_FORMULA.refrigerant });
      }
    } else {
      for (const a of baseAssets.filter((x) => x.category === seg && !x.excluded)) {
        const acts = settings.byAsset[a.id];
        if (!acts) continue;
        const res = applyAssetActions(a, acts, settings.assumptions);
        const cut = res.scope1AbatementT + res.fuelAbatementT;
        if (cut <= 0) continue;
        total += cut;
        rows.push({ label: a.name, value: `−${fmt(cut)} t/yr`, color: FAMILY_COLORS[seg === "mobile" ? 5 : 6], formula: describeAsset(a, res), info: "Cut = electrification + fuel-switch abatement for this asset (see each source for the full breakdown)." });
      }
    }
    rows.push({ label: `${SEG_LABEL[seg]} total`, value: `−${fmt(total)} t/yr`, emphasis: true, formula: "sum of the sources above", info: "The segment's total annual abatement at full roll-out." });
    return {
      title: `How the ${SEG_LABEL[seg]} cut is calculated`,
      subtitle: `${SEG_LABEL[seg]} segment · live`,
      rows,
      footer: seg === "refrigerant"
        ? "Refrigerant cut = current leak × GWP − reduced leak × new-gas GWP. Open a system for its full step-by-step."
        : "Each asset's cut combines electrification and fuel-switch. Open a source for its full step-by-step.",
    };
  }

  // single source
  if (target.kind === "asset") {
    const a = baseAssets.find((x) => x.id === target.id);
    if (!a) return { title: "How this is calculated", subtitle: "", rows: [], footer: "" };
    const acts = settings.byAsset[a.id];
    const base = combustionCO2e(a);
    const rows: Row[] = [{ label: "Baseline emissions", value: `${fmt(base)} t/yr`, formula: `${fmt(a.annualVolume)} ${a.unit} × emission factor ÷ 1000`, info: "This asset's Scope 1 emissions today, before any lever." }];
    if (acts) {
      const res = applyAssetActions(a, acts, settings.assumptions);
      if (acts.electrify.enabled && res.scope1AbatementT > 0) {
        rows.push({ label: "Electrify", value: `−${fmt(res.scope1AbatementT)} t/yr`, color: FAMILY_COLORS[a.category === "mobile" ? 5 : 6], formula: `${fmt(base)} t × ${pct(res.elecFraction)} converted`, info: LEVER_FORMULA.electrify });
      }
      const dropIn = res.fuelAbatementT - res.flexAbatementT;
      if (dropIn > 0) rows.push({ label: "Fuel switch", value: `−${fmt(dropIn)} t/yr`, color: FAMILY_COLORS[2], formula: `fuel emissions × ${pct(res.fuelFraction)} bio blend (drop-in)`, info: LEVER_FORMULA.fuelSwitch });
      if (res.flexAbatementT > 0) rows.push({ label: "Flex-fuel", value: `−${fmt(res.flexAbatementT)} t/yr`, color: FAMILY_COLORS[3], formula: `${pct(res.flexFraction)} of fleet on a high blend`, info: LEVER_FORMULA.flexFuel });
      const cut = res.scope1AbatementT + res.fuelAbatementT;
      rows.push({ label: "Emissions after plan", value: `${fmt(Math.max(0, base - cut))} t/yr`, emphasis: true, formula: `${fmt(base)} − ${fmt(cut)} cut`, info: "What remains once every lever on this asset is fully rolled out." });
    }
    return { title: "How this source's cut is calculated", subtitle: a.name, rows, footer: "Electrification also adds Scope 2 electricity (energy ÷ COP × grid factor); biogenic CO₂ from bio-fuels is reported separately." };
  }

  // system
  const s = baseSystems.find((x) => x.id === target.id);
  if (!s) return { title: "How this is calculated", subtitle: "", rows: [], footer: "" };
  const acts = settings.bySystem[s.id];
  const base = refrigerantCO2e(s);
  const cur = REFRIGERANTS[s.refrigerant];
  const rows: Row[] = [{ label: "Baseline leak emissions", value: `${fmt(base)} t/yr`, formula: `${fmt(s.toppedUpKg)} kg leak × GWP ${fmt(cur.gwp)} ÷ 1000`, info: "Mass-balance: the gas topped up each year equals the amount leaked. Emissions = leak × GWP." }];
  if (acts) {
    const leakPct = acts.leakFix.enabled ? acts.leakFix.leakImprovementPct : 0;
    const newTopUp = s.toppedUpKg * (1 - leakPct / 100);
    if (leakPct > 0) rows.push({ label: "Fix leaks", value: `${fmt(s.toppedUpKg)} → ${fmt(newTopUp)} kg`, color: "#D9774B", formula: `leak × (1 − ${leakPct}%)`, info: "Better maintenance cuts the annual top-up, and therefore the leak." });
    if (acts.gasSwitch.enabled && acts.gasSwitch.transitionPct > 0) {
      const alt = REFRIGERANTS[acts.gasSwitch.altRefrigerant];
      rows.push({ label: "Switch gas", value: `→ ${alt.label} (GWP ${fmt(alt.gwp)})`, color: FAMILY_COLORS[1], formula: `${acts.gasSwitch.transitionPct}% moved; new charge leaks at GWP ${fmt(alt.gwp)}`, info: LEVER_FORMULA.refrigerant });
    }
    const cut = systemCut(s, acts);
    rows.push({ label: "Emissions after plan", value: `${fmt(Math.max(0, base - cut))} t/yr`, emphasis: true, formula: `cut −${fmt(cut)} t/yr`, info: "Remaining fugitive emissions once leak-fix and gas-switch are fully in place." });
  }
  return { title: "How this system's cut is calculated", subtitle: s.name, rows, footer: "Naturals (R-290 / R-717 / R-744) need less charge, so they leak proportionally less mass — captured in the charge-adjustment factor." };
}

function systemCut(s: RefrigerationSystem, acts: NonNullable<ReturnType<typeof useScenario>["settings"]["bySystem"][string]>): number {
  const after = applyRefrigerant(s, {
    transitionPct: acts.gasSwitch.enabled ? acts.gasSwitch.transitionPct : 0,
    altRefrigerant: acts.gasSwitch.altRefrigerant,
    leakImprovementPct: acts.leakFix.enabled ? acts.leakFix.leakImprovementPct : 0,
  });
  return Math.max(0, refrigerantCO2e(s) - Math.max(0, after.newFugitiveT));
}

function describeAsset(a: CombustionAsset, res: ReturnType<typeof applyAssetActions>): string {
  const parts: string[] = [];
  if (res.elecFraction > 0) parts.push(`electrify ${pct(res.elecFraction)}`);
  if (res.fuelFraction > 0) parts.push(`bio blend ${pct(res.fuelFraction)}`);
  return parts.join(" · ") || "no active levers";
}
function describeSystem(s: RefrigerationSystem, acts: NonNullable<ReturnType<typeof useScenario>["settings"]["bySystem"][string]>): string {
  const parts: string[] = [];
  if (acts.gasSwitch.enabled && acts.gasSwitch.transitionPct > 0) parts.push(`${acts.gasSwitch.transitionPct}% → ${REFRIGERANTS[acts.gasSwitch.altRefrigerant].label}`);
  if (acts.leakFix.enabled && acts.leakFix.leakImprovementPct > 0) parts.push(`cut leaks ${acts.leakFix.leakImprovementPct}%`);
  return parts.join(" · ") || "no active levers";
}
