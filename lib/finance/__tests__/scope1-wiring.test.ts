// lib/finance/__tests__/scope1-wiring.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import { compute } from "@/lib/model";
import { applyAssetActions, defaultActions } from "@/lib/model/segments";
import type { CombustionAsset, LeverSettings } from "@/lib/model/types";
import { seedScope1, sourceNamed } from "./seed-fixture";

describe("Scope 1 on the seeded company, priced by reference", () => {
  it("F1 fixed: fuel switch now SAVES money, because diesel is no longer free", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    const fs = r.levers.find((l) => l.id === "fuelSwitch")!;
    expect(fs.abatementT).toBeGreaterThan(0);
    const displaced = fs.opexParts.find((p) => p.label === "Displaced fossil fuel spend")!;
    expect(displaced.amount).toBeLessThan(0);                 // it displaces real spend now
    expect(Math.abs(displaced.amount)).toBeGreaterThan(1e7);  // and it is material
  });

  it("F1: the DG Set's displaced spend equals its volume × ₹92 × the switched fraction", () => {
    const { combustion, settings, baseYear } = seedScope1();
    const dg = sourceNamed(combustion, "DG Set");
    const acts = settings.byAsset[dg.id];
    const applied = applyAssetActions(dg, acts, settings.assumptions);
    const expected = dg.annualVolume * (1 - applied.effFraction) * applied.fuelFraction * 92;

    const r = compute([dg], [], { ...settings, bySystem: {} }, baseYear);
    const fs = r.levers.find((l) => l.id === "fuelSwitch")!;
    const displaced = fs.opexParts.find((p) => p.label === "Displaced fossil fuel spend")!;
    expect(-displaced.amount).toBeCloseTo(expected, 0);
  });

  it("F2 fixed: efficiency credits only the FUEL half of the bill", () => {
    const { combustion, settings, baseYear } = seedScope1();
    const dg = sourceNamed(combustion, "DG Set");
    const withEff = {
      ...settings, bySystem: {},
      byAsset: { [dg.id]: { ...settings.byAsset[dg.id], efficiency: { enabled: true, savingPct: 10, capex: 500_000, startYear: 2026, targetYear: 2028 } } },
    };
    const r = compute([dg], [], withEff, baseYear);
    const eff = r.levers.find((l) => l.id === "efficiency")!;
    const saving = -eff.opexParts.find((p) => p.kind === "fuel")!.amount;

    const applied = applyAssetActions(dg, withEff.byAsset[dg.id], withEff.assumptions);
    const fuelOnly = dg.annualVolume * 92 * applied.effFraction;
    expect(saving).toBeCloseTo(fuelOnly, 0);
    // and strictly less than crediting the whole grossed-up bill
    const wholeBill = (dg.annualVolume * 92) / 0.8 * applied.effFraction;
    expect(saving).toBeLessThan(wholeBill);
  });

  it("F3 fixed: stationary electrification adds maintenance back, like mobile does", () => {
    const { combustion, settings, baseYear } = seedScope1();
    const png = sourceNamed(combustion, "Piped Natural Gas");
    const withElec = {
      ...settings, bySystem: {},
      byAsset: { [png.id]: { ...settings.byAsset[png.id], electrify: { ...settings.byAsset[png.id].electrify, enabled: true, capacityPct: 50 } } },
    };
    const r = compute([png], [], withElec, baseYear);
    const el = r.levers.find((l) => l.id === "electrification")!;
    const addBack = el.opexParts.find((p) => /maintenance/i.test(p.label))!;
    expect(addBack.amount).toBeGreaterThan(0);   // was structurally absent for stationary
  });

  it("F4 fixed: capex on a zero-abatement lever still reaches totalCapex", () => {
    // MUST mirror Task 1's rebuilt F4 witness exactly. An earlier draft used the
    // seeded company with `efficiency: { savingPct: 0, capex: 1_000_000 }`, which
    // does NOT work: lib/model/index.ts:122 guards capex accrual behind
    // `r.effFraction > 0`, so at savingPct 0 the 1,000,000 never enters effCapex
    // and the test measures nothing. Use a single synthetic stationary asset with
    // zero volume and an electrify lever instead — stationary electrifyCapexFor
    // returns assetCapex unconditionally, and capacityPct/100 = 0.5 clears the
    // `> 0` guard, so the capex genuinely accrues while abatement stays 0.
    const asset: CombustionAsset = {
      id: "z-0", name: "Idle boiler", category: "stationary", fuelType: "png",
      unit: "m3", annualVolume: 0, opex: 0, unitCount: 1, remainingLife: 10,
    };
    const settings: LeverSettings = {
      byAsset: { "z-0": { ...defaultActions(asset), electrify: { ...defaultActions(asset).electrify, enabled: true, capacityPct: 50, assetCapex: 1_000_000 } } },
      bySystem: {},
      // infraCapex MUST be 0 — index.ts:236 otherwise adds it on top and the
      // assertion stops measuring one clean number.
      assumptions: { ...DEFAULT_SETTINGS.assumptions, infraCapex: 0 },
    };
    const r = compute([asset], [], settings, 2025);
    const el = r.levers.find((l) => l.id === "electrification")!;

    expect(el.abatementT).toBe(0);           // no volume, so no tonnes
    expect(el.capex).toBeCloseTo(1_000_000, 6); // but the capex is real
    expect(r.kpis.totalCapex).toBeCloseTo(1_000_000, 6); // and it survives the roll-up now
  });

  it("every lever reports the price basis it was costed on", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    expect(r.kpis.priceBasisSummary.reference).toBe(combustion.length); // all seven
    expect(r.kpis.priceBasisSummary.measured).toBe(0);
  });

  it("tonnage is untouched by the finance rework", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    expect(r.baseTotalT).toBeGreaterThan(0);
    // pinned in Task 10 against a pre-change snapshot; here only that it exists
    expect(r.levers.reduce((s, l) => s + l.abatementT, 0)).toBeGreaterThan(0);
  });
});
