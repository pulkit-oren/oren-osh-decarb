import { describe, it, expect } from "vitest";
import { compute } from "..";
import { DEFAULT_ASSETS, DEFAULT_COMBUSTION_BY_YEAR, DEFAULT_SETTINGS, DEFAULT_SYSTEMS } from "../../defaults";
import { migrateEquipment } from "@/lib/equipment/migrate";

describe("the seeded inventory keeps no flat mirror (Ruling L)", () => {
  const seeded = Object.values(DEFAULT_COMBUSTION_BY_YEAR).flat();

  it("puts unitCount and remainingLife ONLY on the equipment", () => {
    // A source carrying both a flat copy and an equipment copy has two sources
    // of truth for one number, and every edit goes to the equipment — so the
    // flat copy goes stale the first time a user touches the source and the
    // flat-first readers (export.ts, validate.ts, end-use.ts) then serve it.
    for (const e of seeded) {
      expect(e.unitCount, e.id).toBeUndefined();
      expect(e.remainingLife, e.id).toBeUndefined();
      expect(e.equipment, e.id).toHaveLength(1);
      expect(e.equipment![0].unitCount, e.id).toBeGreaterThanOrEqual(1);
      expect(e.equipment![0].remainingLife, e.id).toBeGreaterThan(0);
    }
  });

  it("cannot be stripped later, which is why it had to never be written", () => {
    // migrateEquipment's idempotence guard returns an already-equipped entry BY
    // REFERENCE, so a mirror written at seed time would be permanent.
    const before = DEFAULT_COMBUSTION_BY_YEAR[2025][0];
    expect(migrateEquipment({ 2025: [before] })[2025][0]).toBe(before);
  });

  it("still reaches the engine with those values, stamped by resolution", () => {
    const genset = DEFAULT_ASSETS.find((a) => a.id === "genset")!;
    expect(genset.unitCount).toBe(2);
    expect(genset.remainingLife).toBe(9);
  });
});

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
