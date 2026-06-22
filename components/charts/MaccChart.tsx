"use client";
import type { ComputeResult } from "@/lib/model";
import { CURRENCY } from "@/lib/defaults";
import { fmt } from "@/lib/utils";
import { maccLayout } from "@/lib/macc";

const W = 600, H = 240, PAD_L = 48, PAD_B = 28, PAD_T = 12;

export function MaccChart({ levers }: { levers: ComputeResult["levers"] }) {
  const active = levers.filter((l) => l.enabled && l.abatementT > 0);
  const { bars, totalT, maxCost, minCost } = maccLayout(active);
  if (bars.length === 0) {
    return <p className="text-sm text-ink-faint">Switch on actions in the Scenario Modeller to see the abatement cost curve.</p>;
  }
  const plotW = W - PAD_L - 10;
  const plotH = H - PAD_T - PAD_B;
  const xScale = (t: number) => PAD_L + (totalT > 0 ? (t / totalT) * plotW : 0);
  const top = Math.max(maxCost, 0), bot = Math.min(minCost, 0), span = top - bot || 1;
  const yOf = (c: number) => PAD_T + ((top - c) / span) * plotH;
  const zeroY = yOf(0);

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} fontFamily="Inter">
        {/* zero line */}
        <line x1={PAD_L} y1={zeroY} x2={W - 10} y2={zeroY} stroke="var(--color-ink-faint)" strokeWidth="1" />
        <text x={PAD_L - 6} y={zeroY + 3} fontSize="9" textAnchor="end" fill="var(--color-ink-faint)">0</text>
        {/* bars */}
        {bars.map((b) => {
          const x = xScale(b.x), w = Math.max(1, xScale(b.x + b.width) - x - 1);
          const yTop = b.costPerTonne >= 0 ? yOf(b.costPerTonne) : zeroY;
          const h = Math.max(1, Math.abs(yOf(b.costPerTonne) - zeroY));
          return (
            <rect key={b.id} x={x} y={yTop} width={w} height={h} fill={b.color} opacity={b.costPerTonne < 0 ? 0.85 : 0.7} rx={2}>
              <title>{`${b.label}: ${CURRENCY}${fmt(b.costPerTonne)}/t · ${fmt(b.abatementT)} t`}</title>
            </rect>
          );
        })}
        {/* axes captions */}
        <text x={PAD_L} y={H - 6} fontSize="9" fill="var(--color-ink-faint)">cheapest first →</text>
        <text x={W - 10} y={H - 6} fontSize="9" textAnchor="end" fill="var(--color-ink-faint)">{fmt(totalT)} tCO₂e abated</text>
        <text x={PAD_L - 6} y={PAD_T + 8} fontSize="9" textAnchor="end" fill="var(--color-ink-faint)">{CURRENCY}/t</text>
      </svg>
    </div>
  );
}
