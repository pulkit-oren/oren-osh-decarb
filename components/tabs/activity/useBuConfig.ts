"use client";

import { useState, useEffect } from "react";

type BuConfig = { mode: "central" | "bu"; units: { name: string; aggregate: boolean }[] };

export type BuReg = BuConfig;

export function useBuConfig(activeId: string) {
  const buKey = `osh-bus-v3::${activeId}`;

  const [buReg, setBuReg] = useState<BuConfig>(() => {
    if (typeof window === "undefined") return { mode: "central", units: [] };
    try {
      const v = JSON.parse(window.localStorage.getItem(buKey) || "");
      return v && v.mode ? v : { mode: "central", units: [] };
    } catch {
      return { mode: "central", units: [] };
    }
  });

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(buKey, JSON.stringify(buReg));
  }, [buReg, buKey]);

  const addBu = (name: string, aggregate: boolean) =>
    setBuReg((prev) => prev.units.some((b) => b.name === name) ? prev : { ...prev, units: [...prev.units, { name, aggregate }] });

  const removeBu = (name: string) =>
    setBuReg((prev) => ({ ...prev, units: prev.units.filter((b) => b.name !== name) }));

  const setMode = (mode: "central" | "bu") =>
    setBuReg((prev) => ({ ...prev, mode }));

  return { buReg, addBu, removeBu, setMode };
}
