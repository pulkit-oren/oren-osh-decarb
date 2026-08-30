/* ============================================================
   The Indian open-access cost stack.

   Procurement priced a PPA off ONE number — a strike delta against
   the grid tariff — which is the least state-dependent part of the
   decision. What actually decides whether an open-access PPA is worth
   signing, and which of two plants should sign first, is the stack of
   regulated charges bolted onto every wheeled unit:

     - Cross-subsidy surcharge (CSS). Levied by the state commission
       to compensate the discom for a departing HT consumer. The
       single largest and most volatile component.
     - Additional surcharge. Recovers the discom's stranded fixed
       cost. Appears and disappears with the discom's own filings.
     - Wheeling / transmission charges for using the network.
     - Banking losses. Energy injected now and drawn later is not
       returned one-for-one; the unreturned share is bought at grid
       rates.

   Two plants in two states can face a stack differing by more than
   the strike price itself, which is precisely the comparison the
   model could not make. Green tariff and RECs are deliberately NOT
   charged this stack: a green tariff is a discom product delivered
   over the same connection, and a REC is an unbundled certificate
   with no wheeled electron behind it.

   Every component is optional and defaults to zero, so a plan written
   before this existed prices exactly as it did.
   ============================================================ */

import type { OpenAccessCharges } from "./types";

/** Indicative all-in stacks, INR/kWh, for orientation only — the real numbers
 *  come from the current state tariff order and change with it. Offered as
 *  starting points in the UI, never applied silently. */
export const INDICATIVE_STACK_PER_KWH: Record<string, number> = {
  "Maharashtra": 2.6,
  "Tamil Nadu": 1.4,
  "Karnataka": 1.9,
  "Gujarat": 1.5,
  "Telangana": 2.1,
  "Uttar Pradesh": 2.3,
};

export const EMPTY_STACK: OpenAccessCharges = {
  crossSubsidySurchargePerKwh: 0,
  additionalSurchargePerKwh: 0,
  wheelingChargePerKwh: 0,
  bankingLossPct: 0,
};

/**
 * The all-in adder on every open-access kilowatt-hour, INR/kWh.
 *
 * Banking loss is a QUANTITY loss, not a charge: bank 100 units, draw 98, and
 * the missing 2 are bought from the discom at the grid tariff. Converting it to
 * a per-kWh adder therefore needs the grid tariff, not the strike price — which
 * is why it takes the tariff as an argument rather than being a fixed rate.
 */
export function openAccessAdderPerKwh(c: OpenAccessCharges | undefined, gridTariffPerKwh: number): number {
  if (!c) return 0;
  const explicit =
    (c.crossSubsidySurchargePerKwh || 0) +
    (c.additionalSurchargePerKwh || 0) +
    (c.wheelingChargePerKwh || 0);
  const bankingLoss = Math.max(0, Math.min(100, c.bankingLossPct || 0)) / 100;
  return explicit + bankingLoss * Math.max(0, gridTariffPerKwh);
}

/** Does this stack turn a nominally cheaper PPA into a more expensive one? */
export function erodesSaving(
  strikeDeltaPerKwh: number, c: OpenAccessCharges | undefined, gridTariffPerKwh: number,
): boolean {
  return strikeDeltaPerKwh < 0 && strikeDeltaPerKwh + openAccessAdderPerKwh(c, gridTariffPerKwh) >= 0;
}
