"use client";

/* The scenario modeller's top-level structure, target-first:
   Balance to target (landing) → Scope 1 → Scope 2. One combined target
   drives the balance screen; the scope tabs hold the per-source detail.
   Both stores are always mounted, so switching tabs never loses state. */

import { useState } from "react";
import { PillNav } from "@/components/ui/PillNav";
import { BalanceTab, type LeverFocus } from "./BalanceTab";
import { BuilderTab } from "./BuilderTab";
import { Scope2BuilderTab } from "@/components/scope2/BuilderTab";

type HubTab = "balance" | "s1" | "s2";

export function BuilderHub() {
  const [hub, setHub] = useState<HubTab>("balance");
  /* Set when a lever on the balance screen is clicked — the scope tab mounts
     straight on that lever's screen. Cleared on manual pill navigation. */
  const [focus, setFocus] = useState<LeverFocus | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <PillNav
        items={[
          { key: "balance", label: "Balance to target" },
          { key: "s1", label: "Scope 1 · fuels & refrigerants" },
          { key: "s2", label: "Scope 2 · electricity" },
        ]}
        active={hub}
        onSelect={(k) => { setFocus(null); setHub(k as HubTab); }}
      />
      {hub === "balance" ? (
        <BalanceTab onOpenLever={(f) => { setFocus(f); setHub(f.scope); }} />
      ) : hub === "s1" ? (
        <BuilderTab initialSeg={focus?.scope === "s1" ? focus.seg : undefined} />
      ) : (
        <Scope2BuilderTab
          initialMode={focus?.scope === "s2" ? focus.mode : undefined}
          initialFacilityId={focus?.scope === "s2" ? focus.facilityId : undefined}
        />
      )}
    </div>
  );
}
