import { describe, it, expect } from "vitest";
import { fractionFor, defaultActions, defaultFlexFuel, flexFuelCapable, applyAssetActions } from "../segments";
import type { CombustionAsset, GlobalAssumptions } from "../types";

const mobile: CombustionAsset = { id: "f", name: "Fleet", category: "mobile", fuelType: "diesel", annualVolume: 100000, unit: "L", opex: 0, remainingLife: 6, unitCount: 5, year: 2025 };
const petrolFleet: CombustionAsset = { ...mobile, id: "p", fuelType: "petrol", unit: "L" };
const stationary: CombustionAsset = { id: "b", name: "Boiler", category: "stationary", fuelType: "png", annualVolume: 180000, unit: "m3", opex: 0, remainingLife: 12, unitCount: 1, year: 2025 };
const assume: GlobalAssumptions = { gridEf: 0.71, renewableSourcingPct: 0, recCostPerTonne: 800, carbonPricePerTonne: 2000, infraCapex: 0 };

describe("fractionFor", () => {
  it("mobile = unitsToConvert / unitCount", () => {
    const a = { ...defaultActions(mobile).electrify, unitsToConvert: 3 };
    expect(fractionFor(a, mobile)).toBeCloseTo(0.6, 5);
  });
  it("stationary = capacityPct / 100", () => {
    const a = { ...defaultActions(stationary).electrify, capacityPct: 60 };
    expect(fractionFor(a, stationary)).toBeCloseTo(0.6, 5);
  });
  it("clamps to 0..1", () => {
    expect(fractionFor({ ...defaultActions(mobile).electrify, unitsToConvert: 99 }, mobile)).toBe(1);
  });
});

describe("applyAssetActions", () => {
  it("electrify 3/5 vehicles abates ~60% of the asset and adds Scope 2", () => {
    const acts = {
      electrify: { ...defaultActions(mobile).electrify, enabled: true, unitsToConvert: 3 },
      fuelSwitch: { ...defaultActions(mobile).fuelSwitch, enabled: false },
    };
    const r = applyAssetActions(mobile, acts, assume);
    expect(r.scope1AbatementT).toBeCloseTo(0.6 * ((100000 * 2.57082) / 1000), 1);
    expect(r.scope2AddedT).toBeGreaterThan(0);
  });
  it("electrify + fuel switch on one asset never abate more than its emissions", () => {
    const base = (100000 * 2.57082) / 1000;
    const acts = {
      electrify: { ...defaultActions(mobile).electrify, enabled: true, unitsToConvert: 5 },
      fuelSwitch: { ...defaultActions(mobile).fuelSwitch, enabled: true, blendPct: 100 },
    };
    const r = applyAssetActions(mobile, acts, assume);
    expect(r.scope1AbatementT + r.fuelAbatementT).toBeLessThanOrEqual(base + 1e-6);
  });
  it("disabled actions abate nothing", () => {
    const r = applyAssetActions(mobile, defaultActions(mobile), assume);
    expect(r.scope1AbatementT).toBe(0);
    expect(r.fuelAbatementT).toBe(0);
    expect(r.flexAbatementT).toBe(0);
  });
});

describe("flex-fuel conversion", () => {
  it("is offered for mobile petrol/diesel, not for stationary or drop-in-100% fuels", () => {
    expect(flexFuelCapable(petrolFleet)).toBe(true);
    expect(flexFuelCapable(mobile)).toBe(true); // diesel fleet
    expect(flexFuelCapable(stationary)).toBe(false); // PNG → biomethane is 100% drop-in
    expect(flexFuelCapable({ ...mobile, fuelType: "cng" })).toBe(false); // bio-CNG is 100% drop-in
  });

  it("converting vehicles to a high blend abates emissions, counted per vehicle", () => {
    const acts = {
      ...defaultActions(petrolFleet),
      flexFuel: { ...defaultFlexFuel(petrolFleet), enabled: true, unitsToConvert: 2, highBlendPct: 85 },
    };
    const r = applyAssetActions(petrolFleet, acts, assume);
    expect(r.flexFraction).toBeCloseTo(2 / 5, 5);
    expect(r.flexAbatementT).toBeGreaterThan(0);
    // flex is part of the total fuel abatement bucket
    expect(r.fuelAbatementT).toBeGreaterThanOrEqual(r.flexAbatementT - 1e-9);
  });

  it("flex + electrify never claim more of the fleet than exists", () => {
    const base = (100000 * FUEL_PETROL_EF) / 1000;
    const acts = {
      ...defaultActions(petrolFleet),
      electrify: { ...defaultActions(petrolFleet).electrify, enabled: true, unitsToConvert: 4 },
      flexFuel: { ...defaultFlexFuel(petrolFleet), enabled: true, unitsToConvert: 5, highBlendPct: 100 },
    };
    const r = applyAssetActions(petrolFleet, acts, assume);
    // electrified 4/5, so flex capped to the remaining 1/5
    expect(r.flexFraction).toBeCloseTo(1 / 5, 5);
    expect(r.scope1AbatementT + r.fuelAbatementT).toBeLessThanOrEqual(base + 1e-6);
  });
});

const FUEL_PETROL_EF = 2.06916;

describe("context-aware blend cap & biomass co-firing", () => {
  const dieselBoiler: CombustionAsset = { id: "fo", name: "FO boiler", category: "stationary", fuelType: "fuelOil", annualVolume: 50000, unit: "L", opex: 0, remainingLife: 12, unitCount: 1, year: 2025 };
  const coalBoiler: CombustionAsset = { id: "c", name: "Coal boiler", category: "stationary", fuelType: "coal", annualVolume: 1000, unit: "t", opex: 0, remainingLife: 15, unitCount: 1, year: 2025 };

  it("stationary biodiesel can blend far past the B20 vehicle cap", () => {
    const acts = {
      ...defaultActions(dieselBoiler),
      fuelSwitch: { ...defaultActions(dieselBoiler).fuelSwitch, enabled: true, altFuel: "biodiesel" as const, blendPct: 80 },
    };
    const r = applyAssetActions(dieselBoiler, acts, assume);
    // 80% blend is honoured (cap is B100 for stationary), so most of the fuel CO2 is abated
    expect(r.fuelFraction).toBeCloseTo(0.8, 5);
    expect(r.fuelAbatementT).toBeGreaterThan(0.5 * ((50000 * 3.17492) / 1000));
  });

  it("coal boiler can co-fire biomass (default alt fuel = biomass)", () => {
    expect(defaultActions(coalBoiler).fuelSwitch.altFuel).toBe("biomass");
    const acts = {
      ...defaultActions(coalBoiler),
      fuelSwitch: { ...defaultActions(coalBoiler).fuelSwitch, enabled: true, altFuel: "biomass" as const, blendPct: 20 },
    };
    const r = applyAssetActions(coalBoiler, acts, assume);
    const coalBase = (1000 * 2395.28994) / 1000;
    // ~20% co-firing removes close to a fifth of the coal's Scope 1
    expect(r.fuelAbatementT).toBeGreaterThan(0.15 * coalBase);
    expect(r.fuelAbatementT).toBeLessThan(0.22 * coalBase);
  });

  it("co-firing blend is clamped to the biomass cap (50%)", () => {
    const acts = {
      ...defaultActions(coalBoiler),
      fuelSwitch: { ...defaultActions(coalBoiler).fuelSwitch, enabled: true, altFuel: "biomass" as const, blendPct: 90 },
    };
    const r = applyAssetActions(coalBoiler, acts, assume);
    expect(r.fuelFraction).toBeCloseTo(0.5, 5); // capped at 50%, not 90%
  });
});
