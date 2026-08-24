"use client";

import { useEffect, useState } from "react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { GoalsProvider } from "@/lib/goals/store";
import { EsgProvider } from "@/lib/esg/store";
import type { GoalCategory } from "@/lib/goals/types";
import { CompanyProvider, useCompany } from "@/lib/company/store";
import { esgKey, goalsKey, scope1Key, scope2Key } from "@/lib/company/helpers";
import { DEFAULT_PERSONA, isPersona, lensTabs, personaLanding, personaStorageKey, type Persona } from "@/lib/persona";
import { cn } from "@/lib/utils";
import { Sidebar, MobileNav, type Scope, type TabKey } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CeoOverviewTab } from "./tabs/CeoOverviewTab";
import { ActivityDataTab } from "./tabs/ActivityDataTab";
import { BuilderHub } from "./tabs/BuilderHub";
import { ActionPlanTab } from "./tabs/ActionPlanTab";
import { CfoFinanceTab } from "./tabs/CfoFinanceTab";
import { RefrigerantTab } from "./tabs/RefrigerantTab";
import { CompareTab } from "./tabs/CompareTab";
import { GoalsTab } from "./tabs/GoalsTab";
import { Scope2CeoOverviewTab } from "./scope2/CeoOverviewTab";
import { Scope2ActionPlanTab } from "./scope2/ActionPlanTab";
import { Scope2CompareTab } from "./scope2/CompareTab";

export function Shell() {
  return (
    <CompanyProvider>
      <CompanyScopedShell />
    </CompanyProvider>
  );
}

const SCOPE_OPTS: { key: Scope; label: string; sub: string }[] = [
  { key: "s1", label: "Scope 1", sub: "Fuel & gas" },
  { key: "s2", label: "Scope 2", sub: "Electricity" },
];

/** In-page Scope 1 / Scope 2 switch, shown only on tabs that have both. */
function ScopeToggle({ scope, setScope }: { scope: Scope; setScope: (s: Scope) => void }) {
  return (
    <div className="mt-4 inline-flex items-center gap-1 rounded-full bg-surface-muted p-1">
      {SCOPE_OPTS.map((o) => {
        const on = scope === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => setScope(o.key)}
            aria-pressed={on}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors inline-flex items-center gap-2",
              on ? "bg-white text-brand-700 shadow-card" : "text-ink-soft hover:text-ink",
            )}
          >
            {o.label}
            <span className={cn("text-[11px] font-medium", on ? "text-brand-500" : "text-ink-faint")}>{o.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

/* Keyed by company id: switching company remounts both stores so they
   re-hydrate from that company's own localStorage namespace. */
function CompanyScopedShell() {
  const { activeId } = useCompany();
  const [scope, setScope] = useState<Scope>("s1"); // only affects the dual-scope tabs
  const [tab, setTabState] = useState<TabKey>("data");  // single logical nav; default = Activity data
  const [persona, setPersonaState] = useState<Persona>(DEFAULT_PERSONA);
  // Set when a Data-input screen deep-links into goal creation (e.g. Water →
  // "Set a water goal"); cleared as soon as the user navigates elsewhere.
  const [goalSetupCategory, setGoalSetupCategory] = useState<GoalCategory | null>(null);

  const setTab = (t: TabKey) => {
    if (t !== "goals") setGoalSetupCategory(null);
    setTabState(t);
  };
  const openGoalSetup = (c: GoalCategory) => {
    setGoalSetupCategory(c);
    setTabState("goals");
  };

  // Hydrate this company's saved persona on mount / company switch.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(personaStorageKey(activeId)) : null;
    setPersonaState(isPersona(saved) ? saved : DEFAULT_PERSONA);
  }, [activeId]);

  // Persist persona per company.
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(personaStorageKey(activeId), persona);
  }, [persona, activeId]);

  // If the current tab isn't in this persona's lens, jump to the lens landing.
  useEffect(() => {
    const allowed = lensTabs(persona);
    if (!allowed.includes(tab)) setTab(personaLanding(persona));
  }, [persona]); // eslint-disable-line react-hooks/exhaustive-deps

  // These tabs exist separately for Scope 1 (fuel) and Scope 2 (electricity).
  // The builder is unified (Balance to target → Scope 1 → Scope 2 inside).
  const dualScope = tab === "overview" || tab === "action" || tab === "compare";

  return (
    <ScenarioProvider key={`s1-${activeId}`} storageKey={scope1Key(activeId)}>
      <Scope2Provider key={`s2-${activeId}`} storageKey={scope2Key(activeId)}>
        <GoalsProvider key={`g-${activeId}`} storageKey={goalsKey(activeId)}>
        <EsgProvider key={`e-${activeId}`} storageKey={esgKey(activeId)}>
        <div className="flex min-h-screen p-3 md:p-4 gap-4">
          <Sidebar tab={tab} setTab={setTab} persona={persona} />
          <main className="flex-1 min-w-0">
            <div className="bg-surface/90 backdrop-blur-md rounded-xl3 shadow-card-lg p-4 md:p-7 min-h-[calc(100vh-2rem)] pb-24 md:pb-7">
              <Topbar scope={scope} tab={tab} persona={persona} setPersona={setPersonaState} />
              {dualScope && <ScopeToggle scope={scope} setScope={setScope} />}
              <div key={`${tab}-${dualScope ? scope : "x"}`} className="tab-fade mt-6">
                {tab === "overview" && (scope === "s1" ? <CeoOverviewTab /> : <Scope2CeoOverviewTab />)}
                {tab === "goals" && <GoalsTab persona={persona} setupCategory={goalSetupCategory ?? undefined} />}
                {tab === "data" && <ActivityDataTab onOpenGoalSetup={openGoalSetup} />}
                {tab === "builder" && <BuilderHub />}
                {tab === "action" && (scope === "s1" ? <ActionPlanTab /> : <Scope2ActionPlanTab />)}
                {tab === "finance" && <CfoFinanceTab />}
                {tab === "refrigerant" && <RefrigerantTab />}
                {tab === "compare" && (scope === "s1" ? <CompareTab /> : <Scope2CompareTab />)}
              </div>
            </div>
          </main>
          <MobileNav tab={tab} setTab={setTab} persona={persona} />
        </div>
        </EsgProvider>
        </GoalsProvider>
      </Scope2Provider>
    </ScenarioProvider>
  );
}
