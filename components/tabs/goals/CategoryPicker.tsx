"use client";

/* Step 1 of goal creation: pick a category. Two large selectable boxes. */

import { Droplets, Factory, Recycle, Zap } from "lucide-react";
import type { GoalCategory } from "@/lib/goals/types";
import { cn } from "@/lib/utils";

const CARDS: { key: GoalCategory; icon: React.ElementType; title: string; blurb: string }[] = [
  { key: "emissions", icon: Factory, title: "Emissions goal", blurb: "Cut tCO₂e — absolute reduction, net-zero, carbon neutral, or intensity." },
  { key: "energy", icon: Zap, title: "Energy goal", blurb: "Renewable electricity (RE100), energy efficiency, or on-site solar." },
  { key: "water", icon: Droplets, title: "Water goal", blurb: "Cut withdrawal, go water neutral, reduce intensity, or reach zero liquid discharge." },
  { key: "waste", icon: Recycle, title: "Waste goal", blurb: "Zero waste to landfill, cut waste generated, or lift the recovery rate." },
];

export function CategoryPicker({ onPick }: { onPick: (c: GoalCategory) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {CARDS.map(({ key, icon: Icon, title, blurb }) => (
        <button
          key={key}
          onClick={() => onPick(key)}
          className={cn(
            "group text-left rounded-xl3 border border-line/60 bg-surface p-6 shadow-card lift",
            "hover:border-brand-400 hover:shadow-card-lg transition-all",
          )}
        >
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 grid place-items-center mb-3 group-hover:bg-brand-500 group-hover:text-white transition-colors">
            <Icon size={24} />
          </div>
          <h3 className="text-lg font-extrabold text-ink">{title}</h3>
          <p className="text-sm text-ink-soft mt-1">{blurb}</p>
        </button>
      ))}
    </div>
  );
}
