"use client";

/* Goals dashboard — portfolio KPI strip, a box per goal, and the selected
   goal's expanded charts below. Reads actuals from the Scope 1 + Scope 2 stores. */

import { useState } from "react";
import { Target, ListChecks, Wallet, Users } from "lucide-react";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import { useEsg } from "@/lib/esg/store";
import { useGoals } from "@/lib/goals/store";
import type { Inventories } from "@/lib/goals/select";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { fmtMoney } from "@/lib/utils";
import { GoalBox } from "./GoalBox";
import { GoalDetail } from "./GoalDetail";

export function GoalsDashboard() {
  const s1 = useScenario();
  const s2 = useScope2();
  const esg = useEsg();
  const { goals, initiatives } = useGoals();
  const inv: Inventories = { combustion: s1.combustion, refrigeration: s1.refrigeration, facilities: s2.facilities, water: esg.water, waste: esg.waste };

  const sorted = [...goals].sort((a, b) => a.createdAt - b.createdAt);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sorted.find((g) => g.id === selectedId) ?? sorted[0] ?? null;

  if (goals.length === 0) {
    return (
      <Card tone="muted" className="text-center py-12">
        <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-3"><Target size={24} /></div>
        <h3 className="font-semibold text-ink">No goals to track yet</h3>
        <p className="text-sm text-ink-soft mt-1 max-w-md mx-auto">
          Switch to <strong>Set up goals</strong> to pick a target. The dashboard will track progress here, one box per goal.
        </p>
      </Card>
    );
  }

  const activeInitiatives = initiatives.filter((i) => i.status !== "on_hold");
  const assignedCount = goals.filter((g) => g.assignee).length;
  const totalBudget = initiatives.reduce((s, i) => s + i.budget, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard emphasis icon={Target} label="Goals" value={String(goals.length)} hint="board-level commitments" />
        <KpiCard icon={ListChecks} label="Initiatives" value={String(initiatives.length)} hint={`${activeInitiatives.length} active`} />
        <KpiCard icon={Users} label="Assigned goals" value={`${assignedCount}/${goals.length}`} hint="to a team owner" />
        <KpiCard icon={Wallet} label="Total budget" value={fmtMoney(totalBudget)} hint="across all initiatives" />
      </div>

      {/* box per goal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((g) => (
          <GoalBox
            key={g.id}
            goal={g}
            inv={inv}
            initiatives={initiatives}
            selected={selected?.id === g.id}
            onSelect={() => setSelectedId(g.id)}
          />
        ))}
      </div>

      {/* expanded detail for the selected goal */}
      {selected && <GoalDetail goal={selected} inv={inv} initiatives={initiatives} />}
    </div>
  );
}
