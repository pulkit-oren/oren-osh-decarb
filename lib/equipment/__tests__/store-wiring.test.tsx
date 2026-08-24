// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScenarioProvider, useScenario } from "@/lib/store";
import type { CombustionAsset } from "@/lib/model/types";

type Store = ReturnType<typeof useScenario>;

/** Store writes are driven through rendered buttons rather than a captured
 *  reference: assigning the hook's return to anything outside the component is
 *  a react-hooks lint error, and a click is already wrapped for React. */
function Probe({ writes = [] }: { writes?: Array<(s: Store) => void> }) {
  const s = useScenario();
  const { resolvedBaseAssets, settings } = s;
  return (
    <div>
      <span data-testid="ids">{resolvedBaseAssets.map((a) => a.id).join(",")}</span>
      <span data-testid="volume">{resolvedBaseAssets.reduce((t, a) => t + a.annualVolume, 0)}</span>
      <span data-testid="spend">{resolvedBaseAssets.reduce((t, a) => t + a.opex, 0)}</span>
      <span data-testid="levers">{Object.keys(settings.byAsset).sort().join(",")}</span>
      <span data-testid="raw">{JSON.stringify(s.combustion[s.baseYear] ?? [])}</span>
      {writes.map((w, i) => (
        <button key={i} data-testid={`write-${i}`} onClick={() => w(s)}>write {i}</button>
      ))}
    </div>
  );
}

const rawEntries = (): CombustionAsset[] => JSON.parse(screen.getByTestId("raw").textContent!);
const write = (i = 0) => fireEvent.click(screen.getByTestId(`write-${i}`));

/** Seeding storage explicitly is mandatory: an unseeded ScenarioProvider
 *  hydrates DEFAULT_COMBUSTION_BY_YEAR and pollutes every id assertion. This
 *  trap cost the port a review round on Task 8. */
function seed(state: unknown) {
  window.localStorage.setItem("test-key", JSON.stringify(state));
}

describe("store wiring", () => {
  it("resolves a split source to one row per equipment", () => {
    seed({
      baseYear: 2025,
      combustion: { 2025: [{
        id: "c-1", name: "PNG", category: "stationary", fuelType: "png", unit: "m3",
        annualVolume: 180000, opex: 9000000,
        equipment: [
          { id: "c-1", name: "Boiler 1", unitCount: 1, remainingLife: 12 },
          { id: "eq-2", name: "Boiler 2", unitCount: 1, remainingLife: 8 },
        ],
        allocations: { "c-1": 108000, "eq-2": 72000 },
      }] },
      settings: { byAsset: {}, bySystem: {}, assumptions: {} },
      scenarios: [],
    });
    render(<ScenarioProvider storageKey="test-key"><Probe /></ScenarioProvider>);
    expect(screen.getByTestId("ids").textContent).toBe("c-1,eq-2");
    expect(Number(screen.getByTestId("volume").textContent)).toBeCloseTo(180000, 2);
    expect(Number(screen.getByTestId("spend").textContent)).toBeCloseTo(9000000, 2);
  });

  it("migrates a legacy entry on hydrate and keeps its lever key", () => {
    seed({
      baseYear: 2025,
      combustion: { 2025: [{
        id: "c-1", name: "DG Set", category: "stationary", fuelType: "diesel", unit: "L",
        annualVolume: 250000, opex: 22500000, remainingLife: 9, unitCount: 30,
      }] },
      // A COMPLETE lever, not the partial { enabled, unitsToConvert } the brief
      // sketched: compute() dereferences acts.fuelSwitch.altFuel unguarded
      // (lib/model/index.ts:119 -> segments.ts:164), so a half-written lever
      // throws on render. That fragility is pre-existing and unrelated to what
      // this test pins — that a lever SAVED under the entry id still resolves
      // after migration, because the minted equipment reuses that id.
      settings: {
        byAsset: {
          "c-1": {
            electrify: { enabled: true, unitsToConvert: 2, capacityPct: 0, cop: 3, tariffPerKwh: 9, assetCapex: 0, startYear: 2026, targetYear: 2032 },
            fuelSwitch: { enabled: false, altFuel: "biodiesel", blendPct: 0, efficiencyPenaltyPct: 0, altFuelPricePerUnit: 0, retrofitCapex: 0, startYear: 2026, targetYear: 2030 },
          },
        },
        bySystem: {},
        assumptions: {},
      },
      scenarios: [],
    });
    render(<ScenarioProvider storageKey="test-key"><Probe /></ScenarioProvider>);
    expect(screen.getByTestId("ids").textContent).toBe("c-1");
    // The saved lever survived because the minted equipment reused the entry id.
    expect(screen.getByTestId("levers").textContent).toContain("c-1");
  });

  it("does not mint a lever for the remainder row", () => {
    seed({
      baseYear: 2025,
      combustion: { 2025: [{
        id: "c-1", name: "PNG", category: "stationary", fuelType: "png", unit: "m3",
        annualVolume: 180000, opex: 9000000,
        equipment: [{ id: "c-1", name: "Boiler 1", unitCount: 1, remainingLife: 12 }],
        allocations: { "c-1": 100000 },
      }] },
      settings: { byAsset: {}, bySystem: {}, assumptions: {} },
      scenarios: [],
    });
    render(<ScenarioProvider storageKey="test-key"><Probe /></ScenarioProvider>);
    expect(screen.getByTestId("ids").textContent).toContain("::unallocated");
    expect(screen.getByTestId("levers").textContent).not.toContain("::unallocated");
  });

  /* Ruling V — the write points, at the store level. Three screens type a
     volume and all three funnel through updateCombustion; recomputing there is
     what makes the map a function of the volume rather than a stale snapshot. */
  describe("updateCombustion keeps allocations in step with the volume", () => {
    const oneMachine = (over: Record<string, unknown> = {}) => ({
      baseYear: 2025,
      combustion: { 2025: [{
        id: "c-1", name: "Gensets", category: "stationary", fuelType: "diesel", unit: "L",
        annualVolume: 0, opex: 0,
        equipment: [{ id: "c-1", name: "Gensets", unitCount: 1, remainingLife: 10 }],
        allocations: { "c-1": 0 },
        ...over,
      }] },
      settings: { byAsset: {}, bySystem: {}, assumptions: {} },
      scenarios: [],
    });

    it("re-projects a created-at-zero source when the real volume is typed", () => {
      seed(oneMachine());
      render(<ScenarioProvider storageKey="test-key">
        <Probe writes={[(s) => s.updateCombustion(2025, "c-1", { annualVolume: 250000 })]} />
      </ScenarioProvider>);
      write();
      expect(rawEntries()[0].allocations).toEqual({ "c-1": 250000 });
      expect(screen.getByTestId("ids").textContent).toBe("c-1");
    });

    it("keeps a computed split's proportions when the volume changes", () => {
      seed(oneMachine({
        annualVolume: 100000,
        equipment: [
          { id: "c-1", name: "City vans", unitCount: 3, remainingLife: 6 },
          { id: "eq-2", name: "Highway vans", unitCount: 2, remainingLife: 6 },
        ],
        allocations: { "c-1": 60000, "eq-2": 40000 },
        allocationBasis: "units",
      }));
      render(<ScenarioProvider storageKey="test-key">
        <Probe writes={[(s) => s.updateCombustion(2025, "c-1", { annualVolume: 200000 })]} />
      </ScenarioProvider>);
      write();
      expect(rawEntries()[0].allocations).toEqual({ "c-1": 120000, "eq-2": 80000 });
    });

    it("scales a MANUAL split rather than recomputing it, and keeps its remainder", () => {
      seed(oneMachine({
        annualVolume: 100000,
        equipment: [
          { id: "c-1", name: "A", unitCount: 1, remainingLife: 6 },
          { id: "eq-2", name: "B", unitCount: 1, remainingLife: 6 },
        ],
        allocations: { "c-1": 70000, "eq-2": 20000 }, // 10,000 deliberately over
        allocationBasis: "manual",
      }));
      render(<ScenarioProvider storageKey="test-key">
        <Probe writes={[
          (s) => s.updateCombustion(2025, "c-1", { annualVolume: 200000 }),
          (s) => s.updateCombustion(2025, "c-1", { annualVolume: 45000 }),
        ]} />
      </ScenarioProvider>);
      // Volume grows: the user's hand-made 70/20 and their 10,000 remainder both stand.
      write(0);
      expect(rawEntries()[0].allocations).toEqual({ "c-1": 70000, "eq-2": 20000 });
      // Volume shrinks below the map: scaled proportionally, never rejected.
      write(1);
      expect(rawEntries()[0].allocations).toEqual({ "c-1": 35000, "eq-2": 10000 });
    });

    it("leaves an explicit allocations patch alone - that is a hand-made split", () => {
      seed(oneMachine({ annualVolume: 100000, allocations: { "c-1": 100000 } }));
      render(<ScenarioProvider storageKey="test-key">
        <Probe writes={[(s) => s.updateCombustion(2025, "c-1", { annualVolume: 50000, allocations: { "c-1": 40000 } })]} />
      </ScenarioProvider>);
      write();
      expect(rawEntries()[0].allocations).toEqual({ "c-1": 40000 });
    });
  });

  it("addCombustionAsset mints when handed an equipment-less source (D8)", () => {
    seed({ baseYear: 2025, combustion: { 2025: [] }, settings: { byAsset: {}, bySystem: {}, assumptions: {} }, scenarios: [] });
    // A public store API that persists an ARBITRARY source. Its one production
    // caller mints; the guard belongs at the write point because D8 is a
    // runtime invariant the compiler cannot hold (Ruling K).
    render(<ScenarioProvider storageKey="test-key">
      <Probe writes={[(s) => s.addCombustionAsset(2025, {
        id: "c-9", name: "Bare", category: "stationary", fuelType: "diesel", unit: "L",
        annualVolume: 1000, opex: 0,
      })]} />
    </ScenarioProvider>);
    write();
    const created = rawEntries().find((e) => e.id === "c-9")!;
    expect(created.equipment).toHaveLength(1);
    expect(created.equipment![0].id).toBe("c-9");   // mintFirstEquipment reuses the id
    expect(created.equipment![0].unitCount).toBe(1);
    // ...and the source therefore resolves to a real row, not the degenerate
    // unexpanded one resolveEquipment falls back to.
    expect(screen.getByTestId("ids").textContent).toContain("c-9");
  });
});
