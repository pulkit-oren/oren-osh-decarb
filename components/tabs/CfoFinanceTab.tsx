"use client";

import { Layers, IndianRupee, Coins, Clock } from "lucide-react";
import { useScenario } from "@/lib/store";
import { FAMILY_COLORS } from "@/lib/model/factors";
import { CURRENCY } from "@/lib/defaults";
import { fmt, fmtMoney, fmtNum, cn } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";
import { KpiCard } from "../ui/KpiCard";
import { HowTo } from "../ui/HowTo";
import { MaccChart } from "../charts/MaccChart";

export function CfoFinanceTab() {
  const { result } = useScenario();
  const k = result.kpis;
  const active = result.levers.filter((l) => l.enabled);
  const opexDelta = active.reduce((s, l) => s + l.annualOpexDelta, 0);
  const ranked = active.filter((l) => l.abatementT > 0).sort((a, b) => a.costPerTonne - b.costPerTonne);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard emphasis icon={Layers} label="Capital required" value={fmtMoney(k.totalCapex)} hint="one-off CAPEX to target" />
        <KpiCard icon={Coins} label="Blended cost / tonne" value={`${CURRENCY}${fmt(k.costPerTonne)}`} hint="weighted ₹/tCO₂e" />
        <KpiCard icon={IndianRupee} label="Running-cost impact" value={`${opexDelta <= 0 ? "−" : "+"}${fmtMoney(Math.abs(opexDelta))}`} hint={opexDelta <= 0 ? "saving per year" : "cost per year"} />
        <KpiCard icon={Clock} label="Portfolio payback" value={k.paybackYears != null ? `${fmtNum(k.paybackYears, 1)} yrs` : "—"} hint={k.paybackYears != null ? "investment recovered" : "no payback yet"} />
      </div>

      <Card>
        <CardHeader
          title="Marginal abatement cost curve"
          subtitle={`Bar width = tonnes abated · height = ${CURRENCY}/tonne · cheapest first`}
          right={<HowTo points={[
            "Each bar is one action. Width = CO₂e it removes per year; height = cost per tonne.",
            "Bars below the zero line save money (negative cost per tonne).",
            "Fund left-to-right: the cheapest tonnes first.",
          ]} />}
        />
        <MaccChart levers={result.levers} />
      </Card>

      <Card>
        <CardHeader title="Lever economics — ranked by cost per tonne" subtitle="Capex, abatement, payback and running-cost change" />
        {ranked.length === 0 ? (
          <p className="text-sm text-ink-faint">No actions switched on yet — build the plan in the Scenario Modeller.</p>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="font-semibold text-left py-2 px-2">Action</th>
                  <th className="font-semibold text-right py-2 px-2">Abatement</th>
                  <th className="font-semibold text-right py-2 px-2">Capex</th>
                  <th className="font-semibold text-right py-2 px-2">{CURRENCY}/tonne</th>
                  <th className="font-semibold text-right py-2 px-2">Payback</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((l) => (
                  <tr key={l.id} className="border-t border-line/60">
                    <td className="py-2.5 px-2">
                      <span className="flex items-center gap-2 font-medium text-ink">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: FAMILY_COLORS[l.colorIdx] }} />
                        {l.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{fmt(l.abatementT)} t</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{fmtMoney(l.capex)}</td>
                    <td className={cn("py-2.5 px-2 text-right tabular-nums font-semibold", l.costPerTonne < 0 && "text-brand-600")}>
                      {l.costPerTonne < 0 ? "−" : ""}{CURRENCY}{fmt(Math.abs(l.costPerTonne))}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{l.paybackYears != null ? `${fmtNum(l.paybackYears, 1)} yrs` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
