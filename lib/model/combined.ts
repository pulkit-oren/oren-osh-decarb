/* Combined Scope 1 + 2 pathway — pair any Scope 1 trajectory with a Scope 2
   (market-based) trajectory year by year. Electrification's Scope 2 spill is
   attributed to the electricity side so the total is honest: cutting fuel by
   adding grid load doesn't vanish. Pure: no React, no I/O. */

import type { TrajectoryRow } from "./types";

export interface CombinedRow {
  year: number;
  bau: number;
  target: number;
  s1Net: number;
  /** Scope 2 net plus the Scope 1 plan's electrification spill. */
  s2Net: number;
  net: number;
  onTrack: boolean;
}

export function combineTrajectories(s1: TrajectoryRow[], s2: TrajectoryRow[]): CombinedRow[] {
  const s2ByYear = new Map(s2.map((r) => [r.year, r]));
  const out: CombinedRow[] = [];
  for (const r of s1) {
    const b = s2ByYear.get(r.year);
    if (!b) continue;
    const s1Net = r.net;
    const s2Net = b.net + r.scope2Spill;
    const net = s1Net + s2Net;
    const target = r.target + b.target;
    out.push({
      year: r.year,
      bau: r.bau + b.bau,
      target,
      s1Net,
      s2Net,
      net,
      onTrack: net <= target + 1e-9,
    });
  }
  return out;
}
