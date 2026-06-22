/* ============================================================
   Resolve a financial year's inventory into the flat shape the
   engine consumes. Each year is its own independent list; we just
   stamp the FY so emission factors use the right DEFRA year.
   ============================================================ */

import type {
  CombustionAsset,
  CombustionByYear,
  RefrigerationByYear,
  RefrigerationSystem,
} from "./model/types";

export function resolveCombustion(byYear: CombustionByYear, year: number): CombustionAsset[] {
  return (byYear[year] ?? []).map((a) => ({ ...a, year }));
}

export function resolveRefrigeration(byYear: RefrigerationByYear, year: number): RefrigerationSystem[] {
  return byYear[year] ?? [];
}
