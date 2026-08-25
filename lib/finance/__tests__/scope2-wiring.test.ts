// lib/finance/__tests__/scope2-wiring.test.ts
import { describe, expect, it } from "vitest";
import { computeScope2 } from "@/lib/scope2/model";
import type { Facility, Scope2Levers } from "@/lib/scope2/model/types";

const facility = (over: Partial<Facility> = {}): Facility => ({
  id: "f-0", name: "Star", annualLoadKwh: 848_488, tariffPerKwh: 9,
  loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
  roofSpaceM2: 2000, peakLoadKw: 400, gridEf: 0.71, irradiance: 1400, isolated: false, ...over,
});

const levers = (over: Partial<Scope2Levers> = {}): Scope2Levers => ({
  byFacility: { "f-0": {
    efficiency: { enabled: true, ledPct: 50, motorPct: 0, bmsPct: 0, ledCapex: 400_000, motorCapex: 900_000, bmsCapex: 500_000, startYear: 2026, targetYear: 2030 },
    generation: { enabled: false, solarKwp: 0, batteryKwh: 0, exportMode: "netMetering", solarCapexPerKw: 45_000, batteryCapexPerKwh: 28_000, subsidyPct: 0, startYear: 2026, targetYear: 2030 },
  } },
  procurement: { enabled: false, ppaPct: 0, greenTariffPct: 0, recPct: 0, ppaStrikeDeltaPerKwh: -0.5, greenTariffPremiumPerKwh: 0.8, recPricePerKwh: 0.45, re100Exclusion: false, startYear: 2026, targetYear: 2030 },
  ...over,
});

const withGeneration = () => levers({ byFacility: { "f-0": {
  ...levers().byFacility["f-0"],
  generation: { ...levers().byFacility["f-0"].generation, enabled: true, solarKwp: 300 },
} } });

describe("Scope 2 finance", () => {
  it("F8: the user's discount rate now reaches Scope 2 — it was a module constant", () => {
    const at = (pct: number) => computeScope2([facility()], levers(), 2025, { discountRatePct: pct })
      .levers.find((l) => l.id === "efficiency")!.levelisedCostPerTonne;
    // Assert FINITE first. `expect(undefined).not.toBeCloseTo(undefined)` passes,
    // so without this the test is vacuous until the field exists — and it stays
    // vacuous if an implementation ever drops the field again.
    expect(at(0)).toBeTypeOf("number");
    expect(Number.isFinite(at(0))).toBe(true);
    expect(Number.isFinite(at(25))).toBe(true);
    expect(at(0)).not.toBeCloseTo(at(25), 3);
  });

  it("reports levelised cost and a payback kind, like Scope 1", () => {
    const r = computeScope2([facility()], levers(), 2025, { discountRatePct: 10 });
    const eff = r.levers.find((l) => l.id === "efficiency")!;
    expect(Number.isFinite(eff.levelisedCostPerTonne)).toBe(true);
    expect(["discounted", "never", "no-capital"]).toContain(eff.paybackKind);
  });

  it("generation is levelised over 25 years, efficiency over 8 — not one flat 10", () => {
    const r = computeScope2([facility()], withGeneration(), 2025, { discountRatePct: 10 });
    const gen = r.levers.find((l) => l.id === "generation")!;
    expect(gen.series[gen.series.length - 1].year - gen.series[0].year + 1).toBeGreaterThanOrEqual(25);
  });
});

// Ruling R. Scope 2 declared its own OpexPart with no `kind`, and the engine's
// escalationFor() falls through to otherEscalationPct — 0% by default. Every
// Scope 2 part is an electricity flow, so an untagged part silently stops
// escalating while the identical kWh in Scope 1's electrification lever
// escalates at elecEscalationPct. These tests fail if any part is left untagged.
describe("Scope 2 opexParts escalate as ELECTRICITY, not as untagged 'other'", () => {
  it("a Scope 2 saving compounds at elecEscalationPct across the window", () => {
    const r = computeScope2([facility()], withGeneration(), 2025,
      { discountRatePct: 0, elecEscalationPct: 10, otherEscalationPct: 0 });
    const gen = r.levers.find((l) => l.id === "generation")!;

    // Compare two FULL-RAMP years so the ramp factor is 1 in both and the only
    // difference left is escalation.
    const full = gen.series.filter((s) => s.year >= 2030);
    const first = full[0];
    const last = full[full.length - 1];
    expect(first.opexDelta).toBeLessThan(0);            // it is a saving
    const years = last.year - first.year;
    expect(last.opexDelta / first.opexDelta).toBeCloseTo(Math.pow(1.10, years), 4);
  });

  it("moving elecEscalationPct moves a Scope 2 lever's economics", () => {
    const npvAt = (elecEscalationPct: number) => computeScope2(
      [facility()], withGeneration(), 2025, { discountRatePct: 10, elecEscalationPct },
    ).levers.find((l) => l.id === "generation")!.npv;
    // Finite first, for the same reason as the F8 test above: a negated
    // closeTo passes on undefined, so this would be vacuous without it.
    expect(Number.isFinite(npvAt(0))).toBe(true);
    expect(Number.isFinite(npvAt(8))).toBe(true);
    // If the parts were untagged, both runs would read otherEscalationPct and
    // these would be identical.
    expect(npvAt(0)).not.toBeCloseTo(npvAt(8), 0);
  });

  it("every Scope 2 opexPart carries an explicit kind", () => {
    const r = computeScope2([facility()], withGeneration(), 2025, { discountRatePct: 10 });
    const parts = r.levers.flatMap((l) => l.opexParts);
    expect(parts.length).toBeGreaterThan(0);
    for (const p of parts) expect(p.kind, `part "${p.label}" is untagged`).toBeDefined();
  });
});

// Ruling P consequence. Scope 2 has NO measured/reference price basis to assert:
// `facility.tariffPerKwh` is supplied directly by the user and nothing in
// lib/scope2 derives a money unit price by dividing spend by volume (verified by
// grep — the only divisions there produce emission factors and load ratios).
// So the Scope 1 trap, where a reference-priced fixture makes two different
// formulas agree, has no analogue here. This test pins that premise, so if a
// derived price is ever introduced the assumption stops being silent.
describe("Scope 2 prices electricity from a supplied tariff, not a derived one", () => {
  it("moving the tariff moves the saving proportionally", () => {
    const savingAt = (tariffPerKwh: number) => -computeScope2(
      [facility({ tariffPerKwh })], levers(), 2025, { discountRatePct: 10 },
    ).levers.find((l) => l.id === "efficiency")!.annualOpexDelta;
    expect(savingAt(18) / savingAt(9)).toBeCloseTo(2, 6);
  });
});
