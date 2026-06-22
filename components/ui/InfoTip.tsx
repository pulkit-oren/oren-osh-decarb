"use client";

import { useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

/** Small (i) icon that reveals a plain-language explanation on hover/focus.
 *  The bubble is rendered in a portal with fixed positioning so it is never
 *  clipped by a parent's `overflow` (e.g. the horizontally-scrolling data
 *  tables). Falls below the icon when there isn't room above. */
export function InfoTip({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);

  const show = () => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    const below = r.top < 130; // not enough room above → drop below the icon
    const half = 116; // half the bubble width (w-56 = 224px) + a little
    const left = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
    setPos({ top: below ? r.bottom + 8 : r.top - 8, left, below });
  };
  const hide = () => setPos(null);

  const bubbleStyle: CSSProperties | undefined = pos
    ? { position: "fixed", top: pos.top, left: pos.left, transform: `translate(-50%, ${pos.below ? "0%" : "-100%"})` }
    : undefined;

  return (
    <>
      <span
        ref={ref}
        className="relative inline-flex align-middle"
        tabIndex={0}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <Info size={13} className="text-ink-faint hover:text-brand-600 focus:text-brand-600 cursor-help" />
      </span>
      {pos && typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            style={bubbleStyle}
            className="pointer-events-none z-[1000] w-56 rounded-lg bg-ink text-white text-[11px] leading-snug px-2.5 py-1.5 shadow-card-lg text-left font-normal normal-case tracking-normal"
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}
