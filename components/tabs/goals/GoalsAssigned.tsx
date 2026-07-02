"use client";

/* Assigned to me — the initiatives owned by the active persona (chosen in the
   top-right "View as" menu), grouped by goal. The owner updates status,
   progress and notes here; because it's the same store, those updates flow
   straight back to the goal dashboard and My goals. */

import { useGoals } from "@/lib/goals/store";
import { PERSONAS, type Persona } from "@/lib/persona";
import { METRIC_UNIT, STATUS_COLOR, STATUS_LABEL, type Initiative, type InitiativeStatus } from "@/lib/goals/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { AssigneeAvatar, personaLabel } from "./AssigneePicker";
import { cn, fmt } from "@/lib/utils";

const STATUSES = Object.keys(STATUS_LABEL) as InitiativeStatus[];
const cell = "border border-line rounded-md px-2 py-1 text-sm bg-white focus:outline-none focus:border-brand-400";

export function GoalsAssigned({ persona }: { persona: Persona }) {
  const { goals, initiatives, updateInitiative } = useGoals();
  const me = PERSONAS.find((p) => p.key === persona);
  const mine = initiatives.filter((i) => i.assignee === persona);

  // Group by goal, preserving goal order.
  const byGoal = goals
    .map((g) => ({ goal: g, items: mine.filter((i) => i.goalId === g.id) }))
    .filter((grp) => grp.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <AssigneeAvatar persona={persona} size={28} />
              {me ? `${me.sub}’s initiatives` : "My initiatives"}
            </span>
          }
          subtitle={`Initiatives assigned to ${me ? personaLabel(persona) : "you"}. Update status and progress — it flows to the goal dashboard. Switch person in the top-right “View as” menu.`}
        />
        <div className="flex flex-wrap gap-4 text-sm">
          <Stat label="Assigned" value={String(mine.length)} />
          <Stat label="Completed" value={String(mine.filter((i) => i.status === "completed").length)} />
          <Stat label="In progress" value={String(mine.filter((i) => i.status === "in_progress").length)} />
        </div>
      </Card>

      {byGoal.length === 0 ? (
        <Card tone="muted" className="text-center py-12">
          <h3 className="font-semibold text-ink">Nothing assigned to {me?.sub ?? "you"}</h3>
          <p className="text-sm text-ink-soft mt-1 max-w-md mx-auto">
            Initiatives assigned to {me?.label ?? "this person"} will appear here. Assign owners in My goals, or switch person in the top-right menu.
          </p>
        </Card>
      ) : (
        byGoal.map(({ goal, items }) => (
          <Card key={goal.id} className="flex flex-col gap-3">
            <CardHeader title={goal.name} subtitle={`${items.length} initiative${items.length === 1 ? "" : "s"} · impact in ${METRIC_UNIT[goal.metric]}`} />
            <div className="space-y-2.5">
              {items.map((i) => (
                <AssignedRow key={i.id} init={i} unit={METRIC_UNIT[goal.metric]} onChange={(patch) => updateInitiative(i.id, patch)} />
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function AssignedRow({ init, unit, onChange }: { init: Initiative; unit: string; onChange: (patch: Partial<Initiative>) => void }) {
  return (
    <div className="rounded-xl2 border border-line/60 bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[init.status] }} />
        <span className="font-medium text-ink text-sm flex-1 min-w-0 truncate">{init.name}</span>
        <span className="text-xs text-ink-faint shrink-0 tabular-nums">{fmt(init.metricImpact)} {unit} · by {init.targetYear}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wide text-ink-faint font-bold mb-1">Status</span>
          <select className={cn(cell, "w-full")} value={init.status} onChange={(e) => onChange({ status: e.target.value as InitiativeStatus })}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wide text-ink-faint font-bold mb-1">Progress %</span>
          <input
            type="number" min={0} max={100} className={cn(cell, "w-full")}
            value={init.progressPct ?? 0}
            onChange={(e) => onChange({ progressPct: Math.max(0, Math.min(100, e.target.value === "" ? 0 : Number(e.target.value))) })}
          />
        </label>
        <label className="block sm:col-span-1">
          <span className="block text-[10px] uppercase tracking-wide text-ink-faint font-bold mb-1">Update / note</span>
          <input className={cn(cell, "w-full")} value={init.note ?? ""} placeholder="e.g. RFP issued, install Q3" onChange={(e) => onChange({ note: e.target.value })} />
        </label>
      </div>
      {/* progress bar */}
      <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${init.progressPct ?? 0}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl2 bg-surface-muted/60 border border-line/40 px-4 py-2">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">{label}</div>
      <div className="font-display text-xl font-bold text-ink tabular-nums">{value}</div>
    </div>
  );
}
