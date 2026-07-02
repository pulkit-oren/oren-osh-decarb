"use client";

/* Edit one goal: metric-aware target definition, milestones, assignee, the
   calculation panel (data pulled from Data Input), and its initiatives
   (auto-suggested from data, regenerable, plus manual). */

import { Plus, Trash2, Flag, RefreshCw, ArrowLeft } from "lucide-react";
import { useGoals } from "@/lib/goals/store";
import { uniqueId } from "@/lib/store-helpers";
import { FY_YEARS } from "@/lib/model/types";
import { autoInitiatives } from "@/lib/goals/initiatives-auto";
import type { Inventories } from "@/lib/goals/select";
import {
  METRIC_UNIT, SCOPE_LABEL, categoryHasGhgScope, type Goal, type GoalScope,
} from "@/lib/goals/types";
import { Card } from "@/components/ui/Card";
import { NumberField, SelectField, TextField } from "./fields";
import { AssigneePicker } from "./AssigneePicker";
import { CalcPanel } from "./CalcPanel";
import { InitiativeTable } from "./InitiativeTable";

const SCOPE_OPTS = (Object.keys(SCOPE_LABEL) as GoalScope[]).map((s) => ({ value: s, label: SCOPE_LABEL[s] }));
const YEAR_OPTS = [...FY_YEARS, 2028, 2029, 2030, 2035, 2040, 2045, 2050].map((y) => ({ value: String(y), label: String(y) }));

export function GoalEditor({ goal, inv, onBack }: { goal: Goal; inv: Inventories; onBack?: () => void }) {
  const { updateGoal, deleteGoal, initiatives, addInitiative, regenerateAuto } = useGoals();
  const set = (patch: Partial<Goal>) => updateGoal(goal.id, patch);
  const mine = initiatives.filter((i) => i.goalId === goal.id);
  const unit = METRIC_UNIT[goal.metric];
  const isIncrease = goal.direction === "increase";

  const addMilestone = () => {
    const m = { id: uniqueId("m", goal.milestones.map((x) => x.id)), year: goal.baseYear + 3, reductionPct: isIncrease ? 50 : 25 };
    set({ milestones: [...goal.milestones, m] });
  };
  const updateMilestone = (id: string, patch: Partial<Goal["milestones"][number]>) =>
    set({ milestones: goal.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const delMilestone = (id: string) => set({ milestones: goal.milestones.filter((m) => m.id !== id) });

  return (
    <Card className="flex flex-col gap-5">
      {onBack && (
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink self-start">
          <ArrowLeft size={15} /> Back to all goals
        </button>
      )}
      <div className="flex items-start gap-3">
        <input
          value={goal.name}
          onChange={(e) => set({ name: e.target.value })}
          className="flex-1 text-lg font-bold text-ink bg-transparent border-b border-transparent hover:border-line focus:border-brand-400 focus:outline-none py-1"
        />
        <button onClick={() => deleteGoal(goal.id)} aria-label="Delete goal" className="w-9 h-9 rounded-lg grid place-items-center text-ink-faint hover:text-red-600 hover:bg-red-50 transition-colors">
          <Trash2 size={16} />
        </button>
      </div>

      {/* target definition */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {categoryHasGhgScope(goal.category) && (
          <SelectField label="Scope" value={goal.scope} onChange={(v) => set({ scope: v })} options={SCOPE_OPTS} />
        )}
        <SelectField label="Base year" value={String(goal.baseYear)} onChange={(v) => set({ baseYear: Number(v) })} options={YEAR_OPTS} />
        <SelectField label="Target year" value={String(goal.targetYear)} onChange={(v) => set({ targetYear: Number(v) })} options={YEAR_OPTS} />
        <AssigneePicker value={goal.assignee} onChange={(p) => set({ assignee: p })} />

        {goal.templateId === "netzero" ? (
          <NumberField label="Residual at target" value={goal.residualPct ?? 0} onChange={(v) => set({ residualPct: v })} min={0} max={100} suffix="%" />
        ) : goal.metric === "solar_kwp" ? (
          <NumberField label="Target capacity" value={goal.targetAbsolute ?? 0} onChange={(v) => set({ targetAbsolute: v })} min={0} suffix="kWp" />
        ) : (
          <NumberField
            label={isIncrease ? "Target share" : "Reduction at target"}
            value={goal.targetPct ?? 0}
            onChange={(v) => set({ targetPct: v })}
            min={0} max={100} suffix="%"
          />
        )}
        {goal.templateId === "carbon_neutral" && (
          <NumberField label="Offset remainder" value={goal.offsetPct ?? 0} onChange={(v) => set({ offsetPct: v })} min={0} max={100} suffix="%" />
        )}
        {(goal.templateId === "intensity" || goal.templateId === "water_intensity") && (
          <TextField className="lg:col-span-2" label="Intensity denominator" value={goal.intensityUnit ?? ""} onChange={(v) => set({ intensityUnit: v })} placeholder="e.g. per ₹ crore revenue" />
        )}
      </div>

      {/* calculation transparency */}
      <CalcPanel goal={goal} inv={inv} />

      {/* milestones */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-ink flex items-center gap-1.5"><Flag size={14} /> Interim milestones</h4>
          <button onClick={addMilestone} className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg bg-surface-muted px-2.5 py-1.5 text-ink-soft hover:text-ink transition-colors">
            <Plus size={13} /> Add milestone
          </button>
        </div>
        {goal.milestones.length === 0 ? (
          <p className="text-xs text-ink-faint">No milestones — the target line runs straight from the base year to the target.</p>
        ) : (
          <div className="space-y-2">
            {[...goal.milestones].sort((a, b) => a.year - b.year).map((m) => (
              <div key={m.id} className="flex items-end gap-3">
                <SelectField className="w-32" label="Year" value={String(m.year)} onChange={(v) => updateMilestone(m.id, { year: Number(v) })} options={YEAR_OPTS} />
                <NumberField className="w-40" label={isIncrease ? "Target %" : "Reduction %"} value={m.reductionPct} onChange={(v) => updateMilestone(m.id, { reductionPct: v })} min={0} max={100} suffix="%" />
                <button onClick={() => delMilestone(m.id)} aria-label="Delete milestone" className="mb-1 w-8 h-8 rounded-lg grid place-items-center text-ink-faint hover:text-red-600 hover:bg-red-50">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* initiatives */}
      <div className="border-t border-line/60 pt-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-ink">Initiatives ({mine.length})</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={() => regenerateAuto(goal.id, autoInitiatives(goal, inv))}
              title="Replace auto-suggested initiatives with fresh ones from current data (your manual ones are kept)"
              className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg bg-surface-muted px-2.5 py-2 text-ink-soft hover:text-ink transition-colors"
            >
              <RefreshCw size={13} /> Regenerate from data
            </button>
            <button onClick={() => addInitiative(goal.id)} className="inline-flex items-center gap-2 text-sm font-medium rounded-lg bg-brand-500 text-white px-3.5 py-2 hover:bg-brand-600 transition-colors">
              <Plus size={15} /> Add initiative
            </button>
          </div>
        </div>
        {mine.length === 0 ? (
          <p className="text-sm text-ink-faint">No initiatives yet. Use “Regenerate from data” to pull suggestions, or add your own.</p>
        ) : (
          <InitiativeTable initiatives={mine} unit={unit} />
        )}
      </div>
    </Card>
  );
}
