/* ============================================================
   The couplings between the two scopes that neither engine can see
   on its own.

   Scope 1 and Scope 2 are computed by separate engines with separate
   lever sets, which is right — they model different physics. But a
   plant does not experience them separately, and two decisions in
   particular sit across the join:

     - Storage bought for Scope 2 can carry outage load, which is what
       the diesel generator in Scope 1 exists for. The mechanism to
       model that ALREADY EXISTS: electrifying a `generator` end-use
       at COP 1 is exactly "displace DG runtime", and END_USES says so
       in its own note. What was missing is nothing in either screen
       connecting the battery you just sized to the generator you
       could switch off, so the user has to notice the link unaided.
     - On-site solar and a DG set in the same business unit are the
       same reliability decision seen from two tabs.

   These are OPPORTUNITIES, not faults: the plan is not wrong for
   omitting them. They are surfaced in their own strip and worded as
   suggestions, because dressing a suggestion as a warning trains
   people to ignore warnings.
   ============================================================ */

import { combustionCO2e } from "./model/baseline";
import type { CombustionAsset, LeverSettings } from "./model/types";
import type { Facility, Scope2Levers } from "./scope2/model/types";
import { isInstrumentRecord } from "./scope2/model/instruments";

const buOf = (x: { bu?: string }) => x.bu ?? "Central";

/** Is this asset a standby generator — the thing storage can displace? */
function isGenerator(a: CombustionAsset): boolean {
  return a.category === "stationary" && a.equipment?.[0]?.endUse === "generator";
}

export interface CrossScopeOpportunity {
  bu: string;
  message: string;
  /** Scope 1 tonnes currently unaddressed in this business unit. */
  tonnesAtStake: number;
}

/**
 * Business units that are planning battery storage on the Scope 2 side while
 * leaving their diesel generators unmodelled on the Scope 1 side.
 *
 * Deliberately NOT a new lever. Adding a second "displace the DG" control
 * beside the electrify lever that already does it would double-count the
 * capex the moment a user filled in both. The two batteries genuinely differ
 * in duty — Scope 2's is sized to capture solar spill, Scope 1's to ride
 * through an outage — so the honest fix is to name the link, not to model it
 * twice.
 */
export function dgDisplacementOpportunities(
  assets: CombustionAsset[],
  s1: LeverSettings,
  facilities: Facility[],
  s2: Scope2Levers,
): CrossScopeOpportunity[] {
  const storageByBu = new Map<string, number>();
  for (const f of facilities) {
    // Instrument records (VPPA / I-REC / solar) carry no levers of their own.
    if (isInstrumentRecord(f) && f.name !== "Purchased electricity") continue;
    const gen = s2.byFacility[f.id]?.generation;
    if (!gen?.enabled || gen.batteryKwh <= 0) continue;
    storageByBu.set(buOf(f), (storageByBu.get(buOf(f)) ?? 0) + gen.batteryKwh);
  }
  if (storageByBu.size === 0) return [];

  const out: CrossScopeOpportunity[] = [];
  for (const [bu, batteryKwh] of storageByBu) {
    const idle = assets.filter(
      (a) => isGenerator(a) && buOf(a) === bu && !s1.byAsset[a.id]?.electrify.enabled,
    );
    if (idle.length === 0) continue;

    const tonnes = idle.reduce((s, a) => s + combustionCO2e(a), 0);
    if (tonnes <= 0) continue;

    const names = idle.map((a) => a.name).join(", ");
    out.push({
      bu,
      tonnesAtStake: tonnes,
      message:
        `${bu} plans ${Math.round(batteryKwh).toLocaleString("en-IN")} kWh of storage, and its diesel ` +
        `generators (${names}) are not modelled as displaced — ${Math.round(tonnes).toLocaleString("en-IN")} tCO₂e ` +
        `a year. Storage sized for solar spill can also carry outage load: switch on Electrify for those ` +
        `generators at a COP of 1 to model it, and add only the extra storage the backup duty needs.`,
    });
  }
  return out.sort((a, b) => b.tonnesAtStake - a.tonnesAtStake);
}
