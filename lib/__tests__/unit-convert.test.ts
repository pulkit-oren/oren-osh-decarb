import { describe, expect, it } from "vitest";
import { displayUnits, fromRef, toRef } from "../unit-convert";

describe("unit-convert", () => {
  it("offers the reference unit plus mass units", () => {
    expect(displayUnits("diesel")).toContain("L"); // reference
    expect(displayUnits("diesel")).toContain("kg");
    expect(displayUnits("diesel")).toContain("t");
    expect(displayUnits("png")).toContain("m3"); // reference for gas
  });
  it("is identity for the reference unit", () => {
    expect(fromRef(500, "diesel", "L")).toBe(500);
    expect(toRef(500, "diesel", "L")).toBe(500);
  });
  it("round-trips reference → kg → reference via density", () => {
    const kg = fromRef(1000, "diesel", "kg");
    expect(kg).toBeGreaterThan(0);
    expect(toRef(kg, "diesel", "kg")).toBeCloseTo(1000, 5);
  });
  it("round-trips reference → t → reference", () => {
    const t = fromRef(1000, "diesel", "t");
    expect(toRef(t, "diesel", "t")).toBeCloseTo(1000, 5);
  });
});
