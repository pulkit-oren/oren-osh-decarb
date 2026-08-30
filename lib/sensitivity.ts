/* ============================================================
   What would have to be true.

   Every assumption in this model was a point estimate: one carbon
   price, one fuel escalation, one discount rate. That is fine for
   reporting a plan and useless for deciding one, because the question
   a CFO actually asks is not "what is the NPV" but "what would have
   to be true for this to be worth doing".

   A plan showing minus INR 33 crore and no payback — the forging
   company's furnace electrification — is not a rejection. It is a
   question: at what carbon price, at what diesel escalation, does it
   turn? Answering that used to mean hand-editing the assumptions,
   reading the new number, and losing the comparison.

   This re-runs the real engines against perturbed assumptions. It
   does not approximate, interpolate or linearise: each point is a
   full recompute, so a result here is exactly what the user would see
   if they typed that value in.
   ============================================================ */

import { compute } from "./model";
import { computeScope2 } from "./scope2/model";
import { programmeMetrics } from "./finance";
import type { CombustionAsset, GlobalAssumptions, LeverSettings, RefrigerationSystem } from "./model/types";
import type { Facility, Scope2Levers } from "./scope2/model/types";

export interface SensitivityInputs {
  assets: CombustionAsset[];
  systems: RefrigerationSystem[];
  settings: LeverSettings;
  facilities: Facility[];
  levers: Scope2Levers;
  baseYear: number;
}

/** The headline numbers a swing is measured on. */
export interface Outcome {
  npv: number;
  totalCapex: number;
  costPerTonne: number;
  /** Combined Scope 1 + market-based Scope 2 reduction at 2030, as a fraction. */
  reduction2030: number;
}

export interface SensitivityPoint {
  value: number;
  outcome: Outcome;
}

export interface SensitivityRow {
  key: string;
  label: string;
  unit: string;
  /** What this variable means, in the user's terms. */
  note: string;
  low: SensitivityPoint;
  base: SensitivityPoint;
  high: SensitivityPoint;
  /** |NPV(high) − NPV(low)| — the sort key for a tornado. */
  npvSwing: number;
  /** True when NPV changes sign across the range: the assumption decides it. */
  flipsSign: boolean;
}

type Knob = keyof GlobalAssumptions;

interface VariableSpec {
  key: Knob;
  label: string;
  unit: string;
  note: string;
  /** [low, high] around whatever the plan currently assumes. */
  range: [number, number];
  /** Fallback when the plan does not set the field. */
  fallback: number;
}

/* The variables that actually move an Indian decarbonisation case. Ranges are
   deliberately wide enough to contain a real disagreement — a range that
   cannot change the answer is a range not worth printing. */
export const VARIABLES: VariableSpec[] = [
  {
    key: "carbonPricePerTonne", label: "Carbon price", unit: "₹/t", fallback: 2000, range: [0, 6000],
    note: "Nothing, through to a price at the high end of what Indian corporates set internally.",
  },
  {
    key: "fuelEscalationPct", label: "Fuel price growth", unit: "%/yr", fallback: 5, range: [2, 9],
    note: "How fast diesel, gas and coal get more expensive. Every avoided litre is worth more if this is high.",
  },
  {
    key: "elecEscalationPct", label: "Tariff growth", unit: "%/yr", fallback: 3, range: [1, 6],
    note: "How fast grid electricity gets more expensive. Cuts both ways — it rewards efficiency and punishes electrification.",
  },
  {
    key: "gridEfDeclinePctPerYear", label: "Grid decarbonisation", unit: "%/yr", fallback: 3.5, range: [0, 6],
    note: "How fast the grid cleans. A frozen grid penalises electrification; a fast one does its work for you.",
  },
  {
    key: "discountRatePct", label: "Discount rate", unit: "%", fallback: 10, range: [7, 15],
    note: "The cost of capital every future saving is discounted at.",
  },
];

function outcomeFor(inp: SensitivityInputs, assumptions: GlobalAssumptions): Outcome {
  const settings: LeverSettings = { ...inp.settings, assumptions };
  const r1 = compute(inp.assets, inp.systems, settings, inp.baseYear);
  const r2 = computeScope2(inp.facilities, inp.levers, inp.baseYear, assumptions);

  // One programme across both scopes — the same union the combined money view
  // uses, so a sensitivity result is comparable with the headline it perturbs.
  const costed = [...r1.levers, ...r2.levers]
    .filter((l) => l.capex > 0 || l.opexParts.some((p) => p.amount !== 0));
  const programme = programmeMetrics(costed.map((l) => l.series));

  const s1Base = r1.baseTotalT;
  const s2Base = r2.kpis.marketBaselineT;
  const combinedBase = s1Base + s2Base;
  const s1Cut = r1.kpis.reduction2030 * s1Base;
  const s2Cut = r2.kpis.reduction2030 * s2Base;

  return {
    npv: programme.npv,
    totalCapex: programme.totalCapex,
    costPerTonne: programme.levelisedCostPerTonne,
    reduction2030: combinedBase > 0 ? (s1Cut + s2Cut) / combinedBase : 0,
  };
}

/** Re-run the plan across each variable's range. Every point is a full
 *  recompute of both engines — no interpolation. */
export function sensitivity(inp: SensitivityInputs, variables: VariableSpec[] = VARIABLES): SensitivityRow[] {
  const base = inp.settings.assumptions;

  const rows = variables.map((v) => {
    const current = (base[v.key] as number | undefined) ?? v.fallback;
    const at = (value: number): SensitivityPoint => ({
      value,
      outcome: outcomeFor(inp, { ...base, [v.key]: value }),
    });
    const low = at(v.range[0]);
    const high = at(v.range[1]);
    const baseline = at(current);
    return {
      key: v.key,
      label: v.label,
      unit: v.unit,
      note: v.note,
      low, base: baseline, high,
      npvSwing: Math.abs(high.outcome.npv - low.outcome.npv),
      // The one thing worth flagging: an assumption that decides whether the
      // programme creates or destroys value, rather than merely how much.
      flipsSign: Math.sign(low.outcome.npv) !== Math.sign(high.outcome.npv),
    };
  });

  return rows.sort((a, b) => b.npvSwing - a.npvSwing);
}

/**
 * The lowest value of `key` at which NPV turns positive, or null when it never
 * does inside the range. This is the break-even a CFO asks for by name: "what
 * carbon price makes this work?"
 *
 * Bisection over a full recompute — 24 evaluations, which is cheap next to
 * being wrong. Assumes NPV is monotonic in the variable over the range, which
 * holds for every variable above; a non-monotonic knob would need a sweep.
 */
export function breakEven(inp: SensitivityInputs, key: Knob, range: [number, number], steps = 24): number | null {
  const base = inp.settings.assumptions;
  const npvAt = (v: number) => outcomeFor(inp, { ...base, [key]: v }).npv;

  let [lo, hi] = range;
  const npvLo = npvAt(lo);
  const npvHi = npvAt(hi);
  if (npvLo > 0) return lo;          // already worth doing at the bottom
  if (npvHi <= 0) return null;       // never worth doing inside the range

  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (npvAt(mid) > 0) hi = mid; else lo = mid;
  }
  return hi;
}
