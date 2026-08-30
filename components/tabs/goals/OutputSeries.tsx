"use client";

/* The denominator of an intensity goal, entered per financial year.

   GoalsState.output has existed since goals were built and had no entry point
   at all, so an "emissions intensity" target divided by nothing and was scored
   on absolute tonnes. This is the missing half of the ratio: without it, an
   intensity goal cannot be measured, and the goal says so rather than quietly
   showing the absolute figure instead. */

import { FY_YEARS } from "@/lib/model/types";
import { useGoals } from "@/lib/goals/store";
import type { Goal } from "@/lib/goals/types";

export function OutputSeries({ goal }: { goal: Goal }) {
  const { output, setOutput } = useGoals();
  const unit = goal.intensityUnit ?? "per unit of output";
  const missingBase = !((output?.[goal.baseYear] ?? 0) > 0);

  return (
    <div className="rounded-xl border border-line/60 bg-surface-muted/40 p-4 flex flex-col gap-3">
      <div>
        <p className="text-sm font-bold text-ink">Output by year</p>
        <p className="text-xs text-ink-faint mt-0.5">
          The denominator this goal is measured {unit}. Revenue in ₹ crore, or production units —
          whichever the target was set on. A year with no output cannot be plotted.
        </p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {FY_YEARS.map((y) => (
          <label key={y} className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              FY {y}-{String((y + 1) % 100).padStart(2, "0")}
            </span>
            <input
              type="number" min={0} placeholder="—"
              value={output?.[y] ?? ""}
              onChange={(e) => setOutput(y, Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm tabular-nums focus:border-brand-400 focus:outline-none"
            />
          </label>
        ))}
      </div>

      {missingBase && (
        <p className="text-xs text-amber-700">
          No output entered for the base year ({goal.baseYear}), so this goal has no baseline
          intensity to measure against yet.
        </p>
      )}
    </div>
  );
}
