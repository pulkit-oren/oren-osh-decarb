import { describe, expect, it } from "vitest";
import { parseCombustionRows } from "../import-combustion";

describe("parseCombustionRows", () => {
  it("parses tab-separated name/amount/fuel and matches fuels", () => {
    const rows = parseCombustionRows("Boiler A\t480000\tdiesel\nGenset\t320000\tpetrol\nMystery\t1000\tunobtainium");
    expect(rows).toHaveLength(3);
    expect(rows[0].asset.name).toBe("Boiler A");
    expect(rows[0].asset.fuelType).toBe("diesel");
    expect(rows[0].asset.annualVolume).toBe(480000);
    expect(rows[0].matched).toBe(true);
    expect(rows[1].asset.fuelType).toBe("petrol");
    expect(rows[2].matched).toBe(false);
    expect(rows[2].asset.fuelType).toBe("diesel"); // default
  });
  it("handles thousands separators (tab-pasted) and skips header/blank rows", () => {
    const rows = parseCombustionRows("name\tamount\tfuel\nDiesel set\t480,000\tdiesel\n\n");
    expect(rows).toHaveLength(1);
    expect(rows[0].asset.annualVolume).toBe(480000);
  });
});
