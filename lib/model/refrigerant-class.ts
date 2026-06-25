import type { RefrigerantId, RefrigerationSystem } from "./types";

export type RefrigClassId =
  | "splitAc" | "vrf" | "chiller" | "packagedRooftop"
  | "coldRoom" | "blastFreezer" | "ammoniaPlant"
  | "displayCase" | "supermarketRack" | "bottleCooler";

export interface RefrigClassProfile {
  id: RefrigClassId;
  label: string;
  systemType: RefrigerationSystem["systemType"];
  recommendedAlt: RefrigerantId;
  note: string;
}

export const REFRIG_CLASSES: Record<RefrigClassId, RefrigClassProfile> = {
  splitAc:         { id: "splitAc",         label: "Split AC",                systemType: "commercialHVAC",        recommendedAlt: "R32",     note: "Small charge — R-32 is the common A2L drop-forward." },
  vrf:             { id: "vrf",             label: "VRF / VRV",               systemType: "commercialHVAC",        recommendedAlt: "R454B",   note: "Leading R-410A replacement for variable-flow systems." },
  chiller:         { id: "chiller",         label: "Chiller",                 systemType: "commercialHVAC",        recommendedAlt: "R1234ze", note: "Ultra-low-GWP HFO suits water chillers." },
  packagedRooftop: { id: "packagedRooftop", label: "Packaged rooftop",        systemType: "commercialHVAC",        recommendedAlt: "R454B",   note: "A2L replacement for packaged DX units." },
  coldRoom:        { id: "coldRoom",        label: "Cold room / walk-in",     systemType: "industrialColdStorage", recommendedAlt: "R717",    note: "Ammonia — zero GWP, best efficiency at scale." },
  blastFreezer:    { id: "blastFreezer",    label: "Blast freezer",           systemType: "industrialColdStorage", recommendedAlt: "R744",    note: "CO₂ transcritical suits low-temp freezing." },
  ammoniaPlant:    { id: "ammoniaPlant",    label: "Ammonia plant",           systemType: "industrialColdStorage", recommendedAlt: "R717",    note: "Already ammonia-class; keep R-717." },
  displayCase:     { id: "displayCase",     label: "Display case / reach-in", systemType: "retailRefrigeration",   recommendedAlt: "R290",    note: "Propane — near-zero GWP within charge limits." },
  supermarketRack: { id: "supermarketRack", label: "Supermarket rack",        systemType: "retailRefrigeration",   recommendedAlt: "R744",    note: "CO₂ transcritical is the retail-rack standard." },
  bottleCooler:    { id: "bottleCooler",    label: "Bottle cooler / vending", systemType: "retailRefrigeration",   recommendedAlt: "R290",    note: "Self-contained — propane within charge limits." },
};

// Insertion order of REFRIG_CLASSES is the canonical selector order.
export const REFRIG_CLASS_LIST: RefrigClassProfile[] = Object.values(REFRIG_CLASSES);

export function refrigClassesFor(systemType: RefrigerationSystem["systemType"]): RefrigClassProfile[] {
  return REFRIG_CLASS_LIST.filter((p) => p.systemType === systemType);
}

/** Profile for a system's equipment class, or undefined when unspecified. */
export function refrigClassProfile(s: { equipmentClass?: RefrigClassId }): RefrigClassProfile | undefined {
  return s.equipmentClass ? REFRIG_CLASSES[s.equipmentClass] : undefined;
}
