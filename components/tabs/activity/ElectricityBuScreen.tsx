"use client";

import { ArrowLeft } from "lucide-react";
import { GRAD, CAT_ICON, ICON_COLOR, ELEC_TYPES, type Nav } from "./shared";
import { fyLabel } from "@/lib/model/types";
import { fmt } from "@/lib/utils";
import { FacilityDetailContent } from "../../scope2/DataInputTab";
import { Collapsible } from "./Collapsible";
import type { Facility } from "@/lib/scope2/model/types";

type Props = {
  bu: string;
  year: number;
  ensureFacility: (instrumentKey: string) => string;
  facById: (id: string) => Facility | undefined;
  updateFacility: (year: number, id: string, patch: Partial<Facility>) => void;
  co2Fac: (id: string) => number;
  setNav: (n: Nav) => void;
};

export function ElectricityBuScreen({ bu, year, ensureFacility, facById, updateFacility, co2Fac, setNav }: Props) {
  const Icon = CAT_ICON.electricity;
  // Resolve each instrument's facility (create on first render so values bind).
  const rows = ELEC_TYPES.map((t) => ({ t, id: ensureFacility(t.key) }));
  const gridRow = rows.find((r) => r.t.key === "grid")!;
  const gridFac = facById(gridRow.id);
  const total = rows.reduce((s, r) => s + co2Fac(r.id), 0);
  const title = bu || "Central (company-wide)";

  return (
    <div key={`elecbu-${bu}`} className="screen-in flex flex-col gap-5">
      <button onClick={() => setNav({ level: "cat", key: "electricity" })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to Electricity</button>
      <div style={{ background: GRAD.electricity }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4">
        <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><Icon size={28} strokeWidth={1.9} style={{ color: ICON_COLOR.electricity }} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-ink truncate">{title}</h1>
          <p className="text-sm font-medium text-ink-soft mt-0.5">Electricity · Scope 2 · {fyLabel(year)}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div>
          <div className="text-3xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(total)}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div>
        </div>
      </div>

      <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
        <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-4">Electricity by source (kWh/yr)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {rows.map(({ t, id }) => {
            const f = facById(id);
            return (
              <label key={t.key} className="block rounded-xl border border-line/70 p-4">
                <span className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{t.label}</span>
                  <span className="text-xs font-semibold tabular-nums text-brand-600">{fmt(co2Fac(id))} t</span>
                </span>
                <span className="text-[11px] text-ink-faint">{t.sub}</span>
                <span className="mt-2 flex items-center gap-2">
                  <input type="number" value={f?.annualLoadKwh ?? 0} onChange={(e) => updateFacility(year, id, { annualLoadKwh: Number(e.target.value) })} className="w-full text-right tabular-nums rounded-lg border border-brand-200 bg-brand-50/50 px-2.5 py-2 text-base focus:outline-none focus:border-brand-400 focus:bg-white" aria-label={`${title} ${t.label}`} />
                  <span className="text-xs text-ink-faint w-10">kWh</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-ink-faint mt-3">Only purchased grid electricity carries emissions; VPPA, solar and I-REC are clean (0 tCO₂e).</p>
      </div>

      {gridFac && (
        <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-4">Details for the scenario modeller</div>
          <FacilityDetailContent f={gridFac} year={year} locationT={co2Fac(gridRow.id)} />
        </div>
      )}

      <Collapsible title="How this is calculated">
        <p className="text-sm text-ink-soft">Location-based Scope 2 = purchased grid load × grid emission factor.</p>
        {gridFac && <p className="mt-2 text-sm font-mono text-ink-soft break-words">{fmt(gridFac.annualLoadKwh)} kWh × {gridFac.gridEf} kgCO₂e/kWh ÷ 1,000 = {fmt(co2Fac(gridRow.id))} tCO₂e</p>}
      </Collapsible>
    </div>
  );
}
