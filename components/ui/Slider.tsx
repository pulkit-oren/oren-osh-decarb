"use client";

import { cn } from "@/lib/utils";
import { InfoTip } from "./InfoTip";

/** Accessible labelled range slider. Uses native accent-color so the
 *  thumb and filled track pick up the lever's family colour. */
export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  suffix = "%",
  color = "#1F9E5A",
  hint,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  color?: string;
  hint?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn(disabled && "opacity-50")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink flex items-center gap-1.5">
          {label}
          {hint && <InfoTip text={hint} />}
        </span>
        <span className="text-sm font-semibold tabular-nums" style={{ color }}>
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-2 w-full h-1.5 cursor-pointer disabled:cursor-not-allowed"
        style={{ accentColor: color }}
      />
    </div>
  );
}
