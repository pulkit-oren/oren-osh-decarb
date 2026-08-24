/* One-way upgrade of persisted combustion state to the equipment model. Runs
   on hydrate (lib/store.tsx). Idempotent: an entry that already has a non-empty
   `equipment` array is returned by reference, so an already-migrated user pays
   nothing on every subsequent load. */

import type { CombustionAsset } from "@/lib/model/types";
import type { Equipment } from "./types";

/** Persisted JSON is untrusted - a hand-edited or half-written localStorage
 *  blob must not throw or produce NaN. */
function num(raw: unknown, fallback: number): number {
  // Number(null) and Number("") both coerce to 0, which would otherwise pass
  // the finite/non-negative check below and mask a genuinely absent field.
  if (raw === null || raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function migrateEquipment(
  byYear: Record<number, CombustionAsset[]>,
): Record<number, CombustionAsset[]> {
  const out: Record<number, CombustionAsset[]> = {};

  for (const [year, entries] of Object.entries(byYear ?? {})) {
    out[Number(year)] = (entries ?? []).map((entry) => {
      const e = entry as unknown as Record<string, unknown>;

      if (Array.isArray(e.equipment) && e.equipment.length > 0) return entry;

      const equipment: Equipment = {
        id: String(e.id),
        name: typeof e.name === "string" && e.name ? e.name : "Equipment 1",
        unitCount: Math.max(1, Math.round(num(e.unitCount, 1))),
        remainingLife: num(e.remainingLife, 10),
        endUse: e.endUse as Equipment["endUse"],
      };

      const volume = num(e.annualVolume, 0);

      // Drop, never translate: a shipped allocation points at company-wide
      // asset ids that no longer exist, and translating a
      // diesel-allocated-to-Coal split would carry the section 1 defect forward.
      const {
        remainingLife: _rl, unitCount: _uc, endUse: _eu,
        allocationMode: _am, assetAllocations: _aa, weightAttribute: _wa,
        ...rest
      } = e;

      return {
        ...rest,
        equipment: [equipment],
        allocations: { [equipment.id]: volume },
      } as unknown as CombustionAsset;
    });
  }

  return out;
}
