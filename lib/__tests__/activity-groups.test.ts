import { describe, it, expect } from "vitest";
import { fuelFamily, fuelsInExcelFamily } from "../activity-groups";

describe("fuelFamily by workbook category", () => {
  it("maps diesel to liquid, png to gas, coal to solid", () => {
    expect(fuelFamily("diesel")).toBe("liquid");
    expect(fuelFamily("png")).toBe("gas");
    expect(fuelFamily("coal")).toBe("solid");
  });
  it("returns null for an app-only fuel not in the workbook", () => {
    expect(fuelFamily("naphtha")).toBeNull();
  });
  it("maps workbook renewables (biodiesel, biogas, woodPellets) to biofuels", () => {
    // Biodiesel has excelCategory "liquid" but is renewable → biofuels
    expect(fuelFamily("biodiesel")).toBe("biofuels");
    // Biogas has excelCategory "gas" but is renewable → biofuels
    expect(fuelFamily("biogas")).toBe("biofuels");
    // Wood Pellets has excelCategory "solid" but is renewable → biofuels
    expect(fuelFamily("woodPellets")).toBe("biofuels");
  });
  it("fuelsInExcelFamily('biofuels') includes biodiesel and woodPellets", () => {
    const biofuels = fuelsInExcelFamily("biofuels");
    const ids = biofuels.map((f) => f.id);
    expect(ids).toContain("biodiesel");
    expect(ids).toContain("woodPellets");
    expect(ids).toContain("biogas");
    expect(ids).toContain("landfillGas");
    expect(ids).toContain("woodChips");
    expect(ids).toContain("woodLogs");
    expect(ids).toContain("bioBriquettes");
    // All 7 workbook renewables and nothing else
    expect(ids).toHaveLength(7);
  });
  it("fuelsInExcelFamily('liquid') no longer contains renewable fuels", () => {
    const liquid = fuelsInExcelFamily("liquid");
    const ids = liquid.map((f) => f.id);
    // Biodiesel moved to biofuels
    expect(ids).not.toContain("biodiesel");
    // bioBriquettes moved to biofuels (it had excelCategory "liquid" but is renewable)
    expect(ids).not.toContain("bioBriquettes");
    // Fossil liquid fuels still present
    expect(ids).toContain("diesel");
    expect(ids).toContain("fuelOil");
  });
});
