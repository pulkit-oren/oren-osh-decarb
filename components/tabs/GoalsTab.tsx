"use client";

/* Goals & Targets — track (Dashboard), create (Set up goal), edit (My goals),
   and the active person's own initiatives (Assigned to me). */

import { useState } from "react";
import { PillNav } from "@/components/ui/PillNav";
import { PERSONAS, type Persona } from "@/lib/persona";
import type { GoalCategory } from "@/lib/goals/types";
import { GoalsDashboard } from "./goals/GoalsDashboard";
import { GoalsSetup } from "./goals/GoalsSetup";
import { GoalsManage } from "./goals/GoalsManage";
import { GoalsAssigned } from "./goals/GoalsAssigned";

type View = "dashboard" | "setup" | "manage" | "assigned";

export function GoalsTab({ persona, setupCategory }: { persona: Persona; setupCategory?: GoalCategory }) {
  // A deep link from Data input (e.g. Water → "Set a water goal") opens Set up directly.
  const [view, setView] = useState<View>(setupCategory ? "setup" : "dashboard");
  const me = PERSONAS.find((p) => p.key === persona);

  return (
    <div className="flex flex-col gap-6">
      <PillNav
        items={[
          { key: "dashboard", label: "Dashboard" },
          { key: "setup", label: "Set up goal" },
          { key: "manage", label: "My goals" },
          { key: "assigned", label: me ? `Assigned to ${me.sub}` : "Assigned to me" },
        ]}
        active={view}
        onSelect={(k) => setView(k as View)}
      />
      {view === "dashboard" && <GoalsDashboard />}
      {view === "setup" && <GoalsSetup onActivated={() => setView("manage")} initialCategory={setupCategory} />}
      {view === "manage" && <GoalsManage onCreateNew={() => setView("setup")} />}
      {view === "assigned" && <GoalsAssigned persona={persona} />}
    </div>
  );
}
