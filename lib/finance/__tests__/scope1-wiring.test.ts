// lib/finance/__tests__/scope1-wiring.test.ts
import { describe, expect, it } from "vitest";
import { financeAssumptionsFrom, recCostPerTonneFrom } from "@/lib/finance";
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

// Every test above runs on the seeded company, where every source has opex: 0
// and therefore resolves on the REFERENCE basis. On that basis
// `spend.fuel === annualVolume * pricePerUnit`, so a formula written in unit
// prices and one written in the fuel half of the bill give the same answer —
// which is exactly why a whole-bill error in either survives all seven.
// These cases put a real measured opex on the asset, where the two diverge.
describe("Scope 1 on a MEASURED-basis source, where the fuel/maintenance split bites", () => {
  // 1000 L at a ₹115,000 bill = ₹115/L blended. At a 20% maintenance share:
  // fuel ₹92,000 (₹92/L), maintenance ₹23,000.
  const measured: CombustionAsset = {
    id: "m-1", name: "Measured genset", category: "stationary", fuelType: "diesel",
    unit: "L", annualVolume: 1000, opex: 115_000, unitCount: 1, remainingLife: 10,
  };
  const assumptions = { ...DEFAULT_SETTINGS.assumptions, infraCapex: 0, maintenanceShareOfSpendPct: 20 };

  it("is actually on the measured basis, or the rest of this block proves nothing", () => {
    const base = defaultActions(measured);
    const r = compute([measured], [], { byAsset: { "m-1": base }, bySystem: {}, assumptions }, 2025);
    expect(r.kpis.priceBasisSummary.measured).toBe(1);
    expect(r.kpis.priceBasisSummary.reference).toBe(0);
  });

  it("F2, second branch: fuel switch displaces the FUEL half, not the whole bill", () => {
    const base = defaultActions(measured);
    const settings: LeverSettings = {
      byAsset: { "m-1": { ...base, fuelSwitch: { ...base.fuelSwitch, enabled: true, blendPct: 100, altFuelPricePerUnit: 0, retrofitCapex: 0 } } },
      bySystem: {}, assumptions,
    };
    const r = compute([measured], [], settings, 2025);
    const fs = r.levers.find((l) => l.id === "fuelSwitch")!;
    const displaced = fs.opexParts.find((p) => p.label === "Displaced fossil fuel spend")!;
    const applied = applyAssetActions(measured, settings.byAsset["m-1"], assumptions);

    // A blend switch swaps the tank contents; the engine's maintenance is
    // unaffected, so the ₹23,000 maintenance share is NOT displaced.
    expect(-displaced.amount).toBeCloseTo(92_000 * applied.fuelFraction, 6);
    expect(-displaced.amount).toBeLessThan(115_000 * applied.fuelFraction); // the whole-bill answer
  });

  it("efficiency and fuel switch agree on what a litre of fuel is worth", () => {
    const base = defaultActions(measured);
    const eff = compute([measured], [], {
      byAsset: { "m-1": { ...base, efficiency: { enabled: true, savingPct: 100, capex: 0, startYear: 2026, targetYear: 2026 } } },
      bySystem: {}, assumptions,
    }, 2025).levers.find((l) => l.id === "efficiency")!;
    const fs = compute([measured], [], {
      byAsset: { "m-1": { ...base, fuelSwitch: { ...base.fuelSwitch, enabled: true, blendPct: 100, altFuelPricePerUnit: 0, retrofitCapex: 0 } } },
      bySystem: {}, assumptions,
    }, 2025).levers.find((l) => l.id === "fuelSwitch")!;

    const effSaving = -eff.opexParts.find((p) => p.kind === "fuel")!.amount;
    const fsDisplaced = -fs.opexParts.find((p) => p.label === "Displaced fossil fuel spend")!.amount;
    const applied = applyAssetActions(measured, {
      ...base, fuelSwitch: { ...base.fuelSwitch, enabled: true, blendPct: 100, altFuelPricePerUnit: 0, retrofitCapex: 0 },
    }, assumptions);

    // Eliminating 100% of the fuel and displacing fraction f of it must value
    // that fuel identically — otherwise two levers price the same litre
    // differently, which is the drift this engine exists to end.
    expect(fsDisplaced).toBeCloseTo(effSaving * applied.fuelFraction, 6);
  });
});

describe("the price-basis tally covers every source, not just the ones with levers", () => {
  it("a source with NO lever settings is still counted", () => {
    // `basisTally[...] += 1` sits deliberately BEFORE `if (!acts) continue`.
    // Moving it after — which reads like tidying, since everything else in the
    // loop needs `acts` — silently makes the tally a count of ACTIONED sources.
    // The UI reads it to say how much of the plan rests on reference prices, so
    // undercounting it overstates how much of the money is measured.
    const { combustion, systems, settings, baseYear } = seedScope1();
    const noActions: LeverSettings = { ...settings, byAsset: {} };
    const r = compute(combustion, systems, noActions, baseYear);
    const s = r.kpis.priceBasisSummary;
    expect(s.measured + s.reference + s.unavailable).toBe(combustion.length);
    expect(s.reference).toBe(combustion.length);
    // Every combustion source really does hit the `continue`, or the fixture is
    // not exercising the path. (The refrigerant lever still runs: bySystem is
    // untouched, and it does not read the combustion loop at all.)
    for (const id of ["efficiency", "electrification", "fuelSwitch"]) {
      expect(r.levers.find((l) => l.id === id)!.abatementT).toBe(0);
    }
  });

  it("the tally still totals every source when levers ARE set", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const s = compute(combustion, systems, settings, baseYear).kpis.priceBasisSummary;
    expect(s.measured + s.reference + s.unavailable).toBe(combustion.length);
  });
});

describe("electrification is costed on tonnes NET of the Scope 2 load it adds", () => {
  // Owner decision, round 3. The lever's opexParts already charged
  // `scope2SpillFullT * recCostPerTonne` for certificates on its added grid
  // load, while its Rs/t divided by the GROSS Scope 1 tonnes — so the numerator
  // and the denominator disagreed about what the lever achieves.
  it("net is gross less the spill, to the tonne", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    const el = r.levers.find((l) => l.id === "electrification")!;

    expect(r.scope2SpillFullT).toBeGreaterThan(0);   // the spill is live here
    expect(el.netAbatementT).toBeLessThan(el.abatementT);
    expect(el.netAbatementT).toBeCloseTo(el.abatementT - r.scope2SpillFullT, 6);
  });

  it("every OTHER lever's net equals its gross", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    let checked = 0;
    for (const l of r.levers) {
      if (l.id === "electrification") continue;
      expect(l.netAbatementT).toBeCloseTo(l.abatementT, 9);
      checked++;
    }
    expect(checked).toBe(3);
  });

  it("PHYSICS is untouched: the gross tonnes the trajectory credits did not move", () => {
    // The whole point of keeping `abatementT` gross. The trajectory adds the
    // spill back on the Scope 2 line, so netting the wedge as well would
    // subtract it twice — and reconciliation.test.ts's tonnage guard would
    // catch it. This asserts the same thing at the lever.
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    const el = r.levers.find((l) => l.id === "electrification")!;
    const gross = r.segments
      .filter((s) => s.key === "elec-mobile" || s.key === "elec-stationary")
      .reduce((s, x) => s + x.abatementT, 0);
    expect(gross).toBeGreaterThan(0);
    expect(el.abatementT).toBeCloseTo(gross, 6);
  });
});

describe("both scopes charge the same rate for the same certificate", () => {
  it("Scope 1's spill charge is the shared per-kWh price, converted", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    const el = r.levers.find((l) => l.id === "electrification")!;
    const rec = el.opexParts.find((p) => p.label === "REC cost on added Scope 2")!;

    expect(r.scope2SpillFullT).toBeGreaterThan(0);
    const fa = financeAssumptionsFrom(settings.assumptions);
    const expected = r.scope2SpillFullT * recCostPerTonneFrom(fa.recPricePerKwh, settings.assumptions.gridEf);
    expect(rec.amount).toBeCloseTo(expected, 6);
    // and it really is the Rs 634 rate rather than the retired Rs 800 one
    expect(rec.amount / r.scope2SpillFullT).toBeCloseTo(633.8028169, 4);
  });

  it("the charge follows the shared price, so the two scopes cannot drift", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const at = (recPricePerKwh: number) => {
      const s = { ...settings, assumptions: { ...settings.assumptions, recPricePerKwh } };
      const r = compute(combustion, systems, s, baseYear);
      return r.levers.find((l) => l.id === "electrification")!
        .opexParts.find((p) => p.label === "REC cost on added Scope 2")!.amount;
    };
    expect(at(0)).toBeCloseTo(0, 6);
    expect(at(0.9)).toBeCloseTo(at(0.45) * 2, 6);
  });
});
