"use client";

/* Refrigerant advisor — answer first: what should WE swap, and what is
   it worth in tonnes. The 30-gas reference library stays one click away
   so the page reads clean for an executive. */

import { useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, Clock3, Leaf, ShieldAlert, Snowflake } from "lucide-react";
import { useScenario } from "@/lib/store";
import { REFRIGERANTS } from "@/lib/model/factors";
import { refrigerantCO2e } from "@/lib/model/baseline";
import type { RefrigerantEra, RefrigerantFactor, RefrigerantId } from "@/lib/model/types";
import { cn, fmt, fmtNum, pct } from "@/lib/utils";
import { groupByBu } from "@/lib/group-by-bu";
import { Card, CardHeader } from "../ui/Card";
import { HowTo } from "../ui/HowTo";
import { InfoTip } from "../ui/InfoTip";

const ALL = Object.values(REFRIGERANTS);
const MAX_GWP = Math.max(...ALL.map((r) => r.gwp));

const ERA_META: Record<RefrigerantEra, { title: string; blurb: string; icon: React.ElementType; chip: string; accent: string }> = {
  legacy: { title: "Phase out", blurb: "High-impact gases being retired under the Kigali Amendment — plan exits now.", icon: Clock3, chip: "bg-amber-50 text-amber-700 border-amber-200", accent: "#D9774B" },
  current: { title: "Transitional", blurb: "Acceptable today, but plan replacements at the next retrofit.", icon: ShieldAlert, chip: "bg-slate-100 text-slate-600 border-slate-200", accent: "#2E5E8C" },
  future: { title: "Move toward", blurb: "Natural refrigerants with near-zero climate impact. Mind the safety class.", icon: Leaf, chip: "bg-brand-50 text-brand-700 border-brand-200", accent: "#1F9E5A" },
};

/** Recommended low-GWP swap for each incumbent. */
const RECO: Partial<Record<RefrigerantId, RefrigerantId>> = {
  R12: "R290", R11: "R744", R502: "R744", R22: "R290", R23: "R744",
  R143a: "R744", R507A: "R744", R404A: "R290", R125: "R454B", R408A: "R290",
  R422D: "R290", R417A: "R290", R410A: "R454B", R407C: "R290", R409A: "R290",
  R407F: "R744", R134a: "R1234yf", R449A: "R744", R448A: "R744",
  R513A: "R1234yf", R450A: "R1234yf", R32: "R290", R454B: "R290", R152a: "R290",
};

export function RefrigerantTab() {
  const { baseSystems } = useScenario();
  // Bug fix: exclude systems flagged as excluded from the advisor
  const systems = baseSystems.filter((s) => !s.excluded);
  // Group by BU (Company-wide first)
  const groups = groupByBu(systems);

  return (
    <div className="flex flex-col gap-6">
      {/* 1 — the answer: recommendations for the user's own systems */}
      <Card>
        <CardHeader
          title="Your systems — recommended swaps"
          subtitle="Based on the cooling systems entered in Data input"
          right={<HowTo points={[
            "Every kilogram of refrigerant that leaks acts like hundreds or thousands of kilograms of CO₂ — that multiplier is the gas's GWP (global warming potential).",
            '"Today" is the CO₂e your system leaks per year at its current charge and leak rate.',
            '"After swap" estimates the same leak with the recommended gas, adjusted for the smaller charge natural refrigerants need.',
            "Swaps are applied in the Scenario modeller via the gas-switch lever.",
          ]} />}
        />
        {systems.length === 0 ? (
          <p className="text-sm text-ink-faint">No cooling systems entered yet — add them in Data input (step 1).</p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map(([bu, groupSystems]) => (
              <div key={bu || "__company_wide__"}>
                <div className="text-[11px] uppercase tracking-wider text-ink-faint font-bold mb-2">
                  {bu || "Company-wide"}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {groupSystems.map((s) => {
                    const cur = REFRIGERANTS[s.refrigerant];
                    const targetId = RECO[s.refrigerant];
                    const tgt = targetId ? REFRIGERANTS[targetId] : null;
                    const nowT = refrigerantCO2e(s);
                    const afterT = tgt ? nowT * ((tgt.gwp * tgt.volAdj) / cur.gwp) : nowT;
                    const cut = tgt ? 1 - afterT / Math.max(nowT, 1e-9) : 0;
                    return (
                      <div key={s.id} className="rounded-xl2 border border-line/70 p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-brand-50 grid place-items-center text-brand-600 shrink-0">
                            <Snowflake size={17} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-ink truncate">{s.name}</div>
                            <div className="text-xs text-ink-faint">{fmt(s.toppedUpKg)} kg topped up/yr (= leaked)</div>
                          </div>
                          {tgt ? (
                            <span className="ml-auto shrink-0 text-sm font-extrabold text-brand-600 bg-brand-50 rounded-full px-3 py-1">
                              −{pct(cut)}
                            </span>
                          ) : (
                            <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
                              <CheckCircle2 size={14} /> already low-impact
                            </span>
                          )}
                        </div>
                        {tgt && (
                          <>
                            <div className="mt-3 flex items-center gap-2 flex-wrap">
                              <span className="text-xs rounded-md bg-surface-muted px-2 py-1 text-ink-soft font-medium">
                                {cur.label} <span className="text-ink-faint">· GWP {fmt(cur.gwp)}</span>
                              </span>
                              <ArrowRight size={14} className="text-ink-faint shrink-0" />
                              <span className="text-xs rounded-md bg-brand-50 text-brand-700 px-2 py-1 font-semibold" title={tgt.note}>
                                {tgt.label} <span className="font-normal">· GWP {fmt(tgt.gwp)}</span>
                              </span>
                            </div>
                            <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2 text-sm">
                              <span className="text-ink-soft">Leak emissions: <strong className="text-ink tabular-nums">{fmtNum(nowT, 1)}</strong> t/yr today</span>
                              <ArrowRight size={13} className="text-ink-faint shrink-0 mx-2" />
                              <span className="text-brand-700 font-semibold tabular-nums">≈ {fmtNum(afterT, 1)} t/yr after swap</span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 2 — the three families, compact */}
      <Card>
        <CardHeader
          title="The three families of cooling gas"
          subtitle="Every gas falls in one of three buckets — the strategy writes itself"
          right={<HowTo points={[
            "GWP = how many kg of CO₂ one leaked kg of gas equals over 100 years. Lower is better.",
            "Phase out: high-GWP gases with a regulatory end date — every retrofit should move off these.",
            "Transitional: fine to run today, but don't design new systems around them.",
            "Move toward: natural gases (propane, CO₂, ammonia) with GWP near zero — check the safety class with your engineer.",
            "Hover any gas chip for its handling note.",
          ]} />}
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(["legacy", "current", "future"] as RefrigerantEra[]).map((era) => {
            const m = ERA_META[era];
            const Icon = m.icon;
            const gases = ALL.filter((r) => r.era === era).sort((a, b) => b.gwp - a.gwp);
            const range = `${fmt(Math.min(...gases.map((g) => g.gwp)))} – ${fmt(Math.max(...gases.map((g) => g.gwp)))}`;
            return (
              <div key={era} className="rounded-xl2 border border-line/70 p-4">
                <div className="flex items-center gap-2">
                  <Icon size={16} style={{ color: m.accent }} />
                  <h3 className="font-semibold text-ink">{m.title}</h3>
                  <span className="ml-auto text-[11px] font-semibold text-ink-faint tabular-nums">GWP {range}</span>
                </div>
                <p className="text-xs text-ink-soft mt-1.5 mb-3 leading-snug">{m.blurb}</p>
                <div className="flex flex-wrap gap-1.5">
                  {gases.map((r) => (
                    <span
                      key={r.id}
                      title={`${r.label} · GWP ${fmt(r.gwp)} — ${r.note}`}
                      className={cn("text-[11px] font-medium px-2 py-1 rounded-full border cursor-help", m.chip)}
                    >
                      {r.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 3 — full GWP chart, tucked behind a toggle */}
      <GwpLibrary />
    </div>
  );
}

/** The full 30-gas GWP bar chart — reference material, collapsed by default. */
function GwpLibrary() {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div>
          <h3 className="font-semibold text-ink">Full comparison — all {ALL.length} gases</h3>
          <p className="text-sm text-ink-soft mt-0.5">The complete GWP reference chart, for when the engineering team asks.</p>
        </div>
        <span className="w-8 h-8 rounded-full bg-surface-muted grid place-items-center text-ink-soft shrink-0">
          <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="mt-4 space-y-2.5">
          <div className="flex items-center gap-3 text-[11px] text-ink-faint">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: ERA_META.legacy.accent }} /> phase out</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: ERA_META.current.accent }} /> transitional</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: ERA_META.future.accent }} /> move toward</span>
            <InfoTip text="Bar length = GWP: the kg of CO₂ that one leaked kg of this gas equals over 100 years (AR5). Lower is better." />
          </div>
          {[...ALL].sort((a, b) => b.gwp - a.gwp).map((r: RefrigerantFactor, idx) => (
            <div key={r.id} className="flex items-center gap-3">
              <span className="w-28 text-sm font-medium text-ink shrink-0">{r.label}</span>
              <div className="flex-1 h-6 rounded-md bg-surface-muted overflow-hidden">
                <div
                  className="h-full rounded-md flex items-center justify-end pr-2 text-[11px] font-semibold text-white min-w-[2px] bar-in"
                  style={{
                    width: `${Math.max(1.5, (r.gwp / MAX_GWP) * 100)}%`,
                    background: `linear-gradient(90deg, ${ERA_META[r.era].accent}B8, ${ERA_META[r.era].accent})`,
                    ["--bar-i" as string]: Math.min(idx, 12),
                  }}
                >
                  {r.gwp >= 200 ? fmt(r.gwp) : ""}
                </div>
              </div>
              {r.gwp < 200 && <span className="text-xs font-semibold text-ink w-10">{fmt(r.gwp)}</span>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
