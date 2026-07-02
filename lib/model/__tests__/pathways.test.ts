/* Pathway options — three distinct strategies with sensible orderings:
   quick wins costs the least, max reduction cuts the most. */

import { describe, expect, it } from "vitest";
import { buildPathways } from "../pathways";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { CombustionAsset, LeverSettings, RefrigerationSystem } from "../types";

const assets: CombustionAsset[] = [
  {
    id: "a1", name: "Diesel gensets", category: "stationary", fuelType: "diesel",
    unit: "L", annualVolume: 80_000, opex: 6_000_000, remainingLife: 12, unitCount: 2,
  },
  {
    id: "a2", name: "Truck fleet", category: "mobile", fuelType: "diesel",
    unit: "L", annualVolume: 120_000, opex: 10_000_000, remainingLife: 8, unitCount: 12,
  },
];
const systems: RefrigerationSystem[] = [
  { id: "s1", name: "HVAC", systemType: "commercialHVAC", refrigerant: "R404A", toppedUpKg: 30, gasCostPerKg: 400 },
];
const PREV: LeverSettings = { byAsset: {}, bySystem: {}, assumptions: DEFAULT_SETTINGS.assumptions };

describe("buildPathways", () => {
  const [quick, balanced, max] = buildPathways(assets, systems, PREV, 2025);

  it("returns the three strategies in order", () => {
    expect([quick.id, balanced.id, max.id]).toEqual(["quick-wins", "balanced", "max"]);
  });

  it("quick wins avoids the heavy-capex levers", () => {
    for (const a of Object.values(quick.settings.byAsset)) expect(a.electrify.enabled).toBe(false);
    for (const s of Object.values(quick.settings.bySystem)) expect(s.gasSwitch.enabled).toBe(false);
    expect(quick.kpis.totalCapex).toBeLessThanOrEqual(balanced.kpis.totalCapex);
  });

  it("max reduction cuts at least as much as balanced, which beats quick wins", () => {
    expect(max.kpis.reduction2030).toBeGreaterThanOrEqual(balanced.kpis.reduction2030 - 1e-9);
    expect(balanced.kpis.reduction2030).toBeGreaterThanOrEqual(quick.kpis.reduction2030 - 1e-9);
    expect(quick.kpis.reduction2030).toBeGreaterThan(0); // leak fix + blends still cut something
  });
});
