// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScenarioProvider, useScenario } from "@/lib/store";

function Probe() {
  const { resolvedBaseAssets, settings } = useScenario();
  return (
    <div>
      <span data-testid="ids">{resolvedBaseAssets.map((a) => a.id).join(",")}</span>
      <span data-testid="volume">{resolvedBaseAssets.reduce((s, a) => s + a.annualVolume, 0)}</span>
      <span data-testid="spend">{resolvedBaseAssets.reduce((s, a) => s + a.opex, 0)}</span>
      <span data-testid="levers">{Object.keys(settings.byAsset).sort().join(",")}</span>
    </div>
  );
}

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
});
