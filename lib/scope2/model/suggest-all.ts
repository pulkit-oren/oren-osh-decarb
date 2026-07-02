/* Portfolio-wide "Suggest a plan for me" for Scope 2 — apply the per-facility
   suggestion (efficiency + solar where feasible) to every non-excluded
   grid-supplied facility in one pass. Procurement is left to the user (it's a
   portfolio decision with real contracts behind it). Pure. */

import { defaultFacilityActions } from "../defaults";
import { suggestForFacility } from "./suggestions";
import type { Facility, Scope2Levers } from "./types";

export function suggestAllScope2(facilities: Facility[], prev: Scope2Levers): Scope2Levers {
  const byFacility = { ...prev.byFacility };
  for (const f of facilities) {
    if (f.excluded || f.gridEf <= 0) continue;
    const cur = byFacility[f.id] ?? defaultFacilityActions(f);
    const next = { ...cur } as unknown as Record<string, Record<string, unknown>>;
    for (const a of suggestForFacility(f).actions) next[a.lever] = { ...next[a.lever], ...a.patch };
    byFacility[f.id] = next as unknown as typeof cur;
  }
  return { ...prev, byFacility };
}
