"use client";

/* "How this is calculated" — a trigger that opens a right-side drawer showing
   how the PROJECTED TARGET is derived: the base-year anchor, each interim
   milestone, and the target-year value, with the exact formula and a hover
   info explaining what every line means. */

import { useEffect, useState } from "react";
import { Calculator, X } from "lucide-react";
import { fyLabel } from "@/lib/model/types";
import { METRIC_UNIT, type Goal } from "@/lib/goals/types";
import { baseValueFor, endReductionFrac, targetValueAt, type Inventories } from "@/lib/goals/select";
import { InfoTip } from "@/components/ui/InfoTip";
import { fmt } from "@/lib/utils";

interface TargetRow { year: number; label: string; formula: string; value: string; info: string; emphasis?: boolean; }

function buildTargetRows(goal: Goal, base: number): TargetRow[] {
  const unit = METRIC_UNIT[goal.metric];
  const reduce = goal.direction === "reduce";
  const v = (n: number) => `${fmt(n)} ${unit}`;

  const anchors = [
    { year: goal.baseYear, kind: "base" as const, pct: 0 },
    ...goal.milestones
      .filter((m) => m.year > goal.baseYear && m.year < goal.targetYear)
      .sort((a, b) => a.year - b.year)
      .map((m) => ({ year: m.year, kind: "milestone" as const, pct: m.reductionPct })),
    { year: goal.targetYear, kind: "target" as const, pct: Math.round(endReductionFrac(goal) * 100) },
  ];

  return anchors.map((a) => {
    const value = targetValueAt(goal, base, a.year);
    if (a.kind === "base") {
      return {
        year: a.year, label: `Base year ${fyLabel(a.year)}`, formula: `${v(base)} — the starting point`, value: v(base),
        info: "Your base-year value, pulled from the Data input tab. Every target reduction is measured against this number.",
      };
    }
    if (a.kind === "milestone") {
      return reduce
        ? { year: a.year, label: `Milestone ${a.year}`, formula: `${fmt(base)} × (1 − ${a.pct}%) = ${v(value)}`, value: v(value),
            info: `An interim checkpoint: ${a.pct}% below the base year by ${a.year}. The target line bends through this point.` }
        : { year: a.year, label: `Milestone ${a.year}`, formula: `reach ${v(a.pct)} by ${a.year}`, value: v(value),
            info: `An interim checkpoint: reach ${v(a.pct)} by ${a.year}. The target line bends through this point.` };
    }
    // target year
    const netZero = goal.templateId === "netzero";
    return reduce
      ? { year: a.year, label: `Target year ${a.year}`, formula: `${fmt(base)} × (1 − ${a.pct}%) = ${v(value)}`, value: v(value), emphasis: true,
          info: netZero
            ? `Net-zero: cut ${a.pct}% and neutralise the remaining ${goal.residualPct ?? 0}% by ${a.year}.`
            : `The goal: ${a.pct}% below the base year by ${a.year}.` }
      : { year: a.year, label: `Target year ${a.year}`, formula: `reach ${v(value)} by ${a.year}`, value: v(value), emphasis: true,
          info: `The goal: reach ${v(value)} by ${a.year}.` };
  });
}

export function CalcPanel({ goal, inv }: { goal: Goal; inv: Inventories }) {
  const [open, setOpen] = useState(false);
  const base = baseValueFor(goal, inv);
  const unit = METRIC_UNIT[goal.metric];
  const rows = buildTargetRows(goal, base);
  const reduce = goal.direction === "reduce";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left rounded-xl2 border border-line/60 bg-surface-muted/50 hover:bg-surface-muted transition-colors"
      >
        <Calculator size={15} className="text-brand-600 shrink-0" />
        <span className="text-sm font-semibold text-ink">How this is calculated</span>
        <span className="text-xs text-ink-faint ml-1">· projected target path</span>
        <span className="ml-auto text-xs font-medium text-brand-600">Open →</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="How the projected target is calculated">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-surface shadow-card-lg border-l border-line flex flex-col tab-fade">
            <header className="flex items-center gap-2 px-5 py-4 border-b border-line/60 shrink-0">
              <Calculator size={17} className="text-brand-600" />
              <div className="min-w-0">
                <h3 className="font-bold text-ink leading-tight truncate">How the projected target is calculated</h3>
                <p className="text-xs text-ink-faint">{goal.name}</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="ml-auto w-8 h-8 rounded-lg grid place-items-center text-ink-faint hover:text-ink hover:bg-surface-muted">
                <X size={17} />
              </button>
            </header>

            <div className="overflow-y-auto flex-1 px-5 py-4">
              {/* method */}
              <div className="flex items-center gap-1.5 text-sm text-ink-soft mb-3">
                <span className="font-semibold text-ink">The target path</span>
                <InfoTip text={`The target is anchored at the base year and the target year (plus any milestones). Between those points it follows a straight line — the value for any year is a linear interpolation between the two nearest anchors.`} />
              </div>

              <div className="space-y-2.5">
                {rows.map((r, i) => (
                  <div key={i} className={cnRow(r.emphasis)}>
                    <div className="flex items-center gap-1.5">
                      <span className={r.emphasis ? "text-sm font-bold text-brand-800" : "text-sm font-medium text-ink"}>{r.label}</span>
                      <InfoTip text={r.info} />
                    </div>
                    <div className="flex items-baseline justify-between gap-2 mt-1">
                      <code className={r.emphasis ? "text-[11px] text-brand-700/80 leading-snug" : "text-[11px] text-ink-soft leading-snug"}>{r.formula}</code>
                      <span className={r.emphasis ? "text-base font-extrabold text-brand-800 tabular-nums shrink-0" : "text-sm font-bold text-ink tabular-nums shrink-0"}>{r.value}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* how on-track is judged */}
              <div className="flex items-start gap-1.5 text-[12px] text-ink-soft mt-4 border-t border-line/60 pt-3">
                <span>On track = your <strong className="text-ink">forecast</strong> (base value adjusted by your initiatives) {reduce ? "lands on or below" : "reaches or beats"} this target path by the target year.</span>
                <InfoTip text={`The forecast starts from your latest actual and ${reduce ? "subtracts" : "adds"} each initiative's impact as it ramps in. If the forecast ${reduce ? "stays at or below" : "meets or exceeds"} the target line, the goal reads on track.`} />
              </div>

              {goal.templateId === "carbon_neutral" && (
                <div className="flex items-start gap-1.5 text-[12px] text-ink-soft mt-2">
                  <span>Remaining emissions after the {rows[rows.length - 1]?.value} target are offset ({goal.offsetPct ?? 0}%).</span>
                  <InfoTip text="Carbon-neutral reaches net-zero on paper: reduce as far as the target, then offset the rest. Offsets are entered as a percentage, not modelled here." />
                </div>
              )}
              {goal.templateId === "intensity" && (
                <div className="flex items-start gap-1.5 text-[12px] text-ink-soft mt-2">
                  <span>This is an intensity target ({goal.intensityUnit || "per unit output"}); the chart shows the absolute-equivalent path.</span>
                  <InfoTip text="Intensity targets track emissions per unit of output/revenue. The projected path shown assumes output stays flat; enter output data to refine." />
                </div>
              )}

              <p className="text-[11px] text-ink-faint mt-4 leading-relaxed">
                Base value {fmt(base)} {unit} for {fyLabel(goal.baseYear)} comes from your Data input entries (see the goal chart’s Actual line).
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function cnRow(emphasis?: boolean): string {
  return emphasis
    ? "rounded-xl2 border border-brand-200 bg-brand-50 p-3"
    : "rounded-xl2 border border-line/50 bg-surface-muted/40 p-3";
}
