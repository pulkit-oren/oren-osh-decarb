/* ============================================================
   The boundary, stated.

   This product models Scope 1 and Scope 2. That is its scope and not
   a defect. The defect was silence: a user could set a goal named
   "Cut emissions 42% by 2030 (SBTi 1.5°C)", watch the model confirm
   the plan reaches it, and reasonably conclude they had an
   SBTi-alignable target — when for most filers the large majority of
   the footprint was never in the model at all.

   The fix is NOT a fabricated Scope 3 inventory. Estimating fifteen
   categories from a sector multiple and presenting the result beside
   measured Scope 1 and 2 data would give a number with none of the
   provenance of the ones around it, and it would be used. What is
   offered instead is an explicit ORDER OF MAGNITUDE — a range, always
   rendered as a range, labelled a screen — whose only job is to stop
   someone mistaking a Scope 1+2 plan for a whole-company one.

   The SBTi threshold is the concrete consequence: where Scope 3 is at
   least 40% of the total footprint, a Scope 3 target is required for
   validation. For nearly every company this model can describe, it is.
   ============================================================ */

/** SBTi requires a Scope 3 target once Scope 3 reaches this share of the
 *  total inventory. */
export const SBTI_SCOPE3_THRESHOLD_PCT = 40;

/** Scope 3 as a share of the TOTAL footprint. Deliberately a wide band drawn
 *  from what disclosing companies report — narrow enough to be informative,
 *  wide enough that nobody mistakes it for a measurement. */
export const TYPICAL_SCOPE3_SHARE_PCT = { low: 70, high: 92 };

export interface Scope3Screen {
  /** Scope 1 + 2 as entered, tCO2e. */
  scope12T: number;
  /** Implied Scope 3, tCO2e — a RANGE, never a point. */
  lowT: number;
  highT: number;
  /** Implied total footprint, tCO2e. */
  totalLowT: number;
  totalHighT: number;
  /** Would a Scope 3 target be required for SBTi validation? */
  scope3TargetRequired: boolean;
}

/**
 * An order-of-magnitude screen of what sits outside this model.
 *
 * If Scope 3 is share s of the total, then Scope 3 = Scope12 × s/(1−s). The
 * band is computed at both ends and returned as both ends; there is
 * deliberately no midpoint, because a midpoint is what gets quoted.
 */
export function scope3Screen(scope12T: number): Scope3Screen {
  const implied = (sharePct: number) => {
    const s = Math.max(0, Math.min(99, sharePct)) / 100;
    return scope12T * (s / (1 - s));
  };
  const lowT = implied(TYPICAL_SCOPE3_SHARE_PCT.low);
  const highT = implied(TYPICAL_SCOPE3_SHARE_PCT.high);
  return {
    scope12T,
    lowT,
    highT,
    totalLowT: scope12T + lowT,
    totalHighT: scope12T + highT,
    // The low end of the band already clears the threshold for every company
    // this model can describe, so this is true whenever there is a footprint
    // at all — which is precisely the point worth making.
    scope3TargetRequired: TYPICAL_SCOPE3_SHARE_PCT.low >= SBTI_SCOPE3_THRESHOLD_PCT && scope12T > 0,
  };
}

/** Goal templates that make a claim Scope 1+2 alone cannot support. */
const CLAIMS_WHOLE_COMPANY = new Set(["abs_sbti", "netzero", "carbon_neutral"]);

export function claimsBeyondThisModel(templateId: string): boolean {
  return CLAIMS_WHOLE_COMPANY.has(templateId);
}
