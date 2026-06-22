"use client";

import { CheckCircle2, AlertTriangle, TrendingDown, Layers } from "lucide-react";
import { useScenario } from "@/lib/store";
import { compute } from "@/lib/model";
import { boardroomVariants } from "@/lib/boardroom-scenarios";
import { combustionGrade, refrigerantGrade, confidenceOf } from "@/lib/data-quality";
import { cn, fmt, fmtMoney, pct } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";
import { KpiCard } from "../ui/KpiCard";
import { HeroCard } from "../ui/HeroCard";
import { ConfidenceGauge } from "../ui/ConfidenceGauge";
import { HowTo } from "../ui/HowTo";
import { WedgeChart } from "../charts/WedgeChart";

export function CeoOverviewTab() {
  const { result, baseAssets, baseSystems, scenarios, setSettings, settings, baseYear } = useScenario();
  const k = result.kpis;
  const confidence = confidenceOf([
    ...baseAssets.map((a) => ({ grade: combustionGrade(a), co2eT: result.baseline.perCombustion.find((p) => p.id === a.id)?.co2eT ?? 0 })),
    ...baseSystems.map((s) => ({ grade: refrigerantGrade(s), co2eT: result.baseline.perRefrigeration.find((p) => p.id === s.id)?.co2eT ?? 0 })),
  ]);
  const variants = boardroomVariants(settings).map((v) => {
    const r = compute(baseAssets.filter((a) => !a.excluded), baseSystems.filter((s) => !s.excluded), v.settings, baseYear);
    return { ...v, reduction2030: r.kpis.reduction2030, totalCapex: r.kpis.totalCapex, onTrack: r.kpis.onTrack2030 };
  });

  const onLoad = (id: string) => {
    if (id === "__live") return;
    const s = scenarios.find((x) => x.id === id);
    if (s) setSettings(() => s.settings);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* verdict + scenario picker */}
      <Card className={cn("border-l-4", k.onTrack2030 ? "border-l-brand-500" : "border-l-amber-500")}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={cn("w-11 h-11 rounded-xl grid place-items-center shrink-0", k.onTrack2030 ? "bg-brand-50 text-brand-600" : "bg-amber-50 text-amber-600")}>
              {k.onTrack2030 ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold text-ink leading-tight">
                {k.onTrack2030 ? "On track for the 2030 climate target" : "Off track for the 2030 climate target"}
              </h2>
              <p className="text-sm text-ink-soft mt-1">
                Scope 1 falls <strong>{pct(k.reduction2030)} by 2030</strong> and {pct(k.reduction2050)} by 2050 on the current pathway.
              </p>
            </div>
          </div>
          {scenarios.length > 0 && (
            <div className="shrink-0">
              <label className="block text-[10px] uppercase tracking-wide text-ink-faint font-bold mb-1">Scenario shown</label>
              <select onChange={(e) => onLoad(e.target.value)} defaultValue="__live" className="border border-line rounded-lg px-3 py-2 text-sm font-medium bg-white focus:outline-none focus:border-brand-400">
                <option value="__live">Current (live)</option>
                {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </Card>

      {/* hero target + headline KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <HeroCard
          tag="Projected · 2030"
          value={fmt(k.net2030)}
          unit="tCO₂e"
          note={`▼ ${pct(k.reduction2030)} vs baseline`}
          footLeft="Baseline"
          footRight={`${fmt(result.baseTotalT)} t`}
        />
        <KpiCard emphasis icon={TrendingDown} label="Cut by 2030" value={pct(k.reduction2030)} delta={k.onTrack2030 ? "On track" : "Off track"} hint="vs base year" />
        <KpiCard icon={Layers} label="Investment to target" value={fmtMoney(k.totalCapex)} hint="one-off CAPEX" />
      </div>

      {/* data confidence */}
      <ConfidenceGauge confidence={confidence} />

      {/* glide path */}
      <Card>
        <CardHeader
          title="Glide path to 2050"
          subtitle="Where emissions go if you do nothing, and what this plan changes · tCO₂e"
          right={<HowTo points={[
            "Grey dashed line: business as usual.",
            "Coloured bands: the cut each action delivers.",
            "Solid green line: emissions with the plan in place.",
            "Blue dashed line: the SBTi 1.5°C target — stay below it to be on track.",
          ]} />}
        />
        <WedgeChart result={result} />
      </Card>

      {/* boardroom scenarios — three pathways from the live plan */}
      <Card>
        <CardHeader title="Boardroom scenarios" subtitle="Three pathways from your live plan — adopt one as the committed plan" />
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="font-semibold text-left py-2 px-2">Pathway</th>
                <th className="font-semibold text-right py-2 px-2">Cut by 2030</th>
                <th className="font-semibold text-right py-2 px-2">Investment</th>
                <th className="font-semibold text-left py-2 px-2 pl-4">Status</th>
                <th className="py-2 px-2" />
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} className="border-t border-line/60">
                  <td className="py-2.5 px-2 font-medium text-ink">{v.name}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-semibold">{pct(v.reduction2030)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{fmtMoney(v.totalCapex)}</td>
                  <td className="py-2.5 px-2 pl-4">
                    <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-2.5 py-0.5", v.onTrack ? "text-brand-700 bg-brand-50" : "text-amber-700 bg-amber-50")}>
                      <span className={cn("w-1.5 h-1.5 rounded-full", v.onTrack ? "bg-good" : "bg-warn")} />
                      {v.onTrack ? "On track" : "Off track"}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <button onClick={() => setSettings(() => v.settings)} className="text-xs font-semibold rounded-lg border border-line px-3 py-1.5 hover:border-brand-300 hover:text-brand-700">
                      Adopt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
