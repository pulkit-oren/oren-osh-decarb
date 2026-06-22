import { describe, it, expect } from "vitest";
import { buildTrajectory, targetLine } from "../trajectory";

describe("trajectory", () => {
  it("targetLine hits ~50% at 2030 and ~10% at 2050 of base", () => {
    expect(targetLine(1000, 2025)).toBeCloseTo(1000, 0);
    expect(targetLine(1000, 2030)).toBeCloseTo(500, 0);
    expect(targetLine(1000, 2050)).toBeCloseTo(100, 0);
    expect(targetLine(1000, 2040)).toBeCloseTo(300, 0); // midway 50→10
  });

  it("BAU drifts up; net ≤ BAU when a lever is active", () => {
    const t = buildTrajectory({
      baseYear: 2025, endYear: 2050, baseTotalT: 1000, bauGrowth: 0.01,
      wedges: [{ id: "x", label: "X", colorIdx: 4, scope: 1, startYear: 2026, rampYears: 5, fullAbatementT: 300 }],
    });
    const y2030 = t.find((r) => r.year === 2030)!;
    expect(y2030.bau).toBeGreaterThan(1000);
    expect(y2030.net).toBeLessThan(y2030.bau);
    expect(y2030.net).toBeGreaterThanOrEqual(0);
    expect(y2030.wedges["x"]).toBeGreaterThan(0);
  });

  it("stacked abatement never drives net below 0", () => {
    const t = buildTrajectory({
      baseYear: 2025, endYear: 2050, baseTotalT: 100, bauGrowth: 0,
      wedges: [{ id: "a", label: "a", colorIdx: 1, scope: 1, startYear: 2025, rampYears: 1, fullAbatementT: 200 }],
    });
    expect(Math.min(...t.map((r) => r.net))).toBeGreaterThanOrEqual(0);
  });

  it("ramps linearly: half abatement halfway through the ramp", () => {
    const t = buildTrajectory({
      baseYear: 2025, endYear: 2050, baseTotalT: 1000, bauGrowth: 0,
      wedges: [{ id: "x", label: "X", colorIdx: 4, scope: 1, startYear: 2025, rampYears: 4, fullAbatementT: 400 }],
    });
    // year index 2 of a 4-year ramp (2025,26,27,28) → ~ (2+1)/4 = 75%? define start year counts as year 1
    const y2026 = t.find((r) => r.year === 2026)!;
    expect(y2026.wedges["x"]).toBeCloseTo(200, 0); // (2026-2025+1)/4 = 0.5 → 200
  });
});
