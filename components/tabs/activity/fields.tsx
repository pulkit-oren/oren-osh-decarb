"use client";

import { Minus, Plus, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Field label with an optional (i) hint shown on hover. */
export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="text-xs font-semibold text-ink-soft flex items-center gap-1.5">
      {children}
      {hint && (
        <span title={hint} aria-label={hint} className="text-ink-faint cursor-help shrink-0">
          <Info size={12} />
        </span>
      )}
    </span>
  );
}

export function TextField({
  label, value, onChange, placeholder, hint,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <label className="block">
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="mt-1.5 w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
      />
    </label>
  );
}

export function NumField({
  label, value, onChange, suffix, hint, footer, min, step, placeholder,
}: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string;
  hint?: string; footer?: React.ReactNode; min?: number; step?: number; placeholder?: string;
}) {
  return (
    <label className="block">
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <span className="mt-1.5 flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          placeholder={placeholder}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400 text-right tabular-nums"
        />
        {suffix && <span className="text-xs text-ink-faint shrink-0 min-w-[2.75rem]">{suffix}</span>}
      </span>
      {footer && <span className="block mt-1 text-[11px] text-ink-faint">{footer}</span>}
    </label>
  );
}

export function SelectField<T extends string>({
  label, value, onChange, options, hint,
}: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; hint?: string }) {
  return (
    <label className="block">
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
        className="mt-1.5 w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Integer counter with − / + buttons. */
export function Stepper({
  label, value, onChange, min = 0, max, hint,
}: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; hint?: string }) {
  const clamp = (v: number) => Math.max(min, max != null ? Math.min(max, v) : v);
  return (
    <div className="block">
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <span className="mt-1.5 flex items-stretch">
        <button
          type="button" onClick={() => onChange(clamp(value - 1))} aria-label={`Decrease ${label}`}
          className="grid place-items-center w-9 rounded-l-lg border border-line bg-surface-muted text-ink-soft hover:bg-line/40 hover:text-ink transition-colors"
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(clamp(Math.round(Number(e.target.value))))}
          aria-label={label}
          className="w-full border-y border-line px-2 py-2 text-sm text-center tabular-nums bg-white focus:outline-none focus:border-brand-400"
        />
        <button
          type="button" onClick={() => onChange(clamp(value + 1))} aria-label={`Increase ${label}`}
          className="grid place-items-center w-9 rounded-r-lg border border-line bg-surface-muted text-ink-soft hover:bg-line/40 hover:text-ink transition-colors"
        >
          <Plus size={14} />
        </button>
      </span>
    </div>
  );
}

/** Range slider with the live value shown beside the label. */
export function SliderField({
  label, value, onChange, min, max, step = 1, suffix, hint, accent = "var(--color-brand-500)",
}: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number;
  step?: number; suffix?: string; hint?: string; accent?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2">
        <FieldLabel hint={hint}>{label}</FieldLabel>
        <span className="text-sm font-bold text-ink tabular-nums">
          {value}{suffix && <span className="text-xs font-medium text-ink-faint ml-0.5">{suffix}</span>}
        </span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        style={{ accentColor: accent }}
        className="mt-2 w-full cursor-pointer"
      />
    </label>
  );
}

/** Pill-style segmented control. */
export function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-surface-muted p-1">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value} type="button" onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-md py-1.5 px-2 text-xs font-semibold transition-colors",
              on ? "bg-white text-ink shadow-card" : "text-ink-soft hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** On/off switch. */
export function ToggleSwitch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0", on ? "bg-brand-500" : "bg-line")}
    >
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

/** Horizontal stacked bar made of coloured segments (e.g. a load split). */
export function SplitBar({ segments }: { segments: { label: string; pct: number; color: string }[] }) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
      {segments.filter((s) => s.pct > 0).map((s) => (
        <div key={s.label} title={`${s.label} · ${Math.round(s.pct)}%`} style={{ width: `${Math.min(s.pct, 100)}%`, background: s.color }} className="h-full" />
      ))}
    </div>
  );
}

/** Standard section card used across the entry screens. */
export function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-4">{title}</div>
      {children}
    </div>
  );
}
