"use client";

/* The two-pane frame every entry screen renders into.

   The problem it solves: an entry used to be five full-width cards stacked down
   a page far taller than any laptop — the emissions figure scrolled out of view
   exactly when you were typing the number that changes it.

   Three rules shape the layout.

   1. THE RESULT IS ALWAYS ON SCREEN. Emissions, the derivation behind it, the
      data-quality grade and every warning live in the right rail, which never
      scrolls out of view. The left pane is where you type; the right pane is
      what your typing does. Emissions therefore appears ONCE, in the rail —
      putting it in the hero band too would be the same fact competing with
      itself two inches apart.

   2. WARNINGS BELONG TO THE ENTRY, NOT TO A TAB. A tabbed pane can hide a
      problem behind a tab you are not on, so every warning is hoisted to the
      rail and the tab that owns it grows an amber dot. You can always tell from
      any tab that another one needs attention.

   3. ONLY GENUINELY UNBOUNDED CONTENT SCROLLS. The frame is fixed-height at lg
      and up. Within it, exactly two things may scroll on their own: the active
      panel (an equipment table grows a row per machine) and the rail (the
      derivation is longer for biomass, which has a third step). Everything else
      is sized to fit. Below lg the frame collapses to one column and the page
      flows normally — a locked two-pane on a phone is worse than a scroll. */

import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Grade } from "@/lib/data-quality";
import { SectionTabs, type SectionTab } from "@/components/ui/SectionTabs";
import { fmt } from "@/lib/utils";

export type EntryTab = SectionTab & { content: React.ReactNode };

const GRADE_STYLE: Record<Grade, { label: string; cls: string }> = {
  measured: { label: "Measured", cls: "bg-brand-50 text-brand-700 border-brand-200" },
  estimated: { label: "Estimated", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  missing: { label: "Not recorded", cls: "bg-red-50 text-red-700 border-red-200" },
};

/** The panel body every tab's content sits in.
 *
 *  By default it scrolls and pads. `flush` hands both jobs to the child: the
 *  equipment tab pins its own header and split controls and scrolls only the
 *  table between them, which a scroll container out here would prevent. */
export function TabPanel({ children, flush = false }: { children: React.ReactNode; flush?: boolean }) {
  return (
    <div className={cn("h-full min-h-0", flush ? "" : "overflow-y-auto p-6")}>{children}</div>
  );
}

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
  const active = tabs.find((t) => t.key === activeTab) ?? tabs[0];
  const g = GRADE_STYLE[grade];

  return (
    <div className="screen-in flex flex-col gap-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"
      >
        <ArrowLeft size={16} /> Back to {backLabel}
      </button>

      {/* The frame. Fixed-height only where there is height to spend. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:h-[calc(100dvh-14rem)] lg:min-h-[30rem]">
        {/* ── Work pane ── */}
        <div className="flex flex-col min-h-0 gap-3">
          {/* Hero: identity only. The number lives in the rail. */}
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

          {/* Shared with Balance to target — see components/ui/SectionTabs. */}
          <SectionTabs
            ariaLabel="Entry sections"
            tabs={tabs.map(({ key, label, badge, alert }) => ({ key, label, badge, alert }))}
            active={active.key}
            onSelect={onTabChange}
          />

          {/* The one panel. min-h-0 is what lets its child scroll instead of
              pushing the frame taller. */}
          <div
            role="tabpanel"
            key={active.key}
            className="panel-in flex-1 min-h-0 rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden"
          >
            {active.content}
          </div>
        </div>

        {/* ── Result rail ── */}
        <aside className="flex flex-col min-h-0 rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden">
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

          {/* The derivation the figure above comes from. Scrolls on its own —
              biomass adds a third step and a short laptop cannot hold it. The
              fade is what distinguishes "there is more below" from "this is
              broken": without it the last visible line is sliced mid-glyph. */}
          <div className="relative flex-1 min-h-0">
            <div className="h-full overflow-y-auto px-5 py-4">
              <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold mb-3">{calcTitle}</div>
              {calc}
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface to-transparent"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
