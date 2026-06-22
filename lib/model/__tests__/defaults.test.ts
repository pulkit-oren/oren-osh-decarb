import { describe, it, expect } from "vitest";
import { compute } from "..";
import { DEFAULT_ASSETS, DEFAULT_SETTINGS, DEFAULT_SYSTEMS } from "../../defaults";

describe("default scenario", () => {
  const r = compute(DEFAULT_ASSETS, DEFAULT_SYSTEMS, DEFAULT_SETTINGS, 2025);

  it("has a credible baseline footprint", () => {
    expect(r.baseTotalT).toBeGreaterThan(1500);
    expect(r.baseTotalT).toBeLessThan(2500);
    expect(r.baseline.combustionT).toBeGreaterThan(0);
    expect(r.baseline.refrigerantT).toBeGreaterThan(0);
  });

  it("opens already telling a story — meaningful 2030 cut, on track soon", () => {
    expect(r.kpis.reduction2030).toBeGreaterThan(0.3);
    expect(r.kpis.onTrack2030 || (r.kpis.yearsToTarget !== null && r.kpis.yearsToTarget <= 2033)).toBe(true);
  });

  it("electrification creates a visible Scope 2 spillover", () => {
    expect(r.scope2SpillFullT).toBeGreaterThan(0);
  });

  it("produces a per-segment breakdown across mobile + stationary", () => {
    expect(r.segments.length).toBeGreaterThanOrEqual(3);
    expect(r.segments.some((seg) => seg.key.startsWith("elec"))).toBe(true);
    expect(r.segments.some((seg) => seg.key.startsWith("fuel"))).toBe(true);
  });

  it("refrigerant defaults preserve the old global story (₹12M capex, meaningful abatement)", () => {
    const lever = r.levers.find((l) => l.id === "refrigerant");
    expect(lever).toBeDefined();
    expect(lever!.capex).toBe(12_000_000);
    // old global default (60% → R290, 50% leak fix) abated ≈446 t/yr; per-system defaults should stay in that band
    expect(lever!.abatementT).toBeGreaterThan(380);
    expect(lever!.abatementT).toBeLessThan(500);
  });
});
