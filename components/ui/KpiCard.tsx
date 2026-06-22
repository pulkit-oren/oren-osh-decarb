import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ElementType, ReactNode } from "react";
import { InfoTip } from "./InfoTip";

export function KpiCard({
  label,
  value,
  unit,
  delta,
  hint,
  info,
  icon: Icon,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: string;
  hint?: string;
  /** Plain-language explanation revealed on the ⓘ — keeps the card clean. */
  info?: string;
  icon?: ElementType;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "group rounded-xl2 p-5 shadow-card border border-line/40 lift",
        emphasis
          ? "bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 text-white"
          : "bg-surface text-ink",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <div
              className={cn(
                "w-8 h-8 rounded-lg grid place-items-center shrink-0",
                emphasis ? "bg-white/15 text-white" : "bg-brand-50 text-brand-600",
              )}
            >
              <Icon size={16} strokeWidth={2.2} />
            </div>
          )}
          <span className={cn("text-sm font-medium truncate", emphasis ? "text-white/90" : "text-ink-soft")}>
            {label}
          </span>
          {info && !emphasis && <InfoTip text={info} />}
        </div>
        <span
          className={cn(
            "w-7 h-7 rounded-full grid place-items-center shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
            emphasis ? "bg-white/15" : "bg-surface-muted",
          )}
        >
          <ArrowUpRight size={14} />
        </span>
      </div>

      <div className="mt-5 flex items-baseline gap-2 stat-in">
        <span className="font-display text-3xl md:text-4xl font-bold">{value}</span>
        {unit && (
          <span className={cn("text-sm font-medium", emphasis ? "text-white/80" : "text-ink-faint")}>
            {unit}
          </span>
        )}
      </div>
      {(delta || hint) && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {delta && (
            <span
              className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-full",
                emphasis ? "bg-white/15 text-white" : "bg-brand-50 text-brand-600",
              )}
            >
              {delta}
            </span>
          )}
          {hint && (
            <span className={cn("text-xs", emphasis ? "text-white/75" : "text-ink-faint")}>{hint}</span>
          )}
        </div>
      )}
    </div>
  );
}
