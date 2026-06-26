import { describe, expect, it } from "vitest";
import { suggestForFacility, capexForFacility, facilityImpact, roofCapKwp } from "@/lib/scope2/model/suggestions";
import { defaultFacilityActions } from "@/lib/scope2/defaults";
import type { Facility } from "@/lib/scope2/model/types";

function fac(over: Partial<Facility>): Facility {
  return { id: "f1", name: "Plant", annualLoadKwh: 1_000_000, tariffPerKwh: 9, loadSplit: { lightingPct: 55, motorPct: 15, hvacPct: 15 }, roofSpaceM2: 5500, peakLoadKw: 0, gridEf: 0.71, irradiance: 1500, isolated: false, existingSolarKwp: 0, ...over } as Facility;
}

describe("suggestForFacility", () => {
  it("recommends efficiency (LED for lighting-heavy) and includes a solar action when roof headroom exists", () => {
    const s = suggestForFacility(fac({}));
    const eff = s.actions.find((a) => a.lever === "efficiency");
    expect(eff).toBeTruthy();
    expect(eff!.patch.enabled).toBe(true);
    expect(Number(eff!.patch.ledPct)).toBeGreaterThan(0);
    // 5500 m2 / 5.5 = 1000 kWp headroom → solar action present (primary or alternative)
    const hasSolar = [...s.actions, ...(s.altActions ?? [])].some((a) => a.lever === "generation");
    expect(hasSolar).toBe(true);
  });
});

describe("capexForFacility / facilityImpact", () => {
  it("baseT = load × gridEf / 1000 and afterT is lower once levers cut load", () => {
    const f = fac({});
    const acts = defaultFacilityActions(f);
    acts.efficiency = { ...acts.efficiency, enabled: true, ledPct: 100, motorPct: 0, bmsPct: 0 };
    const imp = facilityImpact(f, acts);
    expect(imp.baseT).toBeCloseTo((f.annualLoadKwh * f.gridEf) / 1000, 3);
    expect(imp.afterT).toBeLessThan(imp.baseT);
    expect(capexForFacility(f, acts)).toBeGreaterThanOrEqual(0);
  });
  it("roofCapKwp = roofSpaceM2 / M2_PER_KW − existing", () => {
    expect(roofCapKwp(fac({ roofSpaceM2: 5500, existingSolarKwp: 0 }))).toBeCloseTo(1000, 0);
  });
});
