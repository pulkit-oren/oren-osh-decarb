/* ============================================================
   Year-by-year cashflow — money follows the same deployment ramp
   as the trajectory. Capex lands as the ramp phases in; opex deltas
   scale with the ramp AND escalate by price line (diesel inflates
   faster than grid tariffs — a static snapshot structurally hides
   the argument for electrification). Outputs the numbers a board
   asks for: NPV, peak funding need, and the true payback year.
   Sign convention: positive = cash OUT. Pure.
   ============================================================ */

import type { OpexPart } from "./index";

export interface CashflowLever {
  id: string;
  label: string;
  capex: number;
  opexParts: OpexPart[];
  startYear: number;
  rampYears: number;
}

export interface CashflowAssumptions {
  discountRatePct: number;
  fuelEscalationPct: number; // diesel / FO / gas price growth per year
  elecEscalationPct: number; // grid tariff growth per year
}

export const DEFAULT_CASHFLOW_ASSUMPTIONS: CashflowAssumptions = {
  discountRatePct: 10,
  fuelEscalationPct: 5,
  elecEscalationPct: 3,
};

export interface CashflowRow {
  year: number;
  capex: number;      // investment landing this year (ramp increment)
  opexDelta: number;  // running-cost change this year (escalated)
  net: number;        // capex + opexDelta (positive = cash out)
  cumulative: number; // running total of net
}

export interface CashflowResult {
  rows: CashflowRow[];
  totalCapex: number;
  /** Net present value of the program: Σ −net(y) ÷ (1+r)^t. Positive = value-creating. */
  npv: number;
  /** Worst cumulative cash position — the funding the program actually needs. */
  peakFunding: number;
  /** First year the cumulative cash turns non-positive (savings repaid the spend). */
  paybackYear: number | null;
}

const rampAt = (l: CashflowLever, year: number): number => {
  if (year < l.startYear) return 0;
  return Math.min(1, (year - l.startYear + 1) / Math.max(1, l.rampYears));
};

export function buildCashflow(
  levers: CashflowLever[],
  baseYear: number,
  endYear = 2040,
  a: CashflowAssumptions = DEFAULT_CASHFLOW_ASSUMPTIONS,
): CashflowResult {
  const active = levers.filter((l) => l.capex > 0 || l.opexParts.some((p) => p.amount !== 0));
  const r = a.discountRatePct / 100;
  const escFor = (kind: OpexPart["kind"]) =>
    kind === "fuel" ? a.fuelEscalationPct / 100 : kind === "elec" ? a.elecEscalationPct / 100 : 0;

  const rows: CashflowRow[] = [];
  let cumulative = 0;
  let npv = 0;
  let peakFunding = 0;
  let spentAnything = false;
  let paybackYear: number | null = null;

  for (let year = baseYear; year <= endYear; year++) {
    let capex = 0;
    let opexDelta = 0;
    for (const l of active) {
      const ramp = rampAt(l, year);
      const prevRamp = rampAt(l, year - 1);
      capex += l.capex * Math.max(0, ramp - prevRamp); // investment follows deployment
      for (const p of l.opexParts) {
        opexDelta += p.amount * ramp * Math.pow(1 + escFor(p.kind), year - baseYear);
      }
    }
    const net = capex + opexDelta;
    cumulative += net;
    npv += -net / Math.pow(1 + r, year - baseYear);
    if (capex > 0) spentAnything = true;
    peakFunding = Math.max(peakFunding, cumulative);
    if (paybackYear === null && spentAnything && cumulative <= 0) paybackYear = year;
    rows.push({ year, capex, opexDelta, net, cumulative });
  }

  return {
    rows,
    totalCapex: active.reduce((s, l) => s + l.capex, 0),
    npv,
    peakFunding,
    paybackYear,
  };
}
