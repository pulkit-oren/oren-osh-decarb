/* ============================================================
   Demo company datasets — the typed spec three sector examples are
   written in, and which lib/company/demo/build.ts turns into the
   exact localStorage payloads each store hydrates from.

   Written as TYPES rather than pre-baked JSON strings on purpose:
   the seed in lib/company/seed.ts is a captured export, so a field
   renamed in lib/model/types.ts leaves it silently stale. A spec
   that is typed against the live domain types cannot go stale
   without failing `tsc`.
   ============================================================ */

import type { CapacityUnit } from "@/lib/equipment/types";
import type { EndUseId } from "@/lib/model/end-use";
import type {
  AssetActions, FuelId, FuelUnit, GlobalAssumptions, RefrigerantId,
  RefrigerationSystem, SystemActions,
} from "@/lib/model/types";
import type {
  FacilityActions, LoadSplit, ProcurementSettings,
} from "@/lib/scope2/model/types";
import type { FacilityTypeId } from "@/lib/scope2/model/facility-type";
import type { EsgState } from "@/lib/esg/types";
import type { Goal } from "@/lib/goals/types";

/** The two financial years every demo company carries data for:
 *  FY 2024-25 and FY 2025-26. Index 0 is the earlier year. */
export const DEMO_YEARS = [2024, 2025] as const;

/** The FY the plan is built from — the later of the two. */
export const DEMO_BASE_YEAR = 2025;

/** A per-year pair, ordered as DEMO_YEARS. */
export type ByDemoYear = readonly [number, number];

export interface DemoEquipmentSpec {
  id: string;
  name: string;
  /** In the source's capacityUnit (D9). */
  capacity?: number;
  operatingHours?: number;
  unitCount: number;
  remainingLife: number;
  endUse?: EndUseId;
  /** Process duty temperature, °C — what the electrification feasibility gate
   *  reads. See lib/model/feasibility.ts. */
  dutyTempC?: number;
  /** Levers for THIS machine. Overrides the source-level default when both
   *  are present. Lever settings are keyed by equipment id, not source id
   *  (resolveEquipment emits one row per equipment, keyed by the machine),
   *  so this is the level the engine actually reads. */
  actions?: AssetActions;
}

export interface DemoSourceSpec {
  id: string;
  name: string;
  category: "stationary" | "mobile";
  fuelType: FuelId;
  unit: FuelUnit;
  /** Business unit — must match one of the company's `bus`. */
  bu: string;
  capacityUnit?: CapacityUnit;
  /** Annual consumption in `unit`, per DEMO_YEARS. */
  volume: ByDemoYear;
  /** Annual fuel + maintenance spend (₹), per DEMO_YEARS. */
  opex: ByDemoYear;
  equipment: DemoEquipmentSpec[];
  /** Default plan, applied to every one of this source's machines (a mobile
   *  lever's unitsToConvert is clamped to each machine's own unitCount, so
   *  replicating it can never convert more vehicles than exist). Omitted ⇒
   *  no levers unless a machine names its own. */
  actions?: AssetActions;
}

export interface DemoSystemSpec {
  id: string;
  name: string;
  systemType: RefrigerationSystem["systemType"];
  refrigerant: RefrigerantId;
  bu: string;
  /** Top-up (= fugitive loss under mass balance), kg, per DEMO_YEARS. */
  toppedUpKg: ByDemoYear;
  gasCostPerKg: number;
  actions?: SystemActions;
}

export interface DemoFacilitySpec {
  id: string;
  /** For the four electricity instruments this MUST be the instrument name
   *  (see lib/scope2/model/instruments.ts) — records are matched by name. */
  name: string;
  bu: string;
  /** kWh per DEMO_YEARS. */
  kwh: ByDemoYear;
  tariffPerKwh: number;
  gridEf: number;
  roofSpaceM2: number;
  peakLoadKw: number;
  irradiance: number;
  loadSplit: LoadSplit;
  facilityType?: FacilityTypeId;
  isolated?: boolean;
  existingSolarKwp?: number;
  existingRenewablePct?: number;
  actions?: FacilityActions;
}

/** A saved Scope 1 scenario, expressed as a patch on the base settings so a
 *  variant is a handful of lines rather than a second full lever set. */
export interface DemoScope1ScenarioSpec {
  id: string;
  name: string;
  note?: string;
  byAsset?: Record<string, Partial<AssetActions>>;
  bySystem?: Record<string, Partial<SystemActions>>;
  assumptions?: Partial<GlobalAssumptions>;
}

export interface DemoScope2ScenarioSpec {
  id: string;
  name: string;
  note?: string;
  byFacility?: Record<string, Partial<FacilityActions>>;
  procurement?: Partial<ProcurementSettings>;
}

export interface DemoCompany {
  /** Stable slug — the install marker records which demos are present. */
  slug: string;
  name: string;
  sector: string;
  /** One-line description of who this company is, for the summary. */
  profile: string;
  bus: { name: string; aggregate: boolean }[];
  assumptions: GlobalAssumptions;
  sources: DemoSourceSpec[];
  systems: DemoSystemSpec[];
  facilities: DemoFacilitySpec[];
  procurement: ProcurementSettings;
  scope1Scenarios: DemoScope1ScenarioSpec[];
  scope2Scenarios: DemoScope2ScenarioSpec[];
  esg: EsgState;
  /** Seeded goals. Initiatives are generated from the data at install time. */
  goals: Omit<Goal, "createdAt">[];
}
