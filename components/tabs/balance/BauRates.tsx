"use client";

/* One rendering of the BAU growth premise, used by BOTH places that state it:
   the Compare-mixes premise strip and the result rail's "How this is
   calculated" paragraph.

   It exists as a component rather than as two inline `??` chains because those
   two chains are exactly what went wrong. Both read
   `assumptions.bauGrowthPct ?? s1.derivedBau?.pct ?? 1` — Scope 1's chain — and
   printed it beside a COMBINED business-as-usual figure that is the sum of a
   Scope 1 curve and a Scope 2 curve growing at two different derived rates. On
   the shipped inventories that read "reaches 6,866 t by 2030, growing at
   2.8 %/yr" while Scope 2 was on 7.5 %/yr, and the arithmetic closed in neither
   direction.

   The rates come from `describeBauPremise`, which calls the same
   `resolveBauGrowthPct` both engines call, so what is stated here is what the
   engines will use — by construction, not by two chains being kept in step. */

import type { BauPremise } from "@/lib/bau";

const Rate = ({ pct }: { pct: number }) => (
  <strong className="text-ink tabular-nums">{pct.toFixed(1)} %/yr</strong>
);

/** The rate, or both rates when the scopes are on different premises.
 *
 *  An override IS one rate for both engines, so the single-rate phrasing is
 *  correct in that branch and is kept there. */
export function BauRates({ premise }: { premise: BauPremise }) {
  if (premise.single) return <Rate pct={premise.s1Pct} />;
  return (
    <>
      <Rate pct={premise.s1Pct} /> on Scope 1 and <Rate pct={premise.s2Pct} /> on Scope 2
    </>
  );
}
