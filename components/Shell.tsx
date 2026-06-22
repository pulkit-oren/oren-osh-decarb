"use client";

import { useEffect, useState } from "react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { CompanyProvider, useCompany } from "@/lib/company/store";
import { scope1Key, scope2Key } from "@/lib/company/helpers";
import { DEFAULT_PERSONA, isPersona, lensTabs, personaLanding, personaStorageKey, type Persona } from "@/lib/persona";
import { Sidebar, MobileNav, type AnyTabKey, type Scope, type Scope2TabKey, type TabKey } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CeoOverviewTab } from "./tabs/CeoOverviewTab";
import { ActivityDataTab } from "./tabs/ActivityDataTab";
import { BuilderTab } from "./tabs/BuilderTab";
import { ActionPlanTab } from "./tabs/ActionPlanTab";
import { CfoFinanceTab } from "./tabs/CfoFinanceTab";
import { RefrigerantTab } from "./tabs/RefrigerantTab";
import { CompareTab } from "./tabs/CompareTab";
import { Scope2CeoOverviewTab } from "./scope2/CeoOverviewTab";
import { Scope2BuilderTab } from "./scope2/BuilderTab";
import { Scope2ActionPlanTab } from "./scope2/ActionPlanTab";
import { Scope2CompareTab } from "./scope2/CompareTab";

export function Shell() {
  return (
    <CompanyProvider>
      <CompanyScopedShell />
    </CompanyProvider>
  );
}

/* Keyed by company id: switching company remounts both stores so they
   re-hydrate from that company's own localStorage namespace. */
function CompanyScopedShell() {
  const { activeId } = useCompany();
  const [scope, setScope] = useState<Scope>("s1");
  // Each scope remembers its own active tab across switches.
  const [tabS1, setTabS1] = useState<TabKey>("builder");
  const [tabS2, setTabS2] = useState<Scope2TabKey>("builder2");

  const [persona, setPersonaState] = useState<Persona>(DEFAULT_PERSONA);

  // Hydrate this company's saved persona on mount / company switch.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(personaStorageKey(activeId)) : null;
    setPersonaState(isPersona(saved) ? saved : DEFAULT_PERSONA);
  }, [activeId]);

  // Persist persona per company.
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(personaStorageKey(activeId), persona);
  }, [persona, activeId]);

  const tab: AnyTabKey = scope === "s1" ? tabS1 : tabS2;
  const setTab = (t: AnyTabKey) =>
    scope === "s1" ? setTabS1(t as TabKey) : setTabS2(t as Scope2TabKey);

  // If the current tab isn't in this persona's lens, jump to the lens landing.
  useEffect(() => {
    const allowed = lensTabs(scope, persona);
    if (!allowed.includes(tab)) setTab(personaLanding(scope, persona));
  }, [persona, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ScenarioProvider key={`s1-${activeId}`} storageKey={scope1Key(activeId)}>
      <Scope2Provider key={`s2-${activeId}`} storageKey={scope2Key(activeId)}>
        <div className="flex min-h-screen p-3 md:p-4 gap-4">
          <Sidebar scope={scope} setScope={setScope} tab={tab} setTab={setTab} persona={persona} />
          <main className="flex-1 min-w-0">
            <div className="bg-surface/90 backdrop-blur-md rounded-xl3 shadow-card-lg p-4 md:p-7 min-h-[calc(100vh-2rem)] pb-24 md:pb-7">
              <Topbar scope={scope} tab={tab} persona={persona} setPersona={setPersonaState} />
              <div key={tab} className="tab-fade mt-6">
                {tab === "overview" && <CeoOverviewTab />}
                {tab === "data" && <ActivityDataTab />}
                {tab === "builder" && <BuilderTab />}
                {tab === "action" && <ActionPlanTab />}
                {tab === "finance" && <CfoFinanceTab />}
                {tab === "refrigerant" && <RefrigerantTab />}
                {tab === "compare" && <CompareTab />}
                {tab === "overview2" && <Scope2CeoOverviewTab />}
                {tab === "data2" && <ActivityDataTab />}
                {tab === "builder2" && <Scope2BuilderTab />}
                {tab === "action2" && <Scope2ActionPlanTab />}
                {tab === "compare2" && <Scope2CompareTab />}
              </div>
            </div>
          </main>
          <MobileNav scope={scope} setScope={setScope} tab={tab} setTab={setTab} persona={persona} />
        </div>
      </Scope2Provider>
    </ScenarioProvider>
  );
}
