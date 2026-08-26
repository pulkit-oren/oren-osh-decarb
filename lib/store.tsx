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
  AssetActions, CombustionAsset, CombustionByYear, EfficiencyAction, ElectrifyAction, FlexFuelAction, FuelSwitchAction,
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
import { resolveEquipment } from "./equipment/resolve";
import { migrateEquipment, mintFirstEquipment } from "./equipment/migrate";
import { defaultBasis, reallocateForVolume } from "./equipment/allocate";

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
  addRefrigerationSystem: (year: number, system: RefrigerationSystem) => void;
  delRefrigeration: (year: number, id: string) => void;
  updateRefrigeration: (year: number, id: string, patch: Partial<RefrigerationSystem>) => void;
  copyRefrigeration: (fromYear: number, toYear: number) => void;

  setSettings: (updater: (prev: LeverSettings) => LeverSettings) => void;
  updateAction: (assetId: string, lever: "efficiency" | "electrify" | "fuelSwitch" | "flexFuel", patch: Partial<EfficiencyAction> & Partial<ElectrifyAction> & Partial<FuelSwitchAction> & Partial<FlexFuelAction>) => void;
  updateSystemAction: (systemId: string, lever: "gasSwitch" | "leakFix", patch: Partial<GasSwitchAction> & Partial<LeakFixAction>) => void;
  updateAssumptions: (patch: Partial<GlobalAssumptions>) => void;
  resetSettings: () => void;
  saveScenario: (name: string, note?: string) => void;
  duplicateScenario: (id: string) => void;
  deleteScenario: (id: string) => void;

  result: ComputeResult;
  baseAssets: CombustionAsset[];
  baseSystems: RefrigerationSystem[];
  selectedAssets: CombustionAsset[];
  selectedSystems: RefrigerationSystem[];
  selectedBaseline: BaselineResult;
  /** baseAssets / selectedAssets expanded across each source's own equipment
   *  — one row per equipment plus an unallocated remainder, re-keyed to the
   *  equipment id. Only the engine (compute / baselineScope1) consumes these;
   *  editors keep binding to baseAssets / selectedAssets so a user keeps
   *  editing what they typed. */
  resolvedBaseAssets: CombustionAsset[];
  resolvedSelectedAssets: CombustionAsset[];
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
      if (p.combustion) setCombustion(migrateEquipment(p.combustion));
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
      const base: CombustionAsset = {
        id, name: "New fuel", category: "stationary", fuelType: "diesel", unit: "L",
        annualVolume, opex,
      };
      const line: CombustionAsset = {
        ...base,
        // D8 (Ruling O): mint through the one shared helper so this can't
        // silently diverge from the source-creation and import paths.
        equipment: [mintFirstEquipment(base)],
        allocations: { [id]: annualVolume },
      };
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
        const entry = { ...r, id } as CombustionAsset;
        // D8 again: the single minted equipment reuses the entry id, so the
        // byAsset seeding below (keyed on the entry id) is already the
        // equipment's lever key. Mint through the shared helper (Ruling O) —
        // never a fresh literal — and drop the flat fields it shadows so an
        // imported row doesn't carry stale remainingLife/unitCount/endUse
        // alongside the equipment array (Ruling P).
        const equipment = entry.equipment?.length ? entry.equipment : [mintFirstEquipment(entry)];
        const kept = { ...entry } as unknown as Record<string, unknown>;
        delete kept.remainingLife;
        delete kept.unitCount;
        delete kept.endUse;
        return {
          ...kept,
          equipment,
          allocations: entry.allocations ?? { [id]: entry.annualVolume ?? 0 },
        } as unknown as CombustionAsset;
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
    // D8 (Ruling P): this is a public store API that persists an ARBITRARY
    // source. Its one production caller mints, but the guard belongs here, at
    // the write point, because D8 is a runtime invariant the compiler cannot
    // hold (Ruling K). Mint through the one shared helper (Ruling O).
    const line: CombustionAsset = asset.equipment?.length
      ? asset
      : { ...asset, equipment: [mintFirstEquipment(asset)] };
    setCombustion((prev) => ({ ...prev, [year]: [...(prev[year] ?? []), line] }));
    setSettingsState((p) => (p.byAsset[line.id] ? p : { ...p, byAsset: { ...p.byAsset, [line.id]: defaultActions(line) } }));
  };
  const delCombustion = (year: number, id: string) =>
    setCombustion((prev) => ({ ...prev, [year]: (prev[year] ?? []).filter((a) => a.id !== id) }));
  /** Ruling V: `allocations` is a FUNCTION of `annualVolume` and the basis, and
   *  until now nothing owned keeping the two consistent. A source is created at
   *  volume 0 with a matching `{ [id]: 0 }` map; the user then types the real
   *  volume through one of three writers (this list's inline input, the entry
   *  screen's hero field, the data-input table) and none of them touched the
   *  map. resolveEquipment then read a present-but-zero allocation, put 100% of
   *  the volume on the `::unallocated` remainder row — which no lever can act
   *  on — and left the source permanently unplannable, with the totals still
   *  correct so nothing complained.
   *
   *  Recomputing here rather than in each writer is the point: this is the one
   *  funnel all three go through. An explicit `allocations` in the patch always
   *  wins — that is EquipmentSection writing a hand-made split. */
  const updateCombustion = (year: number, id: string, patch: Partial<CombustionAsset>) =>
    setCombustion((prev) => {
      // Prior-year volumes for the carryForward basis, matched on the entry id
      // (ids persist across years) — the same lookup ActivityDataTab threads
      // into EquipmentSection, so both recompute from identical weights.
      const previous = (prev[year - 1] ?? []).find((e) => e.id === id)?.allocations;
      return {
        ...prev,
        [year]: (prev[year] ?? []).map((a) => {
          if (a.id !== id) return a;
          const next = { ...a, ...patch };
          if (!("annualVolume" in patch) || patch.allocations !== undefined) return next;
          const equipment = next.equipment ?? [];
          if (equipment.length === 0) return next;
          const entryVolume = Number.isFinite(next.annualVolume) ? next.annualVolume : 0;
          return {
            ...next,
            allocations: reallocateForVolume({
              entryVolume,
              basis: next.allocationBasis ?? defaultBasis(equipment, previous),
              equipment,
              previous,
              existing: next.allocations ?? {},
            }),
          };
        }),
      };
    });
  const copyCombustion = (fromYear: number, toYear: number) => {
    const src = clone(combustion[fromYear] ?? []);
    setCombustion((prev) => ({ ...prev, [toYear]: src }));
    setSettingsState((p) => {
      const byAsset = { ...p.byAsset };
      for (const a of src) {
        for (const unit of a.equipment ?? []) {
          if (!byAsset[unit.id]) byAsset[unit.id] = defaultActions({ ...a, ...unit, equipment: [unit] });
        }
      }
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
  const addRefrigerationSystem = (year: number, system: RefrigerationSystem) => {
    setRefrigeration((prev) => ({ ...prev, [year]: [...(prev[year] ?? []), system] }));
    setSettingsState((p) => (p.bySystem[system.id] ? p : { ...p, bySystem: { ...p.bySystem, [system.id]: defaultSystemActions(system) } }));
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
    assetId: string, lever: "efficiency" | "electrify" | "fuelSwitch" | "flexFuel",
    patch: Partial<EfficiencyAction> & Partial<ElectrifyAction> & Partial<FuelSwitchAction> & Partial<FlexFuelAction>,
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
  const saveScenario = (name: string, note?: string) =>
    setScenarios((prev) => [
      ...prev,
      { id: uniqueId("sc", prev.map((s) => s.id)), name, note: note?.trim() || undefined, settings, savedAt: Date.now() },
    ]);
  const duplicateScenario = (id: string) =>
    setScenarios((prev) => {
      const src = prev.find((s) => s.id === id);
      if (!src) return prev;
      return [
        ...prev,
        {
          id: uniqueId("sc", prev.map((s) => s.id)),
          name: `${src.name} (copy)`,
          note: src.note,
          settings: JSON.parse(JSON.stringify(src.settings)) as typeof src.settings,
          savedAt: Date.now(),
        },
      ];
    });
  const deleteScenario = (id: string) => setScenarios((prev) => prev.filter((s) => s.id !== id));

  const baseAssets = useMemo(() => resolveCombustion(combustion, baseYear), [combustion, baseYear]);
  const baseSystems = useMemo(() => resolveRefrigeration(refrigeration, baseYear), [refrigeration, baseYear]);
  const selectedAssets = useMemo(() => resolveCombustion(combustion, selectedYear), [combustion, selectedYear]);
  const selectedSystems = useMemo(() => resolveRefrigeration(refrigeration, selectedYear), [refrigeration, selectedYear]);

  // Resolved rows — what the engine consumes. baseAssets/selectedAssets stay
  // as the raw, editable entries; only these expand each source into one row
  // per equipment (+ remainder).
  const resolvedBaseAssets = useMemo(() => resolveEquipment(baseAssets), [baseAssets]);
  const resolvedSelectedAssets = useMemo(() => resolveEquipment(selectedAssets), [selectedAssets]);

  const result = useMemo(() => compute(resolvedBaseAssets.filter((a) => !a.excluded), baseSystems.filter((s) => !s.excluded), settings, baseYear), [resolvedBaseAssets, baseSystems, settings, baseYear]);
  const selectedBaseline = useMemo(() => baselineScope1(resolvedSelectedAssets.filter((a) => !a.excluded), selectedSystems.filter((s) => !s.excluded)), [resolvedSelectedAssets, selectedSystems]);

  const value: StoreShape = {
    combustion, refrigeration, settings, scenarios, selectedYear, baseYear,
    setSelectedYear, setBaseYear,
    addCombustion, delCombustion, updateCombustion, copyCombustion, importCombustion, addCombustionAsset,
    addRefrigeration, addRefrigerationSystem, delRefrigeration, updateRefrigeration, copyRefrigeration,
    setSettings, updateAction, updateSystemAction, updateAssumptions, resetSettings, saveScenario, duplicateScenario, deleteScenario,
    result, baseAssets, baseSystems, selectedAssets, selectedSystems, selectedBaseline,
    resolvedBaseAssets, resolvedSelectedAssets,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScenario(): StoreShape {
  const v = useContext(Ctx);
  if (!v) throw new Error("useScenario must be used within ScenarioProvider");
  return v;
}

/** The global assumptions if a ScenarioProvider is above us, else undefined.
 *
 *  Exists so the Scope 2 provider can price on the user's discount rate and
 *  escalations instead of the module defaults, WITHOUT hard-coupling to the
 *  Scope 1 store: Shell nests Scope2Provider inside ScenarioProvider, but some
 *  tests mount Scope2Provider on its own, and `useScenario` throws there.
 *  Returning undefined lets `financeAssumptionsFrom` fall back exactly as it
 *  does for any absent field. */
export function useOptionalAssumptions(): GlobalAssumptions | undefined {
  return useContext(Ctx)?.settings.assumptions;
}
