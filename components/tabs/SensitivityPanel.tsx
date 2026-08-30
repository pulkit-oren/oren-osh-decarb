"use client";

/* "What would have to be true."

   A plan showing a negative NPV and no payback is not a rejection — it is a
   question. At what carbon price does it turn? At what diesel escalation? The
   model could only answer by having the user hand-edit an assumption, read the
   new number, and lose the comparison.

   Every row here is a full recompute of both engines at that value, not an
   interpolation, so a figure on this panel is exactly what the plan would show
   if the user typed that number into the assumptions. */

import { useMemo } from "react";
import { Activity, AlertTriangle } from "lucide-react";
import { useScenario } from "@/lib/store";
import { useOptionalScope2 } from "@/lib/scope2/store";
import { sensitivity, breakEven, type SensitivityRow } from "@/lib/sensitivity";
import { CURRENCY } from "@/lib/defaults";
import { fmt, fmtMoney } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";

const crore = (v: number) => `${v < 0 ? "−" : ""}${CURRENCY}${fmt(Math.abs(v) / 1e7)} cr`;

export function SensitivityPanel() {
  const { resolvedBaseAssets, baseSystems, settings, baseYear } = useScenario();
  const s2 = useOptionalScope2();

  const { rows, carbonBreakEven } = useMemo(() => {
    if (!s2) return { rows: [] as SensitivityRow[], carbonBreakEven: null as number | null };
    const inp = {
      assets: resolvedBaseAssets.filter((a) => !a.excluded),
      systems: baseSystems.filter((x) => !x.excluded),
      settings,
      facilities: s2.baseFacilities.filter((f) => !f.excluded),
      levers: s2.levers,
      baseYear,
    };
    return {
      rows: sensitivity(inp),
      carbonBreakEven: breakEven(inp, "carbonPricePerTonne", [0, 20_000]),
    };
  }, [resolvedBaseAssets, baseSystems, settings, s2, baseYear]);

  if (rows.length === 0) return null;

  const maxSwing = Math.max(...rows.map((r) => r.npvSwing), 1);
  const deciding = rows.filter((r) => r.flipsSign);

  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Activity size={17} className="text-brand-600" />What would have to be true</span>}
        subtitle="Each row re-runs the whole plan at that value — both scopes, full recompute. Sorted by how much the answer moves."
      />

      {deciding.length > 0 && (
        <div className="mt-3 flex gap-2.5 items-start rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" strokeWidth={2.2} />
          <p className="text-[13px] text-amber-900 leading-snug">
            {deciding.map((r) => r.label).join(" and ")}{" "}
            {deciding.length === 1 ? "decides" : "decide"} whether this plan creates value at all — not
            just how much. Across the range tested, the NPV changes sign.
          </p>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="text-left font-bold py-2 pr-4">Assumption</th>
              <th className="text-right font-bold py-2 px-3">Low</th>
              <th className="text-right font-bold py-2 px-3">Plan</th>
              <th className="text-right font-bold py-2 px-3">High</th>
              <th className="text-left font-bold py-2 pl-4 w-[34%]">NPV swing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line/60 align-top">
                <td className="py-2.5 pr-4">
                  <div className="font-semibold text-ink">{r.label}</div>
                  <div className="text-[11px] text-ink-faint leading-snug max-w-[34ch] mt-0.5">{r.note}</div>
                </td>
                <Cell v={r.low.value} npv={r.low.outcome.npv} unit={r.unit} />
                <Cell v={r.base.value} npv={r.base.outcome.npv} unit={r.unit} emphasis />
                <Cell v={r.high.value} npv={r.high.outcome.npv} unit={r.unit} />
                <td className="py-2.5 pl-4">
                  <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className={r.flipsSign ? "h-full bg-amber-500" : "h-full bg-brand-500"}
                      style={{ width: `${Math.max(2, (r.npvSwing / maxSwing) * 100)}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-ink-faint mt-1 tabular-nums">{crore(r.npvSwing)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 pt-3 border-t border-line/60 text-[13px] text-ink-soft">
        {carbonBreakEven === null ? (
          <>No internal carbon price up to {CURRENCY}20,000/t turns this plan NPV-positive on its own — the case has to be made on something other than carbon.</>
        ) : carbonBreakEven <= 0 ? (
          <>This plan is NPV-positive with no internal carbon price at all.</>
        ) : (
          <>
            Break-even internal carbon price:{" "}
            <strong className="text-ink font-semibold">{CURRENCY}{fmt(Math.round(carbonBreakEven))}/tCO₂e</strong>
            {" "}— above that, the programme pays for itself.
          </>
        )}
      </p>
    </Card>
  );
}

function Cell({ v, npv, unit, emphasis }: { v: number; npv: number; unit: string; emphasis?: boolean }) {
  return (
    <td className={`py-2.5 px-3 text-right tabular-nums ${emphasis ? "bg-surface-muted/50" : ""}`}>
      <div className="text-[12px] text-ink-faint">{fmt(v)}{unit.startsWith("%") ? unit : ` ${unit}`}</div>
      <div className={`font-semibold ${npv >= 0 ? "text-brand-600" : "text-red-600"}`}>{fmtMoney(npv)}</div>
    </td>
  );
}
