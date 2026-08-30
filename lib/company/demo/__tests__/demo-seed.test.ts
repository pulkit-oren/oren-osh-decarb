/* What these tests are for.

   The demo datasets are hand-written data, and hand-written data fails
   differently from code: it typechecks perfectly while pointing a lever at an
   equipment id that does not exist, tagging a source to a business unit that
   was renamed, or naming an electricity record "Purchased Electricity" so the
   instruments model (which matches by exact name) silently stops seeing it.
   None of that throws. It just quietly produces a dashboard with a zero in it.

   So these assert the JOINS - lever key to machine, source to BU, facility
   name to instrument - plus the sector shape each dataset is supposed to
   demonstrate, which is the one thing a reviewer would actually notice if a
   digit slipped. */

import { describe, it, expect } from "vitest";
import { compute } from "@/lib/model";
import { computeScope2 } from "@/lib/scope2/model";
import { INSTRUMENTS } from "@/lib/scope2/model/instruments";
import { resolveCombustion, resolveRefrigeration } from "@/lib/yearly";
import { resolveEquipment } from "@/lib/equipment/resolve";
import { resolveFacilities } from "@/lib/scope2/store-helpers";
import { loadRegistry, scope1Key, scope2Key, esgKey, goalsKey, type StorageLike } from "../../helpers";
import { buildCompany, buKey } from "../build";
import { DEMO_COMPANIES, DEMO_MARKER_KEY, installDemoCompanies, PHARMA, MANUFACTURING, IT_SERVICES } from "..";
import { DEMO_BASE_YEAR, DEMO_YEARS, type DemoCompany } from "../types";

/** A Storage stand-in - the helpers take StorageLike precisely so this works. */
function memoryStorage(seed: Record<string, string> = {}): StorageLike & { dump: () => Record<string, string> } {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

const NOW = 1_800_000_000_000;

const INSTRUMENT_NAMES: string[] = Object.values(INSTRUMENTS);

describe.each(DEMO_COMPANIES.map((d) => [d.name, d] as const))("%s - dataset integrity", (_name, demo: DemoCompany) => {
  const built = buildCompany(demo, "c-test", NOW);

  it("carries both financial years, FY2024-25 and FY2025-26", () => {
    expect(DEMO_YEARS).toEqual([2024, 2025]);
    for (const y of DEMO_YEARS) {
      expect(built.combustion[y].length).toBe(demo.sources.length);
      expect(built.refrigeration[y].length).toBe(demo.systems.length);
      expect(built.facilities[y].length).toBe(demo.facilities.length);
    }
  });

  it("tags every source, system and facility to a declared business unit", () => {
    const declared = new Set(demo.bus.map((b) => b.name));
    for (const s of demo.sources) expect(declared).toContain(s.bu);
    for (const s of demo.systems) expect(declared).toContain(s.bu);
    for (const f of demo.facilities) expect(declared).toContain(f.bu);
  });

  it("allocates each source's volume across its own machines, summing back to the source", () => {
    for (const y of DEMO_YEARS) {
      for (const entry of built.combustion[y]) {
        const ids = new Set((entry.equipment ?? []).map((e) => e.id));
        expect(ids.size).toBe(entry.equipment?.length);
        const alloc = entry.allocations ?? {};
        // Only this source's own machines may appear - a foreign id here is
        // the exact defect the equipment model was built to make impossible.
        for (const key of Object.keys(alloc)) expect(ids).toContain(key);
        const sum = Object.values(alloc).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(entry.annualVolume, 1);
      }
    }
  });

  it("keys every lever to a machine that exists in the base year", () => {
    const machineIds = new Set(
      built.combustion[DEMO_BASE_YEAR].flatMap((e) => (e.equipment ?? []).map((q) => q.id)),
    );
    for (const key of Object.keys(built.settings.byAsset)) expect(machineIds).toContain(key);

    const systemIds = new Set(built.refrigeration[DEMO_BASE_YEAR].map((s) => s.id));
    for (const key of Object.keys(built.settings.bySystem)) expect(systemIds).toContain(key);

    const facilityIds = new Set(built.facilities[DEMO_BASE_YEAR].map((f) => f.id));
    for (const key of Object.keys(built.levers.byFacility)) expect(facilityIds).toContain(key);
  });

  it("never converts more vehicles than a machine actually has", () => {
    for (const entry of built.combustion[DEMO_BASE_YEAR]) {
      for (const machine of entry.equipment ?? []) {
        const acts = built.settings.byAsset[machine.id];
        if (!acts) continue;
        expect(acts.electrify.unitsToConvert).toBeLessThanOrEqual(machine.unitCount);
        if (acts.flexFuel) expect(acts.flexFuel.unitsToConvert).toBeLessThanOrEqual(machine.unitCount);
      }
    }
  });

  it("names every electricity record exactly as the instruments model matches them", () => {
    // Matching is by exact string. "Solar Onsite" would parse, render, and be
    // counted as an ordinary facility with a zero grid factor - i.e. it would
    // vanish from the renewable share without any error.
    for (const f of demo.facilities) expect(INSTRUMENT_NAMES).toContain(f.name);
    // Every BU must have grid supply for its contracts to attach to.
    const gridBus = new Set(demo.facilities.filter((f) => f.name === INSTRUMENTS.grid).map((f) => f.bu));
    for (const f of demo.facilities) {
      if (f.name !== INSTRUMENTS.grid) expect(gridBus).toContain(f.bu);
    }
  });

  it("produces a non-zero Scope 1 and Scope 2 baseline for both years", () => {
    for (const y of DEMO_YEARS) {
      const assets = resolveEquipment(resolveCombustion(built.combustion, y));
      const systems = resolveRefrigeration(built.refrigeration, y);
      const s1 = compute(assets, systems, built.settings, y);
      expect(s1.baseTotalT).toBeGreaterThan(0);

      const s2 = computeScope2(resolveFacilities(built.facilities, y), built.levers, y, built.settings.assumptions);
      expect(s2.kpis.baseLocationT).toBeGreaterThan(0);
    }
  });

  it("models a transition that abates carbon and costs capital", () => {
    const assets = resolveEquipment(resolveCombustion(built.combustion, DEMO_BASE_YEAR));
    const systems = resolveRefrigeration(built.refrigeration, DEMO_BASE_YEAR);
    const s1 = compute(assets, systems, built.settings, DEMO_BASE_YEAR);
    expect(s1.kpis.reduction2030).toBeGreaterThan(0);
    expect(s1.kpis.totalCapex).toBeGreaterThan(0);
    expect(Number.isFinite(s1.kpis.costPerTonne)).toBe(true);

    const s2 = computeScope2(
      resolveFacilities(built.facilities, DEMO_BASE_YEAR), built.levers, DEMO_BASE_YEAR, built.settings.assumptions,
    );
    expect(s2.kpis.marketNowT).toBeLessThan(s2.kpis.baseLocationT);
  });

  it("saves scenarios that actually differ from the base plan", () => {
    const raw = JSON.parse(built.entries[scope1Key("c-test")]) as { scenarios: { settings: unknown }[] };
    expect(raw.scenarios.length).toBeGreaterThanOrEqual(2);
    for (const sc of raw.scenarios) {
      expect(JSON.stringify(sc.settings)).not.toBe(JSON.stringify(built.settings));
    }
    const raw2 = JSON.parse(built.entries[scope2Key("c-test")]) as { scenarios: { levers: unknown }[] };
    expect(raw2.scenarios.length).toBeGreaterThanOrEqual(2);
    for (const sc of raw2.scenarios) {
      expect(JSON.stringify(sc.levers)).not.toBe(JSON.stringify(built.levers));
    }
  });

  it("ships a physically feasible plan, and a duty temperature on every heated source", () => {
    /* The feasibility gate found four infeasible COPs in this very data when
       it was first switched on — including a heat-pump COP of 2.8 on a 184 °C
       steam boiler, which is an electrode boiler and a COP of 1. A demo
       dataset that trips the product's own guardrail teaches the wrong thing,
       so the gate holds its own examples to the standard. */
    const assets = resolveEquipment(resolveCombustion(built.combustion, DEMO_BASE_YEAR));
    const r = compute(assets, resolveRefrigeration(built.refrigeration, DEMO_BASE_YEAR), built.settings, DEMO_BASE_YEAR);
    expect(r.warnings).toEqual([]);

    // Every stationary source carrying a thermal end-use records its duty
    // temperature — otherwise the gate has nothing to check against.
    const THERMAL = new Set(["boiler", "tfh", "furnace", "kiln", "oven", "dryer", "cooking"]);
    for (const s of demo.sources) {
      for (const e of s.equipment) {
        if (s.category === "stationary" && e.endUse && THERMAL.has(e.endUse)) {
          expect(e.dutyTempC, `${s.name} / ${e.name} has no duty temperature`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("saves scenarios that change the ANSWER, not just the settings", () => {
    /* A scenario can differ field-by-field and still model identically. It
       happened: the levers stack efficiency -> electrify -> fuel switch, so a
       source already electrified at 100% capacity has no fuel left for a
       switch, and raising that blend from 60% to 100% moved neither tonnes nor
       capex. The settings-differ check above passed it. Comparing the computed
       result is the only assertion that catches an inert scenario. */
    const assets = resolveEquipment(resolveCombustion(built.combustion, DEMO_BASE_YEAR));
    const systems = resolveRefrigeration(built.refrigeration, DEMO_BASE_YEAR);
    const base = compute(assets, systems, built.settings, DEMO_BASE_YEAR);

    const s1raw = JSON.parse(built.entries[scope1Key("c-test")]) as {
      scenarios: { name: string; settings: Parameters<typeof compute>[2] }[];
    };
    for (const sc of s1raw.scenarios) {
      const r = compute(assets, systems, sc.settings, DEMO_BASE_YEAR);
      const moved =
        Math.abs(r.kpis.reduction2030 - base.kpis.reduction2030) > 0.005 ||
        Math.abs(r.kpis.totalCapex - base.kpis.totalCapex) > 1_000_000;
      expect(moved, `Scope 1 scenario "${sc.name}" models identically to the base plan`).toBe(true);
    }

    const facilities = resolveFacilities(built.facilities, DEMO_BASE_YEAR);
    const baseS2 = computeScope2(facilities, built.levers, DEMO_BASE_YEAR, built.settings.assumptions);
    const s2raw = JSON.parse(built.entries[scope2Key("c-test")]) as {
      scenarios: { name: string; levers: Parameters<typeof computeScope2>[1] }[];
    };
    for (const sc of s2raw.scenarios) {
      const r = computeScope2(facilities, sc.levers, DEMO_BASE_YEAR, built.settings.assumptions);
      const moved =
        Math.abs(r.kpis.marketNowT - baseS2.kpis.marketNowT) > 1 ||
        Math.abs(r.kpis.totalCapex - baseS2.kpis.totalCapex) > 1_000_000;
      expect(moved, `Scope 2 scenario "${sc.name}" models identically to the base plan`).toBe(true);
    }
  });

  it("keeps water and waste totals equal to their BRSR breakdowns", () => {
    for (const y of DEMO_YEARS) {
      const w = demo.esg.water[y];
      const bySource = Object.values(w.withdrawalBySource ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      const byDest = Object.values(w.dischargeByDest ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      expect(bySource).toBe(w.withdrawalKl);
      expect(byDest).toBe(w.dischargeKl);
      // GRI 303-5: what is withdrawn but not returned is consumed.
      expect(w.consumptionKl).toBe(w.withdrawalKl - w.dischargeKl);

      const waste = demo.esg.waste[y];
      const cats = Object.values(waste.byCategory ?? {});
      expect(cats.reduce((a, c) => a + c.generatedT, 0)).toBe(waste.generatedT);
      expect(cats.reduce((a, c) => a + c.disposedT, 0)).toBe(waste.disposedT);
      expect(cats.reduce((a, c) => a + c.recoveredT, 0)).toBe(waste.recoveredT);
      for (const c of cats) expect(c.disposedT + c.recoveredT).toBeLessThanOrEqual(c.generatedT);
    }
  });

  it("generates initiatives for its goals from its own data", () => {
    const goals = JSON.parse(built.entries[goalsKey("c-test")]) as { goals: unknown[]; initiatives: unknown[] };
    expect(goals.goals.length).toBe(demo.goals.length);
    expect(goals.initiatives.length).toBeGreaterThan(0);
  });

  it("writes the business-unit registry the Data input screens read", () => {
    const bus = JSON.parse(built.entries[buKey("c-test")]) as { units: { name: string }[] };
    expect(bus.units.map((u) => u.name)).toEqual(demo.bus.map((b) => b.name));
  });
});

describe("sector shape", () => {
  const s1Of = (demo: DemoCompany) => {
    const b = buildCompany(demo, "c-test", NOW);
    const assets = resolveEquipment(resolveCombustion(b.combustion, DEMO_BASE_YEAR));
    const systems = resolveRefrigeration(b.refrigeration, DEMO_BASE_YEAR);
    return compute(assets, systems, b.settings, DEMO_BASE_YEAR);
  };
  const s2Of = (demo: DemoCompany) => {
    const b = buildCompany(demo, "c-test", NOW);
    return computeScope2(
      resolveFacilities(b.facilities, DEMO_BASE_YEAR), b.levers, DEMO_BASE_YEAR, b.settings.assumptions,
    );
  };

  it("IT services is Scope 2 dominated - the sector's defining feature", () => {
    const s1 = s1Of(IT_SERVICES).baseTotalT;
    const s2 = s2Of(IT_SERVICES).kpis.baseLocationT;
    expect(s2).toBeGreaterThan(s1 * 20);
  });

  it("IT services loses nearly half its Scope 1 to refrigerant leaks", () => {
    // No process heat, so fugitive gas from chillers and data-hall precision
    // AC very nearly matches every litre of diesel burned - the opposite of a
    // process industry, where the same line is a rounding error.
    const it = s1Of(IT_SERVICES).baseline;
    const itShare = it.refrigerantT / it.totalT;
    expect(itShare).toBeGreaterThan(0.4);

    const mfg = s1Of(MANUFACTURING).baseline;
    expect(mfg.refrigerantT / mfg.totalT).toBeLessThan(0.1);
  });

  it("manufacturing carries the largest Scope 1 of the three, on process heat", () => {
    const mfg = s1Of(MANUFACTURING).baseTotalT;
    expect(mfg).toBeGreaterThan(s1Of(PHARMA).baseTotalT);
    expect(mfg).toBeGreaterThan(s1Of(IT_SERVICES).baseTotalT * 4);
  });

  it("pharma reports biogenic CO2 separately, from a renewable fuel it already burns", () => {
    // Briquettes are renewable: only CH4/N2O count as Scope 1, and the biogenic
    // CO2 is reported outside the scopes under BRSR/GRI. Every company shows
    // SOME biogenic CO2 once a bio-blend lever is on, so the test is that
    // pharma's is an order larger - it burns a renewable fuel in the baseline
    // inventory rather than only blending one into a fossil fuel later.
    const pharma = s1Of(PHARMA).biogenicT;
    expect(pharma).toBeGreaterThan(2_000);
    expect(pharma).toBeGreaterThan(s1Of(IT_SERVICES).biogenicT * 5);
  });

  it("every company's market-based Scope 2 beats its location-based number", () => {
    for (const demo of DEMO_COMPANIES) {
      const k = s2Of(demo).kpis;
      expect(k.marketBaselineT).toBeLessThan(k.baseLocationT);
    }
  });
});

describe("installation into a browser", () => {
  it("adds the three companies without disturbing what is already there", () => {
    const storage = memoryStorage({
      "osh-companies-v1": JSON.stringify({
        companies: [{ id: "c-1", name: "Ventive Hospitality", createdAt: 1 }],
        activeId: "c-1",
      }),
      "osh-scope1-planner-v4::c-1": JSON.stringify({ combustion: {}, baseYear: 2025 }),
    });

    const res = installDemoCompanies(storage, NOW);
    expect(res.installed.map((c) => c.name)).toEqual(DEMO_COMPANIES.map((d) => d.name));

    const reg = loadRegistry(storage);
    expect(reg.companies.length).toBe(4);
    // The user's own company and their place in the app are untouched.
    expect(reg.companies[0].name).toBe("Ventive Hospitality");
    expect(reg.activeId).toBe("c-1");
    expect(storage.getItem("osh-scope1-planner-v4::c-1")).toBe(JSON.stringify({ combustion: {}, baseYear: 2025 }));

    for (const c of res.installed) {
      for (const key of [scope1Key(c.id), scope2Key(c.id), esgKey(c.id), goalsKey(c.id), buKey(c.id)]) {
        expect(storage.getItem(key)).toBeTruthy();
      }
    }
  });

  it("installs once, not on every page load", () => {
    const storage = memoryStorage();
    installDemoCompanies(storage, NOW);
    const after = storage.dump();

    const second = installDemoCompanies(storage, NOW + 5_000);
    expect(second.installed).toEqual([]);
    expect(storage.dump()).toEqual(after);
  });

  it("does not overwrite a demo the user has edited", () => {
    const storage = memoryStorage();
    const { installed } = installDemoCompanies(storage, NOW);
    const edited = JSON.stringify({ combustion: {}, refrigeration: {}, settings: {}, scenarios: [], baseYear: 2025 });
    storage.setItem(scope1Key(installed[0].id), edited);

    installDemoCompanies(storage, NOW + 5_000);
    expect(storage.getItem(scope1Key(installed[0].id))).toBe(edited);
  });

  it("leaves a deleted demo deleted", () => {
    // The marker records that a slug was installed, not that it still exists -
    // otherwise the next load would resurrect it and deletion could never stick.
    const storage = memoryStorage();
    installDemoCompanies(storage, NOW);
    const before = loadRegistry(storage);
    const victim = before.companies.find((c) => c.name === PHARMA.name);
    expect(victim).toBeDefined();

    const kept = before.companies.filter((c) => c.id !== victim!.id);
    storage.setItem("osh-companies-v1", JSON.stringify({ companies: kept, activeId: kept[0].id }));

    installDemoCompanies(storage, NOW + 5_000);
    const after = loadRegistry(storage);
    expect(after.companies.some((c) => c.name === PHARMA.name)).toBe(false);
  });

  it("recovers from a corrupt marker by reinstalling rather than throwing", () => {
    const storage = memoryStorage();
    storage.setItem(DEMO_MARKER_KEY, "{not json");
    expect(() => installDemoCompanies(storage, NOW)).not.toThrow();
    expect(loadRegistry(storage).companies.length).toBeGreaterThanOrEqual(3);
  });
});
