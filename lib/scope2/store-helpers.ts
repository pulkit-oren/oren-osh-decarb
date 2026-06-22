/* Pure Scope 2 store helpers — id minting reuses lib/store-helpers,
   migration fills gaps in persisted levers so old snapshots keep working. */

import { DEFAULT_PROCUREMENT, defaultFacilityActions } from "./defaults";
import type { FacilitiesByYear, Facility, FacilityActions, Scope2Levers } from "./model/types";

export { allIds, uniqueId } from "@/lib/store-helpers";

/** Resolve a financial year's facility list, stamping the FY. */
export function resolveFacilities(byYear: FacilitiesByYear, year: number): Facility[] {
  return (byYear[year] ?? []).map((f) => ({ ...f, year }));
}

/** Upgrade persisted levers: fill missing per-facility entries and any
 *  procurement keys added since the snapshot was written. */
export function migrateScope2Levers(raw: unknown, facilities: Facility[]): Scope2Levers {
  const r = raw as Partial<Scope2Levers> | null | undefined;
  const byFacility: Record<string, FacilityActions> = { ...(r?.byFacility ?? {}) };
  for (const f of facilities) if (!byFacility[f.id]) byFacility[f.id] = defaultFacilityActions(f);
  return {
    byFacility,
    procurement: { ...DEFAULT_PROCUREMENT, ...(r?.procurement ?? {}) },
  };
}
