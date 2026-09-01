/* ============================================================
   Turning a typed figure on a capex line into per-source writes.

   A line aggregates several sources — three facilities' LED packages,
   nine vehicles at two different prices — and the table shows one
   figure for it. Typing a new figure has to land somewhere, and the
   choice of WHERE is the whole design:

   Scaling, not flattening. Each source's field is multiplied by
   `typed / current`, so the line reads back exactly the number typed
   while the spread between sources survives. Overwriting every source
   with the typed value would silently destroy per-asset prices entered
   in the Scope 1 / Scope 2 screens, and the line would read back the
   same either way — so the destructive option buys nothing.

   One formula covers both kinds of line, because both are "multiply
   each source's field by the same factor":

     decomposing (solar: kW x Rs/kW)  current = the weighted-average RATE
                                      -> the weighted average becomes `typed`
     lump        (LED: Rs per site)   current = the line's total AMOUNT
                                      -> the total becomes `typed`

   Pure: no React, no store. The caller reads each source's current
   value and applies the returned patches, because only it knows which
   store holds which field.
   ============================================================ */

import type { CapexEditTarget, CapexLine } from "./capex";

/** One write, already resolved to a store, a source and a field. */
export type CapexPatch =
  | { kind: "s1-asset"; sourceId: string; action: "efficiency" | "electrify" | "fuelSwitch" | "flexFuel"; field: string; value: number }
  | { kind: "s1-system"; sourceId: string; action: "leakFix" | "chargeReduction" | "gasSwitch"; field: string; value: number }
  | { kind: "s1-assumption"; field: "infraCapex"; value: number }
  | { kind: "s2-facility"; sourceId: string; action: "efficiency" | "generation"; field: string; value: number };

/** What the table shows for a line, and therefore what a typed figure
 *  replaces: a per-unit rate where the driver genuinely decomposes, the
 *  total otherwise. Never invent a unit rate to make the table uniform. */
export function editableFigure(line: CapexLine): { value: number; kind: "rate" | "total" } {
  return line.unit ? { value: line.unit.rate, kind: "rate" } : { value: line.amount, kind: "total" };
}

/** Is this line's figure something a user can type over?
 *
 *  `edit: null` means the driver consumes no capital (green procurement is
 *  priced per kWh in the procurement action, not as capital). A `subsidyPct`
 *  target is a PERCENTAGE, and scaling a percentage by a rupee ratio is not a
 *  meaningful operation — the subsidy shows, negative, and stays editable per
 *  facility in the Scope 2 screen. */
export function isEditable(line: CapexLine): boolean {
  if (!line.edit) return false;
  if (line.edit.kind === "s2-facility" && line.edit.field === "subsidyPct") return false;
  return true;
}

/** The factor each source's field is multiplied by.
 *
 *  Two guards, both from the spec:
 *  - a current figure of 0 cannot be scaled — there is no ratio — so those
 *    sources take the typed value directly. That is flattening a set of zeros,
 *    which loses nothing.
 *  - a typed 0 sets every source to 0, rather than being read as "no change". */
export function scaleFactor(current: number, typed: number): number | null {
  if (!Number.isFinite(typed)) return null;
  if (typed === 0) return 0;
  if (!(current > 0)) return null; // caller assigns `typed` directly
  return typed / current;
}

/** Per-source writes that make `line` read back `typed`.
 *
 *  `readSource` returns a source's CURRENT value for this line's field; the
 *  caller supplies it because only it knows which store holds it. A source the
 *  caller cannot resolve returns undefined and is skipped rather than being
 *  written a guessed value. */
export function capexEditPatches(
  line: CapexLine,
  typed: number,
  readSource: (sourceId: string) => number | undefined,
): CapexPatch[] {
  if (!isEditable(line) || !line.edit) return [];
  if (!Number.isFinite(typed)) return [];

  const current = editableFigure(line).value;
  const factor = scaleFactor(current, typed);

  /* A whole-company lump has one "source" and no spread to preserve, so it
     takes the typed figure directly whatever the factor would have been. */
  if (line.edit.kind === "s1-assumption") {
    return [{ kind: "s1-assumption", field: "infraCapex", value: typed }];
  }

  const target: CapexEditTarget = line.edit;
  const out: CapexPatch[] = [];

  for (const sourceId of line.sourceIds) {
    const now = readSource(sourceId);
    if (now === undefined) continue;
    const value = factor === null ? typed : now * factor;
    if (!Number.isFinite(value)) continue;

    if (target.kind === "s1-asset") {
      out.push({ kind: "s1-asset", sourceId, action: target.action, field: target.field, value });
    } else if (target.kind === "s1-system") {
      out.push({ kind: "s1-system", sourceId, action: target.action, field: target.field, value });
    } else if (target.kind === "s2-facility") {
      out.push({ kind: "s2-facility", sourceId, action: target.action, field: target.field, value });
    }
  }

  return out;
}
