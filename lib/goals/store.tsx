"use client";

/* ============================================================
   Goals store (v2) — goals created from catalog templates, plus their
   initiatives (auto-seeded from data, then editable) and an optional
   output series for intensity goals. Persists per-company to
   localStorage, mirroring the Scenario / Scope2 providers.
   ============================================================ */

import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from "react";
import { uniqueId } from "@/lib/store-helpers";
import type { Goal, GoalsState, Initiative } from "./types";

interface GoalsStoreShape extends GoalsState {
  /** Activate a configured draft goal; `makeAuto` (given the saved goal) seeds its initiatives. */
  addGoal: (draft: Goal, makeAuto?: (goal: Goal) => Initiative[]) => string;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;

  addInitiative: (goalId: string, partial?: Partial<Initiative>) => string;
  updateInitiative: (id: string, patch: Partial<Initiative>) => void;
  deleteInitiative: (id: string) => void;
  /** Replace the auto-generated initiatives for a goal (manual ones are kept). */
  regenerateAuto: (goalId: string, fresh: Initiative[]) => void;

  setOutput: (year: number, value: number) => void;
}

const Ctx = createContext<GoalsStoreShape | null>(null);
const DEFAULT_LS_KEY = "osh-goals-v1";
const DEFAULT_BASE_YEAR = 2025;

function load(key: string): GoalsState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as GoalsState) : null;
  } catch {
    return null;
  }
}

export function GoalsProvider({
  children,
  storageKey = DEFAULT_LS_KEY,
}: {
  children: ReactNode;
  storageKey?: string;
}) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [output, setOutputState] = useState<Record<number, number>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration */
    const p = load(storageKey);
    if (p) {
      if (Array.isArray(p.goals)) setGoals(p.goals.map((g) => ({ ...g, milestones: g.milestones ?? [] })));
      if (Array.isArray(p.initiatives)) setInitiatives(p.initiatives);
      if (p.output) setOutputState(p.output);
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time per mount; key changes remount
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const data: GoalsState = { goals, initiatives, output };
    window.localStorage.setItem(storageKey, JSON.stringify(data));
  }, [goals, initiatives, output, hydrated, storageKey]);

  const addGoal: GoalsStoreShape["addGoal"] = (draft, makeAuto) => {
    const id = uniqueId("g", goals.map((g) => g.id));
    const goal: Goal = { ...draft, id, createdAt: Date.now() };
    setGoals((prev) => [...prev, goal]);
    if (makeAuto) {
      const seeded = makeAuto(goal);
      if (seeded.length) setInitiatives((prev) => [...prev, ...seeded]);
    }
    return id;
  };
  const updateGoal: GoalsStoreShape["updateGoal"] = (id, patch) =>
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const deleteGoal: GoalsStoreShape["deleteGoal"] = (id) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    setInitiatives((prev) => prev.filter((i) => i.goalId !== id));
  };

  const addInitiative: GoalsStoreShape["addInitiative"] = (goalId, partial) => {
    const id = uniqueId("i", initiatives.map((i) => i.id));
    const parent = goals.find((g) => g.id === goalId);
    const init: Initiative = {
      id, goalId, name: "New initiative", scope: parent?.scope ?? "s1s2",
      status: "planned", startYear: DEFAULT_BASE_YEAR + 1, targetYear: parent?.targetYear ?? 2030,
      metricImpact: 0, budget: 0, progressPct: 0, auto: false,
      ...partial,
    };
    setInitiatives((prev) => [...prev, init]);
    return id;
  };
  const updateInitiative: GoalsStoreShape["updateInitiative"] = (id, patch) =>
    setInitiatives((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const deleteInitiative: GoalsStoreShape["deleteInitiative"] = (id) =>
    setInitiatives((prev) => prev.filter((i) => i.id !== id));
  const regenerateAuto: GoalsStoreShape["regenerateAuto"] = (goalId, fresh) =>
    setInitiatives((prev) => [...prev.filter((i) => !(i.goalId === goalId && i.auto)), ...fresh]);

  const setOutput: GoalsStoreShape["setOutput"] = (year, value) =>
    setOutputState((prev) => ({ ...prev, [year]: value }));

  const value: GoalsStoreShape = {
    goals, initiatives, output,
    addGoal, updateGoal, deleteGoal,
    addInitiative, updateInitiative, deleteInitiative, regenerateAuto,
    setOutput,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGoals(): GoalsStoreShape {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGoals must be used within GoalsProvider");
  return v;
}
