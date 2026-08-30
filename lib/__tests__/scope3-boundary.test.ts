/* The boundary, stated. The product models Scope 1 and 2; the defect was
   silence about it while confirming targets that claim the whole company. */

import { describe, it, expect } from "vitest";
import {
  SBTI_SCOPE3_THRESHOLD_PCT, TYPICAL_SCOPE3_SHARE_PCT,
  claimsBeyondThisModel, scope3Screen,
} from "../scope3-boundary";

describe("claimsBeyondThisModel", () => {
  it("catches the goal names that assert a whole-company position", () => {
    expect(claimsBeyondThisModel("abs_sbti")).toBe(true);
    expect(claimsBeyondThisModel("netzero")).toBe(true);
    expect(claimsBeyondThisModel("carbon_neutral")).toBe(true);
  });

  it("leaves alone the goals that claim exactly what is modelled", () => {
    // "80% renewable electricity" is a Scope 2 statement and complete as one.
    expect(claimsBeyondThisModel("re100")).toBe(false);
    expect(claimsBeyondThisModel("renewable_pct")).toBe(false);
    expect(claimsBeyondThisModel("energy_efficiency")).toBe(false);
  });
});

describe("scope3Screen", () => {
  it("inverts the share correctly: 70% of the total is 2.33x Scope 1+2", () => {
    const s = scope3Screen(10_000);
    expect(s.lowT).toBeCloseTo(10_000 * (0.7 / 0.3), 6);
    expect(s.highT).toBeCloseTo(10_000 * (0.92 / 0.08), 6);
  });

  it("returns a band and no midpoint — a midpoint is what gets quoted", () => {
    const s = scope3Screen(10_000);
    expect(s.highT).toBeGreaterThan(s.lowT);
    expect(Object.keys(s)).not.toContain("midT");
  });

  it("keeps the implied total consistent with its own band", () => {
    const s = scope3Screen(54_977);
    expect(s.totalLowT).toBeCloseTo(s.scope12T + s.lowT, 6);
    expect(s.totalHighT).toBeCloseTo(s.scope12T + s.highT, 6);
    // And the low end really is the stated share of the implied total.
    expect((s.lowT / s.totalLowT) * 100).toBeCloseTo(TYPICAL_SCOPE3_SHARE_PCT.low, 6);
  });

  it("says a Scope 3 target is required, because at these shares it always is", () => {
    expect(scope3Screen(1).scope3TargetRequired).toBe(true);
    expect(TYPICAL_SCOPE3_SHARE_PCT.low).toBeGreaterThanOrEqual(SBTI_SCOPE3_THRESHOLD_PCT);
  });

  it("claims nothing about a company with no footprint entered", () => {
    expect(scope3Screen(0).scope3TargetRequired).toBe(false);
    expect(scope3Screen(0).lowT).toBe(0);
  });
});
