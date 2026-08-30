/* Equipment - the machines inside ONE combustion source. Unlike the deleted
   lib/assets registry these are never company-wide: a source's split only ever
   offers its own equipment, which is what makes a diesel entry unable to be
   allocated onto "Coal" (spec section 1). Pure types. */

import type { EndUseId } from "@/lib/model/end-use";

export type CapacityUnit = "kW" | "kVA" | "TR" | "tph";

/** How a source's volume is divided across its equipment (spec 4.1). */
export type AllocationBasis =
  | "load"          // capacity x operatingHours - the default
  | "capacity"      // capacity alone
  | "units"         // unitCount (D10)
  | "even"          // 1 each
  | "carryForward"  // prior year's proportions
  | "manual";       // typed by hand

export interface Equipment {
  /** Stable across fiscal years - lever settings are keyed by this. The first
   *  equipment of a migrated source REUSES the source's id; see spec 3.3. */
  id: string;
  /** User-typed, required, non-empty. */
  name: string;
  /** Rated capacity, in the SOURCE's capacityUnit (D9 - there is deliberately
   *  no per-equipment unit). Absent => excluded from the capacity/load bases. */
  capacity?: number;
  /** Running hours per year. Absent => excluded from the load basis. */
  operatingHours?: number;
  /** Identical units this equipment stands for; one machine => 1 (D8). Moved
   *  down from the source, NOT deleted - nine consumers across segments.ts,
   *  energy-balance.ts, suggestions.ts, index.ts and export.ts read it off the
   *  resolved row. Weights the `units` basis. */
  unitCount: number;
  /** Remaining useful life, years. The retrofit guardrail
   *  (lib/model/validate.ts:10) reads this; absent would make it NaN. */
  remainingLife: number;
  /** Drives lever defaults and feasibility. Absent => unspecified. */
  endUse?: EndUseId;
  /** Process duty temperature, °C. The field the electrification lever is
   *  checked against: a COP above ~1.2 means heat recovery, which is
   *  commercial only to about 165 °C, so this is what separates a heat pump
   *  from a resistive conversion. Absent => the COP cannot be checked, which
   *  is itself reported. See lib/model/feasibility.ts. */
  dutyTempC?: number;
}
