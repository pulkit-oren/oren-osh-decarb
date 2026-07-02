"use client";

/* E / S / G pre-screen — the Data-input entry point. Environment opens the
   pillar screen (Energy & Emissions / Water / Waste); Social and Governance
   are placeholders until their data models land. */

import { Leaf, Users, Landmark, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Nav } from "./shared";

const PILLARS: {
  key: string;
  letter: string;
  title: string;
  blurb: string;
  icon: React.ElementType;
  grad: string;
  target?: Nav;
}[] = [
  {
    key: "e", letter: "E", title: "Environment",
    blurb: "Energy & emissions · Water · Waste",
    icon: Leaf, grad: "linear-gradient(150deg,#1F9E5A,#0C5A34)",
    target: { level: "env" },
  },
  {
    key: "s", letter: "S", title: "Social",
    blurb: "Workforce, safety & community — coming soon",
    icon: Users, grad: "linear-gradient(150deg,#0C86C4,#08517A)",
  },
  {
    key: "g", letter: "G", title: "Governance",
    blurb: "Board, ethics & compliance — coming soon",
    icon: Landmark, grad: "linear-gradient(150deg,#5A6B7E,#2E3A48)",
  },
];

export function EsgScreen({ setNav }: { setNav: (n: Nav) => void }) {
  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-10rem)]">
      <div className="rounded-xl3 border border-line/50 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60 px-5 py-4 shrink-0">
        <h1 className="text-xl font-extrabold text-ink">Data input</h1>
        <p className="text-sm text-ink-soft">Pick a pillar to enter your ESG data.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:flex-1 lg:min-h-0">
        {PILLARS.map((p) => {
          const Icon = p.icon;
          const enabled = !!p.target;
          return (
            <button
              key={p.key}
              onClick={() => p.target && setNav(p.target)}
              disabled={!enabled}
              aria-label={p.title}
              style={{ background: p.grad }}
              className={cn(
                "group flex flex-col rounded-xl3 shadow-card-lg px-6 py-6 text-left text-white min-h-[190px] lg:h-full transition-all duration-200",
                enabled
                  ? "hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.22)] hover:ring-2 hover:ring-white/40 cursor-pointer"
                  : "opacity-80 cursor-not-allowed",
              )}
            >
              <span className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm grid place-items-center shrink-0 text-2xl font-extrabold text-white transition-all group-hover:bg-white/30">
                {p.letter}
              </span>
              <span className="mt-4 flex items-center gap-2 text-2xl font-extrabold text-white">
                <Icon size={22} strokeWidth={1.9} /> {p.title}
              </span>
              <p className="mt-1 text-sm text-white/85">{p.blurb}</p>
              <div className="mt-auto pt-4">
                {enabled ? (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-white">
                    Open <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 bg-white/20 text-white/90">Coming soon</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
