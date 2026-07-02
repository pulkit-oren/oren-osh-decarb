"use client";

/* Step 3 of creation: configure the chosen target type, then Activate. Builds a
   draft goal in local state (not yet saved); Activate persists it + seeds
   auto-initiatives. Detailed editing happens later in the My goals tab. */

import { useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { goalFromTemplate, type GoalTemplate } from "@/lib/goals/catalog";
import { METRIC_UNIT, SCOPE_LABEL, categoryHasGhgScope, type Goal, type GoalScope } from "@/lib/goals/types";
import { baseValueFor, type Inventories } from "@/lib/goals/select";
import { FY_YEARS } from "@/lib/model/types";
import { Card } from "@/components/ui/Card";
import { NumberField, SelectField, TextField } from "./fields";
import { AssigneePicker } from "./AssigneePicker";
import { CalcPanel } from "./CalcPanel";
import { fmt } from "@/lib/utils";

const SCOPE_OPTS = (Object.keys(SCOPE_LABEL) as GoalScope[]).map((s) => ({ value: s, label: SCOPE_LABEL[s] }));
const YEAR_OPTS = [...FY_YEARS, 2028, 2029, 2030, 2035, 2040, 2045, 2050].map((y) => ({ value: String(y), label: String(y) }));

export function GoalConfigDraft({
  template, baseYear, inv, onActivate, onBack,
}: {
  template: GoalTemplate; baseYear: number; inv: Inventories;
  onActivate: (draft: Goal) => void; onBack: () => void;
}) {
  const [draft, setDraft] = useState<Goal>(() => goalFromTemplate(template, "draft", baseYear, 0));
  const set = (patch: Partial<Goal>) => setDraft((d) => ({ ...d, ...patch }));
  const unit = METRIC_UNIT[draft.metric];
  const isIncrease = draft.direction === "increase";

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink">
          <ArrowLeft size={15} /> Back
        </button>
        <span className="text-sm font-semibold text-ink">Configure target</span>
        <span className="text-xs text-ink-faint ml-auto">{template.title}</span>
      </div>

      <TextField label="Goal name" value={draft.name} onChange={(v) => set({ name: v })} placeholder="Name this goal" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {categoryHasGhgScope(draft.category) && (
          <SelectField label="Scope" value={draft.scope} onChange={(v) => set({ scope: v })} options={SCOPE_OPTS} />
        )}
        <SelectField label="Base year" value={String(draft.baseYear)} onChange={(v) => set({ baseYear: Number(v) })} options={YEAR_OPTS} />
        <SelectField label="Target year" value={String(draft.targetYear)} onChange={(v) => set({ targetYear: Number(v) })} options={YEAR_OPTS} />
        <AssigneePicker value={draft.assignee} onChange={(p) => set({ assignee: p })} />

        {draft.templateId === "netzero" ? (
          <NumberField label="Residual at target" value={draft.residualPct ?? 0} onChange={(v) => set({ residualPct: v })} min={0} max={100} suffix="%" />
        ) : draft.metric === "solar_kwp" ? (
          <NumberField label="Target capacity" value={draft.targetAbsolute ?? 0} onChange={(v) => set({ targetAbsolute: v })} min={0} suffix="kWp" />
        ) : (
          <NumberField label={isIncrease ? "Target share" : "Reduction at target"} value={draft.targetPct ?? 0} onChange={(v) => set({ targetPct: v })} min={0} max={100} suffix="%" />
        )}
        {draft.templateId === "carbon_neutral" && (
          <NumberField label="Offset remainder" value={draft.offsetPct ?? 0} onChange={(v) => set({ offsetPct: v })} min={0} max={100} suffix="%" />
        )}
        {(draft.templateId === "intensity" || draft.templateId === "water_intensity") && (
          <TextField className="lg:col-span-2" label="Intensity denominator" value={draft.intensityUnit ?? ""} onChange={(v) => set({ intensityUnit: v })} placeholder="e.g. per ₹ crore revenue" />
        )}
      </div>

      <CalcPanel goal={draft} inv={inv} />

      <div className="flex items-center justify-between gap-3 border-t border-line/60 pt-4 flex-wrap">
        <p className="text-xs text-ink-faint">
          Baseline pulled from Data input. Activating seeds initiatives from your data — edit them in <strong>My goals</strong>.
        </p>
        <button
          onClick={() => onActivate(draft)}
          className="inline-flex items-center gap-2 text-sm font-semibold rounded-lg bg-brand-500 text-white px-5 py-2.5 hover:bg-brand-600 transition-colors shrink-0"
        >
          <CheckCircle2 size={16} /> Activate goal
        </button>
      </div>
    </Card>
  );
}
