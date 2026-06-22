"use client";

/* Shared editable-cell + small-control idioms for the Scope 2 tabs —
   same look as the Scope 1 data grid (borderless until hover/focus). */

import { Copy, Plus } from "lucide-react";
import { fyLabel } from "@/lib/model/types";
import { cn } from "@/lib/utils";

const FIELD = "w-full bg-transparent rounded-md px-2 py-1.5 border border-transparent hover:border-line focus:border-brand-400 focus:bg-white focus:outline-none";

export function TextCell({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} aria-label={label} />;
}

export function NumCell({ value, onChange, label }: { value: number; onChange: (v: number) => void; label?: string }) {
  return <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className={`${FIELD} text-right tabular-nums`} aria-label={label} />;
}

/** Labelled inline number input for lever cards (bordered, compact). */
export function NumField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="text-xs text-ink-soft">{label}</span>
      <span className="mt-1 flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400 text-right tabular-nums"
          aria-label={label}
        />
        {suffix && <span className="text-xs text-ink-faint shrink-0">{suffix}</span>}
      </span>
    </label>
  );
}

/** Brand-coloured on/off switch used on lever cards. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative w-10 h-6 rounded-full transition-colors shrink-0",
        on ? "bg-brand-500" : "bg-line",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
          on ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

export function YearRange({
  start, target, onStart, onTarget,
}: {
  start: number; target: number; onStart: (y: number) => void; onTarget: (y: number) => void;
}) {
  const years = Array.from({ length: 2040 - 2025 + 1 }, (_, i) => 2025 + i);
  const sel = "border border-line rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400";
  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-ink-soft">Start</span>
        <select value={start} onChange={(e) => onStart(Number(e.target.value))} className={sel} aria-label="Start year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-ink-soft">Target</span>
        <select value={target} onChange={(e) => onTarget(Number(e.target.value))} className={sel} aria-label="Target year">
          {years.filter((y) => y >= start).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
    </div>
  );
}

export function CopyFrom({ years, onPick }: { years: number[]; onPick: (from: number) => void }) {
  if (years.length === 0) return null;
  return (
    <label className="inline-flex items-center gap-1.5 text-sm rounded-lg border border-line px-2.5 py-1.5 hover:border-brand-300 cursor-pointer">
      <Copy size={14} className="text-ink-soft" />
      <select
        defaultValue=""
        onChange={(e) => { if (e.target.value) { onPick(Number(e.target.value)); e.target.value = ""; } }}
        className="bg-transparent text-ink-soft focus:outline-none cursor-pointer"
      >
        <option value="">Copy from…</option>
        {years.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
      </select>
    </label>
  );
}

export function EmptyState({ label, hint, action }: {
  label: string;
  hint: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border border-dashed border-line py-10 text-center">
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="text-xs text-ink-faint mt-1">{hint}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium rounded-lg bg-brand-500 text-white px-4 py-2 hover:bg-brand-600 transition-colors"
        >
          <Plus size={15} /> {action.label}
        </button>
      )}
    </div>
  );
}
