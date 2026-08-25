// lib/finance/__tests__/goals-wiring.test.ts
import { describe, expect, it } from "vitest";
import { autoInitiatives } from "@/lib/goals/initiatives-auto";
import { getTemplate, goalFromTemplate } from "@/lib/goals/catalog";
import type { Inventories } from "@/lib/goals/select";
import type { Goal } from "@/lib/goals/types";
import type { CombustionAsset, CombustionByYear, RefrigerationByYear } from "@/lib/model/types";
import type { FacilitiesByYear } from "@/lib/scope2/model/types";

const BASE_YEAR = 2024;

// Reuses the shape lib/goals/__tests__/initiatives-auto.test.ts already
// establishes, rather than inventing a second fixture convention.
const goalOf = (templateId: Goal["templateId"]): Goal =>
  goalFromTemplate(getTemplate(templateId), "g-0", BASE_YEAR, 0);

const boiler = (over: Partial<CombustionAsset> = {}): CombustionAsset => ({
  id: "c1", name: "Diesel boiler", category: "stationary", fuelType: "diesel",
  annualVolume: 50_000, unit: "L", opex: 0, remainingLife: 10, unitCount: 1, ...over,
} as CombustionAsset);

const invOf = (assets: CombustionAsset[]): Inventories => ({
  combustion: { [BASE_YEAR]: assets } as CombustionByYear,
  refrigeration: {} as RefrigerationByYear,
  facilities: {} as FacilitiesByYear,
});

describe("auto initiatives price fuel through the shared engine", () => {
  it("F11: a zero-spend source no longer yields a cost with no offset", () => {
    // opex: 0 — the third copy of `opex / annualVolume` read zero here, exactly
    // as it did in lib/model and lib/scope2, so nothing was ever displaced.
    const inits = autoInitiatives(goalOf("abs_sbti"), invOf([boiler()]));
    const withDelta = inits.filter((i) => i.annualOpexDelta != null && i.annualOpexDelta !== 0);
    expect(withDelta.length).toBeGreaterThan(0);
    expect(withDelta.some((i) => i.annualOpexDelta! < 0)).toBe(true);
  });

  it("the hardcoded 0.2 x 0.65 is gone — moving the assumption moves the number", () => {
    // A MOBILE asset: the literal only ever applied to `category === "mobile"`.
    const van = boiler({ id: "c1", name: "Delivery van", category: "mobile", annualVolume: 20_000, opex: 2_300_000 });
    const total = (evMaintenanceRatioPct: number) =>
      autoInitiatives(goalOf("abs_sbti"), invOf([van]), { evMaintenanceRatioPct })
        .reduce((s, i) => s + (i.annualOpexDelta ?? 0), 0);
    // Finite first: a negated closeTo passes on undefined, so without this the
    // test is vacuous until the 3rd parameter exists (see obs 118).
    expect(Number.isFinite(total(0))).toBe(true);
    expect(Number.isFinite(total(100))).toBe(true);
    expect(total(0)).not.toBeCloseTo(total(100), 3);
  });

  it("moving maintenanceShareOfSpendPct also moves the number", () => {
    const van = boiler({ id: "c1", name: "Delivery van", category: "mobile", annualVolume: 20_000, opex: 2_300_000 });
    const total = (maintenanceShareOfSpendPct: number) =>
      autoInitiatives(goalOf("abs_sbti"), invOf([van]), { maintenanceShareOfSpendPct })
        .reduce((s, i) => s + (i.annualOpexDelta ?? 0), 0);
    expect(Number.isFinite(total(0))).toBe(true);
    expect(Number.isFinite(total(40))).toBe(true);
    expect(total(0)).not.toBeCloseTo(total(40), 3);
  });

  it("a zero-capital initiative reports no payback number", () => {
    // Two earlier drafts of this test were wrong, both instructively.
    // (1) Looping over the Scope 1 fixture: every asset initiative carries
    //     capex, so the loop body never ran and it passed vacuously.
    // (2) Assuming procurement is the zero-capital case: it is not.
    // The waste templates are, so they are what this pins.
    //
    // HONEST LIMIT: their `annualOpexDelta` is undefined, so they exercise the
    // guard's FIRST condition (`annualOpexDelta != null`), not `budget > 0`.
    // A zero-capital initiative that DOES carry an opex delta appears to be
    // unreachable through autoInitiatives, so the `budget > 0` half of the
    // guard is defensive rather than observable from here. Recorded rather
    // than papered over with a test that looks like it covers it.
    const inits = autoInitiatives(goalOf("waste_recovery"), invOf([boiler()]));
    const zeroCapital = inits.filter((i) => i.budget === 0);
    expect(zeroCapital.length).toBeGreaterThan(0);   // the case IS reachable
    for (const i of zeroCapital) expect(i.paybackYears == null).toBe(true);
  });
});

// Ruling P consequence. Unlike Scope 2, a measured basis IS reachable here —
// `asset.opex` is the same field lib/model reads, so the same trap applies: on a
// reference-priced fixture `spend.fuel === annualVolume * pricePerUnit`, which
// makes the fuel-half formula and the blended-unit-price formula agree. Only a
// real measured opex separates them.
describe("goals initiatives on a MEASURED-basis source", () => {
  // Rs 10,000,000 for 50,000 L = Rs 200/L blended; at a 20% maintenance share the
  // fuel-only rate is Rs 160/L, against diesel's Rs 92/L reference.
  //
  // The first draft used opex: 5,750,000 — Rs 115/L blended, whose fuel half is
  // exactly diesel's Rs 92/L reference price. That makes the grossed-up
  // reference total (4,600,000 / 0.8 = 5,750,000) IDENTICAL to the measured
  // total, so the fixture could not distinguish the two bases at all. That is
  // the Ruling P trap, walked into while writing a test FOR Ruling P: choosing
  // a "realistic" number quietly chose a degenerate one.
  const measured = () => boiler({ opex: 10_000_000 });

  it("is on the measured basis, or the rest of this block proves nothing", () => {
    // A measured price differs from diesel's reference price, so the two bases
    // are distinguishable here; that is the whole point of the block.
    const ref = autoInitiatives(goalOf("abs_sbti"), invOf([boiler()]))
      .find((i) => i.sourceRef === "c1")!.annualOpexDelta;
    const mea = autoInitiatives(goalOf("abs_sbti"), invOf([measured()]))
      .find((i) => i.sourceRef === "c1")!.annualOpexDelta;
    expect(ref).not.toBe(mea);
  });

  it("Ruling T: fuel switch displaces the FUEL half on a measured bill", () => {
    // The suggester only enables fuelSwitch where electrification is NOT
    // feasible — `heavyEquip` has electrify.feasible "hard" and
    // fuelSwitch.feasible "yes", so its suggested plan is
    // [efficiency, fuelSwitch]. Without this end-use the fuel-switch branch of
    // assetOpexDelta is unreachable from autoInitiatives, and an earlier draft
    // of this block left it untested: restoring the blended-unit-price defect
    // did not fail a single test.
    const digger = boiler({
      id: "c1", name: "Excavator", category: "mobile",
      endUse: "heavyEquip", annualVolume: 50_000, opex: 10_000_000,
    } as Partial<CombustionAsset>);
    const init = autoInitiatives(goalOf("abs_sbti"), invOf([digger]), { maintenanceShareOfSpendPct: 20 })
      .find((i) => i.sourceRef === "c1")!;

    // An earlier draft asserted only that moving maintenanceShareOfSpendPct
    // moved the total. That does NOT discriminate: the efficiency term is
    // m-dependent too, so the total moves either way and the mutation survived.
    // Only the exact value separates them. The suggested plan here is
    // [efficiency 7%, biodiesel at 20% blend, Rs 78/L], so with
    // spend.fuel = 10,000,000 x (1 - 0.20) = 8,000,000 and
    // switched = 50,000 x (1 - 0.07) x 0.20 = 9,300 L:
    //
    //   efficiency   -8,000,000 x 0.07                   =   -560,000
    //   alt fuel     +9,300 x 78                         =   +725,400
    //   displaced    -8,000,000 x (1 - 0.07) x 0.20      = -1,488,000
    //                                                      -----------
    //                                                       -1,322,600
    //
    // Under the blended-price defect the displaced term is 9,300 x Rs 200/L =
    // 1,860,000 — exactly 1/(1-m) too much — giving -1,694,600. The two differ
    // by 372,000, so this assertion is what kills that mutation.
    expect(init.annualOpexDelta).toBe(-1_322_600);
  });

  it("the fuel/maintenance split is LOAD-BEARING on a measured bill", () => {
    // An earlier draft asserted `saving <= fuelHalf`, which passed with a 1.8M
    // margin and would have passed under the whole-bill formula too — a weak
    // assertion, not a test. The discriminating property is that the split
    // MATTERS: if the code credits the whole bill, maintenanceShareOfSpendPct
    // is irrelevant to a measured source and moving it changes nothing.
    const at = (maintenanceShareOfSpendPct: number) =>
      autoInitiatives(goalOf("abs_sbti"), invOf([measured()]), { maintenanceShareOfSpendPct })
        .find((i) => i.sourceRef === "c1")!.annualOpexDelta!;
    expect(Number.isFinite(at(0))).toBe(true);
    expect(Number.isFinite(at(40))).toBe(true);
    expect(at(0)).not.toBeCloseTo(at(40), 3);
    // And a bigger maintenance share means a SMALLER fuel bill to save from,
    // so the saving must shrink — pinning the direction, not just movement.
    expect(Math.abs(at(40))).toBeLessThan(Math.abs(at(0)));
  });
});
