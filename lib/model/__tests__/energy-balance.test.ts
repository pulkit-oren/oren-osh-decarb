import { describe, expect, it } from "vitest";
import { applyDials, deriveDials, energyMix, suggestMix } from "@/lib/model/energy-balance";
import type { CombustionAsset, RefrigerationSystem, LeverSettings } from "@/lib/model/types";
import { defaultActions } from "@/lib/model/segments";

const truck = (): CombustionAsset => ({ id: "t1", name: "Trucks", category: "mobile", fuelType: "diesel", unit: "L", annualVolume: 100000, opex: 0, remainingLife: 10, unitCount: 10, endUse: "truck" });
const base = (assets: CombustionAsset[]): LeverSettings => ({
  byAsset: Object.fromEntries(assets.map((a) => [a.id, defaultActions(a)])),
  bySystem: {},
  assumptions: { renewableSourcingPct: 50, gridEf: 0.71, recCostPerTonne: 800, carbonPricePerTonne: 2000, infraCapex: 15000000 },
});

describe("applyDials", () => {
  it("electrify dial sets feasible mobile sources to ~that share of the fleet", () => {
    const a = truck(); const s = applyDials([a], [], base([a]), { efficiencyPct: 0, electrifyPct: 50, renewablePct: 50, bioBlendPct: 0, refrigPct: 0 });
    expect(s.byAsset[a.id].electrify.enabled).toBe(true);
    expect(s.byAsset[a.id].electrify.unitsToConvert).toBe(5);
  });
  it("renewable dial writes the global assumption", () => {
    const a = truck(); const s = applyDials([a], [], base([a]), { efficiencyPct: 0, electrifyPct: 0, renewablePct: 80, bioBlendPct: 0, refrigPct: 0 });
    expect(s.assumptions.renewableSourcingPct).toBe(80);
  });
  it("does not mutate the base settings", () => {
    const a = truck(); const b = base([a]); const before = b.assumptions.renewableSourcingPct;
    applyDials([a], [], b, { efficiencyPct: 0, electrifyPct: 50, renewablePct: 90, bioBlendPct: 0, refrigPct: 0 });
    expect(b.assumptions.renewableSourcingPct).toBe(before);
  });
});

describe("energyMix", () => {
  it("returns non-negative shares that sum to ~the total fuel energy", () => {
    const a = truck(); const s = applyDials([a], [], base([a]), { efficiencyPct: 0, electrifyPct: 50, renewablePct: 50, bioBlendPct: 20, refrigPct: 0 });
    const m = energyMix([a], s);
    expect(m.fossilFuelGJ).toBeGreaterThanOrEqual(0);
    expect(m.gridElecGJ).toBeGreaterThanOrEqual(0);
    expect(m.renewableGJ).toBeGreaterThanOrEqual(0);
    expect(m.fossilFuelGJ + m.gridElecGJ + m.renewableGJ).toBeGreaterThan(0);
  });
});

describe("suggestMix", () => {
  it("raises dials toward a target and returns valid percentages", () => {
    const a = truck(); const d = suggestMix([a], [], base([a]), 0.3, 2025);
    expect(d.electrifyPct).toBeGreaterThanOrEqual(0);
    expect(d.electrifyPct).toBeLessThanOrEqual(100);
  });
});

describe("applyDials — feasibility guard", () => {
  it("heavyEquip (hard-to-electrify mobile) stays electrify.enabled === false even with electrifyPct: 100", () => {
    const a: CombustionAsset = { id: "he1", name: "Excavator", category: "mobile", fuelType: "diesel", unit: "L", annualVolume: 50000, opex: 0, remainingLife: 10, unitCount: 5, endUse: "heavyEquip" };
    const s = applyDials([a], [], base([a]), { efficiencyPct: 0, electrifyPct: 100, renewablePct: 0, bioBlendPct: 0, refrigPct: 0 });
    expect(s.byAsset[a.id].electrify.enabled).toBe(false);
  });

  it("asset with no bio-compatible fuel (marineHfoVlsfo) leaves fuelSwitch.enabled === false with bioBlendPct: 50", () => {
    const a: CombustionAsset = { id: "m1", name: "Marine Vessel", category: "mobile", fuelType: "marineHfoVlsfo", unit: "L", annualVolume: 200000, opex: 0, remainingLife: 15, unitCount: 1 };
    const s = applyDials([a], [], base([a]), { efficiencyPct: 0, electrifyPct: 0, renewablePct: 0, bioBlendPct: 50, refrigPct: 0 });
    expect(s.byAsset[a.id].fuelSwitch.enabled).toBe(false);
  });
});

/* ── Scope 1 efficiency becomes a dial ──────────────────────────────────────
   It was the one lever family the combined suggester could not reach: Scope 2
   had an efficiency dial, Scope 1 did not, and `applyDials`/`deriveDials`
   never touched `AssetActions.efficiency`. Measured on the shipped fixture, a
   15% saving across Scope 1 was worth +3.58pp of reduction and 0.55 Cr/yr at
   zero capital — free abatement no suggested mix could contain. The model
   already treats efficiency as step 0 of the stacking pipeline, so leaving it
   out also inflated every downstream lever's apparent share. */
describe("applyDials — Scope 1 efficiency", () => {
  const dials = (efficiencyPct: number) =>
    ({ electrifyPct: 0, renewablePct: 50, bioBlendPct: 0, refrigPct: 0, efficiencyPct });

  it("is off at zero, and does not enable the package", () => {
    const a = truck();
    const s = applyDials([a], [], base([a]), dials(0));
    expect(s.byAsset[a.id].efficiency?.enabled).toBe(false);
  });

  /* The dial is a share of what each END-USE can actually save, not a raw
     saving percentage. `defaultEfficiency` already carries a per-end-use hint
     (a truck is not a kiln), and the type caps savingPct at 40 — so a dial at
     100 meaning "save 100% of the fuel" would be both unreachable and a lie.
     100 means "take the full saving this end-use supports". */
  it("scales each asset's saving by its own end-use hint", () => {
    const a = truck();
    const hint = defaultActions(a).efficiency!.savingPct;
    expect(hint).toBeGreaterThan(0);

    const full = applyDials([a], [], base([a]), dials(100));
    expect(full.byAsset[a.id].efficiency?.enabled).toBe(true);
    expect(full.byAsset[a.id].efficiency?.savingPct).toBeCloseTo(hint, 6);

    const half = applyDials([a], [], base([a]), dials(50));
    expect(half.byAsset[a.id].efficiency?.savingPct).toBeCloseTo(hint / 2, 6);
  });

  it("does not mutate the base settings", () => {
    const a = truck(); const b = base([a]);
    const before = b.byAsset[a.id].efficiency?.savingPct;
    applyDials([a], [], b, dials(100));
    expect(b.byAsset[a.id].efficiency?.savingPct).toBe(before);
    expect(b.byAsset[a.id].efficiency?.enabled).toBe(false);
  });
});

describe("deriveDials — Scope 1 efficiency reads back", () => {
  it("round-trips the dial through the per-asset settings", () => {
    const a = truck();
    for (const pct of [0, 40, 100]) {
      const applied = applyDials([a], [], base([a]), { electrifyPct: 0, renewablePct: 50, bioBlendPct: 0, refrigPct: 0, efficiencyPct: pct });
      expect(deriveDials([a], [], applied).efficiencyPct).toBe(pct);
    }
  });

  it("reads a hand-set per-asset saving back as a share of the hint", () => {
    // Editing the source screen must move the dial here — the same contract
    // every other dial has.
    const a = truck();
    const b = base([a]);
    const hint = b.byAsset[a.id].efficiency!.savingPct;
    const hand: LeverSettings = {
      ...b,
      byAsset: { [a.id]: { ...b.byAsset[a.id], efficiency: { ...b.byAsset[a.id].efficiency!, enabled: true, savingPct: hint / 2 } } },
    };
    expect(deriveDials([a], [], hand).efficiencyPct).toBe(50);
  });
});
