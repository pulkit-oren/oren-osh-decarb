"use client";
import { cn } from "@/lib/utils";

export type PillNavItem = { key: string; label: string; sub?: string; dotClass?: string };

export function PillNav({
  items, active, onSelect, className,
}: {
  items: PillNavItem[]; active: string; onSelect: (key: string) => void; className?: string;
}) {
  return (
    <div className={cn("inline-flex gap-1 rounded-full bg-surface-muted p-1.5", className)}>
      {items.map((it) => {
        const on = it.key === active;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onSelect(it.key)}
            aria-current={on}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors",
              on ? "bg-surface text-brand-700 shadow-card" : "text-ink-soft hover:text-ink",
            )}
          >
            {it.dotClass && <span className={cn("w-2 h-2 rounded-full", it.dotClass)} />}
            {it.label}
            {it.sub && <span className="font-medium text-ink-faint">{it.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}
