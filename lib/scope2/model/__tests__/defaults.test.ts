import { describe, expect, it } from "vitest";
import {
  DEFAULT_BASE_YEAR, DEFAULT_FACILITIES_BY_YEAR, DEFAULT_SCOPE2_LEVERS, defaultFacilityActions,
} from "../../defaults";

describe("scope 2 defaults", () => {
  const base = DEFAULT_FACILITIES_BY_YEAR[DEFAULT_BASE_YEAR];

  it("seeds three facilities in the base year", () => {
    expect(base).toHaveLength(3);
  });

  it("keeps ids unique and stable across years", () => {
    for (const year of Object.keys(DEFAULT_FACILITIES_BY_YEAR)) {
      const list = DEFAULT_FACILITIES_BY_YEAR[Number(year)];
      expect(new Set(list.map((f) => f.id)).size).toBe(list.length);
    }
    // a facility present in two years keeps the same id
    expect(DEFAULT_FACILITIES_BY_YEAR[2024].find((f) => f.id === "f-pune")).toBeTruthy();
    expect(DEFAULT_FACILITIES_BY_YEAR[2026].find((f) => f.id === "f-pune")).toBeTruthy();
  });

  it("gives every base facility a lever entry", () => {
    for (const f of base) expect(DEFAULT_SCOPE2_LEVERS.byFacility[f.id]).toBeTruthy();
  });

  it("load splits stay within 100%", () => {
    for (const f of base) {
      const { lightingPct, motorPct, hvacPct } = f.loadSplit;
      expect(lightingPct + motorPct + hvacPct).toBeLessThanOrEqual(100);
    }
  });

  it("flags exactly one isolated facility (the island resort)", () => {
    expect(base.filter((f) => f.isolated).map((f) => f.id)).toEqual(["f-island"]);
  });

  it("default actions start disabled with sliders at 0", () => {
    const acts = defaultFacilityActions(base[0]);
    expect(acts.efficiency.enabled).toBe(false);
    expect(acts.generation.solarKwp).toBe(0);
    expect(DEFAULT_SCOPE2_LEVERS.procurement.enabled).toBe(false);
  });
});
