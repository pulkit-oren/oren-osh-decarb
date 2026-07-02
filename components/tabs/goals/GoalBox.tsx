"use client";

/* Compact dashboard box for one goal: category icon, name, assignee, verdict,
   progress toward target, and a click to expand its detail. */

import { Factory, Zap, Droplets, Recycle, CheckCircle2, AlertTriangle, XCircle, ChevronRight } from "lucide-react";
import {
  actualsSeries, baseValueFor, goalStatus, progressFraction, type Inventories, type Verdict,
} from "@/lib/goals/select";
import { METRIC_UNIT, type Goal } from "@/lib/goals/types";
import { AssigneeAvatar } from "./AssigneePicker";
import { cn, fmt, pct } from "@/lib/utils";
import type { Initiative } from "@/lib/goals/types";

const VERDICT: Record<Verdict, { label: string; icon: React.ElementType; chip: string; bar: string }> = {
  "on-track": { label: "On track", icon: CheckCircle2, chip: "bg-brand-50 text-brand-700", bar: "bg-brand-500" },
  "at-risk": { label: "At risk", icon: AlertTriangle, chip: "bg-amber-50 text-amber-700", bar: "bg-amber-500" },
  "off-track": { label: "Off track", icon: XCircle, chip: "bg-red-50 text-red-700", bar: "bg-red-500" },
};

export function GoalBox({
  goal, inv, initiatives, selected, onSelect,
}: {
  goal: Goal; inv: Inventories; initiatives: Initiative[]; selected: boolean; onSelect: () => void;
}) {
  const mine = initiatives.filter((i) => i.goalId === goal.id);
  const base = baseValueFor(goal, inv);
  const actuals = actualsSeries(goal, inv);
  const latest = actuals.length ? actuals[actuals.length - 1] : null;
  const status = goalStatus(goal, base, mine, actuals);
  const progress = latest ? progressFraction(goal, base, latest.value) : 0;
  const v = VERDICT[status.verdict];
  const Icon = v.icon;
  const CatIcon = goal.category === "emissions" ? Factory : goal.category === "water" ? Droplets : goal.category === "waste" ? Recycle : Zap;
  const unit = METRIC_UNIT[goal.metric];

  return (
    <button
      onClick={onSelect}
      className={cn(
        "text-left rounded-xl2 border bg-surface p-4 shadow-card lift hover:shadow-card-lg transition-all w-full",
        selected ? "border-brand-500 ring-2 ring-brand-500/20" : "border-line/60 hover:border-brand-300",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 grid place-items-center shrink-0"><CatIcon size={17} /></div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-ink leading-tight truncate">{goal.name}</h4>
          <p className="text-[11px] text-ink-faint mt-0.5">by {goal.targetYear} · base {fmt(base)} {unit}</p>
        </div>
        <AssigneeAvatar persona={goal.assignee} />
      </div>

      <div className="flex items-center gap-2 mt-3">
        <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full", v.chip)}>
          <Icon size={11} /> {v.label}
        </span>
        <span className="text-[11px] text-ink-faint ml-auto">{pct(progress)} to target</span>
      </div>

      {/* progress bar */}
      <div className="mt-2 h-1.5 rounded-full bg-surface-muted overflow-hidden">
        <div className={cn("h-full rounded-full", v.bar)} style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      <div className="flex items-center gap-1 mt-2.5 text-[11px] text-ink-faint">
        {mine.length} initiative{mine.length === 1 ? "" : "s"}
        <ChevronRight size={13} className="ml-auto text-brand-500" />
      </div>
    </button>
  );
}
