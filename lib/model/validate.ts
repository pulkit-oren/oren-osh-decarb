/* ============================================================
   Scenario sanity checks — pure advisory validation. Spec §5:
   don't plan a retrofit on an asset that retires first.
   ============================================================ */

import type { CombustionAsset } from "./types";

/** FY in which the asset retires: base year + remaining useful life. */
export function retirementYear(asset: CombustionAsset, baseYear: number): number {
  return baseYear + asset.remainingLife;
}

/** True when an action completing in `targetYear` outlives the asset. */
export function outlivesAsset(asset: CombustionAsset, baseYear: number, targetYear: number): boolean {
  return targetYear > retirementYear(asset, baseYear);
}
