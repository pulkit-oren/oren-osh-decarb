import { describe, expect, it } from "vitest";
import { applyDials2, energyMix2, suggestMix2 } from "@/lib/scope2/model/energy-balance";
import { DEFAULT_PROCUREMENT, defaultFacilityActions } from "@/lib/scope2/defaults";
import type { Facility, Scope2Levers } from "@/lib/scope2/model/types";

function fac(over: Partial<Facility>): Facility {
  return { id: "f1", name: "Plant", annualLoadKwh: 1_000_000, tariffPerKwh: 9, loadSplit: { lightingPct: 55, motorPct: 15, hvacPct: 15 }, roofSpaceM2: 5500, peakLoadKw: 0, gridEf: 0.71, irradiance: 1500, isolated: false, existingSolarKwp: 0, ...over } as Facility;
}
const base = (fs: Facility[]): Scope2Levers => ({ byFacility: Object.fromEntries(fs.map((f) => [f.id, defaultFacilityActions(f)])), procurement: { ...DEFAULT_PROCUREMENT } });

describe("applyDials2", () => {
  it("efficiency dial enables + sets LED/VFD/BMS; does not mutate base", () => {
    const f = fac({}); const b = base([f]);
    const next = applyDials2([f], b, { efficiencyPct: 80, solarPct: 0, procurementPct: 0 });
    expect(next.byFacility[f.id].efficiency.enabled).toBe(true);
    expect(next.byFacility[f.id].efficiency.ledPct).toBe(80);
    expect(b.byFacility[f.id].efficiency.enabled).toBe(false); // base untouched
  });
  it("procurement dial enables and sets clean coverage", () => {
    const f = fac({}); const next = applyDials2([f], base([f]), { efficiencyPct: 0, solarPct: 0, procurementPct: 60 });
    expect(next.procurement.enabled).toBe(true);
    expect(next.procurement.ppaPct).toBe(60);
  });
});

describe("energyMix2 + suggestMix2", () => {
  it("mix shares are non-negative and suggest returns valid dials", () => {
    const f = fac({}); const b = base([f]);
    const m = energyMix2([f], applyDials2([f], b, { efficiencyPct: 50, solarPct: 50, procurementPct: 50 }));
    expect(m.gridKwh).toBeGreaterThanOrEqual(0);
    expect(m.renewableKwh).toBeGreaterThanOrEqual(0);
    const d = suggestMix2([f], b, 0.3, 2025);
    expect(d.efficiencyPct).toBeGreaterThanOrEqual(0);
    expect(d.efficiencyPct).toBeLessThanOrEqual(100);
  });
});
