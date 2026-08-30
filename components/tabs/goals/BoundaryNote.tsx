"use client";

/* Shown on any goal whose NAME claims more than this model measures.

   A target called "net zero" or "SBTi 1.5°C" is a whole-company claim. This
   product models Scope 1 and 2, which for most filers is the small minority of
   the footprint. Confirming that a Scope 1+2 plan reaches such a target without
   saying so is how a company ends up believing it has an alignable target. */

import { Info } from "lucide-react";
import {
  SBTI_SCOPE3_THRESHOLD_PCT, TYPICAL_SCOPE3_SHARE_PCT, claimsBeyondThisModel, scope3Screen,
} from "@/lib/scope3-boundary";
import { fmt } from "@/lib/utils";
import type { Goal } from "@/lib/goals/types";

export function BoundaryNote({ goal, scope12T }: { goal: Goal; scope12T: number }) {
  if (!claimsBeyondThisModel(goal.templateId) || scope12T <= 0) return null;
  const s = scope3Screen(scope12T);

  return (
    <div className="rounded-xl border border-line/70 bg-surface-muted/40 px-4 py-3 flex gap-3 items-start">
      <Info size={15} className="text-ink-faint shrink-0 mt-0.5" strokeWidth={2.2} />
      <div className="text-[13px] text-ink-soft leading-snug">
        <p>
          <strong className="text-ink font-semibold">This target covers Scope 1 and 2 only.</strong>{" "}
          For most filers Scope 3 is {TYPICAL_SCOPE3_SHARE_PCT.low}–{TYPICAL_SCOPE3_SHARE_PCT.high}% of
          the total footprint. Against the {fmt(Math.round(scope12T))} tCO₂e entered here, that implies
          roughly {fmt(Math.round(s.lowT))}–{fmt(Math.round(s.highT))} tCO₂e outside this model.
        </p>
        <p className="mt-1.5">
          That is a screen for scale, not a measurement — no Scope 3 category is modelled here.
          {s.scope3TargetRequired && (
            <> SBTi validation requires a Scope 3 target once Scope 3 reaches {SBTI_SCOPE3_THRESHOLD_PCT}%
            of the inventory, so this plan alone would not be validatable.</>
          )}
        </p>
      </div>
    </div>
  );
}
