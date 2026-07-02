"use client";

/* "How this is calculated" for the Scope 2 modeller — a right-side drawer,
   scoped to what you're looking at:
     • all         → whole scenario's 2030 reduction + per-lever cut
     • facility    → how that facility's cut is computed (efficiency + solar)
     • procurement → how market instruments move the market-based number
   Info tooltip on every line. */

import { useEffect, useState } from "react";
import { Calculator, X } from "lucide-react";
import { useScope2 } from "@/lib/scope2/store";
import { defaultFacilityActions } from "@/lib/scope2/defaults";
import { facilityImpact } from "@/lib/scope2/model/suggestions";
import { FAMILY_COLORS } from "@/lib/model/factors";
import { InfoTip } from "../ui/InfoTip";
import { cn, fmt, fmtMoney, pct } from "@/lib/utils";

export type Scope2CalcTarget = { kind: "all" } | { kind: "facility"; id: string } | { kind: "procurement" };

interface Row { label: string; formula: string; value: string; info: string; color?: string; emphasis?: boolean; }
interface Content { title: string; subtitle: string; rows: Row[]; footer: string; }

const LEVER_FORMULA: Record<string, string> = {
  efficiency: "Cut = energy saved (LED + motors/VFD + BMS deployment) × grid factor ÷ 1000. Location-based.",
  generation: "Cut = on-site solar self-consumed (kWp × irradiance, capped at load) × grid factor ÷ 1000. Location-based.",
  procurement: "Cut = renewable kWh procured (PPA / green tariff / RECs) × grid factor ÷ 1000 — market-based only.",
};

export function Scope2CalcPanel({ tone = "light", target = { kind: "all" } }: { tone?: "light" | "onDark"; target?: Scope2CalcTarget }) {
  const [open, setOpen] = useState(false);
  const store = useScope2();

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

function buildContent(store: ReturnType<typeof useScope2>, target: Scope2CalcTarget): Content {
  const { result, baseFacilities, levers } = store;
  const k = result.kpis;

  if (target.kind === "all") {
    const rows: Row[] = [
      { label: "Reduction by 2030", value: pct(k.reduction2030), emphasis: true, formula: "(BAU₂₀₃₀ − market-based net₂₀₃₀) ÷ base electricity emissions",
        info: "The headline. Business-as-usual electricity emissions in 2030 minus your plan's market-based net, over the base year." },
      { label: "Base electricity emissions", value: `${fmt(k.baseLocationT)} t`, formula: "Σ facility load (kWh) × grid factor ÷ 1000",
        info: "Location-based Scope 2 in the base year — physical grid emissions. Everything is measured against this." },
      { label: "Market-based net (now)", value: `${fmt(k.marketNowT)} t`, formula: "",
        info: "After procurement and existing contracts. This is the figure most targets (SBTi/RE100) use." },
      { label: "Location-based net (now)", value: `${fmt(k.locationNowT)} t`, formula: "",
        info: "Physical grid emissions after efficiency + on-site solar. Procurement does not change this." },
    ];
    for (const l of result.levers.filter((x) => x.enabled && x.abatementT > 0).sort((a, b) => b.abatementT - a.abatementT)) {
      rows.push({ label: l.label, value: `−${fmt(l.abatementT)} t/yr`, color: FAMILY_COLORS[l.colorIdx], formula: LEVER_FORMULA[l.id] ?? "", info: LEVER_FORMULA[l.id] ?? "Abatement from this lever." });
    }
    return {
      title: "How the emissions cut is calculated",
      subtitle: "Whole scenario · live",
      rows,
      footer: "Efficiency and solar cut both location- and market-based emissions; procurement cuts only the market-based number. Levers ramp linearly from start to target year.",
    };
  }

  if (target.kind === "facility") {
    const f = baseFacilities.find((x) => x.id === target.id);
    if (!f) return { title: "How this is calculated", subtitle: "", rows: [], footer: "" };
    const acts = levers.byFacility[f.id] ?? defaultFacilityActions(f);
    const { baseT, afterT } = facilityImpact(f, acts);
    const perF = result.perFacility[f.id];
    const rows: Row[] = [
      { label: "Baseline (location-based)", value: `${fmt(baseT)} t/yr`, formula: `${fmt(f.annualLoadKwh)} kWh × ${f.gridEf} kgCO₂e/kWh ÷ 1000`, info: "This facility's grid emissions today, before any lever." },
    ];
    if (perF) {
      if (acts.efficiency.enabled && perF.eff.savedKwh > 0) {
        rows.push({ label: "Efficiency", value: `−${fmt((perF.eff.savedKwh * f.gridEf) / 1000)} t/yr`, color: FAMILY_COLORS[3], formula: `${fmt(perF.eff.savedKwh)} kWh saved × ${f.gridEf} ÷ 1000`, info: LEVER_FORMULA.efficiency });
      }
      if (acts.generation.enabled && perF.gen.usedOnSiteKwh > 0) {
        rows.push({ label: "On-site solar", value: `−${fmt((perF.gen.usedOnSiteKwh * f.gridEf) / 1000)} t/yr`, color: "#F59E0B", formula: `${fmt(perF.gen.effectiveKwp)} kWp × ${fmt(f.irradiance)} = ${fmt(perF.gen.solarGenKwh)} kWh; self-used ${fmt(perF.gen.usedOnSiteKwh)} × ${f.gridEf} ÷ 1000`, info: LEVER_FORMULA.generation });
      }
    }
    rows.push({ label: "Emissions after levers", value: `${fmt(afterT)} t/yr`, emphasis: true, formula: `${fmt(baseT)} − ${fmt(Math.max(0, baseT - afterT))} cut`, info: "Location-based emissions once efficiency and solar are fully rolled out at this facility." });
    return {
      title: "How this facility's cut is calculated",
      subtitle: f.name,
      rows,
      footer: "Renewable procurement is portfolio-wide (see the Procurement screen); it lowers the market-based number, not this facility's location-based one.",
    };
  }

  // procurement
  const p = result.procurement;
  const proc = result.levers.find((l) => l.id === "procurement");
  const rows: Row[] = [
    { label: "Addressable load", value: `${fmt(p.addressableKwh)} kWh`, formula: "portfolio grid draw the instruments can cover", info: "Grid electricity available to cover with market instruments (isolated sites excluded when the RE100 flag is on)." },
    { label: "Covered", value: `${fmt(p.coveredKwh)} kWh`, formula: "PPA + green tariff + RECs (clamped ≤ 100%)", info: "The renewable electricity contracted across PPA, green tariff and RECs." },
    { label: "Market-based abatement", value: `−${fmt(proc?.abatementT ?? 0)} t/yr`, emphasis: true, formula: "covered kWh × grid factor ÷ 1000", info: "How much procurement lowers the market-based number. Location-based (physical grid) is unchanged." },
    { label: "Procurement cost", value: `${fmtMoney(p.annualCost)}/yr`, formula: "", info: "Net annual cost of the instruments. A PPA strike below the grid tariff can make this a saving." },
  ];
  return {
    title: "How the procurement cut is calculated",
    subtitle: "Portfolio-wide · market-based",
    rows,
    footer: "Procurement moves only the market-based figure (the one RE100/SBTi market method use). Physical location-based emissions stay the same until you add efficiency or on-site solar.",
  };
}
