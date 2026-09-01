"use client";

/* The prices a plan's capital is built from, editable in one place.

   Every rate here was already editable — but only from per-asset "Advanced"
   collapsibles inside two other tabs, so pricing a plan meant leaving the
   screen the plan is on. This is the same fields, gathered.

   Two things it must not do:

   - It must not RE-COST anything. Rows come from `result.capexLines`, which
     each engine emits from the same expressions that accumulate its lever
     capex, so the breakdown and the total are one set of additions. A second
     costing pass here is the drift the registry exists to end.
   - A line-level edit must not FLATTEN its sources. Typing scales each source
     by `typed / current`, so the figure reads back exactly what was typed and
     the spread between sources survives. See lib/model/capex-edit.ts. */

import { useState } from "react";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import type { CapexLine } from "@/lib/model/capex";
import { capexEditPatches, editableFigure, isEditable } from "@/lib/model/capex-edit";
import { CURRENCY } from "@/lib/defaults";
import { InfoTip } from "@/components/ui/InfoTip";
import { cn, fmt, fmtMoney } from "@/lib/utils";

/** A source's current value for the field this line edits. Undefined when the
 *  source cannot be resolved — capexEditPatches skips those rather than
 *  writing a guessed value over them. */
function readerFor(
  line: CapexLine,
  byAsset: Record<string, unknown>,
  bySystem: Record<string, unknown>,
  byFacility: Record<string, unknown>,
) {
  return (sourceId: string): number | undefined => {
    const t = line.edit;
    if (!t) return undefined;
    const bag =
      t.kind === "s1-asset" ? byAsset[sourceId]
        : t.kind === "s1-system" ? bySystem[sourceId]
          : t.kind === "s2-facility" ? byFacility[sourceId]
            : undefined;
    if (!bag || typeof bag !== "object") return undefined;
    const action = (bag as Record<string, unknown>)[(t as { action: string }).action];
    if (!action || typeof action !== "object") return undefined;
    const v = (action as Record<string, unknown>)[t.field];
    return typeof v === "number" ? v : undefined;
  };
}

export function CapexRateTable({ invalidate }: { invalidate: () => void }) {
  const s1 = useScenario();
  const s2 = useScope2();

  /* Which row is being typed in, and the raw text. Held as text so a
     half-typed "4" in "45000" does not momentarily rewrite every source. */
  const [editing, setEditing] = useState<{ driverId: string; text: string } | null>(null);

  const lines: CapexLine[] = [...s1.result.capexLines, ...s2.result.capexLines];

  /* Yearly cost for a line that commits no capital — green procurement is not
     free, and a row reading only "no capital" would say the opposite. */
  const yearlyFor = (line: CapexLine): number => {
    const lever = line.scope === 1
      ? s1.result.levers.find((l) => l.id === line.leverId)
      : s2.result.levers.find((l) => l.id === line.leverId);
    return lever?.annualOpexDelta ?? 0;
  };

  const commit = (line: CapexLine, text: string) => {
    setEditing(null);
    const typed = Number(text);
    if (text.trim() === "" || !Number.isFinite(typed)) return;

    const patches = capexEditPatches(
      line, typed,
      readerFor(line, s1.settings.byAsset, s1.settings.bySystem, s2.levers.byFacility),
    );
    if (patches.length === 0) return;

    invalidate();
    for (const p of patches) {
      if (p.kind === "s1-asset") s1.updateAction(p.sourceId, p.action, { [p.field]: p.value });
      else if (p.kind === "s1-system") s1.updateSystemAction(p.sourceId, p.action, { [p.field]: p.value });
      else if (p.kind === "s1-assumption") s1.updateAssumptions({ infraCapex: p.value });
      else s2.updateFacilityAction(p.sourceId, p.action, { [p.field]: p.value });
    }
  };

  if (lines.length === 0) {
    return (
      <p className="text-[13px] text-ink-faint leading-relaxed">
        No lever is active yet, so the plan buys nothing. Turn one on in Fine-tune
        levers and the prices it is built from appear here.
      </p>
    );
  }

  return (
    <div data-testid="capex-rate-table">
      <div className="flex items-center gap-3 pb-2 text-[10px] uppercase tracking-[0.08em] font-bold text-ink-faint">
        <span className="w-44 shrink-0">Driver</span>
        <span className="w-6 shrink-0" />
        <span className="w-28 shrink-0 text-right">Quantity</span>
        <span className="w-32 shrink-0 text-right">Rate</span>
        <span className="w-24 shrink-0 text-right">Capital</span>
      </div>

      <div className="divide-y divide-line/50">
        {lines.map((line) => {
          const fig = editableFigure(line);
          const editable = isEditable(line);
          const isOpen = editing?.driverId === line.driverId;
          const zeroCapital = Math.abs(line.amount) < 0.5;

          return (
            <div key={`${line.scope}:${line.driverId}`} className="flex items-center gap-3 py-2">
              <span className="w-44 shrink-0 text-[13px] font-medium text-ink truncate" title={line.label}>
                {line.label}
              </span>
              <span className="w-6 shrink-0 text-[10px] font-bold text-ink-faint">S{line.scope}</span>

              <span className="w-28 shrink-0 text-right text-xs tabular-nums text-ink-soft">
                {line.unit ? `${fmt(line.unit.quantity)} ${line.unit.unitLabel}` : "—"}
              </span>

              <span className="w-32 shrink-0 flex items-center justify-end gap-1">
                {editable ? (
                  <input
                    type="number"
                    aria-label={`${line.label} ${fig.kind}`}
                    value={isOpen ? editing.text : String(Math.round(fig.value))}
                    onChange={(e) => setEditing({ driverId: line.driverId, text: e.target.value })}
                    onFocus={(e) => setEditing({ driverId: line.driverId, text: e.target.value })}
                    onBlur={(e) => commit(line, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className="w-28 border border-line rounded-lg px-2.5 py-1.5 text-[13px] bg-white text-right tabular-nums focus:outline-none focus:border-brand-400"
                  />
                ) : (
                  <span className="text-xs text-ink-faint">
                    {zeroCapital ? "no capital" : "per source"}
                  </span>
                )}
                {line.mixed && (
                  <InfoTip text={`Sources are priced differently; ${fmtMoney(fig.value)} is the quantity-weighted average. Typing a new figure scales every source by the same factor, so the spread between them survives.`} />
                )}
              </span>

              <span
                data-amount={line.amount}
                className={cn(
                  "w-24 shrink-0 text-right text-[13px] font-extrabold tabular-nums",
                  line.amount < 0 ? "text-brand-600" : "text-ink",
                )}
              >
                {/* A zero-capital driver still earns a row — green procurement
                    costs nothing up front and is not free. But when its yearly
                    cost is zero too it is simply not part of this plan, and
                    "₹0/yr" states that far less clearly than saying so. */}
                {zeroCapital
                  ? Math.abs(yearlyFor(line)) > 0.5
                    ? <span className="font-semibold text-ink-faint">{fmtMoney(yearlyFor(line))}/yr</span>
                    : <span className="font-semibold text-ink-faint">not in this plan</span>
                  : fmtMoney(line.amount)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3.5 text-xs text-ink-faint leading-relaxed max-w-2xl">
        The same prices the Scope 1 and Scope 2 source screens edit. A rate is{" "}
        {CURRENCY} per unit where the driver decomposes and the line&rsquo;s total
        where it does not; the solar subsidy is a percentage, set per facility.
      </p>
    </div>
  );
}
