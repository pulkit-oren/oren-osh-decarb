"use client";

/* Step 2 of goal creation: pick a goal template within the chosen category,
   or start a custom goal. Searchable. */

import { useState } from "react";
import {
  TrendingDown, Target, Leaf, Gauge, Sun, Plug, Activity, PanelTop, Plus, ArrowLeft, Search,
  Droplets, Waves, CircleOff, Recycle, RefreshCw,
} from "lucide-react";
import { customTemplateFor, templatesFor, type GoalTemplate } from "@/lib/goals/catalog";
import { CATEGORY_LABEL, type GoalCategory } from "@/lib/goals/types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ElementType> = {
  TrendingDown, Target, Leaf, Gauge, Sun, Plug, Activity, PanelTop, Plus,
  Droplets, Waves, CircleOff, Recycle, RefreshCw,
};

export function TemplatePicker({
  category, onPick, onBack,
}: {
  category: GoalCategory; onPick: (t: GoalTemplate) => void; onBack: () => void;
}) {
  const [q, setQ] = useState("");
  const all = [...templatesFor(category), customTemplateFor(category)];
  const list = all.filter((t) => `${t.title} ${t.blurb}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink">
          <ArrowLeft size={15} /> Back
        </button>
        <span className="text-sm font-semibold text-ink">{CATEGORY_LABEL[category]} — pick a goal</span>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search goals…"
            className="text-sm border border-line rounded-lg pl-8 pr-3 py-1.5 bg-white focus:outline-none focus:border-brand-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((t) => {
          const Icon = ICONS[t.icon] ?? Plus;
          const custom = t.id === "custom";
          return (
            <button
              key={t.id}
              onClick={() => onPick(t)}
              className={cn(
                "group text-left rounded-xl2 border bg-surface p-4 shadow-card lift hover:shadow-card-lg transition-all",
                custom ? "border-dashed border-line hover:border-brand-400" : "border-line/60 hover:border-brand-400",
              )}
            >
              <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 grid place-items-center mb-2 group-hover:bg-brand-500 group-hover:text-white transition-colors">
                <Icon size={18} />
              </div>
              <h4 className="text-sm font-bold text-ink leading-tight">{t.title}</h4>
              <p className="text-xs text-ink-soft mt-1 leading-snug">{t.blurb}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
