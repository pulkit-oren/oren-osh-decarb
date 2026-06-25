"use client";

import { ArrowLeft, Leaf } from "lucide-react";
import { GRAD, ICON_COLOR } from "./shared";
import { FUELS } from "@/lib/model/factors";
import { fyLabel } from "@/lib/model/types";
import { fmt } from "@/lib/utils";
import type { CombustionAsset } from "@/lib/model/types";

type Row = { a: CombustionAsset; t: number };

export function BiogenicScreen({ rows, total, year, onBack }: { rows: Row[]; total: number; year: number; onBack: () => void }) {
  const sorted = [...rows].sort((x, y) => y.t - x.t);
  return (
    <div className="screen-in flex flex-col gap-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit">
        <ArrowLeft size={16} /> All activity data
      </button>

      {/* Themed header */}
      <div style={{ background: GRAD.biomass }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4">
        <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0">
          <Leaf size={28} strokeWidth={1.9} style={{ color: ICON_COLOR.biomass }} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-ink leading-tight">Biogenic CO₂</h1>
          <p className="text-sm font-medium text-ink-soft mt-0.5">Outside of Scopes · {fyLabel(year)} · {sorted.length} source{sorted.length === 1 ? "" : "s"}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Total</div>
          <div className="text-3xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(total)} <span className="text-base font-semibold text-ink-soft">tCO₂e</span></div>
        </div>
      </div>

      <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-4 text-sm text-ink-soft">
        Biomass fuels release <strong className="text-ink">biogenic CO₂</strong>. Under the GHG Protocol and BRSR this is reported
        <strong className="text-ink"> separately from Scope 1</strong> (shown here, not in your gross total). Only the CH₄ and N₂O from
        burning these fuels stay in Scope 1.
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl3 border border-dashed border-line/70 bg-surface-muted/30 px-6 py-12 text-center">
          <p className="text-sm text-ink-faint">No biomass / biofuel sources with consumption yet.</p>
        </div>
      ) : (
        <div className="rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden divide-y divide-line/40">
          {sorted.map(({ a, t }) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: ICON_COLOR.biomass }} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {a.name}
                <span className="text-ink-faint font-normal"> · {FUELS[a.fuelType]?.label ?? a.fuelType}{a.bu ? ` · ${a.bu}` : ""}</span>
              </span>
              <span className="text-sm font-semibold tabular-nums shrink-0 w-24 text-right">{fmt(t)} t</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
