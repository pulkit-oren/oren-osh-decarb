import { describe, expect, it } from "vitest";
import { fuelFamily, FAMILY_DEFAULT_FUEL } from "../activity-groups";

describe("fuelFamily", () => {
  it("classifies fuels by family", () => {
    expect(fuelFamily("png")).toBe("gaseous");
    expect(fuelFamily("cng")).toBe("gaseous");
    expect(fuelFamily("diesel")).toBe("liquid");
    expect(fuelFamily("coal")).toBe("solid");
    expect(fuelFamily("biomass")).toBe("biomass");
    expect(fuelFamily("bioCng")).toBe("biomass");
  });
  it("has a valid default fuel per family", () => {
    expect(fuelFamily(FAMILY_DEFAULT_FUEL.gaseous)).toBe("gaseous");
    expect(fuelFamily(FAMILY_DEFAULT_FUEL.liquid)).toBe("liquid");
    expect(fuelFamily(FAMILY_DEFAULT_FUEL.solid)).toBe("solid");
    expect(fuelFamily(FAMILY_DEFAULT_FUEL.biomass)).toBe("biomass");
  });
});
