"use client";

/* One foldable card on the Assumptions screen.

   The sections it replaces were numbered "1 ·" to "4 ·", which reads as a
   wizard you progress through. This screen is not a sequence — it is a set of
   premises you dip into, in any order, usually to change one of them. Titles
   without numbers say that; a fold says it too.

   The SUMMARY is the reason folding is safe. A collapsed section that shows
   nothing forces you to open all four to find out where you stand, which is
   worse than the long scroll it was meant to cure. So each header carries its
   own current value, and the screen stays readable with every card shut. */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingCard({
  title, summary, children, defaultOpen = true, testId,
}: {
  title: string;
  /** The card's current state, shown in the header — legible when folded. */
  summary?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      data-testid={testId}
      className="rounded-xl2 border border-line/70 bg-surface shadow-card/40 overflow-hidden"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center gap-2.5 px-4 py-3 text-left",
          "transition-colors hover:bg-surface-muted/50",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-inset",
        )}
      >
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-ink-faint transition-transform duration-200",
            open ? "" : "-rotate-90",
          )}
        />
        <span className="text-[10px] uppercase tracking-wide font-bold text-ink">{title}</span>
        {summary != null && (
          <span className="ml-auto pl-3 text-[11px] tabular-nums text-ink-soft text-right">
            {summary}
          </span>
        )}
      </button>

      {open && (
        <div className="px-4 pt-3 pb-4 border-t border-line/60">{children}</div>
      )}
    </section>
  );
}
