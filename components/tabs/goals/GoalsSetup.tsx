"use client";

/* Set up goal — a pure creation wizard: category → target type → configure →
   Activate. Activated goals are managed in the "My goals" tab. */

import { useState } from "react";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import { useEsg } from "@/lib/esg/store";
import { useGoals } from "@/lib/goals/store";
import { autoInitiatives } from "@/lib/goals/initiatives-auto";
import type { Inventories } from "@/lib/goals/select";
import type { Goal, GoalCategory } from "@/lib/goals/types";
import type { GoalTemplate } from "@/lib/goals/catalog";
import { Card, CardHeader } from "@/components/ui/Card";
import { HowTo } from "@/components/ui/HowTo";
import { CategoryPicker } from "./CategoryPicker";
import { TemplatePicker } from "./TemplatePicker";
import { GoalConfigDraft } from "./GoalConfigDraft";

type Step = "category" | "template" | "configure";

export function GoalsSetup({ onActivated, initialCategory }: { onActivated: () => void; initialCategory?: GoalCategory }) {
  const s1 = useScenario();
  const s2 = useScope2();
  const esg = useEsg();
  const { addGoal } = useGoals();
  const inv: Inventories = { combustion: s1.combustion, refrigeration: s1.refrigeration, facilities: s2.facilities, water: esg.water, waste: esg.waste };

  // Deep links from the Data-input Water/Waste screens land straight on the templates.
  const [step, setStep] = useState<Step>(initialCategory ? "template" : "category");
  const [category, setCategory] = useState<GoalCategory>(initialCategory ?? "emissions");
  const [template, setTemplate] = useState<GoalTemplate | null>(null);

  const activate = (draft: Goal) => {
    addGoal(draft, (goal) => autoInitiatives(goal, inv));
    setStep("category");
    setTemplate(null);
    onActivated(); // jump to My goals
  };

  return (
    <Card className="flex flex-col gap-5">
      <CardHeader
        title="Set up a goal"
        subtitle="Choose a category, pick a target type, configure it, then activate."
        right={
          <HowTo points={[
            "Step 1: Emissions goal or Energy goal.",
            "Step 2: pick a pre-configured target type (SBTi, net-zero, RE100, solar…) or Custom.",
            "Step 3: set the scope, years, and target, then Activate. The baseline comes from your Data input.",
            "Activated goals — and their auto-suggested initiatives — are edited in the My goals tab.",
          ]} />
        }
      />

      {step === "category" && (
        <CategoryPicker onPick={(c) => { setCategory(c); setStep("template"); }} />
      )}
      {step === "template" && (
        <TemplatePicker
          category={category}
          onPick={(t) => { setTemplate(t); setStep("configure"); }}
          onBack={() => setStep("category")}
        />
      )}
      {step === "configure" && template && (
        <GoalConfigDraft
          template={template}
          baseYear={s1.baseYear}
          inv={inv}
          onActivate={activate}
          onBack={() => setStep("template")}
        />
      )}
    </Card>
  );
}
