"use client";

/* My goals — a box per activated goal; clicking one opens its full detail
   screen (target, milestones, calculation panel, and the initiatives table). */

import { useState } from "react";
import { Target } from "lucide-react";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import { useEsg } from "@/lib/esg/store";
import { useGoals } from "@/lib/goals/store";
import type { Inventories } from "@/lib/goals/select";
import { Card } from "@/components/ui/Card";
import { GoalBox } from "./GoalBox";
import { GoalEditor } from "./GoalEditor";

export function GoalsManage({ onCreateNew }: { onCreateNew: () => void }) {
  const s1 = useScenario();
  const s2 = useScope2();
  const esg = useEsg();
  const { goals, initiatives } = useGoals();
  const inv: Inventories = { combustion: s1.combustion, refrigeration: s1.refrigeration, facilities: s2.facilities, water: esg.water, waste: esg.waste };

  const [openId, setOpenId] = useState<string | null>(null);
  const open = goals.find((g) => g.id === openId) ?? null;

  if (goals.length === 0) {
    return (
      <Card tone="muted" className="text-center py-12">
        <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 grid place-items-center mx-auto mb-3"><Target size={24} /></div>
        <h3 className="font-semibold text-ink">No goals activated yet</h3>
        <p className="text-sm text-ink-soft mt-1 max-w-md mx-auto">Use the <strong>Set up goal</strong> tab to choose a target type and activate it. It’ll appear here for editing.</p>
        <button onClick={onCreateNew} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold rounded-lg bg-brand-500 text-white px-4 py-2.5 hover:bg-brand-600 transition-colors">
          Set up a goal
        </button>
      </Card>
    );
  }

  // Detail screen for the opened goal.
  if (open) {
    return <GoalEditor goal={open} inv={inv} onBack={() => setOpenId(null)} />;
  }

  // Grid of goal boxes.
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[...goals].sort((a, b) => a.createdAt - b.createdAt).map((g) => (
        <GoalBox key={g.id} goal={g} inv={inv} initiatives={initiatives} selected={false} onSelect={() => setOpenId(g.id)} />
      ))}
    </div>
  );
}
