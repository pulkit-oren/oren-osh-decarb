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
  it("lists biodiesel under liquid (renewable)", () => {
    const liquid = fuelsInExcelFamily("liquid");
    const bd = liquid.find((f) => f.id === "biodiesel");
    expect(bd?.renewable).toBe(true);
  });
});
