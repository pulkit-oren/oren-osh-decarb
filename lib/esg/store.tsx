"use client";

/* ============================================================
   ESG store — per-company Water and Waste annual inventories for the
   Environment pillar of the Data input tab. Water is edited per
   withdrawal-source / discharge-destination and waste per BRSR
   category; the headline totals are recomputed on every edit so
   downstream readers (Goals, Environment screen) never drift from
   the breakdowns. Persists to localStorage, mirroring the
   Scenario / Scope2 / Goals providers.
   ============================================================ */

import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from "react";
import {
  EMPTY_WASTE_CAT, normalizeWasteYear, normalizeWaterYear,
  type DischargeDestId, type EsgState, type WasteByYear, type WasteCatYear,
  type WasteCategoryId, type WaterByYear, type WaterSourceId,
} from "./types";

interface EsgStoreShape extends EsgState {
  /** Set one source's withdrawal (kL); the withdrawal total follows. */
  setWaterWithdrawal: (year: number, source: WaterSourceId, kl: number) => void;
  /** Set one destination's discharge (kL); the discharge total follows. */
  setWaterDischarge: (year: number, dest: DischargeDestId, kl: number) => void;
  /** Consumption is entered (or accepted from the suggestion) as a total. */
  setWaterConsumption: (year: number, kl: number) => void;
  /** Patch one BRSR category's quantities; the totals follow. */
  setWasteCategory: (year: number, cat: WasteCategoryId, patch: Partial<WasteCatYear>) => void;
}

const Ctx = createContext<EsgStoreShape | null>(null);
const DEFAULT_LS_KEY = "osh-esg-v1";

function load(key: string): EsgState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as EsgState) : null;
  } catch {
    return null;
  }
}

export function EsgProvider({
  children,
  storageKey = DEFAULT_LS_KEY,
}: {
  children: ReactNode;
  storageKey?: string;
}) {
  const [water, setWater] = useState<WaterByYear>({});
  const [waste, setWaste] = useState<WasteByYear>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration */
    const p = load(storageKey);
    if (p) {
      if (p.water) setWater(p.water);
      if (p.waste) setWaste(p.waste);
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time per mount; key changes remount
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const data: EsgState = { water, waste };
    window.localStorage.setItem(storageKey, JSON.stringify(data));
  }, [water, waste, hydrated, storageKey]);

  const setWaterWithdrawal: EsgStoreShape["setWaterWithdrawal"] = (year, source, kl) =>
    setWater((prev) => {
      const w = normalizeWaterYear(prev[year]);
      const withdrawalBySource = { ...w.withdrawalBySource, [source]: kl };
      return { ...prev, [year]: normalizeWaterYear({ ...w, withdrawalBySource }) };
    });

  const setWaterDischarge: EsgStoreShape["setWaterDischarge"] = (year, dest, kl) =>
    setWater((prev) => {
      const w = normalizeWaterYear(prev[year]);
      const dischargeByDest = { ...w.dischargeByDest, [dest]: kl };
      return { ...prev, [year]: normalizeWaterYear({ ...w, dischargeByDest }) };
    });

  const setWaterConsumption: EsgStoreShape["setWaterConsumption"] = (year, kl) =>
    setWater((prev) => ({ ...prev, [year]: { ...normalizeWaterYear(prev[year]), consumptionKl: kl } }));

  const setWasteCategory: EsgStoreShape["setWasteCategory"] = (year, cat, patch) =>
    setWaste((prev) => {
      const w = normalizeWasteYear(prev[year]);
      const byCategory = { ...w.byCategory, [cat]: { ...EMPTY_WASTE_CAT, ...w.byCategory?.[cat], ...patch } };
      return { ...prev, [year]: normalizeWasteYear({ ...w, byCategory }) };
    });

  return (
    <Ctx.Provider value={{ water, waste, setWaterWithdrawal, setWaterDischarge, setWaterConsumption, setWasteCategory }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEsg(): EsgStoreShape {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEsg must be used within EsgProvider");
  return v;
}
