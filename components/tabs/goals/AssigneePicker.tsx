"use client";

/* Assign a goal or initiative to one of the built-in personas. */

import { PERSONAS, type Persona } from "@/lib/persona";
import { cn } from "@/lib/utils";

export function personaLabel(p: Persona): string {
  const found = PERSONAS.find((x) => x.key === p);
  return found ? `${found.sub} · ${found.label}` : p;
}

export function AssigneeAvatar({ persona, size = 24 }: { persona?: Persona; size?: number }) {
  const found = PERSONAS.find((x) => x.key === persona);
  return (
    <span
      className={cn("rounded-full grid place-items-center text-white text-[11px] font-bold shrink-0", found ? "bg-gradient-to-br from-brand-500 to-brand-700" : "bg-ink-faint")}
      style={{ width: size, height: size }}
      title={found ? personaLabel(persona!) : "Unassigned"}
    >
      {found ? found.sub.charAt(0) : "?"}
    </span>
  );
}

export function AssigneePicker({
  value, onChange, label = "Owner",
}: {
  value?: Persona; onChange: (p: Persona | undefined) => void; label?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-ink-faint font-bold mb-1">{label}</span>
      <select
        className="w-full text-sm border border-line rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? (e.target.value as Persona) : undefined)}
      >
        <option value="">Unassigned</option>
        {PERSONAS.map((p) => (
          <option key={p.key} value={p.key}>{p.sub} · {p.label}</option>
        ))}
      </select>
    </label>
  );
}
