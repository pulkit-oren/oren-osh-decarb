"use client";

import { useState } from "react";
import { Bell, Search, ChevronDown, Check } from "lucide-react";
import { CompanySwitcher } from "./CompanySwitcher";
import { PERSONAS, type Persona } from "@/lib/persona";
import { cn } from "@/lib/utils";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import { fyLabel } from "@/lib/model/types";
import type { AnyTabKey, Scope } from "./Sidebar";

const TITLES: Record<string, { eyebrow: string; title: string }> = {
  overview: { eyebrow: "Boardroom", title: "Scope 1 overview" },
  data: { eyebrow: "Step 1 · Baseline", title: "Activity data" },
  builder: { eyebrow: "Step 2", title: "Decarbonization Scenario Modeller" },
  action: { eyebrow: "Step 3", title: "Action plan" },
  finance: { eyebrow: "Finance", title: "Scope 1 business case" },
  refrigerant: { eyebrow: "Advisory", title: "Refrigerant advisor" },
  compare: { eyebrow: "Step 4", title: "Compare & track to target" },
  overview2: { eyebrow: "Boardroom", title: "Scope 2 overview" },
  data2: { eyebrow: "Step 1 · Baseline", title: "Activity data" },
  builder2: { eyebrow: "Step 2", title: "Scope 2 Scenario Modeller" },
  action2: { eyebrow: "Step 3", title: "Scope 2 action plan" },
  compare2: { eyebrow: "Step 4", title: "Compare & track to target" },
};

export function Topbar({ scope, tab, persona, setPersona }: {
  scope: Scope; tab: AnyTabKey; persona: Persona; setPersona: (p: Persona) => void;
}) {
  const t = TITLES[tab];
  const s1 = useScenario();
  const s2 = useScope2();
  const [menuOpen, setMenuOpen] = useState(false);
  const activePersona = PERSONAS.find((p) => p.key === persona) ?? PERSONAS[0];

  const baseYear = scope === "s1" ? s1.baseYear : s2.baseYear;

  return (
    <header className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p className="text-xs uppercase tracking-wider text-brand-600 font-bold">{t.eyebrow}</p>
        <h1 className="text-xl md:text-2xl font-extrabold text-ink leading-tight mt-0.5">{t.title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <CompanySwitcher />
        <div className="rounded-full bg-surface-muted border border-line/60 px-3.5 py-2 text-sm flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">Base year</span>
          <span className="font-semibold tabular-nums">{fyLabel(baseYear)}</span>
        </div>
        <button className="w-9 h-9 rounded-full bg-surface-muted border border-line/60 grid place-items-center text-ink-soft hover:bg-line/40" aria-label="Search">
          <Search size={16} />
        </button>
        <button className="w-9 h-9 rounded-full bg-surface-muted border border-line/60 grid place-items-center text-ink-soft hover:bg-line/40" aria-label="Notifications">
          <Bell size={16} />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Switch persona view"
            className="flex items-center gap-2 rounded-full border border-line/60 bg-surface-muted pl-1 pr-2.5 py-1 hover:bg-line/40 transition-colors"
          >
            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white text-xs font-bold">{activePersona.sub.charAt(0)}</span>
            <span className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-xs font-bold text-ink">{activePersona.label}</span>
              <span className="text-[10px] text-ink-faint">{activePersona.sub}</span>
            </span>
            <ChevronDown size={14} className={cn("text-ink-faint transition-transform", menuOpen && "rotate-180")} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-surface shadow-card-lg z-50 p-1.5" role="menu">
                <p className="px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-ink-faint font-bold">View as</p>
                {PERSONAS.map((p) => {
                  const on = p.key === persona;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={on}
                      onClick={() => { setPersona(p.key); setMenuOpen(false); }}
                      className={cn("w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors", on ? "bg-brand-50" : "hover:bg-surface-muted")}
                    >
                      <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", p.dotClass)} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-ink">{p.label}</span>
                        <span className="block text-[11px] text-ink-faint">{p.sub}</span>
                      </span>
                      {on && <Check size={14} className="text-brand-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
