import { FUELS } from "@/lib/model/factors";
import type { FuelId } from "@/lib/model/types";
import type { FinanceAssumptions } from "./assumptions";
import type { ResolvedPrice, SpendSplit } from "./types";

interface PriceSource {
  opex: number;
  annualVolume: number;
  fuelType: FuelId;
}

/** The ONLY place a fuel unit price is derived. Before this module the divide
 *  lived inline in three files, and all three read zero on the seeded company
 *  because every source there has opex: 0. */
export function resolvePrice(src: PriceSource): ResolvedPrice {
  if (src.opex > 0 && src.annualVolume > 0) {
    return { pricePerUnit: src.opex / src.annualVolume, basis: "measured" };
  }
  const ref = FUELS[src.fuelType]?.typicalPricePerUnit ?? 0;
  if (ref > 0) return { pricePerUnit: ref, basis: "reference" };
  return { pricePerUnit: 0, basis: "unavailable" };
}

/** `a.opex` is documented as "fuel cost plus related maintenance". Efficiency
 *  cuts volume, so it can only save the fuel half — crediting the whole bill
 *  overstated it by the maintenance share (F2). */
export function splitSpend(totalSpend: number, maintenanceShareOfSpendPct: number): { fuel: number; maintenance: number } {
  const m = Math.min(1, Math.max(0, maintenanceShareOfSpendPct / 100));
  const maintenance = totalSpend * m;
  return { fuel: totalSpend - maintenance, maintenance };
}

/** Annual bill split for one source, whichever basis the price came from.
 *  Both bases end up satisfying maintenance / total === m, so downstream code
 *  never needs to know which basis it got. */
export function resolveFuelSpend(src: PriceSource, a: FinanceAssumptions): SpendSplit {
  const { pricePerUnit, basis } = resolvePrice(src);
  if (basis === "unavailable") return { fuel: 0, maintenance: 0, basis };

  if (basis === "measured") {
    const { fuel, maintenance } = splitSpend(src.opex, a.maintenanceShareOfSpendPct);
    return { fuel, maintenance, basis };
  }

  // Reference prices are pump prices: fuel only. Gross up so that the
  // maintenance share stays a share of the TOTAL, matching the measured path.
  const fuel = src.annualVolume * pricePerUnit;
  const m = Math.min(1, Math.max(0, a.maintenanceShareOfSpendPct / 100));
  const maintenance = m >= 1 ? 0 : fuel * (m / (1 - m));
  return { fuel, maintenance, basis };
}
