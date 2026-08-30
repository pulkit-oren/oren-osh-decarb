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

import { AlertTriangle, Lightbulb } from "lucide-react";

/** `warn` = something in the plan is wrong or unverifiable. `info` = the plan
 *  is fine and there is something else worth doing. Dressing the second as the
 *  first is how people learn to ignore the first. */
export type StripTone = "warn" | "info";

const TONE = {
  warn: {
    box: "border-amber-200 bg-amber-50",
    icon: "text-amber-600",
    head: "text-amber-700",
    body: "text-amber-900",
    Icon: AlertTriangle,
  },
  info: {
    box: "border-brand-200 bg-brand-50",
    icon: "text-brand-600",
    head: "text-brand-700",
    body: "text-brand-900",
    Icon: Lightbulb,
  },
} as const;

export function WarningStrip({
  warnings, label = "Check these", tone = "warn",
}: { warnings: string[]; label?: string; tone?: StripTone }) {
  if (warnings.length === 0) return null;
  const t = TONE[tone];
  const Icon = t.Icon;
  return (
    <div role="status" className={`rounded-xl border px-4 py-3 flex gap-3 items-start ${t.box}`}>
      <Icon size={16} className={`shrink-0 mt-0.5 ${t.icon}`} strokeWidth={2.2} />
      <div className="min-w-0">
        <p className={`text-[11px] font-bold uppercase tracking-wide ${t.head}`}>
          {label} · {warnings.length}
        </p>
        <ul className="mt-1 space-y-1">
          {warnings.map((w) => (
            <li key={w} className={`text-sm leading-snug ${t.body}`}>{w}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
