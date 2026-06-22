import type { FuelId } from "@/lib/model/types";
import { FUELS } from "@/lib/model/factors";

export type FuelFamily = "gaseous" | "liquid" | "solid" | "biomass";

const GASEOUS = new Set<FuelId>(["lpg", "propane", "butane", "cng", "png"]);
const SOLID = new Set<FuelId>(["coal", "cokingCoal", "lignite", "petcoke"]);

export function fuelFamily(id: FuelId): FuelFamily {
  if (FUELS[id]?.renewable) return "biomass";
  if (GASEOUS.has(id)) return "gaseous";
  if (SOLID.has(id)) return "solid";
  return "liquid";
}

export const FAMILY_DEFAULT_FUEL: Record<FuelFamily, FuelId> = {
  gaseous: "png",
  liquid: "diesel",
  solid: "coal",
  biomass: "biomass",
};
