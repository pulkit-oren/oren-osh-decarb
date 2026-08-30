"use client";

/* When the money lands.

   The finance engine has produced a per-year series for every lever since it
   was rebuilt — capex, operating delta and net cash, year by year — and nothing
   anywhere charted it. The plan reported a total and a peak-funding figure,
   which is not what anyone approves: a board approves a number in a year.

   Bars are capital out, stacked by lever family. The line is the cumulative
   undiscounted cash position, so its lowest point IS the peak funding number
   printed elsewhere — the same quantity, finally shown as the shape it is. */

import { familyColor } from "@/lib/model/palette";
import { CURRENCY } from "@/lib/defaults";
import { fmt } from "@/lib/utils";

export interface CapitalSeriesLever {
  id: string;
  label: string;
  colorIdx: number;
  series: { year: number; capex: number; net: number }[];
}

const W = 640, H = 210, PAD_L = 46, PAD_R = 12, PAD_T = 14, PAD_B = 34;

export function CapitalByYear({ levers, endYear = 2035 }: { levers: CapitalSeriesLever[]; endYear?: number }) {
  const withCapex = levers.filter((l) => l.series.some((r) => r.capex > 0));
  const years = Array.from(
    new Set(levers.flatMap((l) => l.series.map((r) => r.year))),
  ).filter((y) => y <= endYear).sort((a, b) => a - b);

  if (withCapex.length === 0 || years.length === 0) {
    return <p className="text-sm text-ink-faint">No capital in this plan yet — switch on a lever that needs investment.</p>;
  }

  const capexByYear = years.map((y) =>
    withCapex.map((l) => ({ lever: l, capex: l.series.find((r) => r.year === y)?.capex ?? 0 })),
  );
  const totalByYear = capexByYear.map((cols) => cols.reduce((s, c) => s + c.capex, 0));
  const maxCapex = Math.max(...totalByYear, 1);

  /* Cumulative UNDISCOUNTED net across every lever — the cash that has to
     exist, which is a different question from whether the plan is worth it.
     Built by fold rather than by mutating a running total inside a map: the
     same answer, and it does not smuggle state through a render. */
  const netByYear = years.map((y) =>
    levers.reduce((s, l) => s + (l.series.find((r) => r.year === y)?.net ?? 0), 0),
  );
  const cumulative = netByYear.reduce<number[]>(
    (acc, n) => [...acc, (acc[acc.length - 1] ?? 0) + n],
    [],
  );
  const worst = Math.min(...cumulative, 0);
  const best = Math.max(...cumulative, 0);
  const cashSpan = best - worst || 1;

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const bandW = plotW / years.length;
  const barW = Math.min(30, bandW * 0.62);
  const yBar = (v: number) => PAD_T + plotH - (v / maxCapex) * plotH;
  const yCash = (v: number) => PAD_T + ((best - v) / cashSpan) * plotH;
  const xMid = (i: number) => PAD_L + bandW * i + bandW / 2;

  const peakIdx = cumulative.indexOf(Math.min(...cumulative));

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
        aria-label={`Capital by year. Peak funding ${CURRENCY}${fmt(Math.abs(worst))} in ${years[peakIdx]}.`}>
        {/* capital gridlines, recessive */}
        {[0.5, 1].map((f) => (
          <line key={f} x1={PAD_L} x2={W - PAD_R} y1={yBar(maxCapex * f)} y2={yBar(maxCapex * f)}
            stroke="var(--color-line)" strokeWidth="1" />
        ))}
        <text x={PAD_L - 6} y={yBar(maxCapex) + 3} fontSize="9" textAnchor="end" fill="var(--color-ink-faint)">
          {CURRENCY}{fmt(maxCapex / 1e7)} cr
        </text>

        {/* stacked capital */}
        {years.map((y, i) => {
          let acc = 0;
          return (
            <g key={y}>
              {capexByYear[i].map(({ lever, capex }) => {
                if (capex <= 0) return null;
                const h = (capex / maxCapex) * plotH;
                acc += h;
                const yTop = PAD_T + plotH - acc;
                return (
                  <rect key={lever.id} x={xMid(i) - barW / 2} y={yTop} width={barW} height={Math.max(1, h - 1)}
                    fill={familyColor(lever.colorIdx)} rx={2}>
                    <title>{`${lever.label} — ${CURRENCY}${fmt(capex)} in FY${y}`}</title>
                  </rect>
                );
              })}
              <text x={xMid(i)} y={H - 18} fontSize="9" textAnchor="middle" fill="var(--color-ink-faint)">
                {String(y).slice(2)}
              </text>
            </g>
          );
        })}

        {/* cumulative cash position */}
        <polyline
          fill="none" stroke="var(--color-ink)" strokeWidth="1.75" strokeLinejoin="round"
          points={years.map((_, i) => `${xMid(i)},${yCash(cumulative[i])}`).join(" ")}
        />
        <circle cx={xMid(peakIdx)} cy={yCash(cumulative[peakIdx])} r="3.5" fill="var(--color-ink)" />
        <text x={xMid(peakIdx)} y={yCash(cumulative[peakIdx]) + 15} fontSize="9" textAnchor="middle" fill="var(--color-ink)" fontWeight="600">
          peak {CURRENCY}{fmt(Math.abs(worst) / 1e7)} cr
        </text>

        <text x={PAD_L} y={H - 4} fontSize="9" fill="var(--color-ink-faint)">capital out per year</text>
        <text x={W - PAD_R} y={H - 4} fontSize="9" textAnchor="end" fill="var(--color-ink-faint)">line: cumulative cash position</text>
      </svg>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {withCapex.map((l) => (
          <span key={l.id} className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: familyColor(l.colorIdx) }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
