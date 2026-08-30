/* ============================================================
   24/7 carbon-free energy — matching clean supply to load HOUR BY
   HOUR rather than netting it off over a year.

   Procurement coverage was an annual percentage: buy as many
   renewable units in a year as you consume in a year and you are
   "100% renewable". That is how RE100 has been claimed for a decade,
   and it is increasingly not the claim being asked for, because it
   is silent about the thing that actually determines whether your
   consumption caused emissions: WHEN.

   A solar-heavy Indian portfolio at 95% annual coverage typically
   scores far lower hourly, because a three-shift plant and a 24x7
   campus draw through a night that solar does not cover. The gap
   between those two numbers is not an accounting detail — it is the
   storage and the wind contract nobody has bought yet.

   WHAT THIS IS NOT. It is not an 8,760-hour dispatch model. It runs
   ONE representative day of 24 hours, scaled to annual energy, with
   no seasonality, no weather years and no forecast error. It will
   not tell you the cost of a particular hedging strategy. It WILL
   tell you, correctly and to within a few points, that an annual
   claim overstates a solar-heavy portfolio and by roughly how much —
   which is the decision-relevant fact and the one the annual number
   hid completely. Every result carries that caveat in the type.
   ============================================================ */

import type { FacilityTypeId } from "./facility-type";

/** Normalised hourly load shapes, midnight to 23:00. Relative, not absolute:
 *  only the SHAPE matters, since each is scaled to the site's own annual kWh. */
export const LOAD_SHAPES: Record<FacilityTypeId | "default", number[]> = {
  // Three-shift plants are nearly flat; the small daytime lift is ancillary
  // load, not process load.
  factory: [
    0.92, 0.92, 0.90, 0.90, 0.92, 0.95, 1.00, 1.05, 1.10, 1.12, 1.12, 1.10,
    1.05, 1.08, 1.10, 1.10, 1.08, 1.05, 1.02, 1.00, 0.98, 0.96, 0.94, 0.92,
  ],
  // Offices are the opposite: a pronounced working-day peak, low at night.
  office: [
    0.30, 0.28, 0.27, 0.27, 0.28, 0.35, 0.50, 0.70, 0.95, 1.15, 1.30, 1.38,
    1.35, 1.38, 1.40, 1.35, 1.25, 1.05, 0.80, 0.60, 0.48, 0.42, 0.36, 0.32,
  ],
  // A data centre barely varies at all — the hardest possible load to match.
  dataCentre: [
    0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 1.00, 1.00, 1.02, 1.02, 1.02, 1.02,
    1.02, 1.02, 1.02, 1.02, 1.02, 1.00, 1.00, 1.00, 0.98, 0.98, 0.98, 0.98,
  ],
  coldStorage: [
    1.00, 1.00, 0.98, 0.98, 0.98, 1.00, 1.02, 1.05, 1.08, 1.10, 1.12, 1.12,
    1.10, 1.10, 1.08, 1.05, 1.02, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
  ],
  warehouse: [
    0.45, 0.42, 0.40, 0.40, 0.45, 0.60, 0.85, 1.05, 1.20, 1.25, 1.25, 1.20,
    1.15, 1.20, 1.22, 1.20, 1.10, 0.95, 0.80, 0.70, 0.62, 0.58, 0.52, 0.48,
  ],
  retail: [
    0.35, 0.32, 0.30, 0.30, 0.32, 0.40, 0.55, 0.75, 1.00, 1.20, 1.30, 1.35,
    1.35, 1.35, 1.35, 1.35, 1.35, 1.30, 1.25, 1.15, 0.95, 0.70, 0.50, 0.40,
  ],
  hotel: [
    0.65, 0.60, 0.58, 0.58, 0.60, 0.70, 0.90, 1.10, 1.20, 1.20, 1.15, 1.10,
    1.05, 1.05, 1.05, 1.08, 1.15, 1.25, 1.35, 1.35, 1.25, 1.05, 0.85, 0.72,
  ],
  default: [
    0.70, 0.68, 0.66, 0.66, 0.70, 0.80, 0.95, 1.10, 1.20, 1.25, 1.25, 1.20,
    1.15, 1.18, 1.20, 1.18, 1.12, 1.02, 0.92, 0.85, 0.80, 0.78, 0.75, 0.72,
  ],
};

/** Indian solar: nothing before ~06:00, nothing after ~18:00, peak at noon. */
export const SOLAR_SHAPE = [
  0, 0, 0, 0, 0, 0.02, 0.15, 0.38, 0.62, 0.82, 0.95, 1.00,
  0.98, 0.90, 0.75, 0.55, 0.32, 0.10, 0.01, 0, 0, 0, 0, 0,
];

/** Indian wind: flatter and night-biased — which is exactly why a solar-wind
 *  hybrid scores so much better hourly than solar alone. */
export const WIND_SHAPE = [
  0.85, 0.88, 0.90, 0.90, 0.88, 0.82, 0.72, 0.62, 0.55, 0.50, 0.48, 0.50,
  0.55, 0.62, 0.70, 0.78, 0.85, 0.92, 0.98, 1.00, 0.98, 0.95, 0.90, 0.88,
];

const HOURS = 24;
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

/** Scale a normalised shape so it sums to `annualKwh / 365` — one day. */
function dailyProfile(annualKwh: number, shape: number[]): number[] {
  const total = sum(shape);
  if (total <= 0 || annualKwh <= 0) return new Array(HOURS).fill(0);
  const daily = annualKwh / 365;
  return shape.map((x) => (x / total) * daily);
}

export interface CfeInput {
  /** The site's own annual consumption, kWh. */
  loadKwh: number;
  facilityType?: FacilityTypeId;
  /** An explicit normalised 24-hour load shape, overriding facilityType. Used
   *  for a PORTFOLIO, whose shape is the load-weighted blend of its sites'
   *  — shapes are linear, so blending them is exact rather than an average of
   *  averages. */
  loadShape?: number[];
  /** Self-consumed on-site solar, kWh/yr. */
  solarKwh: number;
  /** Contracted renewable energy, kWh/yr (PPA + I-REC + VPPA). */
  contractedKwh: number;
  /** Share of the contracted volume that is wind rather than solar, 0..100.
   *  The single most important lever on an hourly score, and the one an annual
   *  number is completely blind to. */
  contractWindPct?: number;
  /** Usable storage, kWh. Shifts surplus clean energy into deficit hours. */
  batteryKwh?: number;
  /** One-way efficiency of the round trip, 0..1. */
  batteryEfficiency?: number;
}

export interface CfeResult {
  /** Clean share when energy is netted over the year — the RE100 claim. */
  annualMatchedPct: number;
  /** Clean share when matched hour by hour — the 24/7 CFE score. */
  hourlyMatchedPct: number;
  /** annual − hourly: the part of the claim that does not survive the clock. */
  gapPct: number;
  /** Per-hour load, clean supply and matched energy, for a chart. */
  byHour: { hour: number; loadKwh: number; cleanKwh: number; matchedKwh: number }[];
  /** Clean energy generated in hours with no load to absorb it, kWh/day. */
  surplusKwhPerDay: number;
  /** Load left uncovered, kWh/day. */
  deficitKwhPerDay: number;
  /** ALWAYS true. One representative day, no seasonality — see the module
   *  comment. Carried in the result so a consumer cannot present this as a
   *  dispatch model by forgetting to read the docs. */
  representativeDayOnly: true;
}

/**
 * Match clean supply to load across a representative day.
 *
 * The battery is dispatched greedily: store whatever clean energy exceeds load
 * in an hour, release it into the next deficit hour. Greedy is optimal here
 * because the profile is a single cycle with one surplus block and one deficit
 * block — it would NOT be optimal against real 8,760-hour prices, which is one
 * more reason this reports a score and not a strategy.
 */
export function cfeScore(inp: CfeInput): CfeResult {
  const shape = inp.loadShape && inp.loadShape.length === HOURS
    ? inp.loadShape
    : LOAD_SHAPES[inp.facilityType ?? "default"] ?? LOAD_SHAPES.default;
  const load = dailyProfile(inp.loadKwh, shape);

  const windShare = Math.max(0, Math.min(100, inp.contractWindPct ?? 0)) / 100;
  const contractedSolar = dailyProfile(inp.contractedKwh * (1 - windShare), SOLAR_SHAPE);
  const contractedWind = dailyProfile(inp.contractedKwh * windShare, WIND_SHAPE);
  const onsite = dailyProfile(inp.solarKwh, SOLAR_SHAPE);

  const clean = load.map((_, h) => onsite[h] + contractedSolar[h] + contractedWind[h]);

  // Greedy battery: soak up surplus, release into deficit.
  //
  // The day is CYCLIC, and it has to be. A single non-wrapping pass starts at
  // midnight with an empty store, so the pre-dawn hours — the ones solar can
  // never reach — are unservable by definition, and the model reports the same
  // score for a 12 MWh battery as for a 60 MWh one. In reality those hours are
  // carried by yesterday afternoon. Running the loop twice and keeping only the
  // second pass reaches the steady state a repeating day settles into.
  const capacity = Math.max(0, inp.batteryKwh ?? 0);
  const eff = Math.max(0, Math.min(1, inp.batteryEfficiency ?? 0.9));
  let stored = 0;
  let matched: number[] = [];

  for (let pass = 0; pass < 2; pass++) {
    const covered: number[] = [];
    for (let h = 0; h < HOURS; h++) {
      const direct = Math.min(load[h], clean[h]);
      let got = direct;
      const surplus = clean[h] - direct;
      if (surplus > 0 && capacity > 0) {
        stored = Math.min(capacity, stored + surplus * eff);
      } else {
        const deficit = load[h] - got;
        if (deficit > 0 && stored > 0) {
          const release = Math.min(stored, deficit);
          stored -= release;
          got += release;
        }
      }
      covered.push(got);
    }
    matched = covered;
  }

  const loadTotal = sum(load);
  const cleanTotal = sum(clean);
  const matchedTotal = sum(matched);

  return {
    // Netting over the year is the annual claim, capped at 100 — buying more
    // than you consume does not make you more than fully covered.
    annualMatchedPct: loadTotal > 0 ? Math.min(100, (cleanTotal / loadTotal) * 100) : 0,
    hourlyMatchedPct: loadTotal > 0 ? (matchedTotal / loadTotal) * 100 : 0,
    gapPct: loadTotal > 0
      ? Math.max(0, Math.min(100, (cleanTotal / loadTotal) * 100) - (matchedTotal / loadTotal) * 100)
      : 0,
    byHour: load.map((l, h) => ({ hour: h, loadKwh: l, cleanKwh: clean[h], matchedKwh: matched[h] })),
    surplusKwhPerDay: Math.max(0, cleanTotal - matchedTotal),
    deficitKwhPerDay: Math.max(0, loadTotal - matchedTotal),
    representativeDayOnly: true,
  };
}
