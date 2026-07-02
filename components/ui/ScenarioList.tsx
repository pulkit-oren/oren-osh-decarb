"use client";

/* Saved-scenario list for the builders' dark asides: load, diff-vs-current,
   duplicate-and-tweak, delete. The diff opens a right-side drawer listing
   exactly what loading the scenario would change, source by source. */

import { useEffect, useState } from "react";
import { ArrowLeftRight, Copy, Trash2, X } from "lucide-react";
import type { DiffRow } from "@/lib/scenario-diff";
import { cn } from "@/lib/utils";

export interface ScenarioListItem {
  id: string;
  name: string;
  note?: string;
  savedAt: number;
}

const MAX_ROWS = 60;

export function ScenarioList({
  items, onLoad, onDuplicate, onDelete, diffRowsFor,
}: {
  items: ScenarioListItem[];
  onLoad: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** Current plan → this scenario; computed lazily when the drawer opens. */
  diffRowsFor: (id: string) => DiffRow[];
}) {
  const [diffId, setDiffId] = useState<string | null>(null);
  const open = items.find((s) => s.id === diffId) ?? null;
  const rows = open ? diffRowsFor(open.id) : [];

  useEffect(() => {
    if (!diffId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDiffId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [diffId]);

  return (
    <>
      <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto">
        {items.map((s) => (
          <div key={s.id} className="rounded-lg bg-white/12 px-2.5 py-1.5 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="flex-1 truncate" title={`Saved ${new Date(s.savedAt).toLocaleDateString()}`}>{s.name}</span>
              <button onClick={() => onLoad(s.id)} className="text-[11px] font-semibold rounded px-1.5 py-0.5 bg-white/20 hover:bg-white/30" title="Load — replaces your current plan">Load</button>
              <button onClick={() => setDiffId(s.id)} aria-label={`Diff ${s.name} against current plan`} title="What loading this would change" className="text-white/70 hover:text-white"><ArrowLeftRight size={13} /></button>
              <button onClick={() => onDuplicate(s.id)} aria-label={`Duplicate ${s.name}`} title="Duplicate — copy to tweak without losing this one" className="text-white/70 hover:text-white"><Copy size={13} /></button>
              <button onClick={() => onDelete(s.id)} aria-label={`Delete ${s.name}`} className="text-white/70 hover:text-white"><Trash2 size={13} /></button>
            </div>
            {s.note && <p className="text-[10px] text-white/60 truncate mt-0.5" title={s.note}>{s.note}</p>}
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Changes if you load ${open.name}`}>
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]" onClick={() => setDiffId(null)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-surface shadow-card-lg border-l border-line flex flex-col tab-fade">
            <header className="flex items-center gap-2 px-5 py-4 border-b border-line/60 shrink-0">
              <ArrowLeftRight size={17} className="text-brand-600" />
              <div className="min-w-0">
                <h3 className="font-bold text-ink leading-tight truncate">Loading “{open.name}” would change…</h3>
                <p className="text-xs text-ink-faint">
                  current plan → scenario · saved {new Date(open.savedAt).toLocaleDateString()}
                  {open.note ? ` · ${open.note}` : ""}
                </p>
              </div>
              <button onClick={() => setDiffId(null)} aria-label="Close" className="ml-auto w-8 h-8 rounded-lg grid place-items-center text-ink-faint hover:text-ink hover:bg-surface-muted shrink-0">
                <X size={17} />
              </button>
            </header>

            <div className="overflow-y-auto flex-1 px-5 py-4">
              {rows.length === 0 ? (
                <p className="text-sm text-ink-soft">Nothing — this scenario is identical to your current plan.</p>
              ) : (
                <div className="space-y-2">
                  {rows.slice(0, MAX_ROWS).map((r, i) => (
                    <div key={i} className={cn("rounded-xl2 border p-2.5", r.field === "enabled" || r.lever === "Plan" ? "border-brand-200 bg-brand-50/60" : "border-line/50 bg-surface-muted/40")}>
                      <div className="text-xs font-semibold text-ink truncate">
                        {r.source}{r.lever ? <span className="text-ink-soft font-medium"> · {r.lever}</span> : null}{r.field ? <span className="text-ink-faint font-medium"> · {r.field}</span> : null}
                      </div>
                      <div className="mt-0.5 text-sm tabular-nums">
                        <span className="text-ink-soft">{r.from}</span>
                        <span className="text-ink-faint mx-1.5">→</span>
                        <span className="font-bold text-ink">{r.to}</span>
                      </div>
                    </div>
                  ))}
                  {rows.length > MAX_ROWS && (
                    <p className="text-xs text-ink-faint">…and {rows.length - MAX_ROWS} more changes.</p>
                  )}
                </div>
              )}
            </div>

            <footer className="px-5 py-4 border-t border-line/60 shrink-0">
              <button
                onClick={() => { onLoad(open.id); setDiffId(null); }}
                className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold rounded-lg bg-brand-500 text-white px-4 py-2.5 hover:bg-brand-600 transition-colors"
              >
                Load this scenario
              </button>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}
