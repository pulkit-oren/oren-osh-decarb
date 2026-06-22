/* ============================================================
   Trajectory engine — year-by-year BAU, target, stacked wedges
   and net. Levers ramp linearly from their start year; total
   abatement is capped so net never goes below zero. Spec §5.
   ============================================================ */

import type { TrajectoryConfig, TrajectoryRow } from "./types";

/** SBTi 1.5°C piecewise target: 100% @2025 → 50% @2030 → 10% @2050. */
export function targetLine(baseTotal: number, year: number): number {
  const pts: [number, number][] = [
    [2025, 1.0],
    [2030, 0.5],
    [2050, 0.1],
  ];
  if (year <= pts[0][0]) return baseTotal * pts[0][1];
  if (year >= pts[pts.length - 1][0]) return baseTotal * pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [y0, f0] = pts[i];
    const [y1, f1] = pts[i + 1];
    if (year >= y0 && year <= y1) {
      const frac = (year - y0) / (y1 - y0);
      return baseTotal * (f0 + (f1 - f0) * frac);
    }
  }
  return baseTotal * pts[pts.length - 1][1];
}

/** Linear ramp fraction: the start year counts as year 1 of the ramp. */
export function rampFraction(year: number, startYear: number, rampYears: number): number {
  if (year < startYear) return 0;
  if (rampYears <= 1) return 1;
  const frac = (year - startYear + 1) / rampYears;
  return Math.max(0, Math.min(1, frac));
}

export function buildTrajectory(cfg: TrajectoryConfig): TrajectoryRow[] {
  const rows: TrajectoryRow[] = [];
  for (let year = cfg.baseYear; year <= cfg.endYear; year++) {
    const bau = cfg.baseTotalT * Math.pow(1 + cfg.bauGrowth, year - cfg.baseYear);
    const target = targetLine(cfg.baseTotalT, year);

    // Stack wedges in array order, capping cumulative abatement at BAU.
    const wedges: Record<string, number> = {};
    let used = 0;
    for (const w of cfg.wedges) {
      const want = w.fullAbatementT * rampFraction(year, w.startYear, w.rampYears);
      const room = Math.max(0, bau - used);
      const got = Math.max(0, Math.min(want, room));
      wedges[w.id] = got;
      used += got;
    }
    const net = Math.max(0, bau - used);

    let scope2Spill = 0;
    for (const s of cfg.scope2Spill ?? []) {
      scope2Spill += s.fullT * rampFraction(year, s.startYear, s.rampYears);
    }

    rows.push({ year, bau, target, net, scope2Spill, wedges, onTrack: net <= target + 1e-6 });
  }
  return rows;
}
