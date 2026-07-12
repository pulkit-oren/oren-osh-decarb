"use client";

import { Layers, IndianRupee, Coins, Clock, TrendingUp } from "lucide-react";
import { useScenario } from "@/lib/store";
import { FAMILY_COLORS } from "@/lib/model/factors";
import { buildCashflow, DEFAULT_CASHFLOW_ASSUMPTIONS } from "@/lib/model/cashflow";
import { CURRENCY } from "@/lib/defaults";
import { fmt, fmtMoney, fmtNum, cn } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";
import { KpiCard } from "../ui/KpiCard";
import { HowTo } from "../ui/HowTo";
import { MaccChart } from "../charts/MaccChart";

export function CfoFinanceTab() {
  const { result, baseYear, settings } = useScenario();
  const k = result.kpis;
  const active = result.levers.filter((l) => l.enabled);
  const opexDelta = active.reduce((s, l) => s + l.annualOpexDelta, 0);
  const ranked = active.filter((l) => l.abatementT > 0).sort((a, b) => a.costPerTonne - b.costPerTonne);
  const cf = buildCashflow(active, baseYear, 2040, {
    ...DEFAULT_CASHFLOW_ASSUMPTIONS,
    discountRatePct: settings.assumptions.discountRatePct ?? 10,
  });
  const cfRows = cf.rows.filter((r) => r.year <= 2037);

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

      <Card>
        <CardHeader
          title="Year-by-year cashflow"
          subtitle={`Money follows the deployment ramp · fuel escalates ${DEFAULT_CASHFLOW_ASSUMPTIONS.fuelEscalationPct}%/yr, electricity ${DEFAULT_CASHFLOW_ASSUMPTIONS.elecEscalationPct}%/yr · discounted at ${settings.assumptions.discountRatePct ?? 10}%`}
          right={<HowTo points={[
            "CAPEX lands as each lever phases in — not all up front.",
            "OPEX Δ scales with the ramp and escalates by price line: diesel inflates faster than grid tariffs, which is often the case FOR electrification.",
            "NPV positive = the program creates value at your discount rate. Peak funding = the most cash you'll ever be out.",
            "Payback year = when cumulative savings have repaid the spend for good.",
          ]} />}
        />
        {active.length === 0 ? (
          <p className="text-sm text-ink-faint">No actions switched on yet — build the plan in the Scenario Modeller.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <KpiCard icon={TrendingUp} label="NPV of the program" value={`${cf.npv < 0 ? "−" : "+"}${fmtMoney(Math.abs(cf.npv))}`} hint={cf.npv >= 0 ? "value-creating at WACC" : "net cost at WACC"} />
              <KpiCard icon={Layers} label="Peak funding need" value={fmtMoney(cf.peakFunding)} hint="worst cumulative cash position" />
              <KpiCard icon={Clock} label="Cash payback year" value={cf.paybackYear != null ? `FY ${cf.paybackYear}` : "beyond 2040"} hint="cumulative savings repay the spend" />
            </div>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                    <th className="font-semibold text-left py-2 px-2">FY</th>
                    <th className="font-semibold text-right py-2 px-2">CAPEX</th>
                    <th className="font-semibold text-right py-2 px-2">OPEX Δ</th>
                    <th className="font-semibold text-right py-2 px-2">Net cash</th>
                    <th className="font-semibold text-right py-2 px-2">Cumulative</th>
                  </tr>
                </thead>
                <tbody>
                  {cfRows.map((r) => (
                    <tr key={r.year} className="border-t border-line/60">
                      <td className="py-2 px-2 font-medium tabular-nums">{r.year}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.capex > 0 ? fmtMoney(r.capex) : "—"}</td>
                      <td className={cn("py-2 px-2 text-right tabular-nums", r.opexDelta < 0 && "text-brand-600")}>{r.opexDelta < 0 ? "−" : "+"}{fmtMoney(Math.abs(r.opexDelta))}</td>
                      <td className={cn("py-2 px-2 text-right tabular-nums font-semibold", r.net < 0 && "text-brand-600")}>{r.net < 0 ? "−" : "+"}{fmtMoney(Math.abs(r.net))}</td>
                      <td className={cn("py-2 px-2 text-right tabular-nums", r.cumulative <= 0 && "text-brand-700 font-semibold")}>{r.cumulative < 0 ? "−" : ""}{fmtMoney(Math.abs(r.cumulative))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
