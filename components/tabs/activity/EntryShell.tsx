"use client";

/* The data-entry screen's use of the shared two-pane frame.

   The frame itself — the grid, the fixed height, which parts may scroll —
   moved to components/ui/TwoPaneShell when the scenario modeller turned out to
   need exactly the same thing. What stays here is only what makes this screen
   an ENTRY screen: a hero you can rename the source in, and a rail whose
   headline is the emissions figure with its data-quality grade and the
   derivation behind it. */

import { cn } from "@/lib/utils";
import type { Grade } from "@/lib/data-quality";
import { RailScroll, TabPanel, TwoPaneShell, type PaneTab } from "@/components/ui/TwoPaneShell";
import { fmt } from "@/lib/utils";

export type EntryTab = PaneTab;
export { TabPanel };

const GRADE_STYLE: Record<Grade, { label: string; cls: string }> = {
  measured: { label: "Measured", cls: "bg-brand-50 text-brand-700 border-brand-200" },
  estimated: { label: "Estimated", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  missing: { label: "Not recorded", cls: "bg-red-50 text-red-700 border-red-200" },
};

export function EntryShell({
  backLabel,
  onBack,
  gradient,
  icon: Icon,
  iconColor,
  name,
  onNameChange,
  subtitle,
  emissionsT,
  emissionsNote,
  tabs,
  activeTab,
  onTabChange,
  calc,
  calcTitle = "How this is calculated",
  grade,
  warnings = [],
}: {
  backLabel: string;
  onBack: () => void;
  gradient: string;
  icon: React.ElementType;
  iconColor: string;
  name: string;
  onNameChange: (v: string) => void;
  subtitle: string;
  emissionsT: number;
  /** What the figure IS — "Scope 1 · combustion", "Scope 2 · location-based". */
  emissionsNote: string;
  tabs: EntryTab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  calc: React.ReactNode;
  calcTitle?: string;
  grade: Grade;
  /** Already-composed messages. Rendered in the rail, always visible. */
  warnings?: React.ReactNode[];
}) {
  const g = GRADE_STYLE[grade];

  return (
    <TwoPaneShell
      backLabel={backLabel}
      onBack={onBack}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={onTabChange}
      tabsLabel="Entry sections"
      hero={
        <div
          style={{ background: gradient }}
          className="rounded-xl3 border border-white/60 shadow-card px-5 py-3.5 flex items-center gap-3.5 shrink-0"
        >
          <span className="w-11 h-11 rounded-xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0">
            <Icon size={22} strokeWidth={1.9} style={{ color: iconColor }} />
          </span>
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="w-full text-xl font-extrabold text-ink bg-transparent border-b-2 border-transparent hover:border-ink/20 focus:border-ink/40 focus:outline-none"
              aria-label="Source name"
            />
            <p className="text-[13px] font-medium text-ink-soft mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>
      }
      rail={
        <>
          {/* The one accent: a rule in the family's own colour, so the figure
              reads as belonging to THIS source rather than floating on white. */}
          <div className="px-5 pt-5 pb-4 shrink-0 border-b border-line/70 border-l-[3px]" style={{ borderLeftColor: iconColor }}>
            <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div>
            <div className="text-[2.5rem] leading-none font-extrabold tabular-nums text-ink mt-1.5">
              {fmt(emissionsT)}
              <span className="text-sm font-semibold text-ink-soft ml-1">tCO₂e</span>
            </div>
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-medium text-ink-faint">{emissionsNote}</span>
              <span className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full border px-2 py-0.5", g.cls)}>
                {g.label}
              </span>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="px-5 py-3 shrink-0 border-b border-line/70 bg-amber-50/40 space-y-1.5">
              {warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-amber-800 leading-relaxed">{w}</p>
              ))}
            </div>
          )}

          <RailScroll title={calcTitle}>{calc}</RailScroll>
        </>
      }
    />
  );
}
