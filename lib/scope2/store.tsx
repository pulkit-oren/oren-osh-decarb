"use client";

/* ============================================================
   Scope 2 store — each FY holds its own facility list, plus the
   per-facility lever settings, portfolio procurement and saved
   scenarios. Persists to localStorage. Lever entries are created
   lazily (no ref handoff between state updaters — the engine and
   updaters both fall back to defaultFacilityActions on demand).
   ============================================================ */

import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import {
  DEFAULT_BASE_YEAR, DEFAULT_FACILITIES_BY_YEAR, DEFAULT_SCOPE2_LEVERS, defaultFacilityActions,
} from "./defaults";
import { computeScope2, type Scope2ComputeResult } from "./model";
import { baselineScope2, type Scope2Baseline } from "./model/baseline";
import type {
  EfficiencyAction, FacilitiesByYear, Facility, FacilityActions, GenerationAction,
  ProcurementSettings, Scope2Levers, Scope2Scenario,
} from "./model/types";
import { allIds, migrateScope2Levers, resolveFacilities, uniqueId } from "./store-helpers";

interface Scope2StoreShape {
  facilities: FacilitiesByYear;
  levers: Scope2Levers;
  scenarios: Scope2Scenario[];
  selectedYear: number;
  baseYear: number;
  setSelectedYear: (y: number) => void;
  setBaseYear: (y: number) => void;

  addFacility: (year: number) => void;
  addFacilityRecord: (year: number, facility: Facility) => void;
  delFacility: (year: number, id: string) => void;
  updateFacility: (year: number, id: string, patch: Partial<Facility>) => void;
  copyFacilities: (fromYear: number, toYear: number) => void;

  updateFacilityAction: (
    facilityId: string,
    lever: "efficiency" | "generation",
    patch: Partial<EfficiencyAction> & Partial<GenerationAction>,
  ) => void;
  updateProcurement: (patch: Partial<ProcurementSettings>) => void;
  setLevers: (updater: (prev: Scope2Levers) => Scope2Levers) => void;
  resetLevers: () => void;
  saveScenario: (name: string) => void;
  deleteScenario: (id: string) => void;

  result: Scope2ComputeResult;
  baseFacilities: Facility[];
  selectedFacilities: Facility[];
  selectedBaseline: Scope2Baseline;
}

const Ctx = createContext<Scope2StoreShape | null>(null);
const DEFAULT_LS_KEY = "osh-scope2-planner-v1";

interface Persisted {
  facilities: FacilitiesByYear;
  levers: Scope2Levers;
  scenarios: Scope2Scenario[];
  baseYear: number;
}

function load(key: string): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function Scope2Provider({
  children,
  storageKey = DEFAULT_LS_KEY,
}: {
  children: ReactNode;
  /** Per-company namespace — remount the provider (React key) when it changes. */
  storageKey?: string;
}) {
  const [facilities, setFacilities] = useState<FacilitiesByYear>(DEFAULT_FACILITIES_BY_YEAR);
  const [levers, setLeversState] = useState<Scope2Levers>(DEFAULT_SCOPE2_LEVERS);
  const [scenarios, setScenarios] = useState<Scope2Scenario[]>([]);
  const [baseYear, setBaseYear] = useState<number>(DEFAULT_BASE_YEAR);
  const [selectedYear, setSelectedYear] = useState<number>(DEFAULT_BASE_YEAR);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    const p = load(storageKey);
    if (p) {
      if (p.facilities) setFacilities(p.facilities);
      const baseList = resolveFacilities(p.facilities ?? DEFAULT_FACILITIES_BY_YEAR, p.baseYear ?? DEFAULT_BASE_YEAR);
      if (p.levers) setLeversState(migrateScope2Levers(p.levers, baseList));
      if (p.scenarios) setScenarios(p.scenarios.map((sc) => ({ ...sc, levers: migrateScope2Levers(sc.levers, baseList) })));
      if (p.baseYear) { setBaseYear(p.baseYear); setSelectedYear(p.baseYear); }
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time per mount; key changes remount the provider
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const data: Persisted = { facilities, levers, scenarios, baseYear };
    window.localStorage.setItem(storageKey, JSON.stringify(data));
  }, [facilities, levers, scenarios, baseYear, hydrated, storageKey]);

  /* ---- facilities (per year) ---- */
  const addFacility = (year: number) =>
    setFacilities((prev) => {
      const id = uniqueId("f", allIds(prev));
      const line: Facility = {
        id, name: "New facility", annualLoadKwh: 1_000_000, tariffPerKwh: 9,
        loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
        roofSpaceM2: 2000, peakLoadKw: 400, gridEf: 0.71, irradiance: 1400, isolated: false,
        existingSolarKwp: 0, existingRenewablePct: 0,
      };
      return { ...prev, [year]: [...(prev[year] ?? []), line] };
    });
  const addFacilityRecord = (year: number, facility: Facility) =>
    setFacilities((prev) => ({ ...prev, [year]: [...(prev[year] ?? []), facility] }));
  const delFacility = (year: number, id: string) =>
    setFacilities((prev) => ({ ...prev, [year]: (prev[year] ?? []).filter((f) => f.id !== id) }));
  const updateFacility = (year: number, id: string, patch: Partial<Facility>) =>
    setFacilities((prev) => ({
      ...prev,
      [year]: (prev[year] ?? []).map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  const copyFacilities = (fromYear: number, toYear: number) =>
    setFacilities((prev) => ({ ...prev, [toYear]: clone(prev[fromYear] ?? []) })); // ids preserved

  /* ---- levers ---- */
  const findFacility = (id: string): Facility | undefined =>
    Object.values(facilities).flat().find((f) => f.id === id);

  const updateFacilityAction = (
    facilityId: string,
    lever: "efficiency" | "generation",
    patch: Partial<EfficiencyAction> & Partial<GenerationAction>,
  ) =>
    setLeversState((p) => {
      const f = findFacility(facilityId);
      const cur = p.byFacility[facilityId] ?? (f ? defaultFacilityActions(f) : undefined);
      if (!cur) return p;
      return {
        ...p,
        byFacility: {
          ...p.byFacility,
          [facilityId]: { ...cur, [lever]: { ...cur[lever], ...patch } } as FacilityActions,
        },
      };
    });
  const updateProcurement = (patch: Partial<ProcurementSettings>) =>
    setLeversState((p) => ({ ...p, procurement: { ...p.procurement, ...patch } }));
  const resetLevers = () => setLeversState(DEFAULT_SCOPE2_LEVERS);
  const saveScenario = (name: string) =>
    setScenarios((prev) => [
      ...prev,
      { id: uniqueId("s2c", prev.map((s) => s.id)), name, levers: clone(levers), savedAt: Date.now() },
    ]);
  const deleteScenario = (id: string) => setScenarios((prev) => prev.filter((s) => s.id !== id));

  const baseFacilities = useMemo(() => resolveFacilities(facilities, baseYear), [facilities, baseYear]);
  const selectedFacilities = useMemo(() => resolveFacilities(facilities, selectedYear), [facilities, selectedYear]);
  const result = useMemo(() => computeScope2(baseFacilities.filter((f) => !f.excluded), levers, baseYear), [baseFacilities, levers, baseYear]);
  const selectedBaseline = useMemo(() => baselineScope2(selectedFacilities.filter((f) => !f.excluded)), [selectedFacilities]);

  const value: Scope2StoreShape = {
    facilities, levers, scenarios, selectedYear, baseYear,
    setSelectedYear, setBaseYear,
    addFacility, addFacilityRecord, delFacility, updateFacility, copyFacilities,
    updateFacilityAction, updateProcurement, setLevers: setLeversState, resetLevers, saveScenario, deleteScenario,
    result, baseFacilities, selectedFacilities, selectedBaseline,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScope2(): Scope2StoreShape {
  const v = useContext(Ctx);
  if (!v) throw new Error("useScope2 must be used within Scope2Provider");
  return v;
}
