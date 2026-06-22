"use client";

/* "How to read this" — an ⓘ button that toggles a small explanation
   popover. Keeps charts and KPI rows clean: the guidance is one click
   away instead of permanent caption text. Click-toggled (not hover) so
   it works on touch and the text can be longer than a tooltip. */

import { useState } from "react";
import { Info, X } from "lucide-react";

export function HowTo({ title = "How to read this", points }: { title?: string; points: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={title}
        title={title}
        className="w-6 h-6 rounded-full grid place-items-center text-ink-faint hover:text-brand-600 hover:bg-brand-50 transition-colors"
      >
        <Info size={14} />
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-30" aria-hidden onClick={() => setOpen(false)} />
          <span className="absolute right-0 top-full mt-1.5 z-40 w-72 rounded-xl bg-white border border-line shadow-card-lg p-3.5 text-left">
            <span className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wide text-brand-700">{title}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="w-5 h-5 rounded-full grid place-items-center text-ink-faint hover:text-ink"
              >
                <X size={12} />
              </button>
            </span>
            <span className="block space-y-1.5">
              {points.map((p) => (
                <span key={p} className="flex items-start gap-1.5 text-xs text-ink-soft leading-snug">
                  <span className="w-1 h-1 rounded-full bg-brand-400 shrink-0 mt-1.5" />
                  {p}
                </span>
              ))}
            </span>
          </span>
        </>
      )}
    </span>
  );
}
