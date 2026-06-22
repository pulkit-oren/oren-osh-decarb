"use client";

import { fmt } from "@/lib/utils";

export interface BarItem {
  label: string;
  value: number;
  color: string;
}

/** Horizontal abatement bars, sorted desc. Hatched track, solid coloured fill. */
export function LeverBars({ items, unit = "tCO₂e" }: { items: BarItem[]; unit?: string }) {
  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((i) => i.value));

  if (sorted.length === 0) {
    return <p className="text-sm text-ink-faint">No active levers — open a lever to see its impact.</p>;
  }

  return (
    <div className="space-y-3">
      {sorted.map((i, idx) => (
        <div key={i.label}>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm text-ink">{i.label}</span>
            <span className="text-sm font-semibold tabular-nums text-ink">
              {fmt(i.value)} <span className="text-ink-faint font-normal text-xs">{unit}</span>
            </span>
          </div>
          <div
            className="h-3 rounded-full overflow-hidden"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, #EEF2F0 0 6px, #F7FAF8 6px 12px)",
            }}
          >
            <div
              className="h-full rounded-full bar-in transition-all duration-300"
              style={{
                width: `${(i.value / max) * 100}%`,
                background: `linear-gradient(90deg, ${i.color}B8, ${i.color})`,
                ["--bar-i" as string]: idx,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
