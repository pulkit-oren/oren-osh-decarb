"use client";

import { CheckCircle2, AlertTriangle, TrendingDown, Wallet } from "lucide-react";
import { useScope2 } from "@/lib/scope2/store";
import { facilityGrade, confidenceOf } from "@/lib/data-quality";
import { cn, fmt, fmtMoney, pct } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";
import { KpiCard } from "../ui/KpiCard";
import { HeroCard } from "../ui/HeroCard";
import { ConfidenceGauge } from "../ui/ConfidenceGauge";
import { HowTo } from "../ui/HowTo";
import { Scope2TrajectoryChart } from "./TrajectoryChart";

export function Scope2CeoOverviewTab() {
  const { result, baseFacilities } = useScope2();
  const k = result.kpis;
  const confidence = confidenceOf(
    baseFacilities.filter((f) => !f.excluded).map((f) => ({ grade: facilityGrade(f), co2eT: result.baseline.perFacility.find((p) => p.id === f.id)?.locationT ?? 0 })),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* verdict */}
      <Card className={cn("border-l-4", k.onTrack2030 ? "border-l-brand-500" : "border-l-amber-500")}>
        <div className="flex items-start gap-3">
          <div className={cn("w-11 h-11 rounded-xl grid place-items-center shrink-0", k.onTrack2030 ? "bg-brand-50 text-brand-600" : "bg-amber-50 text-amber-600")}>
            {k.onTrack2030 ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-ink leading-tight">
              {k.onTrack2030 ? "On track for the 2030 climate target" : "Off track for the 2030 climate target"}
            </h2>
            <p className="text-sm text-ink-soft mt-1">
              Market-based Scope 2 falls <strong>{pct(k.reduction2030)} by 2030</strong> on the current pathway.
            </p>
          </div>
        </div>
      </Card>

      {/* hero target + headline KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <HeroCard
          tag="Target · 2030 · SBTi"
          value={fmt(k.target2030)}
          unit="tCO₂e"
          note={`Projected ▼ ${pct(k.reduction2030)} by 2030`}
          footLeft="Baseline (location)"
          footRight={`${fmt(k.baseLocationT)} t`}
        />
        <KpiCard emphasis icon={TrendingDown} label="Cut by 2030" value={pct(k.reduction2030)} delta={k.onTrack2030 ? "On track" : "Off track"} hint="market-based vs base" />
        <KpiCard icon={Wallet} label="Investment to target" value={fmtMoney(k.totalCapex)} hint="one-off CAPEX" />
      </div>

      {/* data confidence */}
      <ConfidenceGauge confidence={confidence} />

      {/* pathway */}
      <Card>
        <CardHeader
          title="Emissions pathway to 2050"
          subtitle="Location-based (solid) and market-based (dashed) · tCO₂e"
          right={<HowTo points={[
            "Grey dashed line: business as usual.",
            "Solid green line: location-based emissions (physical grid).",
            "Dashed teal line: market-based emissions (after green contracts).",
            "Pale line: the SBTi 1.5°C target — stay below it to be on track.",
          ]} />}
        />
        <Scope2TrajectoryChart
          series={[
            { id: "loc", label: "Location-based", color: "#1F9E5A", rows: result.trajectoryLocation },
            { id: "mkt", label: "Market-based", color: "#0F7873", dashed: true, rows: result.trajectoryMarket },
          ]}
        />
      </Card>
    </div>
  );
}
