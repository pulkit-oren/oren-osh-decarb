/* Step 0 — efficiency: shrinks the base every downstream lever acts on
   (no double counting), aggregates into its own lever row with capex and
   avoided-spend opex. */

import { describe, expect, it } from "vitest";
import { applyAssetActions, defaultActions } from "../segments";
import { combustionCO2e } from "../baseline";
import { compute } from "../index";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { CombustionAsset } from "../types";

const asset: CombustionAsset = {
  id: "a1", name: "Boiler", category: "stationary", fuelType: "diesel",
  unit: "L", annualVolume: 100_000, opex: 8_000_000, remainingLife: 12, unitCount: 1,
  endUse: "boiler",
};
const G = DEFAULT_SETTINGS.assumptions;

function actsWith(effPct: number, elecPct: number) {
  const acts = defaultActions(asset);
  return {
    ...acts,
    efficiency: { ...acts.efficiency!, enabled: effPct > 0, savingPct: effPct },
    electrify: { ...acts.electrify, enabled: elecPct > 0, capacityPct: elecPct },
  };
}

describe("efficiency stacking (step 0)", () => {
  const E0 = combustionCO2e(asset);

  it("efficiency alone removes its share of the full base", () => {
    const r = applyAssetActions(asset, actsWith(10, 0), G);
    expect(r.efficiencyAbatementT).toBeCloseTo(0.1 * E0, 6);
    expect(r.scope1AbatementT).toBe(0);
  });

  it("downstream electrification acts on the REDUCED base — never double counts", () => {
    const withEff = applyAssetActions(asset, actsWith(10, 50), G);
    const withoutEff = applyAssetActions(asset, actsWith(0, 50), G);
    // electrify abatement shrinks by exactly the efficiency factor
    expect(withEff.scope1AbatementT).toBeCloseTo(0.9 * withoutEff.scope1AbatementT, 6);
    // and the new electricity bill shrinks with it
    expect(withEff.kWh).toBeCloseTo(0.9 * withoutEff.kWh, 6);
    // total abatement never exceeds the baseline
    const total = withEff.efficiencyAbatementT + withEff.scope1AbatementT + withEff.fuelAbatementT;
    expect(total).toBeLessThanOrEqual(E0 + 1e-9);
    expect(total).toBeCloseTo(0.1 * E0 + 0.5 * 0.9 * E0, 6);
  });

  it("compute() rolls efficiency into its own lever row with capex and avoided spend", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      byAsset: { a1: { ...actsWith(10, 0), efficiency: { ...actsWith(10, 0).efficiency!, capex: 400_000 } } },
      bySystem: {},
    };
    const r = compute([asset], [], settings, 2025);
    const eff = r.levers.find((l) => l.id === "efficiency")!;
    expect(eff.abatementT).toBeCloseTo(0.1 * E0, 6);
    expect(eff.capex).toBe(400_000);
    // Efficiency cuts VOLUME, so it credits the FUEL half of the bill only —
    // was -0.1 * asset.opex (-800,000), which charged efficiency with
    // maintenance it never touched (F2). This fixture has a real measured
    // opex, so the number moved for a real reason:
    //   8,000,000 x (1 - 20% maintenance share) x 10% saving = 640,000
    const fuelHalf = asset.opex * (1 - 0.2);
    expect(eff.annualOpexDelta).toBeCloseTo(-0.1 * fuelHalf, 6); // avoided FUEL spend
    // Was simplePayback(400,000, 800,000) = 0.5. Payback is now discounted and
    // read off the same series as the cost, and the ramp phases capex with the
    // saving: year one carries 400,000/3 = 133,333 of capex against
    // 640,000 x (1/3) x 1.05 = 224,000 of saving, so the lever is already cash
    // positive in its first year -> 0 whole years, and genuinely computed
    // ("discounted"), not the no-capital placeholder F9 was about.
    expect(eff.paybackKind).toBe("discounted");
    expect(eff.paybackYears).toBe(0);
    expect(r.segments.some((s) => s.key === "eff-stationary")).toBe(true);
  });
});
