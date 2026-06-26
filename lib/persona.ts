import type { TabKey } from "@/components/Sidebar";

export type Persona = "esg" | "ceo" | "plant" | "cfo";

export const DEFAULT_PERSONA: Persona = "esg";

export const PERSONAS: { key: Persona; label: string; sub: string; dotClass: string }[] = [
  { key: "esg",   label: "ESG Lead",   sub: "Amit",   dotClass: "bg-oren-500" },
  { key: "ceo",   label: "CEO",        sub: "Raghav", dotClass: "bg-info" },
  { key: "plant", label: "Plant Head", sub: "Priya",  dotClass: "bg-brand-500" },
  { key: "cfo",   label: "CFO",        sub: "Neha",   dotClass: "bg-warn" },
];

// Logical tabs visible per persona, in display order. ESG = everything.
// Scope (1 vs 2) is chosen in-page on the dual-scope tabs, not here.
const LENS: Record<Persona, TabKey[]> = {
  esg:   ["data", "builder", "action", "refrigerant", "compare"],
  plant: ["data", "builder", "action"],
  cfo:   ["finance", "action", "compare"],
  ceo:   ["overview", "compare"],
};

export function lensTabs(persona: Persona): TabKey[] {
  return LENS[persona];
}

export function personaLanding(persona: Persona): TabKey {
  return LENS[persona][0];
}

export function isPersona(v: unknown): v is Persona {
  return v === "esg" || v === "ceo" || v === "plant" || v === "cfo";
}

export const personaStorageKey = (companyId: string) => `osh-persona-v1::${companyId}`;
