"use client";

/* The 24/7 score beside the annual claim.

   Annual coverage answers "did I buy as many clean units as I consumed". The
   hourly score answers "was my consumption clean when it happened". A
   solar-heavy Indian portfolio can be at 100% on the first and far below it on
   the second, and the difference is the storage and the wind contract nobody
   has bought yet.

   The gap is the whole point of this panel, so it is stated as a number rather
   than left for the reader to subtract. */

import { Clock } from "lucide-react";
import { useScope2 } from "@/lib/scope2/store";
import { fmt } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";

export function CfePanel() {
  const { result, levers, updateProcurement } = useScope2();
  const cfe = result.cfe;
  if (cfe.byHour.every((h) => h.loadKwh === 0)) return null;

  const peak = Math.max(...cfe.byHour.map((h) => Math.max(h.loadKwh, h.cleanKwh)), 1);
  const windPct = levers.procurement.contractWindPct ?? 0;

  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Clock size={17} className="text-brand-600" />24/7 carbon-free energy</span>}
        subtitle="Annual coverage nets clean units against consumption over a year. This matches them hour by hour."
      />

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Annual coverage" value={`${cfe.annualMatchedPct.toFixed(0)}%`} sub="the RE100 claim" />
        <Stat label="Hourly matched" value={`${cfe.hourlyMatchedPct.toFixed(0)}%`} sub="the 24/7 CFE score" emphasis />
        <Stat
          label="Gap"
          value={`${cfe.gapPct.toFixed(0)} pts`}
          sub={cfe.gapPct < 1 ? "the claim survives the clock" : "does not survive the clock"}
          tone={cfe.gapPct >= 15 ? "warn" : undefined}
        />
      </div>

      {/* One representative day: load against clean supply, hour by hour. */}
      <div className="mt-5">
        <div className="flex items-end gap-[3px] h-28" role="img" aria-label="Load and clean supply across a representative day">
          {cfe.byHour.map((h) => (
            <div key={h.hour} className="flex-1 flex flex-col justify-end h-full relative" title={`${String(h.hour).padStart(2, "0")}:00 — ${fmt(Math.round(h.matchedKwh))} of ${fmt(Math.round(h.loadKwh))} kWh matched`}>
              <div className="w-full rounded-t-[2px] bg-surface-muted" style={{ height: `${(h.loadKwh / peak) * 100}%` }} />
              <div className="w-full rounded-t-[2px] bg-brand-500 absolute bottom-0" style={{ height: `${(h.matchedKwh / peak) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-ink-faint mt-1.5 font-mono">
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
        </div>
        <div className="flex gap-4 mt-2 text-[11px] text-ink-soft">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-500" />Matched by clean supply</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-surface-muted border border-line" />Drawn from the grid</span>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-line/60 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Wind share of contracts</span>
          <div className="flex items-center gap-2">
            <input
              type="range" min={0} max={100} step={5} value={windPct}
              onChange={(e) => updateProcurement({ contractWindPct: Number(e.target.value) })}
              className="w-44"
              aria-label="Wind share of contracted renewable energy"
            />
            <span className="tabular-nums font-semibold text-ink w-12">{windPct}%</span>
          </div>
        </label>
        <p className="text-[12px] text-ink-soft max-w-[46ch] leading-snug">
          Indian wind is night-biased. Moving contracted volume from solar to wind changes no annual
          number at all and moves the hourly score substantially — which is exactly what annual
          accounting cannot see.
        </p>
      </div>

      <p className="mt-4 text-[11px] text-ink-faint leading-snug">
        One representative day scaled to annual energy — no seasonality, no weather years, no
        forecast error. Good enough to show that an annual claim overstates a solar-heavy portfolio
        and roughly by how much; not a dispatch model, and not a basis for pricing a hedge.
      </p>
    </Card>
  );
}

function Stat({ label, value, sub, emphasis, tone }: {
  label: string; value: string; sub: string; emphasis?: boolean; tone?: "warn";
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${emphasis ? "border-brand-200 bg-brand-50" : "border-line/70 bg-surface"}`}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums mt-0.5 ${tone === "warn" ? "text-amber-600" : "text-ink"}`}>{value}</div>
      <div className="text-[11px] text-ink-faint mt-0.5">{sub}</div>
    </div>
  );
}
