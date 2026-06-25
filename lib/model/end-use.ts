import type { AltFuelId } from "./types";

export type EndUseId =
  | "car" | "van" | "truck" | "bus" | "forklift" | "heavyEquip"
  | "boiler" | "furnaceKiln" | "generator" | "dryer" | "spaceHeat" | "otherProcess";

export type Feasibility = "easy" | "yes" | "hard" | "no";

export interface EndUseProfile {
  id: EndUseId;
  label: string;
  category: "mobile" | "stationary";
  electrify: { feasible: Feasibility; cop: number; capexPerUnit?: number; capacityHint?: number; note?: string };
  fuelSwitch: { feasible: Feasibility; preferred?: AltFuelId; note?: string };
  flexFuel?: { feasible: Feasibility };
}

export const END_USES: Record<EndUseId, EndUseProfile> = {
  car:        { id: "car",        label: "Car / passenger",       category: "mobile",     electrify: { feasible: "easy", cop: 3.5, capexPerUnit: 1_800_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "yes" } },
  van:        { id: "van",        label: "Van / LCV",             category: "mobile",     electrify: { feasible: "yes",  cop: 3.2, capexPerUnit: 2_500_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "yes" } },
  truck:      { id: "truck",      label: "Truck (HGV)",           category: "mobile",     electrify: { feasible: "yes",  cop: 3.0, capexPerUnit: 9_500_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "yes" } },
  bus:        { id: "bus",        label: "Bus",                   category: "mobile",     electrify: { feasible: "yes",  cop: 3.0, capexPerUnit: 15_000_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "yes" } },
  forklift:   { id: "forklift",   label: "Forklift / handling",   category: "mobile",     electrify: { feasible: "easy", cop: 3.0, capexPerUnit: 600_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "no" } },
  heavyEquip: { id: "heavyEquip", label: "Heavy / off-road",      category: "mobile",     electrify: { feasible: "hard", cop: 2.0, capexPerUnit: 20_000_000, note: "Off-road duty cycles are hard to electrify today." }, fuelSwitch: { feasible: "yes", preferred: "biodiesel", note: "Biodiesel is the near-term lever." }, flexFuel: { feasible: "no" } },
  boiler:       { id: "boiler",       label: "Boiler (low/med-temp)", category: "stationary", electrify: { feasible: "yes",  cop: 3.0, capacityHint: 60 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" } },
  furnaceKiln:  { id: "furnaceKiln",  label: "Furnace / Kiln (high-temp)", category: "stationary", electrify: { feasible: "hard", cop: 1.0, capacityHint: 0, note: "High-temp process — electrification is limited." }, fuelSwitch: { feasible: "yes", preferred: "biodiesel", note: "Bio-blend is the preferred lever." } },
  generator:    { id: "generator",    label: "Generator (genset)",    category: "stationary", electrify: { feasible: "yes",  cop: 1.0, capacityHint: 50, note: "Replace with grid / solar + battery." }, fuelSwitch: { feasible: "easy", preferred: "biodiesel" } },
  dryer:        { id: "dryer",        label: "Dryer",                 category: "stationary", electrify: { feasible: "yes",  cop: 2.5, capacityHint: 50 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" } },
  spaceHeat:    { id: "spaceHeat",    label: "Space / water heater",  category: "stationary", electrify: { feasible: "easy", cop: 3.5, capacityHint: 80 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" } },
  otherProcess: { id: "otherProcess", label: "Other process heat",    category: "stationary", electrify: { feasible: "yes",  cop: 2.0, capacityHint: 40 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" } },
};

export function endUsesFor(category: "mobile" | "stationary"): EndUseProfile[] {
  return (Object.values(END_USES) as EndUseProfile[]).filter((p) => p.category === category);
}

/** Profile for an asset's end-use, or undefined when unspecified. */
export function endUseProfile(asset: { endUse?: EndUseId }): EndUseProfile | undefined {
  return asset.endUse ? END_USES[asset.endUse] : undefined;
}
