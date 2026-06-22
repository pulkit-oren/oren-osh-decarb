"use client";

import { FileWarning, Wallet, TrendingDown, Coins } from "lucide-react";
import { FAMILY_COLORS } from "@/lib/model/factors";
import { useScope2 } from "@/lib/scope2/store";
import { cn, fmt, fmtMoney, fmtNum } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";
import { KpiCard } from "../ui/KpiCard";
import { InfoTip } from "../ui/InfoTip";
import { MaccScatter } from "../charts/MaccScatter";

export function Scope2ActionPlanTab() {
  const { result } = useScope2();
  const k = result.kpis;
  const active = result.levers.filter((l) => l.abatementT > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard icon={Wallet} label="Total CAPEX" value={fmtMoney(k.totalCapex)} hint="all enabled levers, subsidy applied" />
        <KpiCard icon={Coins} label="Annual OPEX Δ" value={fmtMoney(k.annualOpexDelta)} hint={k.annualOpexDelta <= 0 ? "net saving per year" : "net cost per year"} />
        <KpiCard emphasis icon={TrendingDown} label="Blended cost of abatement" value={fmt(k.costPerTonne)} unit="/tCO₂e" hint={k.paybackYears != null ? `portfolio payback ≈ ${fmtNum(k.paybackYears, 1)} yrs` : "no portfolio payback"} />
      </div>

      <Card>
        <CardHeader
          title="Lever economics"
          subtitle="Full-ramp annual abatement and money flows per lever. Negative OPEX Δ is a saving."
        />
        {active.length === 0 ? (
          <p className="text-sm text-ink-faint py-6 text-center">No levers enabled yet — switch them on in the Scenario modeller.</p>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm min-w-[820px] table-fixed border-separate border-spacing-0">
              <colgroup>
                <col style={{ width: "22%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} />
                <col style={{ width: "13%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} />
              </colgroup>
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="font-semibold py-2 px-2 text-left">Lever</th>
                  <th className="font-semibold py-2 px-2 text-right">Abatement (t/yr) <InfoTip text="Procurement abatement is market-based only — the location-based footprint is untouched by certificates." /></th>
                  <th className="font-semibold py-2 px-2 text-right">CAPEX</th>
                  <th className="font-semibold py-2 px-2 text-right">OPEX Δ /yr</th>
                  <th className="font-semibold py-2 px-2 text-right">Payback (yrs)</th>
                  <th className="font-semibold py-2 px-2 text-right">Cost /tCO₂e</th>
                  <th className="font-semibold py-2 px-2 text-left">Running-cost parts</th>
                </tr>
              </thead>
              <tbody>
                {active.map((l) => (
                  <tr key={l.id} className="align-top border-t border-line/60">
                    <td className="py-2.5 px-2 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: FAMILY_COLORS[l.colorIdx] }} />
                        {l.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-semibold tabular-nums">{fmt(l.abatementT)}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{fmtMoney(l.capex)}</td>
                    <td className={cn("py-2.5 px-2 text-right tabular-nums font-medium", l.annualOpexDelta <= 0 ? "text-brand-600" : "text-amber-700")}>
                      {fmtMoney(l.annualOpexDelta)}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{l.paybackYears != null ? fmtNum(l.paybackYears, 1) : "—"}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{fmt(l.costPerTonne)}</td>
                    <td className="py-2.5 px-2">
                      <ul className="text-xs text-ink-soft space-y-0.5">
                        {l.opexParts.filter((part) => part.amount !== 0).map((part) => (
                          <li key={part.label} className="flex justify-between gap-3">
                            <span>{part.label}</span>
                            <span className={cn("tabular-nums shrink-0", part.amount <= 0 ? "text-brand-600" : "text-amber-700")}>{fmtMoney(part.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {k.footnote && (
          <p className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            <FileWarning size={14} className="shrink-0 mt-0.5" />
            RE100 exclusion applied — facilities on isolated/captive grids are excluded from the addressable
            renewable-procurement target. Progress is reported against the Addressable Target; this footnote
            also lands in the Excel export.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Marginal abatement cost curve"
          subtitle="Cheapest tonnes first: levers low and to the left deliver abatement at a saving."
        />
        {active.length === 0 ? (
          <p className="text-sm text-ink-faint py-6 text-center">Enable levers to populate the MACC.</p>
        ) : (
          <MaccScatter
            items={active.map((l) => ({
              label: l.label,
              costPerTonne: l.costPerTonne,
              tonnes: l.abatementT,
              ambition: l.abatementT,
              color: FAMILY_COLORS[l.colorIdx],
            }))}
          />
        )}
      </Card>
    </div>
  );
}
