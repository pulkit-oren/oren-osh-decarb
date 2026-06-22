"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const STEPS: { tag: string; label: string; desc: string }[] = [
  { tag: "01 · Data input", label: "Data input", desc: "Enter Scope 1 combustion assets and refrigeration systems. The baseline footprint is computed bottom-up from emission factors." },
  { tag: "02 · Baseline", label: "Baseline", desc: "Each asset becomes energy (kJ) and tonnes CO₂e using DEFRA 2025 factors and refrigerant GWPs." },
  { tag: "03 · Build scenario", label: "Build scenario", desc: "Apply the fuel-switch, electrification and refrigerant levers, each with a start year and a ramp. This is the view below." },
  { tag: "04 · Simulate", label: "Simulate", desc: "Recompute the year-by-year trajectory, stacking levers so no tonne is abated twice." },
  { tag: "05 · Compare", label: "Compare", desc: "Save scenarios and view them side by side on reduction, cost and timeline." },
  { tag: "06 · Track target", label: "Track target", desc: "Visualise progress against the SBTi 1.5°C line year over year." },
  { tag: "07 · Export", label: "Export", desc: "Inputs, factors and results stay reproducible and assurance-ready." },
];

export function Stepper({ activeIndex = 2 }: { activeIndex?: number }) {
  const [sel, setSel] = useState(activeIndex);
  const current = STEPS[sel];
  return (
    <div>
      <ol className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2" aria-label="Workflow steps">
        {STEPS.map((s, i) => {
          const active = i === sel;
          return (
            <li key={s.tag}>
              <button
                type="button"
                onClick={() => setSel(i)}
                aria-current={active}
                className={cn(
                  "w-full text-left rounded-xl border p-2.5 transition-all",
                  active
                    ? "bg-white text-ink border-white shadow-card"
                    : "bg-white/10 text-white border-white/20 hover:bg-white/20",
                )}
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-md grid place-items-center text-xs font-semibold mb-1.5 tabular-nums",
                    active ? "bg-brand-50 text-brand-700" : "bg-white/15 text-white",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="text-[12px] font-semibold leading-tight">{s.label}</div>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 rounded-xl bg-white/12 backdrop-blur px-4 py-2.5 flex items-start gap-3">
        <span className="text-[11px] uppercase tracking-wide font-semibold bg-white text-brand-700 rounded-md px-2 py-1 whitespace-nowrap">
          {current.tag}
        </span>
        <p className="text-sm text-white/90 leading-snug">{current.desc}</p>
      </div>
    </div>
  );
}
