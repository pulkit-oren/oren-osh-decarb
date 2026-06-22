import { describe, it, expect } from "vitest";
import { baselineScope1 } from "../baseline";
import type { RefrigerationSystem } from "../types";

const sys = (id: string, excluded?: boolean): RefrigerationSystem => ({
  id, name: id, systemType: "commercialHVAC", refrigerant: "R410A", toppedUpKg: 10, gasCostPerKg: 900, excluded,
});

describe("baselineScope1 excludes excluded systems when the caller filters", () => {
  it("drops an excluded system from the refrigerant total", () => {
    const all = [sys("a"), sys("b", true)];
    const included = baselineScope1([], all.filter((s) => !s.excluded));
    const both = baselineScope1([], all);
    expect(both.refrigerantT).toBeGreaterThan(included.refrigerantT);
  });
});
