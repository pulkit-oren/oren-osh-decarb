"use client";

import { Layers, IndianRupee, Coins, Clock, TrendingUp } from "lucide-react";
import { useScenario } from "@/lib/store";
import { FAMILY_COLORS } from "@/lib/model/factors";
import { financeAssumptionsFrom } from "@/lib/finance";
import { CURRENCY } from "@/lib/defaults";
import { fmt, fmtMoney, cn, fmtPayback, paybackHint } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";
import { KpiCard } from "../ui/KpiCard";
import { HowTo } from "../ui/HowTo";
import { MaccChart } from "../charts/MaccChart";

export function CfoFinanceTab() {
  const { result, settings } = useScenario();
  const k = result.kpis;
  const active = result.levers.filter((l) => l.enabled);
  const opexDelta = active.reduce((s, l) => s + l.annualOpexDelta, 0);
  const ranked = active.filter((l) => l.abatementT > 0).sort((a, b) => a.costPerTonne - b.costPerTonne);
  // The cashflow is no longer built here from a second set of assumptions —
  // it IS the series each lever was costed on, merged by year. That is what
  // stops this screen and the KPIs above it disagreeing (F5).
  const fa = financeAssumptionsFrom(settings.assumptions);
  const byYear = new Map<number, { capex: number; opexDelta: number; net: number }>();
  for (const l of active) {
    for (const r of l.series) {
      const acc = byYear.get(r.year) ?? { capex: 0, opexDelta: 0, net: 0 };
      acc.capex += r.capex; acc.opexDelta += r.opexDelta; acc.net += r.net;
      byYear.set(r.year, acc);
    }
  }
  type CfRow = { year: number; capex: number; opexDelta: number; net: number; cumulative: number };
  // No year filter. The table used to stop at 2037 while the NPV and peak
  // funding printed above it were computed over the full window — every lever's
  // own asset life, out to 2044 on this company. Truncating the rows made those
  // KPIs unauditable from the table they sit on, and made "beyond 2037" a claim
  // about a year the engine had already looked past.
  const cfRows = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .reduce<CfRow[]>((acc, [year, v]) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].cumulative : 0;
      acc.push({ year, ...v, cumulative: prev + v.net });
      return acc;
    }, []);
  const lastYear = cfRows.length > 0 ? cfRows[cfRows.length - 1].year : null;
  // First year the UNdiscounted cumulative position turns non-positive, and only
  // once capital has actually been committed. Without the second condition a
  // plan whose savings start before its spend reports payback in the base year
  // — the `spentAnything` guard the deleted cashflow module carried, and the
  // reason this card could contradict the discounted one at the top of the tab.
  let paybackYear: number | null = null;
  let committed = 0;
  for (const r of cfRows) {
    committed += r.capex;
    if (paybackYear === null && committed > 0 && r.cumulative <= 0) paybackYear = r.year;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard emphasis icon={Layers} label="Capital required" value={fmtMoney(k.totalCapex)} hint="one-off CAPEX to target" />
        <KpiCard icon={Coins} label="Blended cost / tonne"
          value={Number.isFinite(k.costPerTonne) ? `${CURRENCY}${fmt(k.costPerTonne)}` : "—"}
          hint={Number.isFinite(k.costPerTonne) ? "levelised ₹/tCO₂e" : "no abatement to divide by"} />
        <KpiCard icon={IndianRupee} label="Running-cost impact" value={`${opexDelta <= 0 ? "−" : "+"}${fmtMoney(Math.abs(opexDelta))}`} hint={opexDelta <= 0 ? "saving per year" : "cost per year"} />
        <KpiCard icon={Clock} label="Portfolio payback"
          value={fmtPayback(k.paybackYears, k.paybackKind)}
          hint={paybackHint(k.paybackYears, k.paybackKind)} />
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
                    <td className="py-2.5 px-2 text-right tabular-nums">
                      {fmtPayback(l.paybackYears, l.paybackKind)}
                    </td>
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
          subtitle={`Money follows the deployment ramp · fuel escalates ${fa.fuelEscalationPct}%/yr, electricity ${fa.elecEscalationPct}%/yr · discounted at ${fa.discountRatePct}%`}
          right={<HowTo points={[
            "CAPEX lands as each lever phases in — not all up front.",
            "OPEX Δ scales with the ramp and escalates by price line: diesel inflates faster than grid tariffs, which is often the case FOR electrification.",
            "NPV positive = the program creates value at your discount rate. Peak funding = the most cash you'll ever be out.",
            "Rows run to the end of the longest-lived asset — the same window the NPV above is computed over.",
            "Cash payback year = the first year cumulative cash comes back in your favour, in real rupees. Portfolio payback at the top of the tab asks the same question with every year discounted, so the two differ by design.",
          ]} />}
        />
        {active.length === 0 ? (
          <p className="text-sm text-ink-faint">No actions switched on yet — build the plan in the Scenario Modeller.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <KpiCard icon={TrendingUp} label="NPV of the program" value={`${k.npv < 0 ? "−" : "+"}${fmtMoney(Math.abs(k.npv))}`} hint={k.npv >= 0 ? "value-creating at WACC" : "net cost at WACC"} />
              <KpiCard icon={Layers} label="Peak funding need" value={fmtMoney(k.peakFunding)} hint="worst cumulative cash position" />
              <KpiCard icon={Clock} label="Cash payback year"
                value={paybackYear != null ? `FY ${paybackYear}` : lastYear != null ? `beyond ${lastYear}` : "—"}
                hint="undiscounted cash — the card above discounts it" />
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
