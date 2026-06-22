import { describe, it, expect } from "vitest";
import { ALT_FUELS, ALT_FUELS_BY_FUEL, defraEF, efFor, FUELS, FUELS_BY_CATEGORY, maxBlendPctFor } from "../factors";
import { defaultAltFuelFor } from "../segments";
import { combustionBreakdown, combustionCO2e } from "../baseline";
import type { CombustionAsset } from "../types";

describe("defraEF year-on-year", () => {
  it("returns the exact year's DEFRA factor when available", () => {
    expect(defraEF("diesel", 2022)).toMatchObject({ value: 2.56, sourceYear: 2022, exact: true });
    expect(defraEF("diesel", 2024)).toMatchObject({ value: 2.51279, sourceYear: 2024, exact: true });
    expect(defraEF("diesel", 2025)).toMatchObject({ value: 2.57082, sourceYear: 2025, exact: true });
  });

  it("clamps to nearest available year outside the range, flagged inexact", () => {
    expect(defraEF("diesel", 2021)).toMatchObject({ value: 2.56, sourceYear: 2022, exact: false });
    expect(defraEF("diesel", 2027)).toMatchObject({ value: 2.57082, sourceYear: 2025, exact: false });
  });

  it("defaults to the latest year when none given", () => {
    expect(defraEF("diesel").sourceYear).toBe(2025);
  });

  it("combustionCO2e uses the asset's FY factor", () => {
    const base: CombustionAsset = { id: "x", name: "x", category: "stationary", fuelType: "diesel", annualVolume: 100000, unit: "L", opex: 0, remainingLife: 5, unitCount: 1 };
    expect(combustionCO2e({ ...base, year: 2022 })).toBeCloseTo((100000 * 2.56) / 1000, 3);
    expect(combustionCO2e({ ...base, year: 2025 })).toBeCloseTo((100000 * 2.57082) / 1000, 3);
  });
});

describe("biomass fuels", () => {
  const biomassIds = ["biogas", "bioCng", "bioBriquettes", "biomass"] as const;

  it("are registered, flagged renewable, and carry a biogenic factor", () => {
    for (const id of biomassIds) {
      expect(FUELS[id]).toBeTruthy();
      expect(FUELS[id].renewable).toBe(true);
      expect(FUELS[id].biogenicCO2ePerUnit).toBeGreaterThan(0);
    }
  });

  it("appear in the data-entry dropdown categories", () => {
    expect(FUELS_BY_CATEGORY.stationary).toEqual(
      expect.arrayContaining(["biogas", "bioCng", "bioBriquettes", "biomass"]),
    );
    expect(FUELS_BY_CATEGORY.mobile).toContain("bioCng");
  });

  it("only the small CH₄/N₂O factor counts to Scope 1, well below a fossil fuel", () => {
    const briq: CombustionAsset = { id: "b", name: "Briquette boiler", category: "stationary", fuelType: "bioBriquettes", annualVolume: 500, unit: "t", opex: 0, remainingLife: 8, unitCount: 1, year: 2025 };
    // Scope 1 = 500 t × 28 kgCO2e/t ÷ 1000 = 14 t
    expect(combustionCO2e(briq)).toBeCloseTo((500 * 28) / 1000, 3);
    // …far below the same tonnage of coal
    const coal: CombustionAsset = { ...briq, fuelType: "coal" };
    expect(combustionCO2e(briq)).toBeLessThan(combustionCO2e(coal) / 50);
  });

  it("breakdown separates biogenic CO₂ from the Scope 1 line", () => {
    const a: CombustionAsset = { id: "g", name: "Biogas boiler", category: "stationary", fuelType: "biogas", annualVolume: 100000, unit: "m3", opex: 0, remainingLife: 8, unitCount: 1, year: 2025 };
    const bd = combustionBreakdown(a);
    expect(bd.renewable).toBe(true);
    expect(bd.biogenicCO2eT).toBeCloseTo((100000 * 1.1908) / 1000, 3);
    expect(bd.co2eT).toBeLessThan(bd.biogenicCO2eT); // Scope 1 portion much smaller than biogenic
  });
});

describe("alt-fuel engine matching & blend caps", () => {
  it("matches each fossil fuel to its drop-in bio fuel by engine/burner", () => {
    expect(ALT_FUELS_BY_FUEL.petrol).toEqual(["ethanol"]);
    expect(ALT_FUELS_BY_FUEL.diesel).toEqual(["biodiesel"]);
    expect(ALT_FUELS_BY_FUEL.cng).toEqual(["bioCng"]);
    expect(ALT_FUELS_BY_FUEL.png).toEqual(["biogas"]);
  });

  it("offers no drop-in bio fuel for fuels that need a different technology (LPG/propane/butane)", () => {
    expect(ALT_FUELS_BY_FUEL.lpg).toBeUndefined();
    expect(ALT_FUELS_BY_FUEL.propane).toBeUndefined();
    expect(defaultAltFuelFor("lpg")).toBeNull();
    expect(defaultAltFuelFor("petrol")).toBe("ethanol");
    expect(defaultAltFuelFor("cng")).toBe("bioCng");
    expect(defaultAltFuelFor("coal")).toBe("biomass"); // coal now co-fires biomass
  });

  it("caps drop-in blends at what existing equipment takes (E20 / B20)", () => {
    expect(ALT_FUELS.ethanol.maxBlendPct).toBe(20);
    expect(ALT_FUELS.biodiesel.maxBlendPct).toBe(20);
    // gaseous biomethane / bio-CNG are true drop-ins → full substitution allowed
    expect(ALT_FUELS.biogas.maxBlendPct).toBe(100);
    expect(ALT_FUELS.bioCng.maxBlendPct).toBe(100);
  });

  it("blend cap is context-aware: stationary boilers take more than vehicles", () => {
    // biodiesel: vehicles ~B20, boilers up to ~B100 (burner retrofit)
    expect(maxBlendPctFor("mobile", "biodiesel")).toBe(20);
    expect(maxBlendPctFor("stationary", "biodiesel")).toBe(100);
    // gaseous is 100% either way
    expect(maxBlendPctFor("mobile", "biogas")).toBe(100);
    expect(maxBlendPctFor("stationary", "biogas")).toBe(100);
  });

  it("offers biomass co-firing for coal and other solid fuels", () => {
    expect(ALT_FUELS_BY_FUEL.coal).toEqual(["biomass"]);
    expect(ALT_FUELS_BY_FUEL.cokingCoal).toEqual(["biomass"]);
    expect(ALT_FUELS_BY_FUEL.lignite).toEqual(["biomass"]);
    expect(ALT_FUELS_BY_FUEL.petcoke).toEqual(["biomass"]);
    expect(ALT_FUELS.biomass.maxBlendPct).toBe(50);
  });
});

describe("efFor source fallback", () => {
  it("uses DEFRA by year when present", () => {
    const ef = efFor("diesel", 2025);
    expect(ef.source).toBe("DEFRA");
    expect(ef.value).toBeCloseTo(2.57082, 5);
    expect(ef.exact).toBe(true);
  });
  it("clamps an out-of-range year for a DEFRA fuel", () => {
    const ef = efFor("diesel", 2030);
    expect(ef.sourceYear).toBe(2025);
    expect(ef.exact).toBe(false);
  });
  it("falls back to IMO for a marine fuel with no DEFRA factor", () => {
    const ef = efFor("marineHfoHsfo", 2025);
    expect(ef.source).toBe("IMO");
    expect(ef.value).toBeCloseTo(3.1251428, 5);
  });
  it("falls back to IPCC for anthracite", () => {
    const ef = efFor("coalAnthracite", 2025);
    expect(ef.source).toBe("IPCC");
    expect(ef.value).toBeCloseTo(2643.09, 2);
  });
  it("returns real IPCC 2014 factor for coalBriquettes (2032.32, not bituminous proxy)", () => {
    const ef = efFor("coalBriquettes", 2025);
    expect(ef.source).toBe("IPCC");
    expect(ef.value).toBeCloseTo(2032.32, 2);
  });
});

describe("FUELS completeness (Task 2)", () => {
  it("every Excel-listed fuel has a category and an EF source", () => {
    const listed = Object.values(FUELS).filter((f) => f.excelCategory);
    expect(listed.length).toBe(35);
    for (const f of listed) expect(["DEFRA", "IPCC", "IMO"]).toContain(f.efSource);
  });
});
