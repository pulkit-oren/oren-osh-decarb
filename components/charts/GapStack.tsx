"use client";

/* Which levers are closing the gap, and how much is still open.

   The balance screen already computed every number in here — tonnes required,
   tonnes allocated, the shortfall, and the contribution of each lever family —
   and rendered them as a row of figures. One stacked bar answers the question a
   figure list makes you assemble in your head, and it moves as a dial moves.

   Capped and linear, never radial. When a mix over-delivers the bar stops at
   the target and the surplus is stated in words: an arc sweeping past its own
   end is a picture of a number that does not exist. */

import { familyColor } from "@/lib/model/palette";
import { fmt } from "@/lib/utils";

export interface GapSegment {
  key: string;
  label: string;
  tonnes: number;
  colorIdx: number;
}

/** Below this share of the bar a segment cannot carry its own label legibly, so
 *  the label moves to the legend rather than being drawn on top of itself. */
const LABEL_MIN_SHARE = 0.09;

export function GapStack({
  segments, requiredT, targetPct, targetYear,
}: {
  segments: GapSegment[];
  requiredT: number;
  targetPct: number;
  targetYear: number;
}) {
  const active = segments.filter((s) => s.tonnes > 0.05).sort((a, b) => b.tonnes - a.tonnes);
  const allocatedT = active.reduce((s, x) => s + x.tonnes, 0);

  if (requiredT <= 0) {
    return (
      <p className="text-sm text-ink-faint">
        Set a target above zero to see what has to close the gap.
      </p>
    );
  }

  const over = allocatedT > requiredT;
  const shortfallT = Math.max(0, requiredT - allocatedT);
  /* The bar's denominator is the TARGET, so a full bar always means "target
     met" and never "as much as this mix happens to deliver". Over-delivery is
     said in words below, not drawn past the end. */
  const scale = over ? allocatedT : requiredT;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <p className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">
          Closing the gap to {targetPct}% by {targetYear}
        </p>
        <p className="text-[11px] text-ink-soft tabular-nums">
          {fmt(allocatedT)} of {fmt(requiredT)} tCO₂e allocated
        </p>
      </div>

      <div
        className="flex h-9 rounded-lg overflow-hidden border border-line/70"
        role="img"
        aria-label={
          `${fmt(allocatedT)} of ${fmt(requiredT)} tonnes allocated. ` +
          active.map((s) => `${s.label} ${fmt(s.tonnes)}`).join(", ") +
          (shortfallT > 0 ? `. Short by ${fmt(shortfallT)} tonnes.` : "")
        }
      >
        {active.map((s) => {
          const share = s.tonnes / scale;
          return (
            <div
              key={s.key}
              className="grid place-items-center min-w-0 transition-[flex-basis] duration-300"
              style={{ flex: `0 0 ${share * 100}%`, background: familyColor(s.colorIdx) }}
              title={`${s.label} — ${fmt(s.tonnes)} tCO₂e`}
            >
              {share >= LABEL_MIN_SHARE && (
                <span className="text-[11px] font-bold text-white/95 truncate px-2">
                  {fmt(s.tonnes)}
                </span>
              )}
            </div>
          );
        })}

        {shortfallT > 0 && (
          <div
            className="grid place-items-center min-w-0 text-ink-soft"
            style={{
              flex: `0 0 ${(shortfallT / scale) * 100}%`,
              backgroundImage:
                "repeating-linear-gradient(45deg, var(--color-surface-muted) 0 6px, transparent 6px 12px)",
            }}
            title={`Still to find — ${fmt(shortfallT)} tCO₂e`}
          >
            {shortfallT / scale >= LABEL_MIN_SHARE && (
              <span className="text-[11px] font-bold truncate px-2">short {fmt(shortfallT)}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
        {active.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: familyColor(s.colorIdx) }} />
            {s.label}
            <span className="tabular-nums font-semibold text-ink">{fmt(s.tonnes)} t</span>
          </span>
        ))}
        {shortfallT > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0 border border-line"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, var(--color-surface-muted) 0 3px, transparent 3px 6px)" }}
            />
            Still to find
            <span className="tabular-nums font-semibold text-ink">{fmt(shortfallT)} t</span>
          </span>
        )}
      </div>

      {over && (
        <p className="text-[11px] text-brand-700 mt-2">
          This mix over-delivers by <strong>{fmt(allocatedT - requiredT)} tCO₂e</strong> — enough for{" "}
          <strong>{Math.round((allocatedT / requiredT) * targetPct)}%</strong> against the{" "}
          {targetPct}% asked for. The bar is drawn to what the mix delivers, so the target sits
          inside it.
        </p>
      )}
    </div>
  );
}
