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

/** The ONE definition of a source's first equipment. Every mint site goes
 *  through this: migrateEquipment below, DataInputTab's write-path fallback,
 *  and (Task 5) the source-creation site in SourceListScreen. It is a function
 *  rather than a documented convention because two hand-written copies of it
 *  diverged on `endUse` inside a single fix round.
 *
 *  Reuses the entry's OWN id, which is what keeps a saved lever resolving:
 *  LeverSettings is keyed by equipment id, and a pre-equipment lever was keyed
 *  by the entry id (spec 3.3). Coerces through num() and re-reads the entry as
 *  unknown because a caller may be handing over unvalidated localStorage — the
 *  static type is no guarantee at this boundary. */
export function mintFirstEquipment(entry: CombustionAsset): Equipment {
  const e = entry as unknown as Record<string, unknown>;
  return {
    id: String(e.id),
    name: typeof e.name === "string" && e.name ? e.name : "Equipment 1",
    unitCount: Math.max(1, Math.round(num(e.unitCount, 1))),
    remainingLife: num(e.remainingLife, 10),
    endUse: e.endUse as Equipment["endUse"],
  };
}

export function migrateEquipment(
  byYear: Record<number, CombustionAsset[]>,
): Record<number, CombustionAsset[]> {
  const out: Record<number, CombustionAsset[]> = {};

  for (const [year, entries] of Object.entries(byYear ?? {})) {
    out[Number(year)] = (entries ?? []).map((entry) => {
      const e = entry as unknown as Record<string, unknown>;

      if (Array.isArray(e.equipment) && e.equipment.length > 0) return entry;

      const equipment: Equipment = mintFirstEquipment(entry);

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
