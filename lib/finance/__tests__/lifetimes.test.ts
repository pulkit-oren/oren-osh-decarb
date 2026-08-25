import { describe, expect, it } from "vitest";
import { S1_LIFETIME_YEARS, S2_LIFETIME_YEARS, windowFor } from "@/lib/finance/lifetimes";

describe("lifetime tables", () => {
  it("Scope 1 keeps its four families and Scope 2 its three, with efficiency differing", () => {
    expect(S1_LIFETIME_YEARS).toEqual({ efficiency: 7, electrification: 10, fuelSwitch: 15, refrigerant: 12 });
    expect(S2_LIFETIME_YEARS).toEqual({ efficiency: 8, generation: 25, procurement: 10 });
    expect(S1_LIFETIME_YEARS.efficiency).not.toBe(S2_LIFETIME_YEARS.efficiency);
  });
});

describe("windowFor", () => {
  it("a single-year deployment runs exactly one asset life", () => {
    expect(windowFor(2026, 2026, 10)).toEqual({ firstYear: 2026, lastYear: 2035 });
  });

  it("a ramp extends the window so the LAST tranche also gets a full life", () => {
    // installs 2026..2030; the 2030 tranche lives to 2039
    expect(windowFor(2026, 2030, 10)).toEqual({ firstYear: 2026, lastYear: 2039 });
  });

  it("a target before the start is treated as a single-year deployment", () => {
    expect(windowFor(2028, 2027, 10)).toEqual({ firstYear: 2028, lastYear: 2037 });
  });

  it("a non-positive asset life still yields at least the deployment years", () => {
    expect(windowFor(2026, 2028, 0)).toEqual({ firstYear: 2026, lastYear: 2028 });
  });
});
