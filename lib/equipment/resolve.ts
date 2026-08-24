/* Expands each combustion source into one row per equipment, plus a remainder
   row when the allocation does not cover the whole source. The emitted rows
   ALWAYS sum to the source's annualVolume AND to its opex, by construction:
   the allocation map is sanitised and clamped BEFORE any row is emitted, and
   every row - remainder included - is derived from that same clamped map.

   Unlike the deleted lib/assets/resolve.ts this takes no registry: a source's
   equipment are its own children, so there is nothing to look up and no way to
   allocate onto another source's machine. */

import type { CombustionAsset } from "@/lib/model/types";
import { clampAllocation, unallocated } from "./allocate";

export const UNALLOCATED_SUFFIX = "::unallocated";

export function isUnallocatedId(id: string): boolean {
  return id.endsWith(UNALLOCATED_SUFFIX);
}

function safeVolume(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function resolveEquipment(entries: CombustionAsset[]): CombustionAsset[] {
  const out: CombustionAsset[] = [];

  for (const e of entries) {
    const equipment = Array.isArray(e.equipment) ? e.equipment : [];

    // D8 (at least one equipment) is enforced at the WRITE points - the
    // hydrate-time migration, addCombustion / importCombustion, source
    // creation - and is deliberately NOT a type invariant (`equipment?:`,
    // Ruling K), so this reader cannot assume it. Degrade by passing the entry
    // through unexpanded rather than dropping it: its volume and opex still
    // reach the engine as one row keyed to the entry id.
    if (equipment.length === 0) {
      // Cleared for the same reason every other emitted row clears it: a
      // resolved row is never itself re-splittable.
      out.push({ ...e, allocations: undefined });
      continue;
    }

    const entryVolume = safeVolume(e.annualVolume);

    // Only this source's own equipment ids are readable. An allocation key
    // naming anything else is ignored, not resolved - the section 1 defect
    // was precisely that a foreign id could be honoured.
    const known: Record<string, number> = {};
    for (const unit of equipment) {
      known[unit.id] = e.allocations
        ? safeVolume(e.allocations[unit.id])
        : unit.id === equipment[0].id ? entryVolume : 0;
    }

    const clamped = clampAllocation(entryVolume, known);

    for (const unit of equipment) {
      const volume = clamped[unit.id] ?? 0;
      const share = entryVolume > 0 ? volume / entryVolume : 0;
      out.push({
        ...e,
        id: unit.id,
        sourceEntryId: e.id,
        name: unit.name,
        annualVolume: volume,
        // Volume share, NOT the whole figure. The shipped resolver copied the
        // full opex onto every row and inflated company spend on every split
        // (spec 2.2). Invariant 6 is the test.
        opex: share * e.opex,
        // The row carries exactly the one machine it descends from...
        equipment: [unit],
        // ...and Ruling A stamps that machine's values FLAT, because the nine
        // model consumers (segments.ts:62,75,156, energy-balance.ts:36,109,
        // suggestions.ts:26, validate.ts:10, export.ts:34) read them flat off
        // the row. Resolution is the only writer of these three.
        remainingLife: unit.remainingLife,
        unitCount: unit.unitCount,
        endUse: unit.endUse,
        allocations: undefined,
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
        allocations: undefined,
      });
    }
  }

  return out;
}
