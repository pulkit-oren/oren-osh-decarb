/* Asset registry types — company-level, year-independent identities that fuel
   entries allocate onto. Mirrors lib/bu/types.ts in lifecycle: one registry per
   company, ids stable across fiscal years. Pure types, no imports. */

export type AssetCategory = "stationary" | "mobile" | "electrical";
export type EndUse = "lighting" | "motor" | "hvac" | "process";

export type AllocationBasis = "manual" | "even" | "weighted" | "carryForward";
export type WeightAttribute = "ratedCapacity" | "operatingHours" | "unitCount" | "lastPeriod";

export interface Tier1Answers {
  vehicleClass?: "twoWheeler" | "car" | "lcv" | "hcv" | "forklift" | "bus";
  /** false ⇒ the fuel is Scope 3, not Scope 1. Flagged only, never auto-moved. */
  owned?: boolean;
}

export interface Tier2Answers {
  annualKm?: number;
  kmPerLitre?: number;
  returnsToDepot?: boolean;
  modelYear?: number;
  /** <100 standard heat pump · 100–200 high-temp · >400 hard-to-abate. */
  processTempC?: number;
  operatingHoursPerYear?: number;
  heatDelivery?: "steam" | "hotWater" | "directFire";
}

export interface Asset {
  id: string;
  name: string;
  /** Bare business-unit NAME (there is no lib/bu/ id registry in this repo —
   *  every write path sets this to `entry.bu ?? ""`, e.g. lib/store.tsx's
   *  addCombustionAsset/upsertUnit call sites). Compared name-to-name
   *  against a combustion entry's own `bu` field (lib/assets/resolve.ts:69:
   *  `asset.buId || e.bu`), not resolved through any separate id table.
   *  Empty string = unassigned. */
  buId: string;
  facilityId?: string;
  category: AssetCategory;
  subtype?: string;
  unitCount: number;
  ratedCapacity?: number;
  ratedCapacityUnit?: "kW" | "kVA" | "TR" | "tph";
  commissioningYear?: number;
  remainingLife: number;
  opex: number;
  endUse?: EndUse;
  tier1?: Tier1Answers;
  tier2?: Tier2Answers;
}

export interface AssetRegistry {
  assets: Asset[];
}
