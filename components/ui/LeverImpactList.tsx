"use client";

/* Per-lever impact rows for the builders' dark asides: what each active lever
   cuts, what it costs to run, and how fast it pays back — the numbers that
   otherwise hide in the CFO tab. */

import { fmt, fmtMoney, fmtPayback, paybackHint, type PaybackKind } from "@/lib/utils";

export interface LeverImpactRow {
  id: string;
  label: string;
  abatementT: number;
  annualOpexDelta: number; // positive = cost, negative = saving
  paybackYears: number | null;
  /** Required, not optional: without it "no capital at risk" and "never
   *  recovered" both render as an em dash, which are opposite facts. Both
   *  callers pass a LeverSummary, which already carries it. */
  paybackKind: PaybackKind;
}

export function LeverImpactList({ levers }: { levers: LeverImpactRow[] }) {
  const active = levers.filter((l) => l.abatementT > 0).sort((a, b) => b.abatementT - a.abatementT);
  if (active.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-white/70 font-bold mb-1.5">Active levers</p>
      <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
        {active.map((l) => (
          <div key={l.id} className="flex items-baseline gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] leading-tight">
            <span className="flex-1 truncate font-semibold text-white/90">{l.label}</span>
            <span className="tabular-nums font-extrabold shrink-0">−{fmt(l.abatementT)} t</span>
            <span className="tabular-nums text-white/70 shrink-0 w-20 text-right" title="Annual operating cost impact">
              {l.annualOpexDelta === 0 ? "±0/yr" : l.annualOpexDelta < 0 ? `saves ${fmtMoney(-l.annualOpexDelta)}` : `+${fmtMoney(l.annualOpexDelta)}/yr`}
            </span>
            <span className="tabular-nums text-white/70 shrink-0 w-16 text-right" title={`Discounted payback — ${paybackHint(l.paybackYears, l.paybackKind)}`}>
              {fmtPayback(l.paybackYears, l.paybackKind)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
