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

/** How far a plan is from its target, on the LEVEL basis.
 *
 *  "Cut 50% by 2030" means emissions END UP at half the base year — what every
 *  framework means (SBTi, BRSR, any public commitment), and what
 *  `goals/select.ts:targetValueAt` and `trajectory.ts:targetLine` already mean.
 *
 *  Balance-to-target used to mean something else: tonnes AVOIDED equal to half
 *  the base year. Those are the same quantity only while BAU sits exactly on the
 *  base year; otherwise they differ by `bauAtYear - base`, which changes sign
 *  depending on whether activity growth or the grid-EF decline wins. One app,
 *  one meaning for one percentage.
 *
 *  Extracted from BalanceTab so the rail's arithmetic is testable without
 *  mounting a component, and so the mix suggester's stop rule reads the same
 *  committed level the rail displays. */
export interface TargetPosition {
  /** Combined base-year emissions — the denominator of every percentage. */
  base: number;
  bauAtYear: number;
  netAtYear: number;
  /** Where emissions must LAND: base x (1 - pct). */
  committedLevel: number;
  /** Tonnes to take out of the BAU path to land there. */
  requiredT: number;
  /** Tonnes the plan takes out of the BAU path. */
  allocatedT: number;
  /** requiredT - allocatedT, which reduces to netAtYear - committedLevel: how
   *  far above the committed level the plan finishes. */
  gapT: number;
  met: boolean;
}

/** Tonnes of slack allowed before a plan is called short. Guards float noise
 *  only — a full tonne would be a real miss. */
const MET_TOLERANCE_T = 0.5;

export function targetPosition(rows: CombinedRow[], targetYear: number, targetPct: number): TargetPosition {
  const base = rows[0]?.bau ?? 0;
  const at = rows.find((r) => r.year === targetYear) ?? rows[rows.length - 1];
  const bauAtYear = at?.bau ?? 0;
  const netAtYear = at?.net ?? 0;
  const committedLevel = base * (1 - targetPct / 100);
  const requiredT = bauAtYear - committedLevel;
  const allocatedT = bauAtYear - netAtYear;
  const gapT = requiredT - allocatedT;
  return { base, bauAtYear, netAtYear, committedLevel, requiredT, allocatedT, gapT, met: gapT <= MET_TOLERANCE_T };
}
