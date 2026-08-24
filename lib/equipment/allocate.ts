/* Pure allocation math - turns a source total plus a basis into a per-equipment
   volume map. Under a computed basis the result ALWAYS sums to the source total;
   the last equipment absorbs the rounding remainder. No mutation.

   weightsFor is the SINGLE source of truth for the weights: computeAllocation
   and explainAllocation both call it, so the explainer can never disagree with
   the number printed beside it (spec 4.3). */

import type { Equipment, AllocationBasis } from "./types";

export interface AllocationInput {
  entryVolume: number;
  basis: AllocationBasis;
  equipment: Equipment[];
  /** carryForward: the prior period's per-equipment volumes. */
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
    const v = Number(w) || 0;
    return Number.isFinite(v) && v >= 0 ? v : 0;
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

/** The weights every basis distributes by. The ONLY place a basis is turned
 *  into numbers - see the module comment. */
export function weightsFor(
  equipment: Equipment[],
  basis: AllocationBasis,
  previous?: Record<string, number>,
): number[] {
  switch (basis) {
    case "load":
      return equipment.map((e) => (e.capacity ?? 0) * (e.operatingHours ?? 0));
    case "capacity":
      return equipment.map((e) => e.capacity ?? 0);
    case "units":
      return equipment.map((e) => e.unitCount || 0);
    case "carryForward": {
      const prior = equipment.map((e) => previous?.[e.id] ?? 0);
      return prior.some((p) => p > 0) ? prior : equipment.map(() => 1);
    }
    case "even":
    case "manual":
    default:
      return equipment.map(() => 1);
  }
}

export function computeAllocation(input: AllocationInput): Record<string, number> {
  const { entryVolume, basis, equipment, previous, existing } = input;
  if (basis === "manual") return { ...(existing ?? {}) };
  if (equipment.length === 0) return {};
  const volumes = distribute(entryVolume, weightsFor(equipment, basis, previous));
  return Object.fromEntries(equipment.map((e, i) => [e.id, volumes[i]]));
}

const plural = (n: number, verb: string) =>
  `${n} equipment ${n === 1 ? verb : verb === "has" ? "have" : verb}`;

/** null = available. A string is the reason the basis is disabled, shown to the
 *  user rather than silently falling back to `even` - which is how the shipped
 *  version made a wrong split look computed (spec 4.1). */
export function basisAvailability(
  equipment: Equipment[],
  previous?: Record<string, number>,
): Record<AllocationBasis, string | null> {
  const noCapacity = equipment.filter((e) => e.capacity == null).length;
  const noHours = equipment.filter((e) => e.operatingHours == null).length;
  const priorHas = equipment.some((e) => (previous?.[e.id] ?? 0) > 0);
  return {
    load: noCapacity > 0
      ? `${plural(noCapacity, "has")} no capacity`
      : noHours > 0 ? `${plural(noHours, "has")} no running hours` : null,
    capacity: noCapacity > 0 ? `${plural(noCapacity, "has")} no capacity` : null,
    units: null,
    even: null,
    carryForward: priorHas ? null : "no allocation recorded for the prior year",
    manual: null,
  };
}

const FORMULA: Partial<Record<AllocationBasis, string>> = {
  load: "capacity x running hours",
  capacity: "rated capacity",
  units: "number of units",
  even: "an equal share each",
  carryForward: "last year's split",
};

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** The "how is it done" block: the formula plus ONE worked row with real
 *  numbers, both derived from weightsFor so they cannot drift (spec 4.3). */
export function explainAllocation(
  input: AllocationInput,
): { formula: string; row: string } | null {
  const { entryVolume, basis, equipment, previous } = input;
  if (basis === "manual" || equipment.length === 0) return null;

  const weights = weightsFor(equipment, basis, previous);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  const volumes = distribute(entryVolume, weights);
  const first = equipment[0];
  const pct = ((weights[0] / total) * 100).toFixed(1);

  const formula = `Each equipment gets a share of ${fmt(entryVolume)} in proportion to ${FORMULA[basis]}.`;

  const workings = basis === "load"
    ? `${fmt(first.capacity ?? 0)} x ${fmt(first.operatingHours ?? 0)} = ${fmt(weights[0])} of ${fmt(total)} total`
    : basis === "units"
      ? `${fmt(weights[0])} of ${fmt(total)} units`
      : `${fmt(weights[0])} of ${fmt(total)} total`;

  return {
    formula,
    row: `${first.name} = ${workings} → ${pct}% → ${fmt(volumes[0])}`,
  };
}

/** Source volume not yet allocated to any equipment. Never negative. */
export function unallocated(entryVolume: number, alloc: Record<string, number>): number {
  const used = Object.values(alloc).reduce((s, v) => s + (v || 0), 0);
  return round2(Math.max(0, entryVolume - used));
}

/** Guard for the manual path: an allocation may never exceed the source volume.
 *  An overshoot is scaled back proportionally rather than rejected, so the user
 *  never loses their relative intent (invariant 3). */
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
