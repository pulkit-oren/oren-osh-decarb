"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Collapsible({ title, right, defaultOpen = false, children }: { title: string; right?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-6 py-4 text-left hover:bg-surface-muted/50 transition-colors"
      >
        <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">{title}</span>
        <span className="flex items-center gap-2 ml-auto">
          {right}
          <ChevronDown size={16} className={cn("text-ink-soft transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && <div className="px-6 pb-6 pt-0">{children}</div>}
    </div>
  );
}
