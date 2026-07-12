"use client";

/* Semicircular banded gauge — progress toward the reduction target.
   Five colored bands (off-track red → on-target green) with a needle at
   the current share of the target. Pure SVG, animates via CSS transform. */

const BANDS = ["#F87171", "#FBBF24", "#FACC15", "#A3E635", "#1F9E5A"];
const CX = 110;
const CY = 108;
const R = 86;

/** Point on the arc: deg runs 180 (left) → 0 (right). */
function pt(deg: number, r: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

function arcPath(fromDeg: number, toDeg: number, r: number) {
  const a = pt(fromDeg, r);
  const b = pt(toDeg, r);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export function TargetGauge({ pct, caption }: { pct: number; caption: string }) {
  const clamped = Math.max(0, Math.min(1, pct));
  const needleDeg = clamped * 180; // 0 = pointing left (0%), 180 = pointing right (100%)
  const span = 180 / BANDS.length;
  const gap = 2.4;

  return (
    <div className="flex flex-col items-center" role="img" aria-label={`${Math.round(pct * 100)}% of target — ${caption}`}>
      <svg viewBox="0 0 220 122" className="w-full max-w-[250px]">
        {BANDS.map((color, i) => {
          const from = 180 - i * span - (i === 0 ? 0 : gap / 2);
          const to = 180 - (i + 1) * span + (i === BANDS.length - 1 ? 0 : gap / 2);
          return <path key={color} d={arcPath(from, to, R)} stroke={color} strokeWidth={22} fill="none" strokeLinecap="butt" />;
        })}
        {/* needle */}
        <g
          style={{ transform: `rotate(${needleDeg}deg)`, transformOrigin: `${CX}px ${CY}px`, transition: "transform 700ms cubic-bezier(.34,1.3,.5,1)" }}
        >
          <path d={`M ${CX} ${CY - 5.5} L ${CX - R + 28} ${CY} L ${CX} ${CY + 5.5} Z`} fill="var(--color-ink, #1F2A24)" />
          <circle cx={CX} cy={CY} r={9} fill="var(--color-ink, #1F2A24)" />
          <circle cx={CX} cy={CY} r={3.5} fill="white" />
        </g>
        <text x={CX - R} y={CY + 12} textAnchor="middle" className="fill-[var(--color-ink-faint,#9AA6A0)]" fontSize={9} fontWeight={700}>0%</text>
        <text x={CX + R} y={CY + 12} textAnchor="middle" className="fill-[var(--color-ink-faint,#9AA6A0)]" fontSize={9} fontWeight={700}>100%</text>
      </svg>
      <div className="-mt-1 text-center">
        <div className="text-2xl font-extrabold tabular-nums text-ink leading-none">{Math.round(pct * 100)}%</div>
        <div className="text-[11px] text-ink-soft font-medium mt-0.5">{caption}</div>
      </div>
    </div>
  );
}
