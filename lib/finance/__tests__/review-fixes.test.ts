// lib/finance/__tests__/review-fixes.test.ts
//
// Regression tests for defects found by the independent review round, after the
// branch had already shipped. Each names the finding it pins.
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import { compute } from "@/lib/model";
import { factorsSheet, kpiFinanceSheet } from "@/lib/export";
import { seedScope1 } from "./seed-fixture";
import { defaultActions } from "@/lib/model/segments";
import type { CombustionAsset, LeverSettings } from "@/lib/model/types";

// Measured basis so the fuel/maintenance split is real and separable:
// Rs 1,000,000 on 10,000 L, 20% maintenance share -> fuel 800,000, maint 200,000.
const boiler: CombustionAsset = {
  id: "b-1", name: "Boiler", category: "stationary", fuelType: "diesel",
  unit: "L", annualVolume: 10_000, opex: 1_000_000, unitCount: 1, remainingLife: 10,
} as CombustionAsset;

const settingsFor = (over: Partial<LeverSettings["assumptions"]> = {}): LeverSettings => {
  const base = defaultActions(boiler);
  return {
    byAsset: {
      "b-1": {
        ...base,
        efficiency: { enabled: true, savingPct: 20, capex: 0, startYear: 2026, targetYear: 2026 },
        electrify: { ...base.electrify, enabled: true, capacityPct: 100, assetCapex: 0, tariffPerKwh: 0 },
      },
    },
    bySystem: {},
    assumptions: {
      ...DEFAULT_SETTINGS.assumptions, infraCapex: 0, recCostPerTonne: 0,
      maintenanceShareOfSpendPct: 20, heatPumpMaintenanceRatioPct: 70, ...over,
    },
  } as LeverSettings;
};

const partsOf = (s: LeverSettings) => {
  const el = compute([boiler], [], s, 2025).levers.find((l) => l.id === "electrification")!;
  const get = (re: RegExp) => el.opexParts.find((p) => re.test(p.label));
  return { el, get };
};

describe("review finding 1: efficiency cuts FUEL, so it must not scale the maintenance bill", () => {
  it("displaces all maintenance plus the post-efficiency fuel, not (1-eff) of both", () => {
    const { get } = partsOf(settingsFor());
    // fuel 800,000 x (1 - 0.20) = 640,000, plus the WHOLE 200,000 maintenance
    // contract, which efficiency never touched. Was (800,000 + 200,000) x 0.8
    // = 800,000, which quietly dropped 40,000 of maintenance out of the model.
    expect(-get(/^Displaced fuel$/)!.amount).toBeCloseTo(640_000, 6);
    expect(-get(/^Displaced maintenance$/)!.amount).toBeCloseTo(200_000, 6);
  });

  it("retains its share of the WHOLE maintenance contract", () => {
    const { get } = partsOf(settingsFor());
    // 200,000 x 100% electrified x 70% retained. Was x (1 - 0.20) = 112,000.
    expect(get(/maintenance on replacement plant/)!.amount).toBeCloseTo(140_000, 6);
  });

  it("the net maintenance effect is the full contract less what is retained", () => {
    const { get } = partsOf(settingsFor());
    const net = get(/^Displaced maintenance$/)!.amount + get(/maintenance on replacement plant/)!.amount;
    expect(net).toBeCloseTo(-60_000, 6); // was -48,000
  });
});

describe("review finding 2: one physical quantity, one escalation rate", () => {
  it("displaced maintenance and retained maintenance escalate together", () => {
    // Both are the same maintenance rupees. Previously "Displaced fuel &
    // maintenance" was tagged fuel (5%/yr) while the add-back was tagged other
    // (0%/yr), so the same contract compounded at two different rates and the
    // net benefit was overstated by ~90% over a 10-year window.
    const { get } = partsOf(settingsFor());
    expect(get(/^Displaced maintenance$/)!.kind).toBe(get(/maintenance on replacement plant/)!.kind);
  });

  it("moving the fuel escalation does NOT move the maintenance parts", () => {
    const at = (fuelEscalationPct: number) => {
      const { el, get } = partsOf(settingsFor({ fuelEscalationPct }));
      return { maint: get(/^Displaced maintenance$/)!.amount, npv: el.npv };
    };
    expect(at(0).maint).toBeCloseTo(at(20).maint, 6);   // nominal amount unchanged
    expect(at(0).npv).not.toBeCloseTo(at(20).npv, 0);   // but fuel still escalates
  });

  it("moving the other-escalation moves the maintenance legs", () => {
    const npvAt = (otherEscalationPct: number) =>
      partsOf(settingsFor({ otherEscalationPct })).el.npv;
    expect(Number.isFinite(npvAt(0))).toBe(true);
    expect(Number.isFinite(npvAt(8))).toBe(true);
    expect(npvAt(0)).not.toBeCloseTo(npvAt(8), 0);
  });
});

describe("review finding 3: a REC is the same instrument in both scopes", () => {
  it("Scope 1's REC-on-added-Scope-2 part escalates as electricity", () => {
    const base = defaultActions(boiler);
    const s = {
      byAsset: { "b-1": { ...base, electrify: { ...base.electrify, enabled: true, capacityPct: 100, assetCapex: 0 } } },
      bySystem: {},
      assumptions: { ...DEFAULT_SETTINGS.assumptions, infraCapex: 0, recCostPerTonne: 800 },
    } as LeverSettings;
    const el = compute([boiler], [], s, 2025).levers.find((l) => l.id === "electrification")!;
    const rec = el.opexParts.find((p) => /REC/.test(p.label))!;
    expect(rec.amount).toBeGreaterThan(0);
    // Scope 2 tags "Unbundled RECs" as elec on the stated reasoning that a REC
    // price tracks the renewable electricity market it settles against. The
    // same instrument one file away was left at 0%.
    expect(rec.kind).toBe("elec");
  });
});

describe("review finding C1: no non-finite number may reach a spreadsheet cell", () => {
  it("a scenario with no costed lever exports a string, not Infinity", () => {
    // programmeMetrics([]) has no discounted tonnes, so levelisedCostPerTonne
    // is Infinity — and Math.round(Infinity) is Infinity, typed `number`, which
    // exceljs writes as the literal token `Infinity`. That is not a valid
    // xsd:double: Excel declares the workbook corrupt and repairs it by
    // DISCARDING content. fmtPerTonne covered the screen; the export had
    // nothing, and the export is what goes to an auditor.
    const base = defaultActions(boiler);
    const bare: LeverSettings = {
      byAsset: { "b-1": base }, bySystem: {},
      assumptions: { ...DEFAULT_SETTINGS.assumptions, infraCapex: 0 },
    } as LeverSettings;
    const r = compute([boiler], [], bare, 2025);
    expect(Number.isFinite(r.kpis.costPerTonne)).toBe(false);   // the sentinel is intact

    const sheet = kpiFinanceSheet(r);
    const nonFinite = sheet.rows.flat().filter((c) => typeof c === "number" && !Number.isFinite(c));
    expect(nonFinite, `non-finite numeric cells: ${JSON.stringify(nonFinite)}`).toHaveLength(0);

    const costRow = sheet.rows.find((row) => String(row[0]).includes("cost per tonne"))!;
    expect(costRow[1]).toBe("n/a");
  });

  it("every sheet is free of non-finite numbers on the seeded company too", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    for (const sheet of [kpiFinanceSheet(r), factorsSheet(settings)]) {
      const bad = sheet.rows.flat().filter((c) => typeof c === "number" && !Number.isFinite(c));
      expect(bad, `${sheet.name} has non-finite cells`).toHaveLength(0);
    }
  });

  it("a zero-capital lever's payback cell says which kind it is", () => {
    const { combustion, systems, settings, baseYear } = seedScope1();
    const r = compute(combustion, systems, settings, baseYear);
    const ref = r.levers.find((l) => l.id === "refrigerant")!;
    expect(ref.capex).toBe(0);
    expect(ref.paybackKind).toBe("no-capital");
    const sheet = kpiFinanceSheet(r);
    // By HEADER, not by index. This read `row[6]` and a later column insertion
    // shifted the payback cell — an index that moves is an assertion that can
    // quietly start checking a different number.
    const header = sheet.rows.find((x) => String(x[0]) === "Lever")!;
    const col = header.findIndex((c) => String(c).startsWith("Payback"));
    expect(col).toBeGreaterThan(0);
    const row = sheet.rows.find((x) => String(x[0]) === ref.label)!;
    // Was "no payback" for BOTH no-capital and never.
    expect(String(row[col])).toContain("no capital");
  });
});

// The mutation review found these four behaviours pinned by nothing: each could
// be broken and the entire suite stayed green.
describe("review: behaviours the suite could not see", () => {
  const seed = () => seedScope1();

  it("the carbon price actually moves costPerTonneWithCarbon", () => {
    // `costPerTonneWithCarbon` could be made to ignore g.carbonPricePerTonne
    // entirely without failing anything.
    const at = (carbonPricePerTonne: number) => {
      const { combustion, systems, settings, baseYear } = seed();
      const r = compute(combustion, systems, { ...settings, assumptions: { ...settings.assumptions, carbonPricePerTonne } }, baseYear);
      return r.levers.find((l) => l.id === "fuelSwitch")!;
    };
    const a = at(0), b = at(3000);
    expect(a.abatementT).toBeGreaterThan(0);
    // Applied uniformly as a per-tonne credit, so the gap IS the carbon price.
    expect(a.costPerTonneWithCarbon - b.costPerTonneWithCarbon).toBeCloseTo(3000, 6);
  });

  it("infraCapex reaches the electrification lever's capex", () => {
    // Every new capex test deliberately sets infraCapex: 0 "so the number stays
    // clean", so nothing exercised the one-off grid-upgrade cost at all.
    const at = (infraCapex: number) => {
      const { combustion, systems, settings, baseYear } = seed();
      return compute(combustion, systems, { ...settings, assumptions: { ...settings.assumptions, infraCapex } }, baseYear)
        .levers.find((l) => l.id === "electrification")!.capex;
    };
    expect(at(5_000_000) - at(0)).toBeCloseTo(5_000_000, 6);
  });

  it("a lever with money but no tonnes stays enabled — the other half of F4", () => {
    // `enabled` drives kpiFinanceSheet's per-lever rows, so narrowing it back to
    // `abatementT > 0` silently drops those rows from the export.
    const asset: CombustionAsset = {
      id: "z-0", name: "Idle boiler", category: "stationary", fuelType: "png",
      unit: "m3", annualVolume: 0, opex: 0, unitCount: 1, remainingLife: 10,
    } as CombustionAsset;
    const base = defaultActions(asset);
    const s: LeverSettings = {
      byAsset: { "z-0": { ...base, electrify: { ...base.electrify, enabled: true, capacityPct: 50, assetCapex: 1_000_000 } } },
      bySystem: {},
      assumptions: { ...DEFAULT_SETTINGS.assumptions, infraCapex: 0 },
    } as LeverSettings;
    const el = compute([asset], [], s, 2025).levers.find((l) => l.id === "electrification")!;
    expect(el.abatementT).toBe(0);
    expect(el.capex).toBeCloseTo(1_000_000, 6);
    expect(el.enabled).toBe(true);
  });

  it("every Scope 1 opexPart carries the kind its quantity actually escalates as", () => {
    // Scope 1 part kinds were asserted nowhere: retagging the refrigerant parts
    // or the retained-maintenance part broke nothing. Pin the mapping.
    const { combustion, systems, settings, baseYear } = seed();
    const r = compute(combustion, systems, settings, baseYear);
    const expected: Record<string, string> = {
      "Avoided fuel spend": "fuel",
      "New electricity cost": "elec",
      "Retained maintenance on replacement plant": "other",
      "REC cost on added Scope 2": "elec",
      "Displaced fuel": "fuel",
      "Displaced maintenance": "other",
      "Alt-fuel spend": "fuel",
      "Displaced fossil fuel spend": "fuel",
    };
    let checked = 0;
    for (const l of r.levers) {
      for (const p of l.opexParts) {
        const want = expected[p.label];
        if (want === undefined) continue;   // refrigerant parts are a data decision
        expect(p.kind, `part "${p.label}"`).toBe(want);
        checked++;
      }
    }
    expect(checked, "no known part was checked").toBeGreaterThan(4);
  });
});
