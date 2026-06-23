"use client";

import { useState, useEffect } from "react";

type BuConfig = { units: { name: string; aggregate: boolean }[] };

export type BuReg = BuConfig;

export function useBuConfig(activeId: string) {
  const buKey = `osh-bus-v3::${activeId}`;

  const [buReg, setBuReg] = useState<BuConfig>(() => {
    if (typeof window === "undefined") return { units: [] };
    try {
      const v = JSON.parse(window.localStorage.getItem(buKey) || "");
      return v && Array.isArray(v.units) ? { units: v.units } : { units: [] };
    } catch {
      return { units: [] };
    }
  });

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(buKey, JSON.stringify(buReg));
  }, [buReg, buKey]);

  const addBu = (name: string, aggregate: boolean) =>
    setBuReg((prev) => prev.units.some((b) => b.name === name) ? prev : { units: [...prev.units, { name, aggregate }] });

  const removeBu = (name: string) =>
    setBuReg((prev) => ({ units: prev.units.filter((b) => b.name !== name) }));

  return { buReg, addBu, removeBu };
}
