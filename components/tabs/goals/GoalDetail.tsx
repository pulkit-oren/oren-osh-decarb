"use client";

/* Expanded detail for a selected dashboard goal: trajectory chart, calculation
   panel, headline numbers, and initiative status breakdown. */

import {
  actualsSeries, baseValueFor, forecastSeries, goalStatus, initiativeRollup,
  targetSeries, targetValueAt, type Inventories,
} from "@/lib/goals/select";
import {
  CATEGORY_LABEL, METRIC_UNIT, SCOPE_LABEL, STATUS_COLOR, STATUS_LABEL, categoryHasGhgScope,
  type Goal, type Initiative, type InitiativeStatus,
} from "@/lib/goals/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { InfoTip } from "@/components/ui/InfoTip";
import { HowTo } from "@/components/ui/HowTo";
import { GoalTrajectoryChart } from "@/components/charts/GoalTrajectoryChart";
import { CalcPanel } from "./CalcPanel";
import { AssigneeAvatar, personaLabel } from "./AssigneePicker";
import { cn, fmt, fmtMoney, pct } from "@/lib/utils";

export function GoalDetail({ goal, inv, initiatives }: { goal: Goal; inv: Inventories; initiatives: Initiative[] }) {
  const mine = initiatives.filter((i) => i.goalId === goal.id);
  const base = baseValueFor(goal, inv);
  const actuals = actualsSeries(goal, inv);
  const latest = actuals.length ? actuals[actuals.length - 1] : null;
  const target = targetSeries(goal, base);
  const forecast = forecastSeries(goal, mine, latest);
  const status = goalStatus(goal, base, mine, actuals);
  const rollup = initiativeRollup(goal.id, initiatives);
  const unit = METRIC_UNIT[goal.metric];

  const milestonePts = goal.milestones
    .filter((m) => m.year > goal.baseYear && m.year < goal.targetYear)
    .map((m) => ({ year: m.year, value: targetValueAt(goal, base, m.year) }));

  return (
    <Card className="flex flex-col gap-5">
      <CardHeader
        title={goal.name}
        subtitle={`${categoryHasGhgScope(goal.category) ? SCOPE_LABEL[goal.scope] : CATEGORY_LABEL[goal.category]} · base ${goal.baseYear} = ${fmt(base)} ${unit} · target by ${goal.targetYear}`}
        right={
          <span className="flex items-center gap-2 text-xs text-ink-soft">
            <AssigneeAvatar persona={goal.assignee} />
            {goal.assignee ? personaLabel(goal.assignee) : "Unassigned"}
          </span>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Latest actual" value={latest ? `${fmt(latest.value)} ${unit}` : "—"} hint={latest ? `FY ${latest.year}` : "no data entered"} />
        <Metric label="Forecast at target" value={`${fmt(status.forecastEnd)} ${unit}`} hint={`by ${goal.targetYear}`} />
        <Metric label="Target" value={`${fmt(status.targetEnd)} ${unit}`} />
        <Metric
          label="Gap to target"
          value={status.gapValue <= 0 ? "Met" : `${fmt(status.gapValue)} ${unit}`}
          tone={status.gapValue <= 0 ? "good" : "warn"}
          hint="Initiative coverage"
          info={`Committed ${fmt(status.committedValue)} ${unit} of ${fmt(status.neededValue)} ${unit} needed (${pct(Math.min(1, status.coverage))}).`}
        />
      </div>

      <div>
        <CardHeader
          title="Trajectory"
          subtitle={`Where this goal has been, is heading, and should be · ${unit}`}
          right={
            <HowTo points={[
              "Dark green line + dots: actual values from your entered FY data.",
              "Dashed green: the forecast once your committed initiatives ramp in.",
              "Dashed blue: the target path (bends through any milestones).",
              "Amber dots: interim milestones. The grey divider marks your latest actual year — history to its left, forecast to its right.",
              "On track = the green forecast lands on or below the blue target by the target year.",
            ]} />
          }
        />
        <GoalTrajectoryChart actuals={actuals} forecast={forecast} target={target} milestones={milestonePts} unit={unit} />
      </div>

      <CalcPanel goal={goal} inv={inv} />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line/60 pt-3">
        <span className="text-xs font-semibold text-ink-soft">{rollup.total} initiative{rollup.total === 1 ? "" : "s"}</span>
        {(Object.keys(STATUS_LABEL) as InitiativeStatus[]).map((s) =>
          rollup.byStatus[s] > 0 ? (
            <span key={s} className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
              {rollup.byStatus[s]} {STATUS_LABEL[s].toLowerCase()}
            </span>
          ) : null,
        )}
        <span className="text-xs text-ink-soft">
          Delivered <strong className="text-ink tabular-nums">{fmt(rollup.deliveredValue)}</strong> of {fmt(rollup.committedValue)} {unit}
          <InfoTip text="Delivered = each initiative's impact × the owner's reported progress. Updated by assignees in their “Assigned to me” view." />
        </span>
        {rollup.totalBudget > 0 && (
          <span className="text-xs text-ink-soft ml-auto">Total budget <strong className="text-ink">{fmtMoney(rollup.totalBudget)}</strong></span>
        )}
      </div>
    </Card>
  );
}

function Metric({
  label, value, hint, tone = "default", info,
}: {
  label: string; value: string; hint?: string; tone?: "default" | "good" | "warn"; info?: string;
}) {
  return (
    <div className="rounded-xl2 bg-surface-muted/60 border border-line/40 p-3.5">
      <div className="flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">{label}</span>
        {info && <InfoTip text={info} />}
      </div>
      <div className={cn("font-display text-2xl font-bold mt-1 tabular-nums", tone === "good" ? "text-brand-600" : tone === "warn" ? "text-amber-600" : "text-ink")}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-ink-faint mt-0.5">{hint}</div>}
    </div>
  );
}
