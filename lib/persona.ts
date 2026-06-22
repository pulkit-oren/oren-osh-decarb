import type { AnyTabKey, Scope } from "@/components/Sidebar";

export type Persona = "esg" | "ceo" | "plant" | "cfo";

export const DEFAULT_PERSONA: Persona = "esg";

export const PERSONAS: { key: Persona; label: string; sub: string; dotClass: string }[] = [
  { key: "esg",   label: "ESG Lead",   sub: "Amit",   dotClass: "bg-oren-500" },
  { key: "ceo",   label: "CEO",        sub: "Raghav", dotClass: "bg-info" },
  { key: "plant", label: "Plant Head", sub: "Priya",  dotClass: "bg-brand-500" },
  { key: "cfo",   label: "CFO",        sub: "Neha",   dotClass: "bg-warn" },
];

// Tab keys visible per persona × scope, in display order. ESG = everything.
const LENS: Record<Persona, { s1: AnyTabKey[]; s2: AnyTabKey[] }> = {
  esg:   { s1: ["data", "builder", "action", "refrigerant", "compare"], s2: ["data2", "builder2", "action2", "compare2"] },
  plant: { s1: ["data", "builder", "action"],                            s2: ["data2", "builder2", "action2"] },
  cfo:   { s1: ["finance", "action", "compare"],                         s2: ["builder2", "action2", "compare2"] },
  ceo:   { s1: ["overview", "compare"],                                  s2: ["overview2", "compare2"] },
};

export function lensTabs(scope: Scope, persona: Persona): AnyTabKey[] {
  return LENS[persona][scope === "s1" ? "s1" : "s2"];
}

export function personaLanding(scope: Scope, persona: Persona): AnyTabKey {
  return lensTabs(scope, persona)[0];
}

export function isPersona(v: unknown): v is Persona {
  return v === "esg" || v === "ceo" || v === "plant" || v === "cfo";
}

export const personaStorageKey = (companyId: string) => `osh-persona-v1::${companyId}`;
