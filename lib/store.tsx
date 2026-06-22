"use client";

/* ============================================================
   Scenario store — each FY holds its own inventory of combustion
   fuels + cooling systems (the mix can differ year to year), plus
   the per-asset lever settings + saved scenarios. Persists to
   localStorage. Exposes the live compute() for the BASE year and a
   baseline for the SELECTED year (Data input view).
   ============================================================ */

import {
  createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { compute, type ComputeResult } from "./model";
import { baselineScope1, type BaselineResult } from "./model/baseline";
import type {
  AssetActions, CombustionAsset, CombustionByYear, ElectrifyAction, FlexFuelAction, FuelSwitchAction,
  GasSwitchAction, GlobalAssumptions, LeakFixAction, LeverSettings, RefrigerationByYear,
  RefrigerationSystem, Scenario, SystemActions,
} from "./model/types";
import { defaultActions, defaultSystemActions } from "./model/segments";
import { FUELS } from "./model/factors";
import {
  DEFAULT_BASE_YEAR, DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_REFRIGERATION_BY_YEAR, DEFAULT_SETTINGS,
} from "./defaults";
import { resolveCombustion, resolveRefrigeration } from "./yearly";
import { allIds, migrateRefrigeration, migrateSettings, uniqueId } from "./store-helpers";

interface StoreShape {
  combustion: CombustionByYear;
  refrigeration: RefrigerationByYear;
  settings: LeverSettings;
  scenarios: Scenario[];
  selectedYear: number;
  baseYear: number;
  setSelectedYear: (y: number) => void;
  setBaseYear: (y: number) => void;

  addCombustion: (year: number) => void;
  delCombustion: (year: number, id: string) => void;
  updateCombustion: (year: number, id: string, patch: Partial<CombustionAsset>) => void;
  copyCombustion: (fromYear: number, toYear: number) => void;
  importCombustion: (year: number, rows: Omit<CombustionAsset, "id">[]) => void;
  addCombustionAsset: (year: number, asset: CombustionAsset) => void;

  addRefrigeration: (year: number) => void;
  delRefrigeration: (year: number, id: string) => void;
  updateRefrigeration: (year: number, id: string, patch: Partial<RefrigerationSystem>) => void;
  copyRefrigeration: (fromYear: number, toYear: number) => void;

  setSettings: (updater: (prev: LeverSettings) => LeverSettings) => void;
  updateAction: (assetId: string, lever: "electrify" | "fuelSwitch" | "flexFuel", patch: Partial<ElectrifyAction> & Partial<FuelSwitchAction> & Partial<FlexFuelAction>) => void;
  updateSystemAction: (systemId: string, lever: "gasSwitch" | "leakFix", patch: Partial<GasSwitchAction> & Partial<LeakFixAction>) => void;
  updateAssumptions: (patch: Partial<GlobalAssumptions>) => void;
  resetSettings: () => void;
  saveScenario: (name: string) => void;
  deleteScenario: (id: string) => void;

  result: ComputeResult;
  baseAssets: CombustionAsset[];
  baseSystems: RefrigerationSystem[];
  selectedAssets: CombustionAsset[];
  selectedSystems: RefrigerationSystem[];
  selectedBaseline: BaselineResult;
}

const Ctx = createContext<StoreShape | null>(null);
const DEFAULT_LS_KEY = "osh-scope1-planner-v4";

interface Persisted {
  combustion: CombustionByYear;
  refrigeration: RefrigerationByYear;
  settings: LeverSettings;
  scenarios: Scenario[];
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

export function ScenarioProvider({
  children,
  storageKey = DEFAULT_LS_KEY,
}: {
  children: ReactNode;
  /** Per-company namespace — remount the provider (React key) when it changes. */
  storageKey?: string;
}) {
  const [combustion, setCombustion] = useState<CombustionByYear>(DEFAULT_COMBUSTION_BY_YEAR);
  const [refrigeration, setRefrigeration] = useState<RefrigerationByYear>(DEFAULT_REFRIGERATION_BY_YEAR);
  const [settings, setSettingsState] = useState<LeverSettings>(DEFAULT_SETTINGS);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [baseYear, setBaseYear] = useState<number>(DEFAULT_BASE_YEAR);
  const [selectedYear, setSelectedYear] = useState<number>(DEFAULT_BASE_YEAR);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    const p = load(storageKey);
    if (p) {
      if (p.combustion) setCombustion(p.combustion);
      const migratedRefrigeration = p.refrigeration ? migrateRefrigeration(p.refrigeration) : null;
      if (migratedRefrigeration) setRefrigeration(migratedRefrigeration);
      const sysForMigration = resolveRefrigeration(migratedRefrigeration ?? DEFAULT_REFRIGERATION_BY_YEAR, p.baseYear ?? DEFAULT_BASE_YEAR);
      if (p.settings) setSettingsState(migrateSettings(p.settings, sysForMigration));
      if (p.scenarios) setScenarios(p.scenarios.map((sc) => ({ ...sc, settings: migrateSettings(sc.settings, sysForMigration) })));
      if (p.baseYear) { setBaseYear(p.baseYear); setSelectedYear(p.baseYear); }
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time per mount; key changes remount the provider
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const data: Persisted = { combustion, refrigeration, settings, scenarios, baseYear };
    window.localStorage.setItem(storageKey, JSON.stringify(data));
  }, [combustion, refrigeration, settings, scenarios, baseYear, hydrated, storageKey]);

  /* ---- combustion (per year) ---- */
  const pendingAssetRef = useRef<CombustionAsset | null>(null);
  const pendingImportRef = useRef<CombustionAsset[]>([]);

  const addCombustion = (year: number) => {
    setCombustion((prev) => {
      const id = uniqueId("c", allIds(prev));
      const annualVolume = 10000;
      const opex = Math.round(annualVolume * (FUELS.diesel.typicalPricePerUnit ?? 0));
      const line: CombustionAsset = { id, name: "New fuel", category: "stationary", fuelType: "diesel", unit: "L", remainingLife: 10, unitCount: 1, annualVolume, opex };
      pendingAssetRef.current = line;
      return { ...prev, [year]: [...(prev[year] ?? []), line] };
    });
    setSettingsState((p) => {
      const line = pendingAssetRef.current;
      if (!line || p.byAsset[line.id]) return p;
      return { ...p, byAsset: { ...p.byAsset, [line.id]: defaultActions(line) } };
    });
  };
  const importCombustion = (year: number, rows: Omit<CombustionAsset, "id">[]) => {
    if (rows.length === 0) return;
    setCombustion((prev) => {
      const ids = allIds(prev);
      const lines = rows.map((r) => {
        const id = uniqueId("c", ids);
        ids.push(id);
        return { ...r, id } as CombustionAsset;
      });
      pendingImportRef.current = lines;
      return { ...prev, [year]: [...(prev[year] ?? []), ...lines] };
    });
    setSettingsState((p) => {
      const byAsset = { ...p.byAsset };
      for (const a of pendingImportRef.current) if (!byAsset[a.id]) byAsset[a.id] = defaultActions(a);
      return { ...p, byAsset };
    });
  };
  const addCombustionAsset = (year: number, asset: CombustionAsset) => {
    setCombustion((prev) => ({ ...prev, [year]: [...(prev[year] ?? []), asset] }));
    setSettingsState((p) => (p.byAsset[asset.id] ? p : { ...p, byAsset: { ...p.byAsset, [asset.id]: defaultActions(asset) } }));
  };
  const delCombustion = (year: number, id: string) =>
    setCombustion((prev) => ({ ...prev, [year]: (prev[year] ?? []).filter((a) => a.id !== id) }));
  const updateCombustion = (year: number, id: string, patch: Partial<CombustionAsset>) =>
    setCombustion((prev) => ({ ...prev, [year]: (prev[year] ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const copyCombustion = (fromYear: number, toYear: number) => {
    const src = clone(combustion[fromYear] ?? []);
    setCombustion((prev) => ({ ...prev, [toYear]: src }));
    setSettingsState((p) => {
      const byAsset = { ...p.byAsset };
      for (const a of src) if (!byAsset[a.id]) byAsset[a.id] = defaultActions(a);
      return { ...p, byAsset };
    });
  };

  /* ---- refrigeration (per year) ---- */
  const pendingSystemRef = useRef<RefrigerationSystem | null>(null);

  const addRefrigeration = (year: number) => {
    setRefrigeration((prev) => {
      const id = uniqueId("r", allIds(prev));
      const line: RefrigerationSystem = { id, name: "New system", systemType: "commercialHVAC", refrigerant: "R410A", toppedUpKg: 24, gasCostPerKg: 900 };
      pendingSystemRef.current = line;
      return { ...prev, [year]: [...(prev[year] ?? []), line] };
    });
    setSettingsState((p) => {
      const line = pendingSystemRef.current;
      if (!line || p.bySystem[line.id]) return p;
      return { ...p, bySystem: { ...p.bySystem, [line.id]: defaultSystemActions(line) } };
    });
  };
  const delRefrigeration = (year: number, id: string) =>
    setRefrigeration((prev) => ({ ...prev, [year]: (prev[year] ?? []).filter((s) => s.id !== id) }));
  const updateRefrigeration = (year: number, id: string, patch: Partial<RefrigerationSystem>) =>
    setRefrigeration((prev) => ({ ...prev, [year]: (prev[year] ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const copyRefrigeration = (fromYear: number, toYear: number) => {
    const src = clone(refrigeration[fromYear] ?? []);
    setRefrigeration((prev) => ({ ...prev, [toYear]: src }));
    setSettingsState((p) => {
      const bySystem = { ...p.bySystem };
      for (const sys of src) if (!bySystem[sys.id]) bySystem[sys.id] = defaultSystemActions(sys);
      return { ...p, bySystem };
    });
  };

  /* ---- scenario settings ---- */
  const setSettings = (updater: (prev: LeverSettings) => LeverSettings) => setSettingsState(updater);
  const updateAction = (
    assetId: string, lever: "electrify" | "fuelSwitch" | "flexFuel",
    patch: Partial<ElectrifyAction> & Partial<FuelSwitchAction> & Partial<FlexFuelAction>,
  ) =>
    setSettingsState((p) => {
      const cur = p.byAsset[assetId];
      if (!cur) return p;
      return { ...p, byAsset: { ...p.byAsset, [assetId]: { ...cur, [lever]: { ...cur[lever], ...patch } } as AssetActions } };
    });
  const updateSystemAction = (
    systemId: string, lever: "gasSwitch" | "leakFix",
    patch: Partial<GasSwitchAction> & Partial<LeakFixAction>,
  ) =>
    setSettingsState((p) => {
      const cur = p.bySystem[systemId];
      if (!cur) return p;
      return { ...p, bySystem: { ...p.bySystem, [systemId]: { ...cur, [lever]: { ...cur[lever], ...patch } } as SystemActions } };
    });
  const updateAssumptions = (patch: Partial<GlobalAssumptions>) =>
    setSettingsState((p) => ({ ...p, assumptions: { ...p.assumptions, ...patch } }));
  const resetSettings = () => setSettingsState(DEFAULT_SETTINGS);
  const saveScenario = (name: string) =>
    setScenarios((prev) => [
      ...prev,
      { id: uniqueId("sc", prev.map((s) => s.id)), name, settings, savedAt: Date.now() },
    ]);
  const deleteScenario = (id: string) => setScenarios((prev) => prev.filter((s) => s.id !== id));

  const baseAssets = useMemo(() => resolveCombustion(combustion, baseYear), [combustion, baseYear]);
  const baseSystems = useMemo(() => resolveRefrigeration(refrigeration, baseYear), [refrigeration, baseYear]);
  const selectedAssets = useMemo(() => resolveCombustion(combustion, selectedYear), [combustion, selectedYear]);
  const selectedSystems = useMemo(() => resolveRefrigeration(refrigeration, selectedYear), [refrigeration, selectedYear]);

  const result = useMemo(() => compute(baseAssets.filter((a) => !a.excluded), baseSystems, settings, baseYear), [baseAssets, baseSystems, settings, baseYear]);
  const selectedBaseline = useMemo(() => baselineScope1(selectedAssets.filter((a) => !a.excluded), selectedSystems), [selectedAssets, selectedSystems]);

  const value: StoreShape = {
    combustion, refrigeration, settings, scenarios, selectedYear, baseYear,
    setSelectedYear, setBaseYear,
    addCombustion, delCombustion, updateCombustion, copyCombustion, importCombustion, addCombustionAsset,
    addRefrigeration, delRefrigeration, updateRefrigeration, copyRefrigeration,
    setSettings, updateAction, updateSystemAction, updateAssumptions, resetSettings, saveScenario, deleteScenario,
    result, baseAssets, baseSystems, selectedAssets, selectedSystems, selectedBaseline,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScenario(): StoreShape {
  const v = useContext(Ctx);
  if (!v) throw new Error("useScenario must be used within ScenarioProvider");
  return v;
}
