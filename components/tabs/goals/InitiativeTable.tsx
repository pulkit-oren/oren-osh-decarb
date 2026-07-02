"use client";

/* Initiatives for a goal as an editable table — one row per initiative, inline
   cell editing, impact shown in the goal's metric unit. */

import { Trash2, Sparkles } from "lucide-react";
import { useGoals } from "@/lib/goals/store";
import { PERSONAS, type Persona } from "@/lib/persona";
import { FY_YEARS } from "@/lib/model/types";
import { STATUS_COLOR, STATUS_LABEL, type Initiative, type InitiativeStatus } from "@/lib/goals/types";
import { cn } from "@/lib/utils";

const STATUSES = Object.keys(STATUS_LABEL) as InitiativeStatus[];
const YEARS = [...FY_YEARS, 2028, 2029, 2030, 2035, 2040, 2045, 2050];

const cell = "w-full border border-line rounded-md px-2 py-1 text-sm bg-white focus:outline-none focus:border-brand-400";

export function InitiativeTable({ initiatives, unit }: { initiatives: Initiative[]; unit: string }) {
  const { updateInitiative, deleteInitiative } = useGoals();

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-sm min-w-[920px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-ink-faint border-b border-line/60">
            <th className="text-left font-semibold py-2 px-2">Initiative</th>
            <th className="text-left font-semibold py-2 px-2">Owner</th>
            <th className="text-left font-semibold py-2 px-2">Status</th>
            <th className="text-left font-semibold py-2 px-2">Start</th>
            <th className="text-left font-semibold py-2 px-2">Target</th>
            <th className="text-right font-semibold py-2 px-2">Impact ({unit})</th>
            <th className="text-right font-semibold py-2 px-2">Budget (₹)</th>
            <th className="text-right font-semibold py-2 px-2">Progress</th>
            <th className="py-2 px-2" />
          </tr>
        </thead>
        <tbody>
          {initiatives.map((i) => {
            const set = (patch: Partial<Initiative>) => updateInitiative(i.id, patch);
            return (
              <tr key={i.id} className="border-b border-line/40 align-top">
                <td className="py-2 px-2 min-w-[220px]">
                  <div className="flex items-start gap-2">
                    <span className="mt-2.5 w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOR[i.status] }} />
                    <div className="flex-1 min-w-0">
                      <input className={cell} value={i.name} onChange={(e) => set({ name: e.target.value })} />
                      {i.auto && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-brand-600">
                          <Sparkles size={10} /> auto
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-2 px-2 min-w-[130px]">
                  <select className={cell} value={i.assignee ?? ""} onChange={(e) => set({ assignee: e.target.value ? (e.target.value as Persona) : undefined })}>
                    <option value="">Unassigned</option>
                    {PERSONAS.map((p) => <option key={p.key} value={p.key}>{p.sub} · {p.label}</option>)}
                  </select>
                </td>
                <td className="py-2 px-2 min-w-[120px]">
                  <select className={cell} value={i.status} onChange={(e) => set({ status: e.target.value as InitiativeStatus })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </td>
                <td className="py-2 px-2">
                  <select className={cn(cell, "w-20")} value={i.startYear} onChange={(e) => set({ startYear: Number(e.target.value) })}>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </td>
                <td className="py-2 px-2">
                  <select className={cn(cell, "w-20")} value={i.targetYear} onChange={(e) => set({ targetYear: Number(e.target.value) })}>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </td>
                <td className="py-2 px-2">
                  <input type="number" min={0} className={cn(cell, "w-28 text-right")} value={i.metricImpact} onChange={(e) => set({ metricImpact: e.target.value === "" ? 0 : Number(e.target.value) })} />
                </td>
                <td className="py-2 px-2">
                  <input type="number" min={0} className={cn(cell, "w-28 text-right")} value={i.budget} onChange={(e) => set({ budget: e.target.value === "" ? 0 : Number(e.target.value) })} />
                </td>
                <td className="py-2 px-2">
                  <input type="number" min={0} max={100} className={cn(cell, "w-20 text-right")} value={i.progressPct ?? 0} onChange={(e) => set({ progressPct: Math.max(0, Math.min(100, e.target.value === "" ? 0 : Number(e.target.value))) })} />
                </td>
                <td className="py-2 px-2">
                  <button onClick={() => deleteInitiative(i.id)} aria-label="Delete initiative" className="w-8 h-8 rounded-lg grid place-items-center text-ink-faint hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
