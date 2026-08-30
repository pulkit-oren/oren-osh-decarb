/* Installed charge, the leak rate it makes measurable, and the lower-charge
   lever. Before this, a system recorded only its top-up: enough to compute
   emissions and nothing else, so a target could only ever be "improve on last
   year" — which is not the promise an F-gas commitment makes. */

import { describe, it, expect } from "vitest";
import { compute } from "@/lib/model";
import { applyRefrigerant } from "@/lib/model/levers";
import {
  IMPLAUSIBLE_LEAK_RATE_PCT, TYPICAL_LEAK_RATE_PCT,
  effectiveLeakImprovementPct, leakRatePct, validateCharge, validateTargetableSystems,
} from "@/lib/model/refrigerant-charge";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { LeakFixAction, LeverSettings, RefrigerationSystem } from "@/lib/model/types";

const sys = (patch: Partial<RefrigerationSystem> = {}): RefrigerationSystem => ({
  id: "chiller", name: "Chiller", systemType: "commercialHVAC", refrigerant: "R410A",
  toppedUpKg: 400, gasCostPerKg: 1200, chargeKg: 4000, ...patch,
});

const leakFix = (patch: Partial<LeakFixAction> = {}): LeakFixAction => ({
  enabled: true, leakImprovementPct: 40, startYear: 2026, targetYear: 2029, ...patch,
});

describe("leakRatePct", () => {
  it("is the annual loss as a share of installed charge", () => {
    expect(leakRatePct(sys())).toBeCloseTo(10, 9);
  });

  it("is undefined — not zero — when no charge is recorded", () => {
    // "Not measurable" and "does not leak" are opposite facts.
    expect(leakRatePct(sys({ chargeKg: undefined }))).toBeUndefined();
    expect(leakRatePct(sys({ chargeKg: 0 }))).toBeUndefined();
  });
});

describe("effectiveLeakImprovementPct", () => {
  it("uses the relative slider when no target rate is set", () => {
    expect(effectiveLeakImprovementPct(sys(), leakFix({ leakImprovementPct: 40 }))).toBe(40);
  });

  it("lets an absolute target rate override the relative slider", () => {
    // Leaking 10% of charge, targeting 4% ⇒ a 60% cut in leaked mass,
    // regardless of what the slider happens to say.
    const v = effectiveLeakImprovementPct(sys(), leakFix({ leakImprovementPct: 5, targetLeakRatePct: 4 }));
    expect(v).toBeCloseTo(60, 9);
  });

  it("falls back to the relative slider when the target cannot be measured", () => {
    const v = effectiveLeakImprovementPct(
      sys({ chargeKg: undefined }), leakFix({ leakImprovementPct: 35, targetLeakRatePct: 4 }),
    );
    expect(v).toBe(35);
  });

  it("never manufactures emissions from a slack target", () => {
    // Targeting 15% while leaking 10% is not a 50% INCREASE in leaks.
    expect(effectiveLeakImprovementPct(sys(), leakFix({ targetLeakRatePct: 15 }))).toBe(0);
  });

  it("is zero when the lever is off, whatever the fields say", () => {
    expect(effectiveLeakImprovementPct(sys(), leakFix({ enabled: false, targetLeakRatePct: 1 }))).toBe(0);
  });
});

describe("charge reduction", () => {
  it("cuts leaked mass proportionally, on top of any leak fix", () => {
    const base = applyRefrigerant(sys(), { transitionPct: 0, altRefrigerant: "R454B", leakImprovementPct: 0 });
    const halved = applyRefrigerant(sys(), { transitionPct: 0, altRefrigerant: "R454B", leakImprovementPct: 0, chargeReductionPct: 50 });
    expect(halved.newFugitiveT).toBeCloseTo(base.newFugitiveT * 0.5, 9);
  });

  it("composes multiplicatively with leak fixing — neither substitutes for the other", () => {
    // Rate and charge are different terms of the same product, so a 50% leak
    // cut on a 50% smaller charge leaves a quarter, not nothing.
    const both = applyRefrigerant(sys(), { transitionPct: 0, altRefrigerant: "R454B", leakImprovementPct: 50, chargeReductionPct: 50 });
    const base = applyRefrigerant(sys(), { transitionPct: 0, altRefrigerant: "R454B", leakImprovementPct: 0 });
    expect(both.newFugitiveT).toBeCloseTo(base.newFugitiveT * 0.25, 9);
  });

  it("defaults to no effect, so plans saved before the lever existed are unchanged", () => {
    const a = applyRefrigerant(sys(), { transitionPct: 0, altRefrigerant: "R454B", leakImprovementPct: 20 });
    const b = applyRefrigerant(sys(), { transitionPct: 0, altRefrigerant: "R454B", leakImprovementPct: 20, chargeReductionPct: 0 });
    expect(a.newFugitiveT).toBeCloseTo(b.newFugitiveT, 12);
  });
});

describe("validateCharge", () => {
  it("says nothing about a plausible system", () => {
    expect(validateCharge([sys()])).toEqual([]);
  });

  it("flags a leak rate that is a fault rather than poor maintenance", () => {
    const w = validateCharge([sys({ toppedUpKg: 4000 * (IMPLAUSIBLE_LEAK_RATE_PCT + 10) / 100 })]);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain(String(TYPICAL_LEAK_RATE_PCT.commercialHVAC));
  });

  it("flags topping up more than the whole charge in one year", () => {
    const w = validateCharge([sys({ toppedUpKg: 5000 })]);
    expect(w[0]).toContain("more than a full recharge");
  });

  it("stays silent when there is no charge to judge against", () => {
    expect(validateCharge([sys({ chargeKg: undefined, toppedUpKg: 9999 })])).toEqual([]);
  });
});

describe("validateTargetableSystems", () => {
  it("says when a rate target cannot be measured", () => {
    const w = validateTargetableSystems(
      [sys({ chargeKg: undefined })],
      { chiller: { leakFix: leakFix({ targetLeakRatePct: 4 }) } },
    );
    expect(w[0]).toContain("no installed charge recorded");
  });

  it("is quiet once the charge is there", () => {
    expect(validateTargetableSystems([sys()], { chiller: { leakFix: leakFix({ targetLeakRatePct: 4 }) } })).toEqual([]);
  });
});

describe("compute() honours the target rate", () => {
  const settings = (leak: Partial<LeakFixAction>): LeverSettings => ({
    byAsset: {},
    bySystem: {
      chiller: {
        gasSwitch: { enabled: false, transitionPct: 0, altRefrigerant: "R454B", retrofitCapex: 0, startYear: 2027, targetYear: 2031 },
        leakFix: leakFix(leak),
      },
    },
    assumptions: DEFAULT_SETTINGS.assumptions,
  });

  it("abates more under a strict rate target than under a weak slider", () => {
    const weak = compute([], [sys()], settings({ leakImprovementPct: 5 }), 2025);
    const strict = compute([], [sys()], settings({ leakImprovementPct: 5, targetLeakRatePct: 2 }));
    expect(strict.baseline.refrigerantT).toBeCloseTo(weak.baseline.refrigerantT, 9);
    const abate = (r: ReturnType<typeof compute>) => r.levers.find((l) => l.label.startsWith("Refrigerant"))?.abatementT ?? 0;
    expect(abate(strict)).toBeGreaterThan(abate(weak));
  });

  it("surfaces an implausible charge through the same warnings channel", () => {
    const r = compute([], [sys({ toppedUpKg: 5000 })], settings({}), 2025);
    expect(r.warnings.some((w) => w.includes("more than a full recharge"))).toBe(true);
  });
});
