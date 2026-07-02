"use client";

/* Small labelled form controls for the goals setup screen — styled to match
   the inputs used elsewhere in the app (border-line, brand focus ring). */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full text-sm border border-line rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400";

export function Labeled({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="block text-[10px] uppercase tracking-wide text-ink-faint font-bold mb-1">{label}</span>
      {children}
    </label>
  );
}

export function TextField({
  label, value, onChange, placeholder, className,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <Labeled label={label} className={className}>
      <input className={inputCls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Labeled>
  );
}

export function NumberField({
  label, value, onChange, min, max, step, suffix, className,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; suffix?: string; className?: string;
}) {
  return (
    <Labeled label={label} className={className}>
      <div className="relative">
        <input
          type="number"
          className={cn(inputCls, suffix && "pr-10")}
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint pointer-events-none">{suffix}</span>
        )}
      </div>
    </Labeled>
  );
}

export function SelectField<T extends string>({
  label, value, onChange, options, className,
}: {
  label: string; value: T; onChange: (v: T) => void;
  options: { value: T; label: string }[]; className?: string;
}) {
  return (
    <Labeled label={label} className={className}>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Labeled>
  );
}
