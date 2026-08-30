/* ============================================================
   Installed charge, and the leak RATE it makes measurable.

   A system recorded only `toppedUpKg` — the mass-balance leak. That
   is enough to compute emissions and nothing else, which left three
   things unrepresentable:

     - The leak RATE. Every F-gas regime, every Kigali commitment and
       every internal target is written as a percentage of installed
       charge per year. Against top-up alone the only expressible
       target is "improve on last year", which is a different promise
       and cannot be assured.
     - A lower-charge system. Microchannel coils, distributed
       architectures and a secondary-loop retrofit cut the mass that
       CAN leak, independently of how well it is maintained.
     - Whether a top-up figure is plausible at all. A system topping
       up more than its own charge in a year has either a catastrophic
       leak or a data-entry error, and both are worth saying out loud.

   Charge stays OPTIONAL. Most first-year users have top-up invoices
   and no charge register, and demanding both would block the number
   they can actually produce. Everything here degrades to undefined
   rather than guessing.
   ============================================================ */

import type { LeakFixAction, RefrigerationSystem } from "./types";

/** Indicative annual leak rates by system type, % of charge. Used only to
 *  judge whether an entered figure is plausible — never to invent one. */
export const TYPICAL_LEAK_RATE_PCT: Record<RefrigerationSystem["systemType"], number> = {
  commercialHVAC: 8,
  industrialColdStorage: 15,
  retailRefrigeration: 20,
};

/** Above this, a leak rate is not a maintenance problem — it is a fault, or
 *  the charge is wrong. */
export const IMPLAUSIBLE_LEAK_RATE_PCT = 40;

/** Annual leak as a share of installed charge (%), or undefined when no charge
 *  is recorded. Undefined is a real answer here: it means "not measurable",
 *  not "zero". */
export function leakRatePct(s: RefrigerationSystem): number | undefined {
  const charge = s.chargeKg;
  if (charge === undefined || !Number.isFinite(charge) || charge <= 0) return undefined;
  return (s.toppedUpKg / charge) * 100;
}

/** The leak improvement the physics should actually apply, as a percentage
 *  reduction in leaked mass.
 *
 *  Two ways to express the same commitment, and they are not interchangeable:
 *    - `leakImprovementPct` — "cut leaks by 45%", relative to today.
 *    - `targetLeakRatePct`  — "get to 5% of charge per year", an absolute
 *      standard. This is the form targets are set and audited in, and it
 *      needs the charge to be resolvable at all.
 *
 *  A target rate wins when both are present and the charge is known, because
 *  it is the stricter, externally-meaningful statement. It cannot make a leak
 *  worse: a target above the current rate yields no improvement rather than a
 *  negative one, so entering a slack target never manufactures emissions. */
export function effectiveLeakImprovementPct(s: RefrigerationSystem, a: LeakFixAction): number {
  if (!a.enabled) return 0;
  const target = a.targetLeakRatePct;
  const current = leakRatePct(s);
  if (target !== undefined && current !== undefined && current > 0) {
    const improvement = (1 - target / current) * 100;
    return Math.max(0, Math.min(100, improvement));
  }
  return Math.max(0, Math.min(100, a.leakImprovementPct));
}

/** Data-quality warnings about the charge itself. */
export function validateCharge(systems: RefrigerationSystem[]): string[] {
  const out: string[] = [];
  for (const s of systems) {
    const rate = leakRatePct(s);
    if (rate === undefined) continue;
    if (rate > 100) {
      out.push(
        `${s.name}: topped up ${s.toppedUpKg} kg against an installed charge of ${s.chargeKg} kg — ` +
        `more than a full recharge in one year. Check the charge, or the system has failed.`,
      );
    } else if (rate > IMPLAUSIBLE_LEAK_RATE_PCT) {
      out.push(
        `${s.name}: leaking ${rate.toFixed(0)}% of its charge per year ` +
        `(typical for ${s.systemType} is about ${TYPICAL_LEAK_RATE_PCT[s.systemType]}%).`,
      );
    }
  }
  return out;
}

/** Systems whose leak-fix target is expressed as a rate but which have no
 *  charge to measure it against — the target silently falls back to the
 *  relative improvement, so say so. */
export function validateTargetableSystems(
  systems: RefrigerationSystem[],
  bySystem: Record<string, { leakFix: LeakFixAction }>,
): string[] {
  const orphans = systems.filter((s) => {
    const a = bySystem[s.id]?.leakFix;
    return a?.enabled && a.targetLeakRatePct !== undefined && leakRatePct(s) === undefined;
  });
  if (orphans.length === 0) return [];
  return [
    `${orphans.length} cooling ${orphans.length === 1 ? "system has" : "systems have"} a target leak ` +
    `rate but no installed charge recorded, so the target cannot be measured and the plan falls back ` +
    `to a relative improvement. Add the charge on the Data input tab.`,
  ];
}
