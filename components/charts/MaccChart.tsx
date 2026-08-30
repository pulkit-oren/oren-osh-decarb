"use client";
import type { ComputeResult } from "@/lib/model";
import { CURRENCY } from "@/lib/defaults";
import { fmt, fmtPerTonne } from "@/lib/utils";
import { maccLayout } from "@/lib/macc";

const W = 600, H = 240, PAD_L = 48, PAD_B = 28, PAD_T = 12;

/** Names the levers the curve cannot place. A bar needs a finite cost per tonne;
 *  a lever whose Scope 2 spill cancels its Scope 1 abatement has none, and would
 *  otherwise disappear from a chart the user switched it on for. */
function UnpricedNote({ labels }: { labels: string[] }) {
  return (
    <p className="mt-2 text-[11px] text-ink-faint">
      Not on the curve: {labels.join(", ")} — no net abatement to divide the cost by,
      so there is no cost per tonne to plot. The action is still counted in CAPEX and running costs.
    </p>
  );
}

/** The only fields the curve needs. Widened from ComputeResult["levers"] so the
 *  same chart can draw a COMBINED curve — Scope 1 and Scope 2 levers ranked
 *  against each other, which is how they compete for the same capital. */
export interface MaccLever {
  id: string;
  label: string;
  colorIdx: number;
  enabled: boolean;
  abatementT: number;
  costPerTonne: number;
}

export function MaccChart({ levers, onSelect }: {
  levers: MaccLever[] | ComputeResult["levers"];
  /** Click a bar to open the lever that produced it. Omitted ⇒ the chart is
   *  read-only, which is what the reporting tabs want. */
  onSelect?: (leverId: string) => void;
}) {
  const active = (levers as MaccLever[]).filter((l) => l.enabled && l.abatementT > 0);
  const { bars, totalT, maxCost, minCost, unpriced } = maccLayout(active);
  if (bars.length === 0) {
    return (
      <div>
        <p className="text-sm text-ink-faint">Switch on actions in the Scenario Modeller to see the abatement cost curve.</p>
        {unpriced.length > 0 && <UnpricedNote labels={unpriced} />}
      </div>
    );
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
          const clickable = !!onSelect;
          return (
            <rect
              key={b.id} x={x} y={yTop} width={w} height={h} fill={b.color}
              opacity={b.costPerTonne < 0 ? 0.85 : 0.7} rx={2}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              style={clickable ? { cursor: "pointer" } : undefined}
              aria-label={clickable ? `Open ${b.label}` : undefined}
              onClick={clickable ? () => onSelect(b.id) : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(b.id); } } : undefined}
            >
              <title>{`${b.label}: ${CURRENCY}${fmtPerTonne(b.costPerTonne)}/t · ${fmt(b.abatementT)} t${clickable ? " — click to open" : ""}`}</title>
            </rect>
          );
        })}
        {/* Direct labels on the bars wide enough to carry one. Everything in
            this chart used to be hover-only, and a board pack is a screenshot. */}
        {bars.map((b) => {
          const x = xScale(b.x), w = xScale(b.x + b.width) - x;
          if (w < 54) return null;
          const yTop = b.costPerTonne >= 0 ? yOf(b.costPerTonne) : zeroY;
          const h = Math.abs(yOf(b.costPerTonne) - zeroY);
          const cy = yTop + h / 2;
          return (
            <text
              key={`lbl-${b.id}`} x={x + w / 2} y={h > 22 ? cy + 3 : yTop - 4}
              fontSize="9" textAnchor="middle" pointerEvents="none"
              fill={h > 22 ? "#FFFFFF" : "var(--color-ink-soft)"}
              fontWeight="600"
            >
              {b.label}
            </text>
          );
        })}
        {/* axes captions */}
        <text x={PAD_L} y={H - 6} fontSize="9" fill="var(--color-ink-faint)">cheapest first →</text>
        <text x={W - 10} y={H - 6} fontSize="9" textAnchor="end" fill="var(--color-ink-faint)">{fmt(totalT)} tCO₂e abated</text>
        <text x={PAD_L - 6} y={PAD_T + 8} fontSize="9" textAnchor="end" fill="var(--color-ink-faint)">{CURRENCY}/t</text>
      </svg>
      {unpriced.length > 0 && <UnpricedNote labels={unpriced} />}
    </div>
  );
}
