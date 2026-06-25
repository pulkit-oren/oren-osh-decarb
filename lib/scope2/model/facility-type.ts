import type { LoadSplit } from "./types";

export type FacilityTypeId = "office" | "warehouse" | "dataCentre" | "factory" | "retail" | "coldStorage" | "hotel";
export type SolarFeasibility = "strong" | "good" | "moderate" | "limited";

export interface FacilityTypeProfile {
  id: FacilityTypeId;
  label: string;
  loadSplit: LoadSplit;
  solar: { feasible: SolarFeasibility; note: string };
}

export const FACILITY_TYPES: Record<FacilityTypeId, FacilityTypeProfile> = {
  office:      { id: "office",      label: "Office",                  loadSplit: { lightingPct: 30, motorPct: 10, hvacPct: 45 }, solar: { feasible: "moderate", note: "Rooftop limited on multi-storey; partial offset." } },
  warehouse:   { id: "warehouse",   label: "Warehouse",               loadSplit: { lightingPct: 55, motorPct: 15, hvacPct: 15 }, solar: { feasible: "strong",   note: "Large flat roof — strong on-site solar potential." } },
  dataCentre:  { id: "dataCentre",  label: "Data centre",             loadSplit: { lightingPct: 5,  motorPct: 10, hvacPct: 80 }, solar: { feasible: "limited",  note: "Demand far exceeds roof capacity — solar offsets little." } },
  factory:     { id: "factory",     label: "Factory / Manufacturing", loadSplit: { lightingPct: 15, motorPct: 60, hvacPct: 15 }, solar: { feasible: "good",     note: "Large roof area suits a sizeable array." } },
  retail:      { id: "retail",      label: "Retail",                  loadSplit: { lightingPct: 40, motorPct: 10, hvacPct: 35 }, solar: { feasible: "moderate", note: "Roof often shared/limited; partial offset." } },
  coldStorage: { id: "coldStorage", label: "Cold storage",            loadSplit: { lightingPct: 5,  motorPct: 70, hvacPct: 15 }, solar: { feasible: "good",     note: "Roof area suits solar; refrigeration dominates load." } },
  hotel:       { id: "hotel",       label: "Hotel",                   loadSplit: { lightingPct: 25, motorPct: 15, hvacPct: 45 }, solar: { feasible: "moderate", note: "Mixed roof use; partial offset." } },
};

// Insertion order of FACILITY_TYPES is the canonical selector order.
export const FACILITY_TYPE_LIST: FacilityTypeProfile[] = Object.values(FACILITY_TYPES);

/** Profile for a facility's type, or undefined when unspecified. */
export function facilityTypeProfile(f: { facilityType?: FacilityTypeId }): FacilityTypeProfile | undefined {
  return f.facilityType ? FACILITY_TYPES[f.facilityType] : undefined;
}
