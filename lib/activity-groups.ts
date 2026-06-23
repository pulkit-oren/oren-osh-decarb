import type { FuelId } from "@/lib/model/types";
import { FUELS } from "@/lib/model/factors";

export type FuelFamily = "liquid" | "gas" | "solid" | "biofuels";

/** Workbook Column-A family for a fuel, or null when the fuel is app-only
 *  (not listed in the Emission Factor 2025 workbook).
 *  Workbook renewables are routed to "biofuels" regardless of their excelCategory. */
export function fuelFamily(id: FuelId): FuelFamily | null {
  const f = FUELS[id];
  if (!f?.excelCategory) return null;
  return f.renewable ? "biofuels" : f.excelCategory;
}

/** All workbook-listed fuels in a family, in declaration order. */
export function fuelsInExcelFamily(fam: FuelFamily): { id: FuelId; label: string; renewable: boolean }[] {
  return (Object.keys(FUELS) as FuelId[])
    .filter((id) => fuelFamily(id) === fam)
    .map((id) => ({ id, label: FUELS[id].label, renewable: FUELS[id].renewable }));
}

export const FAMILY_DEFAULT_FUEL: Record<FuelFamily, FuelId> = {
  liquid: "diesel",
  gas: "png",
  solid: "coal",
  biofuels: "biodiesel",
};
