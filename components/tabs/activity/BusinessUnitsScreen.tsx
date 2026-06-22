"use client";

import { useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Nav } from "./shared";

type Props = {
  setNav: (n: Nav) => void;
  buReg: { mode: "central" | "bu"; units: { name: string; aggregate: boolean }[] };
  addBu: (name: string, aggregate: boolean) => void;
  removeBu: (name: string) => void;
  setMode: (mode: "central" | "bu") => void;
};

export function BusinessUnitsScreen({ setNav, buReg, addBu, removeBu, setMode }: Props) {
  const [addingBu, setAddingBu] = useState(false);
  const [buName, setBuName] = useState("");
  const [buAgg, setBuAgg] = useState(true);

  return (
    <div key="bus" className="screen-in flex flex-col gap-5 max-w-3xl">
      <button onClick={() => setNav({ level: "home" })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to activity data</button>
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Business units</h1>
        <p className="text-sm text-ink-soft mt-0.5">Choose how you collect data. Business units apply to every fuel, refrigerant and electricity source.</p>
      </div>

      <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-5">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-3">How is the data collected?</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([["central", "Centrally", "One company-wide figure per source. No business units."], ["bu", "By business unit", "Enter each source per business unit; the totals roll up."]] as const).map(([val, title, desc]) => (
            <button key={val} onClick={() => setMode(val)} className={cn("rounded-xl border-2 p-4 text-left transition-all", buReg.mode === val ? "border-brand-400 bg-brand-50/50" : "border-line hover:border-brand-300")}>
              <div className="flex items-center gap-2">
                <span className={cn("w-4 h-4 rounded-full border-2 grid place-items-center", buReg.mode === val ? "border-brand-500" : "border-line")}>{buReg.mode === val && <span className="w-2 h-2 rounded-full bg-brand-500" />}</span>
                <span className="font-bold text-ink">{title}</span>
              </div>
              <p className="text-xs text-ink-soft mt-1.5 ml-6">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {buReg.mode === "bu" && (
        <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Your business units</div>
            {!addingBu && <button onClick={() => { setAddingBu(true); setBuName(""); setBuAgg(true); }} className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600 transition-colors"><Plus size={14} /> Add BU</button>}
          </div>
          {addingBu && (
            <div className="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b border-line/60">
              <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Name</span>
                <input value={buName} onChange={(e) => setBuName(e.target.value)} placeholder="e.g. Pune plant" className="border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400" /></label>
              <div className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Aggregate into total?</span>
                <div className="inline-flex gap-1 rounded-lg bg-surface-muted p-1">
                  {([["Yes", true], ["No", false]] as const).map(([lbl, val]) => (
                    <button key={lbl} onClick={() => setBuAgg(val)} className={cn("px-4 py-1.5 rounded-md text-xs font-semibold transition-colors", buAgg === val ? "bg-white text-brand-700 shadow-card" : "text-ink-soft")}>{lbl}</button>
                  ))}
                </div></div>
              <button onClick={() => { const nm = buName.trim(); if (nm) { addBu(nm, buAgg); setAddingBu(false); setBuName(""); setBuAgg(true); } }} className="rounded-lg bg-brand-500 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-600 transition-colors">Add</button>
              <button onClick={() => { setAddingBu(false); setBuName(""); }} className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-brand-300 transition-colors">Cancel</button>
            </div>
          )}
          {buReg.units.length === 0 ? (
            <p className="text-sm text-ink-faint">No business units yet — add your first.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {buReg.units.map((u) => (
                <div key={u.name} className="flex items-center gap-3 rounded-xl border border-line/60 px-4 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-surface-muted grid place-items-center text-ink-soft font-bold text-xs shrink-0">{u.name.charAt(0).toUpperCase()}</span>
                  <span className="font-medium text-ink flex-1 truncate">{u.name}</span>
                  <span className={cn("text-[11px] font-semibold", u.aggregate ? "text-brand-700" : "text-amber-700")}>{u.aggregate ? "Aggregated" : "Excluded from total"}</span>
                  <button onClick={() => removeBu(u.name)} className="p-1.5 rounded-lg text-ink-faint hover:text-red-500 transition-colors" aria-label={`Remove ${u.name}`}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-ink-faint mt-3">These business units appear under every fuel, refrigerant and electricity source.</p>
        </div>
      )}
    </div>
  );
}
