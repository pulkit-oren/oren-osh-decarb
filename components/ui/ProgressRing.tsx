"use client";

/* Donut progress ring — share of the reduction target the plan delivers.
   Rounded arc on a soft track, big % in the middle; green when the target
   is met, amber while there's still a gap. Animates via dash offset. */

const R = 60;
const STROKE = 14;
const C = 2 * Math.PI * R;

export function ProgressRing({ pct, caption, tone }: { pct: number; caption: string; tone: "good" | "warn" }) {
  const clamped = Math.max(0, Math.min(1, pct));
  const size = (R + STROKE / 2) * 2;

  return (
    <div className="flex flex-col items-center gap-2" role="img" aria-label={`${Math.round(pct * 100)}% ${caption}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
          <defs>
            <linearGradient id="ring-good" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--color-brand-400, #3FB76E)" />
              <stop offset="100%" stopColor="var(--color-brand-600, #188049)" />
            </linearGradient>
            <linearGradient id="ring-warn" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="var(--color-surface-muted, #F4F4EF)" strokeWidth={STROKE} />
          <circle
            cx={size / 2} cy={size / 2} r={R} fill="none"
            stroke={`url(#ring-${tone})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - clamped)}
            style={{ transition: "stroke-dashoffset 700ms cubic-bezier(.4,0,.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center leading-none">
            <div className="text-[26px] font-extrabold tabular-nums text-ink">{Math.round(pct * 100)}%</div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-ink-faint mt-1">of target</div>
          </div>
        </div>
      </div>
      <div className="text-[11px] text-ink-soft font-medium text-center max-w-40 leading-snug">{caption}</div>
    </div>
  );
}
