"use client";

/* The section tab strip used by the two-pane working screens — the entry screen
   and Balance to target.

   Underlined, deliberately NOT the pill Segmented control. Segmented appears
   INSIDE a panel (metered vs spend); a pill strip out here would read as the
   same level of choice as the thing it contains. It is also not PillNav, which
   is the level above (Balance / Scope 1 / Scope 2). Three depths of navigation
   on one screen need three distinct shapes. */

import { cn } from "@/lib/utils";

export type SectionTab = {
  key: string;
  label: string;
  /** Rendered after the label in a lighter weight — a count, e.g. "3". */
  badge?: string;
  /** Amber dot: this section holds something unresolved. */
  alert?: boolean;
};

export function SectionTabs({
  tabs, active, onSelect, ariaLabel = "Sections",
}: {
  tabs: SectionTab[];
  active: string;
  onSelect: (key: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex items-end gap-1 border-b border-line shrink-0">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onSelect(t.key)}
            className={cn(
              "relative inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold transition-colors -mb-px border-b-2",
              on
                ? "text-ink border-brand-500"
                : "text-ink-soft border-transparent hover:text-ink hover:border-line",
            )}
          >
            {t.label}
            {t.badge && <span className="text-xs font-medium tabular-nums text-ink-faint">{t.badge}</span>}
            {t.alert && (
              <span aria-label="needs attention" className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}
