import { cn } from "@/lib/utils";
import type { Confidence } from "@/lib/data-quality";

const LABEL: Record<Confidence["label"], string> = { good: "Good", fair: "Fair", low: "Low" };

export function ConfidenceGauge({ confidence: c, className }: { confidence: Confidence; className?: string }) {
  const pct = Math.round(c.measuredPct * 100);
  const est = Math.round(c.estimatedPct * 100);
  return (
    <div className={cn("flex items-center gap-4 rounded-xl3 border border-line/60 bg-surface-muted px-4 py-3.5", className)}>
      <div className="relative w-14 h-14 shrink-0">
        <svg width="56" height="56" viewBox="0 0 42 42">
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--color-line)" strokeWidth="5" />
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--color-good)" strokeWidth="5"
                  strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset="25" strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[13px] font-extrabold text-brand-600">{pct}%</span>
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-ink">Data confidence: {LABEL[c.label]}</p>
        <p className="text-[11.5px] text-ink-soft mt-0.5">
          {pct}% of this year&apos;s tCO₂e from metered data
          {est > 0 ? ` · ${est}% estimated` : ""}
          {c.missingCount > 0 ? ` · ${c.missingCount} need${c.missingCount === 1 ? "s" : ""} data` : ""}
        </p>
        <div className="mt-2 flex h-2 w-full max-w-[260px] overflow-hidden rounded-full bg-line">
          <span className="h-full bg-good" style={{ width: `${pct}%` }} />
          <span className="h-full bg-warn" style={{ width: `${est}%` }} />
        </div>
      </div>
    </div>
  );
}
