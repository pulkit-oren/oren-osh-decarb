/* ============================================================
   Physical feasibility of an electrification plan.

   The electrify lever asks the user for a COP. It never asked what
   temperature the duty runs at, because equipment had no temperature -
   so nothing stopped a COP of 3 being applied to a 1,150 °C billet
   reheat furnace, and the resulting plan was cheap, clean and
   impossible. The cost per tonne of that lever moved by a factor of
   three on a field with no guardrail behind it.

   A heat-pump-scale COP means heat RECOVERY: a heat pump or MVR.
   Those are commercial only up to roughly 165 °C. Above that the
   electric route still exists - resistance, electrode, induction, arc -
   but it recovers nothing, because you are paying for every joule.
   That single fact is the whole check.

   The threshold is 2.0 rather than "anything above 1", because the
   model's cop field also carries delivery efficiency: induction and IR
   put more of the input into the workpiece than a burner does, at any
   temperature. END_USES already encodes that distinction (cooking 1.8,
   oven 1.4 are delivery; boiler 3.0, spaceHeat 3.5 are recovery), so a
   lower gate would fire on this product's own catalogue defaults.

   ADVISORY, not clamped. Silently rewriting a user's COP would make the
   model disagree with the number on screen, and a user modelling a
   genuinely experimental route should be able to. The rule is that the
   warning must be impossible to miss, not that the input is impossible
   to enter - which is why these strings are rendered beside the levers
   rather than returned and dropped.
   ============================================================ */

import type { CombustionAsset, LeverSettings } from "./types";

/** Above this, heat recovery stops being commercially available and the
 *  electric route is direct. Matches the guidance already carried in
 *  lib/model/alternatives.ts ("duties below ~160 °C"). */
export const HEAT_PUMP_MAX_C = 165;

/** The COP above which a plan is claiming HEAT RECOVERY rather than better
 *  delivery.
 *
 *  This threshold is 2.0 and not something lower because the model's `cop`
 *  field carries two physically different things, and only one of them is
 *  temperature-limited:
 *
 *    - Recovery (heat pump, MVR). Moves heat rather than making it, so the
 *      ratio can be 3-4 — and is unavailable above ~165 °C.
 *    - Delivery efficiency. Induction, infrared and zone control put more of
 *      the input into the workpiece than a burner does. END_USES already
 *      assigns exactly this: cooking 1.8, oven 1.4. Those are real at ANY
 *      temperature, so a gate set below them would contradict the catalogue
 *      this product ships with and fire on its own defaults.
 *
 *  2.0 sits above every delivery-efficiency figure in END_USES and below every
 *  heat-pump one, so it separates the two cleanly. */
export const RECOVERY_COP_THRESHOLD = 2;

/** Beyond this, electrification means induction, arc or plasma: commercial
 *  for melting and reheat, but high-capex and a large connected load. */
export const HIGH_TEMP_C = 800;

export type FeasibilityVerdict =
  | { ok: true; note?: string }
  | { ok: false; reason: string; maxCop: number };

/** Is this COP achievable at this duty temperature? */
export function electrifyFeasibility(dutyTempC: number | undefined, cop: number): FeasibilityVerdict {
  if (dutyTempC === undefined || !Number.isFinite(dutyTempC)) {
    return cop > RECOVERY_COP_THRESHOLD
      ? { ok: true, note: "No duty temperature recorded, so this COP cannot be checked." }
      : { ok: true };
  }
  if (dutyTempC > HEAT_PUMP_MAX_C && cop > RECOVERY_COP_THRESHOLD) {
    return {
      ok: false,
      maxCop: RECOVERY_COP_THRESHOLD,
      reason:
        `a COP of ${cop} implies heat recovery — a heat pump or MVR — and those are commercial ` +
        `only to about ${HEAT_PUMP_MAX_C} °C. At ${Math.round(dutyTempC)} °C the electric route is ` +
        `direct heating (resistance, induction, IR), which does not recover heat`,
    };
  }
  if (dutyTempC > HIGH_TEMP_C) {
    return { ok: true, note: "Above 800 °C this means induction, arc or plasma — high capex and a large connected load." };
  }
  return { ok: true };
}

/** Non-blocking feasibility and sanity warnings for the Scope 1 plan.
 *  Mirrors validateScope2's shape so both scopes render through one surface. */
export function validateScope1(assets: CombustionAsset[], settings: LeverSettings): string[] {
  const warnings: string[] = [];
  // Per-asset only where the message is ACTIONABLE on that asset. The
  // "no temperature recorded" case is data completeness, not a fault in one
  // machine's plan, so it is counted once instead of repeating a name per row
  // — a strip that lists every asset is scrolled past, which is the same as
  // not warning at all.
  let uncheckable = 0;

  for (const a of assets) {
    const acts = settings.byAsset[a.id];
    if (!acts?.electrify.enabled) continue;
    if (a.category !== "stationary") continue; // a vehicle has no process duty
    // A resolved row carries exactly the machine it descends from, so the
    // temperature read here belongs to the equipment the lever is keyed to.
    const dutyTempC = a.equipment?.[0]?.dutyTempC;
    const verdict = electrifyFeasibility(dutyTempC, acts.electrify.cop);

    if (!verdict.ok) {
      warnings.push(`${a.name}: ${verdict.reason}. Set the COP to ${verdict.maxCop} or lower.`);
    } else if (dutyTempC === undefined && acts.electrify.cop > RECOVERY_COP_THRESHOLD) {
      uncheckable++;
    }
  }

  if (uncheckable > 0) {
    warnings.push(
      `${uncheckable} electrified ${uncheckable === 1 ? "source has" : "sources have"} a heat-pump ` +
      `COP (above ${RECOVERY_COP_THRESHOLD}) with no duty temperature recorded, so it cannot be checked. ` +
      `Add a duty temperature on the Data input tab.`,
    );
  }

  for (const [id, acts] of Object.entries(settings.byAsset)) {
    if (acts.electrify.enabled && acts.electrify.cop <= 0) {
      const name = assets.find((a) => a.id === id)?.name ?? id;
      warnings.push(`${name}: electrification COP must be greater than zero.`);
    }
  }

  return warnings;
}
