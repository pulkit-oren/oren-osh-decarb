import type { AltFuelId } from "./types";

export type EndUseId =
  | "car" | "van" | "truck" | "bus" | "forklift" | "heavyEquip"
  | "boiler" | "furnaceKiln" | "generator" | "dryer" | "spaceHeat" | "otherProcess"
  // Stationary equipment from the decarbonisation-alternatives reference
  | "tfh" | "furnace" | "kiln" | "oven" | "cooking" | "absorptionChiller" | "firePump" | "captivePower";

export type Feasibility = "easy" | "yes" | "hard" | "no";

export interface EndUseProfile {
  id: EndUseId;
  label: string;
  category: "mobile" | "stationary";
  electrify: { feasible: Feasibility; cop: number; capexPerUnit?: number; capacityHint?: number; note?: string };
  fuelSwitch: { feasible: Feasibility; preferred?: AltFuelId; note?: string };
  flexFuel?: { feasible: Feasibility };
  /** Kept for existing data but hidden from the picker (superseded by finer types). */
  legacy?: boolean;
}

export const END_USES: Record<EndUseId, EndUseProfile> = {
  car:        { id: "car",        label: "Car / passenger",       category: "mobile",     electrify: { feasible: "easy", cop: 3.5, capexPerUnit: 1_800_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "yes" } },
  van:        { id: "van",        label: "Van / LCV",             category: "mobile",     electrify: { feasible: "yes",  cop: 3.2, capexPerUnit: 2_500_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "yes" } },
  truck:      { id: "truck",      label: "Truck (HGV)",           category: "mobile",     electrify: { feasible: "yes",  cop: 3.0, capexPerUnit: 9_500_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "yes" } },
  bus:        { id: "bus",        label: "Bus",                   category: "mobile",     electrify: { feasible: "yes",  cop: 3.0, capexPerUnit: 15_000_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "yes" } },
  forklift:   { id: "forklift",   label: "Forklift / handling",   category: "mobile",     electrify: { feasible: "easy", cop: 3.0, capexPerUnit: 600_000 }, fuelSwitch: { feasible: "yes", preferred: "biodiesel" }, flexFuel: { feasible: "no" } },
  heavyEquip: { id: "heavyEquip", label: "Heavy / off-road",      category: "mobile",     electrify: { feasible: "hard", cop: 2.0, capexPerUnit: 20_000_000, note: "Off-road duty cycles are hard to electrify today." }, fuelSwitch: { feasible: "yes", preferred: "biodiesel", note: "Biodiesel is the near-term lever." }, flexFuel: { feasible: "no" } },

  boiler: {
    id: "boiler", label: "Steam boiler (fire/water tube)", category: "stationary",
    electrify: { feasible: "yes", cop: 3.0, capacityHint: 60, note: "Electrode boiler, or industrial heat pump / MVR up to ~150–165 °C (COP 2–4) where waste heat exists." },
    fuelSwitch: { feasible: "yes", preferred: "biodiesel", note: "Biomass briquette or biogas/CBG firing is the commercial renewable route where electrification doesn't fit." },
  },
  furnaceKiln: {
    id: "furnaceKiln", label: "Furnace / Kiln (high-temp)", category: "stationary", legacy: true,
    electrify: { feasible: "hard", cop: 1.0, capacityHint: 0, note: "High-temp process — pick the finer Furnace or Kiln type for honest guidance." },
    fuelSwitch: { feasible: "yes", preferred: "biodiesel", note: "Bio-blend is the preferred lever." },
  },
  furnace: {
    id: "furnace", label: "Industrial furnace (melt / reheat / heat-treat)", category: "stationary",
    electrify: { feasible: "yes", cop: 1.0, capacityHint: 40, note: "Induction / resistance / arc heating is commercial but high-capex with a high connected load — pair with an RE PPA." },
    fuelSwitch: { feasible: "yes", preferred: "biodiesel", note: "Regenerative burners + oxy-fuel cut 15–40% of fuel; H₂ blends are post-2030." },
  },
  kiln: {
    id: "kiln", label: "Kiln (cement / ceramics / lime)", category: "stationary",
    electrify: { feasible: "no", cop: 1.0, capacityHint: 0, note: "Electric / hydrogen kilns are pilot-stage — AFR co-processing is the commercial lever today." },
    fuelSwitch: { feasible: "yes", note: "Co-process RDF / biomass / agro-residue (AFR) — 10–40% at typical thermal substitution rates." },
  },
  tfh: {
    id: "tfh", label: "Thermic fluid heater", category: "stationary",
    electrify: { feasible: "yes", cop: 1.0, capacityHint: 50, note: "Electric TFH is commercial; heat pumps only fit duties below ~160 °C." },
    fuelSwitch: { feasible: "yes", preferred: "biodiesel", note: "Biomass-fired TFH is proven in Indian process industry." },
  },
  generator: {
    id: "generator", label: "DG set / generator", category: "stationary",
    electrify: { feasible: "yes", cop: 1.0, capacityHint: 80, note: "Displace DG runtime with solar + BESS or a grid-reliability upgrade + green tariff — keep a small set for statutory contingency." },
    fuelSwitch: { feasible: "easy", preferred: "biodiesel", note: "B20 needs minimal modification; HVO is a full drop-in — verify OEM warranty above B20." },
  },
  dryer: {
    id: "dryer", label: "Hot air generator / dryer", category: "stationary",
    electrify: { feasible: "easy", cop: 2.5, capacityHint: 60, note: "Heat pump dryers fit below ~90 °C with 40–60% less energy input." },
    fuelSwitch: { feasible: "yes", preferred: "biodiesel", note: "Biomass-fired HAG with heat exchanger keeps flue gas off the product." },
  },
  oven: {
    id: "oven", label: "Industrial oven (bake / cure / paint)", category: "stationary",
    electrify: { feasible: "easy", cop: 1.4, capacityHint: 70, note: "Electric ovens with zone control, or IR/UV curing — 30–50% less energy and faster cycles." },
    fuelSwitch: { feasible: "yes", preferred: "biodiesel" },
  },
  cooking: {
    id: "cooking", label: "Canteen / kitchen cooking", category: "stationary",
    electrify: { feasible: "easy", cop: 1.8, capacityHint: 80, note: "Induction + electric cooking — staff training and cookware change; better indoor air quality." },
    fuelSwitch: { feasible: "yes", preferred: "biogas", note: "Onsite biogas from canteen / food waste displaces 10–40% of cooking fuel." },
  },
  absorptionChiller: {
    id: "absorptionChiller", label: "Absorption chiller (gas / steam fired)", category: "stationary",
    electrify: { feasible: "yes", cop: 4.0, capacityHint: 80, note: "Modern electric chillers (magnetic bearing, VFD) far out-COP absorption machines — pair with RE." },
    fuelSwitch: { feasible: "yes", preferred: "biogas", note: "Keep absorption only where genuine waste heat or solar heat drives it." },
  },
  firePump: {
    id: "firePump", label: "Diesel fire pump", category: "stationary",
    electrify: { feasible: "no", cop: 1.0, capacityHint: 0, note: "Fire codes (TAC / NFPA 20) usually require a retained diesel unit — electrify only with assured backup supply and insurer sign-off." },
    fuelSwitch: { feasible: "easy", preferred: "biodiesel", note: "HVO / biodiesel in the retained pump — testing hours only, a low-materiality easy win." },
  },
  captivePower: {
    id: "captivePower", label: "Captive power plant / gas turbine", category: "stationary",
    electrify: { feasible: "yes", cop: 1.0, capacityHint: 80, note: "Replace captive generation with an RE PPA (solar / wind / hybrid) + BESS — contractual rather than new kit on site." },
    fuelSwitch: { feasible: "yes", preferred: "biodiesel", note: "Biomass co-firing gives 5–20% at typical rates; H₂-blend turbines are early commercial." },
  },
  spaceHeat: {
    id: "spaceHeat", label: "Space / water heater", category: "stationary",
    electrify: { feasible: "easy", cop: 3.5, capacityHint: 80, note: "Air / water-source heat pumps — 60–75% less energy than resistance; hybridise with solar water heating." },
    fuelSwitch: { feasible: "yes", preferred: "biodiesel" },
  },
  otherProcess: {
    id: "otherProcess", label: "Other process heat", category: "stationary",
    electrify: { feasible: "yes", cop: 2.0, capacityHint: 40 },
    fuelSwitch: { feasible: "yes", preferred: "biodiesel" },
  },
};

/** Default efficiency-package saving (% of fuel) per equipment type — from the
 *  alternatives reference: economiser packages 5–15%, regenerative burners
 *  15–40%, DG right-sizing 5–15%, telematics/route optimisation 5–10%. */
export const EFFICIENCY_HINT_PCT: Partial<Record<EndUseId, number>> = {
  boiler: 10, generator: 10, furnace: 25, kiln: 10, tfh: 10, dryer: 8, oven: 10, cooking: 5,
  absorptionChiller: 8, firePump: 5, captivePower: 7, spaceHeat: 8, otherProcess: 10,
  car: 7, van: 7, truck: 7, bus: 7, forklift: 5, heavyEquip: 7,
};

export function efficiencyHintFor(endUse?: EndUseId): number {
  return (endUse ? EFFICIENCY_HINT_PCT[endUse] : undefined) ?? 8;
}

export function endUsesFor(category: "mobile" | "stationary"): EndUseProfile[] {
  return (Object.values(END_USES) as EndUseProfile[]).filter((p) => p.category === category && !p.legacy);
}

/** Profile for an asset's end-use, or undefined when unspecified. */
export function endUseProfile(asset: { endUse?: EndUseId }): EndUseProfile | undefined {
  return asset.endUse ? END_USES[asset.endUse] : undefined;
}
