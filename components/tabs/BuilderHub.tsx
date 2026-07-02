"use client";

/* The scenario modeller's top-level structure, target-first:
   Balance to target (landing) → Scope 1 → Scope 2. One combined target
   drives the balance screen; the scope tabs hold the per-source detail.
   Both stores are always mounted, so switching tabs never loses state. */

import { useState } from "react";
import { PillNav } from "@/components/ui/PillNav";
import { BalanceTab } from "./BalanceTab";
import { BuilderTab } from "./BuilderTab";
import { Scope2BuilderTab } from "@/components/scope2/BuilderTab";

type HubTab = "balance" | "s1" | "s2";

export function BuilderHub() {
  const [hub, setHub] = useState<HubTab>("balance");

  return (
    <div className="flex flex-col gap-4">
      <PillNav
        items={[
          { key: "balance", label: "Balance to target" },
          { key: "s1", label: "Scope 1 · fuels & refrigerants" },
          { key: "s2", label: "Scope 2 · electricity" },
        ]}
        active={hub}
        onSelect={(k) => setHub(k as HubTab)}
      />
      {hub === "balance" ? (
        <BalanceTab onOpenScope={(s) => setHub(s)} />
      ) : hub === "s1" ? (
        <BuilderTab />
      ) : (
        <Scope2BuilderTab />
      )}
    </div>
  );
}
