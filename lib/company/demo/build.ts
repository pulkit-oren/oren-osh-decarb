/* ============================================================
   Turns a DemoCompany spec into the exact localStorage payloads the
   five stores hydrate from (Scope 1, Scope 2, ESG, Goals, and the BU
   registry the Data input screens read).

   Pure: takes a spec and a timestamp, returns key -> JSON string. No
   Storage, no React, no Date.now() - so a test can assert the output
   and the install path stays trivially testable.
   ============================================================ */

import { computeAllocation } from "@/lib/equipment/allocate";
import type { Equipment } from "@/lib/equipment/types";
import type {
  AssetActions, CombustionAsset, CombustionByYear, LeverSettings,
  RefrigerationByYear, RefrigerationSystem, Scenario, SystemActions,
} from "@/lib/model/types";
import type {
  Facility, FacilitiesByYear, FacilityActions, Scope2Levers, Scope2Scenario,
} from "@/lib/scope2/model/types";
import type { GoalsState, Goal, Initiative } from "@/lib/goals/types";
import { autoInitiatives } from "@/lib/goals/initiatives-auto";
import type { Inventories } from "@/lib/goals/select";
import { esgKey, goalsKey, scope1Key, scope2Key } from "../helpers";
import {
  DEMO_BASE_YEAR, DEMO_YEARS,
  type DemoCompany, type DemoEquipmentSpec, type DemoFacilitySpec,
  type DemoScope1ScenarioSpec, type DemoScope2ScenarioSpec, type DemoSourceSpec,
  type DemoSystemSpec,
} from "./types";

/** The BU registry key - mirrors components/tabs/activity/useBuConfig.ts. */
export const buKey = (companyId: string) => `osh-bus-v3::${companyId}`;

/* ---------- Scope 1 ---------- */

function equipmentOf(spec: DemoSourceSpec): Equipment[] {
  return spec.equipment.map((e: DemoEquipmentSpec) => ({
    id: e.id,
    name: e.name,
    capacity: e.capacity,
    operatingHours: e.operatingHours,
    unitCount: e.unitCount,
    remainingLife: e.remainingLife,
    endUse: e.endUse,
    dutyTempC: e.dutyTempC,
  }));
}

/** "load" needs both capacity and hours on every machine; "units" always
 *  works. Picking per source lets a fleet (units only) and a boiler house
 *  (rated capacity plus metered hours) each split the way its own data
 *  supports, instead of forcing one basis on both. */
function basisFor(equipment: Equipment[]): "load" | "units" {
  const complete = equipment.every((e) => (e.capacity ?? 0) > 0 && (e.operatingHours ?? 0) > 0);
  return complete ? "load" : "units";
}

function sourceForYear(spec: DemoSourceSpec, yearIdx: 0 | 1): CombustionAsset {
  const equipment = equipmentOf(spec);
  const annualVolume = spec.volume[yearIdx];
  const basis = basisFor(equipment);
  const allocations = computeAllocation({
    entryVolume: annualVolume,
    basis,
    equipment,
    unit: spec.unit,
  });
  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    fuelType: spec.fuelType,
    unit: spec.unit,
    annualVolume,
    opex: spec.opex[yearIdx],
    bu: spec.bu,
    inputMode: "metered",
    year: DEMO_YEARS[yearIdx],
    capacityUnit: spec.capacityUnit,
    allocationBasis: basis,
    equipment,
    allocations,
  };
}

function systemForYear(spec: DemoSystemSpec, yearIdx: 0 | 1): RefrigerationSystem {
  return {
    id: spec.id,
    name: spec.name,
    systemType: spec.systemType,
    refrigerant: spec.refrigerant,
    toppedUpKg: spec.toppedUpKg[yearIdx],
    chargeKg: spec.chargeKg,
    gasCostPerKg: spec.gasCostPerKg,
    bu: spec.bu,
  };
}

/** A mobile lever converts vehicles, so replicating a source-level plan across
 *  machines must clamp to the machine it lands on - otherwise a three-line
 *  fleet carrying "convert 4" converts twelve. */
function actionsForEquipment(actions: AssetActions, e: DemoEquipmentSpec): AssetActions {
  const out = JSON.parse(JSON.stringify(actions)) as AssetActions;
  out.electrify.unitsToConvert = Math.min(out.electrify.unitsToConvert, e.unitCount);
  if (out.flexFuel) out.flexFuel.unitsToConvert = Math.min(out.flexFuel.unitsToConvert, e.unitCount);
  return out;
}

function baseSettings(demo: DemoCompany): LeverSettings {
  const byAsset: Record<string, AssetActions> = {};
  for (const s of demo.sources) {
    for (const e of s.equipment) {
      const chosen = e.actions ?? s.actions;
      if (chosen) byAsset[e.id] = actionsForEquipment(chosen, e);
    }
  }
  const bySystem: Record<string, SystemActions> = {};
  for (const s of demo.systems) if (s.actions) bySystem[s.id] = s.actions;
  return { byAsset, bySystem, assumptions: { ...demo.assumptions } };
}

function patchedScope1Settings(base: LeverSettings, spec: DemoScope1ScenarioSpec): LeverSettings {
  const next = JSON.parse(JSON.stringify(base)) as LeverSettings;
  for (const [id, patch] of Object.entries(spec.byAsset ?? {})) {
    const current = next.byAsset[id];
    if (!current) continue;
    next.byAsset[id] = {
      ...current,
      electrify: { ...current.electrify, ...patch.electrify },
      fuelSwitch: { ...current.fuelSwitch, ...patch.fuelSwitch },
      efficiency: patch.efficiency ?? current.efficiency,
      flexFuel: patch.flexFuel ?? current.flexFuel,
    };
  }
  for (const [id, patch] of Object.entries(spec.bySystem ?? {})) {
    const current = next.bySystem[id];
    if (!current) continue;
    next.bySystem[id] = {
      gasSwitch: { ...current.gasSwitch, ...patch.gasSwitch },
      leakFix: { ...current.leakFix, ...patch.leakFix },
    };
  }
  next.assumptions = { ...next.assumptions, ...spec.assumptions };
  return next;
}

/* ---------- Scope 2 ---------- */

function facilityForYear(spec: DemoFacilitySpec, yearIdx: 0 | 1): Facility {
  return {
    id: spec.id,
    name: spec.name,
    annualLoadKwh: spec.kwh[yearIdx],
    tariffPerKwh: spec.tariffPerKwh,
    demandChargePerKvaMonth: spec.demandChargePerKvaMonth,
    loadSplit: { ...spec.loadSplit },
    roofSpaceM2: spec.roofSpaceM2,
    peakLoadKw: spec.peakLoadKw,
    gridEf: spec.gridEf,
    irradiance: spec.irradiance,
    isolated: spec.isolated ?? false,
    bu: spec.bu,
    facilityType: spec.facilityType,
    existingSolarKwp: spec.existingSolarKwp,
    existingRenewablePct: spec.existingRenewablePct,
    year: DEMO_YEARS[yearIdx],
  };
}

function baseLevers(demo: DemoCompany): Scope2Levers {
  const byFacility: Record<string, FacilityActions> = {};
  for (const f of demo.facilities) if (f.actions) byFacility[f.id] = f.actions;
  return { byFacility, procurement: { ...demo.procurement } };
}

function patchedScope2Levers(base: Scope2Levers, spec: DemoScope2ScenarioSpec): Scope2Levers {
  const next = JSON.parse(JSON.stringify(base)) as Scope2Levers;
  for (const [id, patch] of Object.entries(spec.byFacility ?? {})) {
    const current = next.byFacility[id];
    if (!current) continue;
    next.byFacility[id] = {
      efficiency: { ...current.efficiency, ...patch.efficiency },
      generation: { ...current.generation, ...patch.generation },
    };
  }
  next.procurement = { ...next.procurement, ...spec.procurement };
  return next;
}

/* ---------- Goals ---------- */

/** Initiatives are generated the same way the Goals UI generates them - from
 *  the company's own inventory - so a seeded goal opens with the plan a user
 *  would have got by creating that goal by hand. */
function goalsState(demo: DemoCompany, inv: Inventories, now: number): GoalsState {
  const goals: Goal[] = [];
  const initiatives: Initiative[] = [];
  for (const g of demo.goals) {
    const goal: Goal = { ...g, createdAt: now };
    goals.push(goal);
    initiatives.push(...autoInitiatives(goal, inv, demo.assumptions));
  }
  return { goals, initiatives, output: {} };
}

/* ---------- Assembly ---------- */

export interface BuiltCompany {
  entries: Record<string, string>;
  combustion: CombustionByYear;
  refrigeration: RefrigerationByYear;
  facilities: FacilitiesByYear;
  settings: LeverSettings;
  levers: Scope2Levers;
}

export function buildCompany(demo: DemoCompany, companyId: string, now: number): BuiltCompany {
  const combustion: CombustionByYear = {};
  const refrigeration: RefrigerationByYear = {};
  const facilities: FacilitiesByYear = {};

  DEMO_YEARS.forEach((year, i) => {
    const idx = i as 0 | 1;
    combustion[year] = demo.sources.map((s) => sourceForYear(s, idx));
    refrigeration[year] = demo.systems.map((s) => systemForYear(s, idx));
    facilities[year] = demo.facilities.map((f) => facilityForYear(f, idx));
  });

  const settings = baseSettings(demo);
  const levers = baseLevers(demo);

  const scope1Scenarios: Scenario[] = demo.scope1Scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    note: s.note,
    settings: patchedScope1Settings(settings, s),
    savedAt: now,
  }));

  const scope2Scenarios: Scope2Scenario[] = demo.scope2Scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    note: s.note,
    levers: patchedScope2Levers(levers, s),
    savedAt: now,
  }));

  const inv: Inventories = {
    combustion, refrigeration, facilities,
    water: demo.esg.water, waste: demo.esg.waste,
  };

  const entries: Record<string, string> = {
    [scope1Key(companyId)]: JSON.stringify({
      combustion, refrigeration, settings,
      scenarios: scope1Scenarios, baseYear: DEMO_BASE_YEAR,
    }),
    [scope2Key(companyId)]: JSON.stringify({
      facilities, levers,
      scenarios: scope2Scenarios, baseYear: DEMO_BASE_YEAR,
    }),
    [esgKey(companyId)]: JSON.stringify(demo.esg),
    [goalsKey(companyId)]: JSON.stringify(goalsState(demo, inv, now)),
    [buKey(companyId)]: JSON.stringify({ units: demo.bus }),
  };

  return { entries, combustion, refrigeration, facilities, settings, levers };
}
