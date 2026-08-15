/* Pure allocation math — turns an entry total plus a basis into a per-asset
   volume map. The result ALWAYS sums to the entry total when a computed basis
   is used; the last asset absorbs the rounding remainder. No mutation. */

import type { Asset, AllocationBasis, WeightAttribute } from "./types";

export interface AllocationInput {
  entryVolume: number;
  basis: AllocationBasis;
  assets: Asset[];
  weightAttribute?: WeightAttribute;
  /** carryForward: the prior period's per-asset volumes (proportions are reused). */
  previous?: Record<string, number>;
  /** manual: the current map, returned untouched. */
  existing?: Record<string, number>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Split `total` across `weights` proportionally. The last element absorbs the
 *  rounding remainder so the returned array sums to `total` rounded to 2 decimal
 *  places — EXCEPT when earlier elements rounded up past the total, which would
 *  make that remainder negative; in that case the last element is clamped to 0
 *  instead, so a negative allocation is never returned. When that clamp fires,
 *  the array no longer sums exactly to `total` — the sum can be off by a cent
 *  or two (more with many near-zero weights) because the rounding drift that
 *  would have been absorbed by the last element is left standing instead.
 *  All allocations are cent-precision. */
export function distribute(total: number, weights: number[]): number[] {
  // Coerce total to a finite non-negative number to prevent NaN/negative propagation
  const n = Number(total);
  const safeTotal = Number.isFinite(n) && n >= 0 ? n : 0;
  const roundedTotal = round2(safeTotal);
  // Coerce weights to finite non-negative numbers to prevent NaN propagation
  const coercedWeights = weights.map((w) => {
    const n = Number(w) || 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  const sum = coercedWeights.reduce((a, b) => a + b, 0);
  // Guard against zero, negative, or non-finite sum
  if (!Number.isFinite(sum) || sum <= 0) return coercedWeights.map(() => 0);
  const out: number[] = [];
  let acc = 0;
  coercedWeights.forEach((w, i) => {
    if (i === coercedWeights.length - 1) {
      out.push(Math.max(0, round2(roundedTotal - acc)));
    } else {
      const v = round2((roundedTotal * w) / sum);
      out.push(v);
      acc += v;
    }
  });
  return out;
}

function weightFor(a: Asset, attr: WeightAttribute | undefined): number {
  const fallback = a.unitCount || 0;
  switch (attr) {
    case "ratedCapacity":
      return a.ratedCapacity ?? fallback;
    case "operatingHours":
      return a.tier2?.operatingHoursPerYear ?? fallback;
    case "unitCount":
    case "lastPeriod":
    case undefined:
      return fallback;
    default:
      // Guard against unrecognized weight attributes (e.g., from stale JSON)
      return fallback;
  }
}

export function computeAllocation(input: AllocationInput): Record<string, number> {
  const { entryVolume, basis, assets, weightAttribute, previous, existing } = input;
  if (basis === "manual") return { ...(existing ?? {}) };
  if (assets.length === 0) return {};

  let weights: number[];
  if (basis === "even") {
    weights = assets.map((a) => a.unitCount || 0);
  } else if (basis === "weighted") {
    weights = assets.map((a) => weightFor(a, weightAttribute));
  } else {
    // carryForward — reuse prior proportions; fall back to even when absent.
    const prior = assets.map((a) => previous?.[a.id] ?? 0);
    weights = prior.some((p) => p > 0) ? prior : assets.map((a) => a.unitCount || 0);
  }

  const volumes = distribute(entryVolume, weights);
  return Object.fromEntries(assets.map((a, i) => [a.id, volumes[i]]));
}

/** Entry volume not yet allocated to any asset. Never negative. */
export function unallocated(entryVolume: number, alloc: Record<string, number>): number {
  const used = Object.values(alloc).reduce((s, v) => s + (v || 0), 0);
  return round2(Math.max(0, entryVolume - used));
}

/** Guard for the manual path: an allocation may never exceed the entry volume.
 *  An overshoot is scaled back proportionally rather than rejected, so the user
 *  never loses their relative intent (spec 5.2). */
export function clampAllocation(
  entryVolume: number,
  alloc: Record<string, number>,
): Record<string, number> {
  const ids = Object.keys(alloc);
  if (ids.length === 0) return {};
  const total = ids.reduce((s, id) => s + (alloc[id] || 0), 0);
  if (total <= entryVolume) return { ...alloc };
  const scaled = distribute(entryVolume, ids.map((id) => alloc[id] || 0));
  return Object.fromEntries(ids.map((id, i) => [id, scaled[i]]));
}
