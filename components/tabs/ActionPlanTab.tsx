"use client";

/* Action plan — the board one-pager. Verdict first, four plain-language
   KPIs, the pathway chart, what the plan does, and what each action
   costs. All "how to read this" guidance lives behind ⓘ buttons so the
   page itself stays clean. Levers are edited in the Scenario Modeller. */

import { Fragment, useState } from "react";
import {
  TrendingDown, IndianRupee, Layers, Clock, Zap, Fuel, Snowflake,
  CheckCircle2, AlertTriangle, ChevronDown,
} from "lucide-react";
import { useScenario } from "@/lib/store";
import { ALT_FUELS, FAMILY_COLORS, REFRIGERANTS } from "@/lib/model/factors";
import { applyRefrigerant } from "@/lib/model/levers";
import { applyAssetActions } from "@/lib/model/segments";
import { CURRENCY } from "@/lib/defaults";
import { cn, fmt, fmtMoney, fmtNum, pct } from "@/lib/utils";
import { groupByBu } from "@/lib/group-by-bu";
import type { ComputeResult } from "@/lib/model";
import { Card, CardHeader } from "../ui/Card";
import { HowTo } from "../ui/HowTo";
import { InfoTip } from "../ui/InfoTip";
import { KpiCard } from "../ui/KpiCard";
import { WedgeChart } from "../charts/WedgeChart";
import { LeverBars } from "../charts/LeverBars";
import { Collapsible } from "@/components/tabs/activity/Collapsible";

interface PlanItem { label: string; detail: string; tonnes: number; color: string; icon: React.ElementType; bu?: string; }

export function ActionPlanTab() {
  const { settings, setSettings, result, scenarios, baseAssets, baseSystems } = useScenario();
  const [loaded, setLoaded] = useState("__live");

  const k = result.kpis;
  const barItems = result.segments.map((s) => ({ label: s.label, value: s.abatementT, color: FAMILY_COLORS[s.colorIdx] }));

  // "What this plan does" — one line per active action, with its abatement.
  // Only include NON-excluded sources so that the rows sum to the headline KPIs.
  const planItems: PlanItem[] = [];
  for (const a of baseAssets.filter((x) => !x.excluded)) {
    const acts = settings.byAsset[a.id];
    if (!acts) continue;
    const res = applyAssetActions(a, acts, settings.assumptions);
    if (acts.electrify.enabled && res.elecFraction > 0) {
      planItems.push({
        label: a.name,
        detail: a.category === "mobile"
          ? `${acts.electrify.unitsToConvert} of ${a.unitCount} vehicles go electric by ${acts.electrify.targetYear}`
          : `electrify ${acts.electrify.capacityPct}% of capacity by ${acts.electrify.targetYear}`,
        tonnes: res.scope1AbatementT, color: FAMILY_COLORS[a.category === "mobile" ? 5 : 6], icon: Zap, bu: a.bu,
      });
    }
    const dropInT = res.fuelAbatementT - res.flexAbatementT;
    if (acts.fuelSwitch.enabled && dropInT > 0) {
      planItems.push({
        label: a.name,
        detail: `blend ${acts.fuelSwitch.blendPct}% ${ALT_FUELS[acts.fuelSwitch.altFuel].label} by ${acts.fuelSwitch.targetYear}`,
        tonnes: dropInT, color: FAMILY_COLORS[2], icon: Fuel, bu: a.bu,
      });
    }
    if (acts.flexFuel?.enabled && res.flexAbatementT > 0) {
      planItems.push({
        label: a.name,
        detail: `${acts.flexFuel.unitsToConvert} of ${a.unitCount} vehicles → flex-fuel (${ALT_FUELS[acts.flexFuel.altFuel].label} ${acts.flexFuel.highBlendPct}%) by ${acts.flexFuel.targetYear}`,
        tonnes: res.flexAbatementT, color: FAMILY_COLORS[3], icon: Fuel, bu: a.bu,
      });
    }
  }
  const refLever = result.levers.find((l) => l.id === "refrigerant");
  if (refLever && refLever.abatementT > 0) {
    for (const sys of baseSystems.filter((x) => !x.excluded)) {
      const acts = settings.bySystem[sys.id];
      if (!acts) continue;
      const gasOn = acts.gasSwitch.enabled && acts.gasSwitch.transitionPct > 0;
      const leakOn = acts.leakFix.enabled && acts.leakFix.leakImprovementPct > 0;
      if (!gasOn && !leakOn) continue;
      const r = applyRefrigerant(sys, {
        transitionPct: gasOn ? acts.gasSwitch.transitionPct : 0,
        altRefrigerant: acts.gasSwitch.altRefrigerant,
        leakImprovementPct: leakOn ? acts.leakFix.leakImprovementPct : 0,
      });
      const parts = [
        ...(gasOn ? [`move ${acts.gasSwitch.transitionPct}% to ${REFRIGERANTS[acts.gasSwitch.altRefrigerant].label}`] : []),
        ...(leakOn ? [`cut leaks ${acts.leakFix.leakImprovementPct}%`] : []),
      ];
      planItems.push({ label: sys.name, detail: parts.join(" · "), tonnes: r.abatementT, color: FAMILY_COLORS[1], icon: Snowflake, bu: sys.bu });
    }
  }
  planItems.sort((a, b) => b.tonnes - a.tonnes);

  const onLoad = (id: string) => {
    setLoaded(id);
    if (id !== "__live") {
      const s = scenarios.find((x) => x.id === id);
      if (s) setSettings(() => s.settings);
    }
  };

  const totalOpexDelta = result.levers.filter((l) => l.enabled).reduce((s, l) => s + l.annualOpexDelta, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* verdict — the one thing to take away */}
      <Card className={cn("border-l-4", k.onTrack2030 ? "border-l-brand-500" : "border-l-amber-500")}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={cn("w-11 h-11 rounded-xl grid place-items-center shrink-0", k.onTrack2030 ? "bg-brand-50 text-brand-600" : "bg-amber-50 text-amber-600")}>
              {k.onTrack2030 ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-ink leading-tight">
                  {k.onTrack2030 ? "This plan meets the 2030 climate target" : "This plan falls short of the 2030 climate target"}
                </h2>
                <InfoTip text="The target is the SBTi 1.5°C pathway: roughly halve emissions by 2030 and reach ~90% reduction by 2050, measured against your base year." />
              </div>
              <p className="text-sm text-ink-soft mt-1">
                Emissions fall <strong>{pct(k.reduction2030)} by 2030</strong> and {pct(k.reduction2050)} by 2050
                {k.yearsToTarget ? <> — on the science-based pathway from <strong>{k.yearsToTarget}</strong>.</> : <> — and do not reach the science-based pathway by 2050.</>}
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <label className="block text-[10px] uppercase tracking-wide text-ink-faint font-bold mb-1">Scenario shown</label>
            <select value={loaded} onChange={(e) => onLoad(e.target.value)} className="border border-line rounded-lg px-3 py-2 text-sm font-medium bg-white focus:outline-none focus:border-brand-400">
              <option value="__live">Current (live)</option>
              {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* four numbers a board asks for */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          emphasis icon={TrendingDown} label="Emissions cut by 2030" value={pct(k.reduction2030)}
          delta={k.onTrack2030 ? "On track" : "Off track"} hint="vs base year"
        />
        <KpiCard
          icon={Layers} label="Investment needed" value={fmtMoney(k.totalCapex)}
          info="Total capital cost of every action switched on in this plan — vehicles, retrofits, equipment."
          hint="one-off CAPEX"
        />
        <KpiCard
          icon={IndianRupee} label="Running-cost impact" value={`${totalOpexDelta <= 0 ? "−" : "+"}${fmtMoney(Math.abs(totalOpexDelta))}`}
          info="How yearly operating costs change once the plan is fully in place. A minus sign means the plan saves money every year (e.g. cheaper electricity replacing diesel)."
          hint={totalOpexDelta <= 0 ? "saving per year" : "cost per year"}
        />
        <KpiCard
          icon={Clock} label="Payback" value={k.paybackYears != null ? `${fmtNum(k.paybackYears, 1)} yrs` : "—"}
          info="Years for the yearly savings to repay the investment. Shown as — when the plan costs more to run than it saves."
          hint={k.paybackYears != null ? "investment recovered" : "no payback at current settings"}
        />
      </div>

      {/* pathway chart */}
      <Card>
        <CardHeader
          title="Emissions pathway to 2050"
          subtitle="Where emissions go if you do nothing, and what this plan changes · tCO₂e"
          right={
            <HowTo
              points={[
                "Grey dashed line: business as usual — emissions if you change nothing.",
                "Coloured bands: the cut delivered by each action (electrification, fuel switch, refrigerants).",
                "Solid green line: your emissions with the plan in place.",
                "Blue dashed line: the SBTi 1.5°C science-based target. Stay below it to be on track.",
              ]}
            />
          }
        />
        <WedgeChart result={result} />
      </Card>

      {/* what the plan does + where the cuts come from */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title="What this plan does"
            subtitle="Every action, biggest impact first"
            right={<HowTo points={[
              "One row per action that is switched on in the Scenario Modeller.",
              "The number on the right is the CO₂e it removes each year once fully rolled out.",
              "To change an action, open the Scenario Modeller (step 2).",
            ]} />}
          />
          {planItems.length === 0 ? (
            <p className="text-sm text-ink-faint">No actions switched on yet — build the plan in the Scenario Modeller (step 2).</p>
          ) : (
            <div className="space-y-3">
              {groupByBu(planItems).map(([bu, items]) => (
                <Collapsible key={bu} title={bu || "Company-wide"} defaultOpen>
                  <div className="space-y-2.5 pt-2">
                    {items.map((p, i) => {
                      const Icon = p.icon;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg grid place-items-center shrink-0" style={{ background: `${p.color}1A` }}><Icon size={15} style={{ color: p.color }} /></div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-ink truncate">{p.label}</div>
                            <div className="text-xs text-ink-faint truncate">{p.detail}</div>
                          </div>
                          <div className="text-sm font-bold text-ink tabular-nums shrink-0">−{fmt(p.tonnes)} <span className="text-ink-faint font-normal text-xs">t/yr</span></div>
                        </div>
                      );
                    })}
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Where the cuts come from"
            subtitle="Yearly CO₂e removed, by area"
            right={<HowTo points={[
              "Each bar is one area of the business: vehicle fleet, stationary equipment, cooling systems.",
              "Longer bar = more CO₂e removed per year by that area.",
              "Use it to see which part of the operation carries the plan.",
            ]} />}
          />
          <LeverBars items={barItems} />
          {barItems.length === 0 && <p className="text-sm text-ink-faint">Switch on actions in the Scenario Modeller to see their impact here.</p>}
        </Card>
      </div>

      {/* cost of each action — ranked bars instead of a scatter plot */}
      <Card>
        <CardHeader
          title="What each action costs"
          subtitle={`Cost per tonne of CO₂e removed, cheapest first · ${CURRENCY}/t`}
          right={<HowTo points={[
            "Each bar shows the all-in yearly cost of removing one tonne of CO₂e with that action (investment spread over 10 years, plus the change in running costs).",
            `“Pays for itself” means the action saves more in running costs than it costs — the cheapest tonnes you can buy.`,
            "Fund the actions at the top of this list first.",
            "Click any row in the table below it for the full money breakdown.",
          ]} />}
        />
        <CostRanking levers={result.levers.filter((l) => l.enabled && l.abatementT > 0)} />
        <div className="mt-6 pt-4 border-t border-line/60">
          <LeverEconomics levers={result.levers.filter((l) => l.enabled)} />
        </div>
      </Card>

      {/* technical footnotes — out of the way but auditable */}
      <Card tone="muted">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <span className="flex items-center gap-1.5 text-ink-soft">
            Extra electricity from electrification:
            <strong className="text-ink tabular-nums">{fmt(result.scope2SpillFullT)} t</strong>
            <InfoTip text="Going electric moves emissions from your fuel (Scope 1) to purchased electricity (Scope 2). This is the Scope 2 added at full roll-out — manage it on the Scope 2 side of the dashboard." />
          </span>
          {result.biogenicT > 0 && (
            <span className="flex items-center gap-1.5 text-ink-soft">
              Biogenic CO₂ (reported separately):
              <strong className="text-ink tabular-nums">{fmt(result.biogenicT)} t/yr</strong>
              <InfoTip text="CO₂ from the renewable share of biofuels is biogenic — BRSR and GRI report it outside Scope 1. Only the fossil remainder stays in these numbers." />
            </span>
          )}
          <span className="flex items-center gap-1.5 text-ink-soft">
            Blended cost of the plan:
            <strong className="text-ink tabular-nums">{CURRENCY}{fmt(k.costPerTonne)}/t</strong>
            <InfoTip text="The weighted average yearly cost per tonne removed across all active actions — investment annualized over 10 years plus running-cost changes." />
          </span>
        </div>
      </Card>
    </div>
  );
}

/* Ranked cost-per-tonne bars — easier to read than a scatter plot. */
function CostRanking({ levers }: { levers: ComputeResult["levers"] }) {
  if (levers.length === 0) {
    return <p className="text-sm text-ink-faint">No actions switched on yet — build the plan in the Scenario Modeller.</p>;
  }
  const sorted = [...levers].sort((a, b) => a.costPerTonne - b.costPerTonne);
  const maxCost = Math.max(...sorted.map((l) => Math.max(0, l.costPerTonne)), 1);
  return (
    <div className="space-y-3">
      {sorted.map((l, idx) => {
        const paysForItself = l.costPerTonne <= 0;
        const width = paysForItself ? 4 : Math.max(4, (l.costPerTonne / maxCost) * 100);
        return (
          <div key={l.id} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-sm font-medium text-ink flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: FAMILY_COLORS[l.colorIdx] }} />
              {l.label}
            </span>
            <div className="flex-1 h-7 rounded-md bg-surface-muted overflow-hidden">
              <div
                className="h-full rounded-md flex items-center pl-2.5 text-[11px] font-semibold whitespace-nowrap bar-in"
                style={{
                  width: `${width}%`,
                  background: paysForItself
                    ? "linear-gradient(90deg,#3FB76E,#1F9E5A)"
                    : `linear-gradient(90deg, ${FAMILY_COLORS[l.colorIdx]}99, ${FAMILY_COLORS[l.colorIdx]}E6)`,
                  color: "white",
                  ["--bar-i" as string]: idx,
                }}
              >
                {paysForItself ? "" : `${CURRENCY}${fmt(l.costPerTonne)}/t`}
              </div>
            </div>
            <span className="w-40 shrink-0 text-right">
              {paysForItself ? (
                <span className="text-xs font-bold text-brand-600 bg-brand-50 rounded-full px-2.5 py-1">Pays for itself</span>
              ) : l.paybackYears != null ? (
                <span className="text-xs text-ink-soft">payback {fmtNum(l.paybackYears, 1)} yrs</span>
              ) : (
                <span className="text-xs text-ink-faint">net yearly cost</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Per-lever CAPEX / OPEX / payback with an expandable money breakdown. */
function LeverEconomics({ levers }: { levers: ComputeResult["levers"] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (levers.length === 0) return null;
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
            <th className="font-semibold text-left py-2 px-2">Action</th>
            <th className="font-semibold text-right py-2 px-2">CO₂e removed /yr</th>
            <th className="font-semibold text-right py-2 px-2">Investment</th>
            <th className="font-semibold text-right py-2 px-2">Running cost /yr</th>
            <th className="font-semibold text-right py-2 px-2">Payback</th>
          </tr>
        </thead>
        <tbody>
          {levers.map((l) => (
            <Fragment key={l.id}>
              <tr
                className="border-t border-line/60 cursor-pointer hover:bg-surface-muted/60"
                tabIndex={0}
                role="button"
                aria-expanded={open === l.id}
                onClick={() => setOpen(open === l.id ? null : l.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen(open === l.id ? null : l.id);
                  }
                }}
              >
                <td className="py-2.5 px-2">
                  <span className="flex items-center gap-2 font-medium text-ink">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: FAMILY_COLORS[l.colorIdx] }} />
                    {l.label}
                    <ChevronDown size={13} className={cn("text-ink-faint transition-transform", open === l.id && "rotate-180")} />
                  </span>
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">{fmt(l.abatementT)} t</td>
                <td className="py-2.5 px-2 text-right tabular-nums">{fmtMoney(l.capex)}</td>
                <td className={cn("py-2.5 px-2 text-right tabular-nums", l.annualOpexDelta < 0 && "text-brand-600 font-semibold")}>
                  {l.annualOpexDelta < 0 ? "−" : "+"}{fmtMoney(Math.abs(l.annualOpexDelta))}
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums">{l.paybackYears != null ? `${fmtNum(l.paybackYears, 1)} yrs` : "—"}</td>
              </tr>
              {open === l.id && (
                <tr className="bg-surface-muted/50">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      {l.opexParts.map((p) => (
                        <div key={p.label} className="flex items-center justify-between gap-2 rounded-lg bg-white border border-line/60 px-3 py-2">
                          <span className="text-ink-soft">{p.label}</span>
                          <span className={cn("font-semibold tabular-nums", p.amount < 0 ? "text-brand-600" : "text-ink")}>
                            {p.amount < 0 ? "−" : "+"}{fmtMoney(Math.abs(p.amount))}/yr
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-ink-faint mt-2">
                      Negative = saving. Yearly cost = investment ÷ 10 years + running-cost change. Payback = investment ÷ yearly saving.
                    </p>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
