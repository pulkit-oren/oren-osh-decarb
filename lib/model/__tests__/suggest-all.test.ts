/* Portfolio-wide suggestions — every non-excluded source gets its suggestion
   applied; excluded sources are untouched; assumptions carry over. */

import { describe, expect, it } from "vitest";
import { suggestAllSettings } from "../suggest-all";
import { suggestForAsset } from "../suggestions";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { CombustionAsset, LeverSettings, RefrigerationSystem } from "../types";

const asset = (over: Partial<CombustionAsset>): CombustionAsset => ({
  id: "a1", name: "Diesel genset", category: "stationary", fuelType: "diesel",
  unit: "L", annualVolume: 50_000, opex: 4_000_000, remainingLife: 10, unitCount: 1,
  ...over,
});

const system: RefrigerationSystem = {
  id: "s1", name: "HVAC", systemType: "commercialHVAC", refrigerant: "R404A",
  toppedUpKg: 20, gasCostPerKg: 400,
};

const PREV: LeverSettings = { byAsset: {}, bySystem: {}, assumptions: DEFAULT_SETTINGS.assumptions };

describe("suggestAllSettings", () => {
  it("enables each source's suggested levers in one pass", () => {
    const a = asset({});
    const next = suggestAllSettings([a], [system], PREV);
    const acts = next.byAsset["a1"];
    // the same levers the per-asset suggestion card would turn on
    const suggestedLevers = suggestForAsset(a).actions.map((x) => x.lever);
    for (const lever of suggestedLevers) {
      expect((acts as unknown as Record<string, { enabled: boolean }>)[lever].enabled).toBe(true);
    }
    expect(next.bySystem["s1"].leakFix.enabled).toBe(true);
  });

  it("skips excluded sources and preserves assumptions", () => {
    const next = suggestAllSettings([asset({ excluded: true })], [], PREV);
    expect(next.byAsset["a1"]).toBeUndefined();
    expect(next.assumptions).toBe(PREV.assumptions);
  });

  it("keeps a source's existing non-suggested fields", () => {
    const a = asset({});
    const withPlan = suggestAllSettings([a], [], PREV);
    const tweaked: LeverSettings = {
      ...withPlan,
      byAsset: { a1: { ...withPlan.byAsset.a1, electrify: { ...withPlan.byAsset.a1.electrify, tariffPerKwh: 12 } } },
    };
    const again = suggestAllSettings([a], [], tweaked);
    expect(again.byAsset.a1.electrify.tariffPerKwh).toBe(12); // patch doesn't touch it
  });
});
