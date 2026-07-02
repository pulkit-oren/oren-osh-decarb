"use client";

/* Environment pillar — pick a topic: Energy & Emissions (the Scope 1+2
   categories), Water, or Waste. Shows each topic's headline number for the
   selected financial year. */

import { ArrowLeft, Zap, Droplets, Recycle, ChevronRight } from "lucide-react";
import { fyLabel } from "@/lib/model/types";
import { fmt } from "@/lib/utils";
import type { WasteYear, WaterYear } from "@/lib/esg/types";
import type { Nav } from "./shared";

export function EnvironmentScreen({
  year, setNav, totalCo2T, totalSources, water, waste,
}: {
  year: number;
  setNav: (n: Nav) => void;
  totalCo2T: number;
  totalSources: number;
  water?: WaterYear;
  waste?: WasteYear;
}) {
  const topics: {
    key: string; title: string; sub: string; icon: React.ElementType;
    grad: string; iconColor: string; value: string; unit: string; target: Nav;
  }[] = [
    {
      key: "energy", title: "Energy & Emissions", sub: `Fuels, refrigerants & electricity · ${totalSources} source${totalSources === 1 ? "" : "s"}`,
      icon: Zap, grad: "linear-gradient(135deg,#FFF7E0,#FCE3A0)", iconColor: "#B45309",
      value: fmt(totalCo2T), unit: "tCO₂e", target: { level: "home" },
    },
    {
      key: "water", title: "Water", sub: "Withdrawal, consumption & discharge",
      icon: Droplets, grad: "linear-gradient(135deg,#EAF6FE,#BFE4FB)", iconColor: "#0369A1",
      value: fmt(water?.withdrawalKl ?? 0), unit: "kL withdrawn", target: { level: "water" },
    },
    {
      key: "waste", title: "Waste", sub: "Generated, disposed & recovered",
      icon: Recycle, grad: "linear-gradient(135deg,#E9FCF0,#BBF3CD)", iconColor: "#15803D",
      value: fmt(waste?.generatedT ?? 0), unit: "t generated", target: { level: "waste" },
    },
  ];

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-10rem)]">
      <div className="rounded-xl3 border border-line/50 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60 px-5 py-4 flex flex-wrap items-end justify-between gap-3 shrink-0">
        <div>
          <button onClick={() => setNav({ level: "esg" })} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink mb-1">
            <ArrowLeft size={15} /> Back to pillars
          </button>
          <h1 className="text-xl font-extrabold text-ink">Environment</h1>
          <p className="text-sm text-ink-soft">Pick a topic to enter your data · {fyLabel(year)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-1 lg:min-h-0">
        {topics.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setNav(t.target)}
              aria-label={t.title}
              style={{ background: t.grad }}
              className="group flex items-center gap-5 rounded-xl3 border border-white/60 shadow-card px-6 text-left flex-1 min-h-[88px] transition-all duration-200 hover:-translate-y-1 hover:shadow-card-lg hover:ring-2 hover:ring-white/80"
            >
              <span className="w-12 h-12 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0 transition-all group-hover:bg-white/85 group-hover:scale-105">
                <Icon size={24} strokeWidth={1.9} style={{ color: t.iconColor }} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-xl font-extrabold text-ink truncate">{t.title}</span>
                <p className="mt-1 text-xs text-ink-soft">{t.sub}</p>
              </div>
              <div className="text-right shrink-0 mr-1">
                <div className="text-base font-extrabold tabular-nums text-ink">{t.value}</div>
                <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">{t.unit}</div>
              </div>
              <ChevronRight size={20} className="text-ink-soft/70 group-hover:text-ink group-hover:translate-x-1 transition-all shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
