"use client";

/* The surface both engines' warnings render through.

   Scope 2 has computed `warnings` via validateScope2 since it was written, and
   no component ever read them — a load split summing over 100%, a negative
   grid factor, procurement clamped at 100%, all produced silently. Scope 1 now
   produces feasibility warnings too (a heat-pump COP on a duty no heat pump
   reaches), and a warning nothing renders is the same as no warning at all.

   Deliberately not a toast and not dismissible: these describe the plan
   currently on screen, so they should persist exactly as long as the plan
   does. */

import { AlertTriangle } from "lucide-react";

export function WarningStrip({ warnings, label = "Check these" }: { warnings: string[]; label?: string }) {
  if (warnings.length === 0) return null;
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3 items-start"
    >
      <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" strokeWidth={2.2} />
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
          {label} · {warnings.length}
        </p>
        <ul className="mt-1 space-y-1">
          {warnings.map((w) => (
            <li key={w} className="text-sm text-amber-900 leading-snug">{w}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
