"use client";

/* The two-pane frame, shared by every screen where you change one thing and
   watch a number move.

   It was built for the data-entry screens, where five stacked full-width cards
   ran further down the page than any laptop and the emissions figure scrolled
   out of view exactly as you typed the number that changes it. The scenario
   modeller had the identical shape and the identical problem: a source's plan
   is a suggestion card, an impact strip, four lever rows and an alternatives
   catalogue, stacked, so the tonnes you are trying to move sit above the
   controls that move them.

   Three rules, unchanged from where they were first written down.

   1. THE RESULT IS ALWAYS ON SCREEN. Whatever the screen is for — emissions
      entered, tonnes abated — lives in the right rail and never scrolls away.
      The left pane is where you act; the right pane is what your acting does.
      The figure appears ONCE, in the rail: putting it in the hero as well is
      the same fact competing with itself two inches apart.

   2. PROBLEMS BELONG TO THE SCREEN, NOT TO A TAB. A tabbed pane can hide a
      problem behind a tab you are not on, so warnings are hoisted to the rail
      and the owning tab grows a dot. From any tab you can tell another one
      needs attention.

   3. ONLY GENUINELY UNBOUNDED CONTENT SCROLLS. Fixed-height at lg and up.
      Within it exactly two things may scroll: the active panel and the rail.
      Everything else is sized to fit. Below lg it collapses to one column and
      the page flows normally — a locked two-pane on a phone is worse than a
      scroll. */

import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionTabs, type SectionTab } from "./SectionTabs";

export type PaneTab = SectionTab & { content: React.ReactNode };

/** The panel body every tab's content sits in.
 *
 *  By default it scrolls and pads. `flush` hands both jobs to the child: a
 *  table that pins its own header and scrolls only its rows cannot do that
 *  inside a scroll container out here. */
export function TabPanel({ children, flush = false }: { children: React.ReactNode; flush?: boolean }) {
  return (
    <div className={cn("h-full min-h-0", flush ? "" : "overflow-y-auto p-6")}>{children}</div>
  );
}

export function TwoPaneShell({
  backLabel,
  onBack,
  hero,
  tabs,
  activeTab,
  onTabChange,
  tabsLabel = "Sections",
  rail,
}: {
  backLabel: string;
  onBack: () => void;
  /** Identity only — the number belongs in the rail (rule 1). */
  hero: React.ReactNode;
  tabs: PaneTab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  tabsLabel?: string;
  /** Everything in the right-hand column. Owns its own scrolling. */
  rail: React.ReactNode;
}) {
  const active = tabs.find((t) => t.key === activeTab) ?? tabs[0];

  return (
    <div className="screen-in flex flex-col gap-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"
      >
        <ArrowLeft size={16} /> Back to {backLabel}
      </button>

      {/* Fixed-height only where there is height to spend. The 30rem floor is
          not 36: a min-height on a viewport-height frame is a promise the
          viewport may not keep, and a floor set too high just pushes the page
          back into scrolling — the thing this layout exists to stop. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:h-[calc(100dvh-14rem)] lg:min-h-[30rem]">
        <div className="flex flex-col min-h-0 gap-3">
          {hero}

          <SectionTabs
            ariaLabel={tabsLabel}
            tabs={tabs.map(({ key, label, badge, alert }) => ({ key, label, badge, alert }))}
            active={active.key}
            onSelect={onTabChange}
          />

          {/* min-h-0 is what lets the child scroll instead of pushing the frame
              taller. Keyed on the tab so the panel re-enters on change. */}
          <div
            role="tabpanel"
            key={active.key}
            className="panel-in flex-1 min-h-0 rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden"
          >
            {active.content}
          </div>
        </div>

        <aside className="flex flex-col min-h-0 rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden">
          {rail}
        </aside>
      </div>
    </div>
  );
}

/** The rail's scrolling section, with the fade that distinguishes "there is
 *  more below" from "this is broken" — without it the last visible line is
 *  sliced mid-glyph. */
export function RailScroll({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="relative flex-1 min-h-0">
      <div className="h-full overflow-y-auto px-5 py-4">
        {title && <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold mb-3">{title}</div>}
        {children}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface to-transparent"
      />
    </div>
  );
}
