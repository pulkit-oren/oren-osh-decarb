"use client";

import { Database, Wand2, ClipboardList, Snowflake, GitCompare, Settings, LogOut, LayoutDashboard, Wallet, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { lensTabs, type Persona } from "@/lib/persona";
import { OrenLogo } from "./ui/OrenLogo";

export type Scope = "s1" | "s2";
export type TabKey = "overview" | "goals" | "data" | "builder" | "action" | "finance" | "refrigerant" | "compare";
// Kept as an alias so existing imports stay valid; navigation is now a single logical set.
export type AnyTabKey = TabKey;

const NAV: { key: TabKey; icon: React.ElementType; label: string }[] = [
  { key: "overview", icon: LayoutDashboard, label: "Overview" },
  { key: "goals", icon: Target, label: "Goals & targets" },
  { key: "data", icon: Database, label: "Data input" },
  { key: "builder", icon: Wand2, label: "Scenario modeller" },
  { key: "action", icon: ClipboardList, label: "Action plan" },
  { key: "finance", icon: Wallet, label: "Finance" },
  { key: "refrigerant", icon: Snowflake, label: "Refrigerant advisor" },
  { key: "compare", icon: GitCompare, label: "Compare & track" },
];

function navFor(persona: Persona) {
  const allowed = new Set<TabKey>(lensTabs(persona));
  return NAV.filter((n) => allowed.has(n.key));
}

export function Sidebar({
  tab, setTab, persona,
}: {
  tab: AnyTabKey;
  setTab: (t: AnyTabKey) => void;
  persona: Persona;
}) {
  return (
    <aside className="w-[88px] shrink-0 flex-col items-center py-4 gap-4 hidden md:flex">
      <div
        className="w-14 h-14 rounded-2xl bg-white shadow-card flex items-center justify-center lift"
        title="Oren · Sustainability Simplified"
      >
        <OrenLogo size={30} />
      </div>

      <nav className="bg-white rounded-2xl shadow-card p-2 flex flex-col gap-1">
        {navFor(persona).map(({ key, icon: Icon, label }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-label={label}
              aria-current={active}
              className={cn(
                "w-[64px] py-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-300",
                active
                  ? "bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-[0_8px_20px_rgba(31,158,90,0.35)]"
                  : "text-ink-soft hover:bg-surface-muted hover:text-ink",
              )}
            >
              <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
              <span className={cn("text-[9px] font-semibold leading-tight text-center", active ? "text-white" : "text-ink-faint")}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto bg-white rounded-2xl shadow-card p-2 flex flex-col gap-1">
        <button className="w-12 h-12 rounded-xl flex items-center justify-center text-ink-soft hover:bg-surface-muted" title="Settings">
          <Settings size={20} strokeWidth={1.8} />
        </button>
        <button className="w-12 h-12 rounded-xl flex items-center justify-center text-ink-soft hover:bg-surface-muted" title="Sign out">
          <LogOut size={20} strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  );
}

/** Mobile bottom tab bar — the rail collapses below md. */
export function MobileNav({
  tab, setTab, persona,
}: {
  tab: AnyTabKey;
  setTab: (t: AnyTabKey) => void;
  persona: Persona;
}) {
  return (
    <nav className="md:hidden fixed bottom-3 left-3 right-3 z-30 bg-white rounded-2xl shadow-card-lg border border-line/40 p-1.5 flex items-center gap-1">
      <div className="flex-1 flex justify-around">
        {navFor(persona).map(({ key, icon: Icon, label }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-label={label}
              aria-current={active}
              className={cn(
                "flex-1 h-11 rounded-xl flex items-center justify-center transition-all",
                active ? "bg-brand-500 text-white" : "text-ink-soft",
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
