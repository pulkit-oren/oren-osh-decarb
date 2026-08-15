/* Expands byAsset combustion entries into one row per allocated asset, plus an
   unallocated remainder row when the allocation doesn't cover the full entry.
   For a byAsset entry the emitted rows ALWAYS sum to that entry's annualVolume,
   by construction: the known-asset map is built and sanitised BEFORE it is run
   through clampAllocation, and every emitted row (including the remainder) is
   derived from that same clamped map. Entries whose mode is not byAsset pass
   through unchanged, by reference. */

import type { CombustionAsset } from "@/lib/model/types";
import type { AssetRegistry } from "./types";
import { clampAllocation, unallocated } from "./allocate";

export const UNALLOCATED_SUFFIX = "::unallocated";

export function isUnallocatedId(id: string): boolean {
  return id.endsWith(UNALLOCATED_SUFFIX);
}

/** Read `.volume` off a persisted allocation-map member without destructuring
 *  in the loop header — a persisted `{"a-1": null}` must not throw. */
function readVolume(raw: unknown): number {
  if (raw === null || typeof raw !== "object") return 0;
  const v = (raw as { volume?: unknown }).volume;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function resolveAssets(
  entries: CombustionAsset[],
  registry: AssetRegistry,
): CombustionAsset[] {
  const assetsById = new Map(registry.assets.map((a) => [a.id, a]));
  const out: CombustionAsset[] = [];

  for (const e of entries) {
    if (e.allocationMode !== "byAsset" || !e.assetAllocations || typeof e.assetAllocations !== "object") {
      out.push(e);
      continue;
    }

    // 0. sanitise the entry's own volume once, up front — a NaN/negative here
    //    must never silently vanish the entry from the resolved output.
    const nSanitised = Number(e.annualVolume);
    const entryVolume = Number.isFinite(nSanitised) && nSanitised >= 0 ? nSanitised : 0;

    // 1. known-asset map — registry-present, non-electrical ids only.
    // 2. sanitise each volume to a finite non-negative number.
    const known: Record<string, number> = {};
    for (const [id, raw] of Object.entries(e.assetAllocations)) {
      const asset = assetsById.get(id);
      if (!asset || asset.category === "electrical") continue;
      known[id] = readVolume(raw);
    }

    // 3. clamp the sanitised map against the entry's own sanitised volume.
    const clamped = clampAllocation(entryVolume, known);

    // 4. emit rows from the CLAMPED values only. allocationMode/assetAllocations
    //    are explicitly cleared — a resolved row is keyed to one asset (or is
    //    the remainder), never itself a byAsset entry to be re-split.
    for (const [id, volume] of Object.entries(clamped)) {
      const asset = assetsById.get(id);
      if (!asset) continue; // clampAllocation only ever returns known ids, but stay defensive.
      out.push({
        ...e,
        id: asset.id,
        sourceEntryId: e.id,
        name: asset.name,
        bu: asset.buId || e.bu,
        annualVolume: volume,
        opex: asset.opex,
        unitCount: asset.unitCount,
        remainingLife: asset.remainingLife,
        allocationMode: undefined,
        assetAllocations: undefined,
      });
    }

    const remainder = unallocated(entryVolume, clamped);
    if (remainder > 0) {
      const share = entryVolume > 0 ? remainder / entryVolume : 0;
      out.push({
        ...e,
        id: `${e.id}${UNALLOCATED_SUFFIX}`,
        sourceEntryId: e.id,
        annualVolume: remainder,
        opex: share * e.opex,
        allocationMode: undefined,
        assetAllocations: undefined,
      });
    }
  }

  return out;
}
