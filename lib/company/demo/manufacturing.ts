/* ============================================================
   Demo company 2 of 3 - MANUFACTURING (auto components).

   Bharat Precision Forgings Ltd: closed-die forging plus machining
   for the Indian auto OEM supply chain - Chakan (Pune) forging, Hosur
   (Tamil Nadu) machining and heat treatment, a small Pune corporate
   office.

   What makes the sector's footprint distinctive:
     - Process heat is irreducible and hot. Billet reheat runs at
       1,150-1,250 degC, so PNG furnaces are the single largest Scope 1
       line and the hardest to electrify - which is exactly why the
       plan below leans on regenerative burners and efficiency before
       it leans on electrification.
     - Coal survives in the utility corner. A hot-air generator for
       shot blasting and paint drying still burns Indian steam coal at
       ~2.4 tCO2e per tonne, making it the best rupees-per-tonne
       abatement on site despite being a small energy user.
     - Induction and machining make the plant electricity-heavy, so
       Scope 2 is three times Scope 1 and open-access PPAs move more
       carbon than anything on the shop floor.
   ============================================================ */

import type { DemoCompany } from "./types";

export const MANUFACTURING: DemoCompany = {
  slug: "bharat-forgings",
  name: "Bharat Precision Forgings Ltd",
  sector: "Manufacturing - auto components",
  profile:
    "Closed-die forging and machining, ~INR 1,800 cr revenue. Chakan forging plant, Hosur machining plant, Pune corporate office.",

  bus: [
    { name: "Chakan Forging Plant", aggregate: true },
    { name: "Hosur Machining Plant", aggregate: true },
    { name: "Pune Corporate Office", aggregate: true },
  ],

  assumptions: {
    gridEf: 0.71,
    renewableSourcingPct: 50,
    recPricePerKwh: 0.45,
    carbonPricePerTonne: 2000,
    infraCapex: 32_000_000,
    discountRatePct: 12,
    maintenanceShareOfSpendPct: 20,
    evMaintenanceRatioPct: 65,
    heatPumpMaintenanceRatioPct: 70,
    fuelEscalationPct: 5.5,
    elecEscalationPct: 4,
    otherEscalationPct: 0,
  },

  sources: [
    {
      id: "png-reheat",
      name: "PNG billet reheat furnaces",
      category: "stationary",
      fuelType: "png",
      unit: "m3",
      bu: "Chakan Forging Plant",
      capacityUnit: "tph",
      volume: [4_880_000, 5_150_000],
      opex: [278_000_000, 292_000_000],
      equipment: [
        { id: "png-reheat", name: "Reheat furnace #1 (6 TPH)", capacity: 6, operatingHours: 6000, unitCount: 1, remainingLife: 12, endUse: "furnace", dutyTempC: 1230 },
        { id: "png-reheat-2", name: "Reheat furnace #2 (4 TPH)", capacity: 4, operatingHours: 5200, unitCount: 1, remainingLife: 8, endUse: "furnace", dutyTempC: 1180 },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 18, capex: 46_000_000, startYear: 2026, targetYear: 2029 },
        electrify: { enabled: true, unitsToConvert: 0, capacityPct: 25, cop: 1, tariffPerKwh: 8.9, assetCapex: 165_000_000, startYear: 2028, targetYear: 2033 },
        fuelSwitch: { enabled: false, altFuel: "biogas", blendPct: 0, efficiencyPenaltyPct: 3, altFuelPricePerUnit: 34, retrofitCapex: 0, startYear: 2029, targetYear: 2034 },
      },
    },
    {
      id: "fo-heattreat",
      name: "Furnace-oil heat-treatment line",
      category: "stationary",
      fuelType: "fuelOil",
      unit: "L",
      bu: "Hosur Machining Plant",
      capacityUnit: "kW",
      volume: [812_000, 840_000],
      opex: [54_600_000, 56_300_000],
      equipment: [
        { id: "fo-heattreat", name: "Continuous hardening furnace (1100 kW)", capacity: 1100, operatingHours: 6000, unitCount: 1, remainingLife: 10, endUse: "oven", dutyTempC: 870 },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 12, capex: 8_500_000, startYear: 2026, targetYear: 2029 },
        electrify: { enabled: true, unitsToConvert: 0, capacityPct: 40, cop: 1, tariffPerKwh: 7.8, assetCapex: 58_000_000, startYear: 2027, targetYear: 2032 },
        fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 30, efficiencyPenaltyPct: 3, altFuelPricePerUnit: 82, retrofitCapex: 7_200_000, startYear: 2026, targetYear: 2030 },
      },
    },
    {
      id: "coal-hag",
      name: "Coal-fired hot-air generator",
      category: "stationary",
      fuelType: "coal",
      unit: "t",
      bu: "Chakan Forging Plant",
      capacityUnit: "tph",
      volume: [1_720, 1_650],
      opex: [11_600_000, 11_100_000],
      equipment: [
        { id: "coal-hag", name: "HAG - blasting and paint drying (4 TPH)", capacity: 4, operatingHours: 5800, unitCount: 1, remainingLife: 7, endUse: "dryer", dutyTempC: 140 },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 10, capex: 2_400_000, startYear: 2026, targetYear: 2028 },
        electrify: { enabled: true, unitsToConvert: 0, capacityPct: 100, cop: 3, tariffPerKwh: 8.9, assetCapex: 34_000_000, startYear: 2026, targetYear: 2029 },
        fuelSwitch: { enabled: true, altFuel: "biomass", blendPct: 60, efficiencyPenaltyPct: 4, altFuelPricePerUnit: 5_200, retrofitCapex: 9_500_000, startYear: 2026, targetYear: 2028 },
      },
    },
    {
      id: "dg-chakan",
      name: "DG sets - Chakan",
      category: "stationary",
      fuelType: "diesel",
      unit: "L",
      bu: "Chakan Forging Plant",
      capacityUnit: "kVA",
      volume: [224_000, 210_000],
      opex: [22_600_000, 21_300_000],
      equipment: [
        { id: "dg-chakan", name: "DG 1500 kVA (x3)", capacity: 1500, operatingHours: 620, unitCount: 3, remainingLife: 9, endUse: "generator" },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 8, capex: 1_800_000, startYear: 2026, targetYear: 2028 },
        electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 1, tariffPerKwh: 8.9, assetCapex: 0, startYear: 2027, targetYear: 2032 },
        fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 82, retrofitCapex: 1_400_000, startYear: 2026, targetYear: 2029 },
      },
    },
    {
      id: "dg-hosur",
      name: "DG sets - Hosur",
      category: "stationary",
      fuelType: "diesel",
      unit: "L",
      bu: "Hosur Machining Plant",
      capacityUnit: "kVA",
      volume: [138_000, 130_000],
      opex: [14_000_000, 13_200_000],
      equipment: [
        { id: "dg-hosur", name: "DG 1250 kVA (x2)", capacity: 1250, operatingHours: 700, unitCount: 2, remainingLife: 11, endUse: "generator" },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 8, capex: 1_200_000, startYear: 2026, targetYear: 2028 },
        electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 1, tariffPerKwh: 7.8, assetCapex: 0, startYear: 2027, targetYear: 2032 },
        fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 82, retrofitCapex: 1_000_000, startYear: 2026, targetYear: 2029 },
      },
    },
    {
      id: "forklifts",
      name: "Forklifts and material handling (diesel)",
      category: "mobile",
      fuelType: "diesel",
      unit: "L",
      bu: "Chakan Forging Plant",
      volume: [58_000, 62_000],
      opex: [6_400_000, 6_900_000],
      equipment: [
        { id: "forklifts", name: "Diesel forklifts and stackers", unitCount: 9, remainingLife: 6, endUse: "forklift" },
      ],
      actions: {
        efficiency: { enabled: false, savingPct: 0, capex: 0, startYear: 2026, targetYear: 2030 },
        electrify: { enabled: true, unitsToConvert: 7, capacityPct: 0, cop: 3, tariffPerKwh: 8.9, assetCapex: 600_000, purchaseTiming: "replacement", replacementPremiumPct: 40, startYear: 2026, targetYear: 2030 },
        fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 82, retrofitCapex: 0, startYear: 2026, targetYear: 2028 },
      },
    },
    {
      id: "trucks",
      name: "Owned logistics trucks (diesel)",
      category: "mobile",
      fuelType: "diesel",
      unit: "L",
      bu: "Hosur Machining Plant",
      volume: [226_000, 238_000],
      opex: [24_900_000, 26_300_000],
      equipment: [
        { id: "trucks", name: "Inbound and outbound HGV fleet", unitCount: 11, remainingLife: 7, endUse: "truck" },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 6, capex: 1_600_000, startYear: 2026, targetYear: 2029 },
        electrify: { enabled: true, unitsToConvert: 3, capacityPct: 0, cop: 3, tariffPerKwh: 7.8, assetCapex: 9_500_000, purchaseTiming: "replacement", replacementPremiumPct: 45, startYear: 2029, targetYear: 2033 },
        fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 82, retrofitCapex: 0, startYear: 2026, targetYear: 2029 },
      },
    },
    {
      id: "lpg-cutting",
      name: "LPG - cutting and canteen",
      category: "stationary",
      fuelType: "lpg",
      unit: "L",
      bu: "Chakan Forging Plant",
      volume: [44_000, 48_000],
      opex: [2_700_000, 3_000_000],
      equipment: [
        { id: "lpg-cutting", name: "Cutting torches + canteen", unitCount: 1, remainingLife: 9, endUse: "cooking", dutyTempC: 210 },
      ],
      actions: {
        efficiency: { enabled: false, savingPct: 0, capex: 0, startYear: 2026, targetYear: 2030 },
        electrify: { enabled: true, unitsToConvert: 0, capacityPct: 45, cop: 1.8, tariffPerKwh: 8.9, assetCapex: 3_200_000, startYear: 2027, targetYear: 2031 },
        fuelSwitch: { enabled: false, altFuel: "biogas", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 34, retrofitCapex: 0, startYear: 2028, targetYear: 2032 },
      },
    },
  ],

  systems: [
    {
      id: "hvac-chakan",
      name: "Plant HVAC and compressor room",
      systemType: "commercialHVAC",
      refrigerant: "R410A",
      bu: "Chakan Forging Plant",
      toppedUpKg: [252, 240],
      chargeKg: 2750,
      gasCostPerKg: 1200,
      actions: {
        gasSwitch: { enabled: true, transitionPct: 60, altRefrigerant: "R454B", retrofitCapex: 9_500_000, startYear: 2027, targetYear: 2031 },
        leakFix: { enabled: true, leakImprovementPct: 45, capex: 1_600_000, startYear: 2026, targetYear: 2028 },
      },
    },
    {
      id: "chillers-hosur",
      name: "Machining coolant chillers",
      systemType: "industrialColdStorage",
      refrigerant: "R407C",
      bu: "Hosur Machining Plant",
      toppedUpKg: [182, 175],
      chargeKg: 1200,
      gasCostPerKg: 900,
      actions: {
        gasSwitch: { enabled: true, transitionPct: 65, altRefrigerant: "R290", retrofitCapex: 7_200_000, startYear: 2026, targetYear: 2030 },
        leakFix: { enabled: true, leakImprovementPct: 50, capex: 1_100_000, startYear: 2026, targetYear: 2028 },
      },
    },
    {
      id: "vrf-pune-corp",
      name: "Office VRF - Pune",
      systemType: "commercialHVAC",
      refrigerant: "R32",
      bu: "Pune Corporate Office",
      toppedUpKg: [62, 60],
      chargeKg: 720,
      gasCostPerKg: 1200,
      actions: {
        gasSwitch: { enabled: false, transitionPct: 0, altRefrigerant: "R454B", retrofitCapex: 0, startYear: 2029, targetYear: 2033 },
        leakFix: { enabled: true, leakImprovementPct: 30, capex: 400_000, startYear: 2026, targetYear: 2028 },
      },
    },
  ],

  facilities: [
    {
      id: "elec-chakan",
      name: "Purchased electricity",
      bu: "Chakan Forging Plant",
      kwh: [49_800_000, 52_000_000],
      tariffPerKwh: 8.9,
      gridEf: 0.71,
      roofSpaceM2: 38_000,
      peakLoadKw: 9500,
      irradiance: 1550,
      loadSplit: { lightingPct: 10, motorPct: 68, hvacPct: 12 },
      facilityType: "factory",
      existingSolarKwp: 2200,
      actions: {
        efficiency: { enabled: true, ledPct: 95, motorPct: 60, bmsPct: 55, ledCapex: 8_200_000, motorCapex: 56_000_000, bmsCapex: 14_000_000, startYear: 2026, targetYear: 2030 },
        generation: { enabled: true, solarKwp: 3800, batteryKwh: 5000, exportMode: "netMetering", solarCapexPerKw: 41_000, batteryCapexPerKwh: 23_000, subsidyPct: 0, startYear: 2026, targetYear: 2029 },
      },
    },
    {
      id: "solar-chakan",
      name: "Solar onsite",
      bu: "Chakan Forging Plant",
      kwh: [2_800_000, 3_100_000],
      tariffPerKwh: 3.3,
      gridEf: 0,
      roofSpaceM2: 0,
      peakLoadKw: 0,
      irradiance: 1550,
      loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
    },
    {
      id: "vppa-chakan",
      name: "Virtual PPA",
      bu: "Chakan Forging Plant",
      kwh: [11_000_000, 15_000_000],
      tariffPerKwh: 4.3,
      gridEf: 0,
      roofSpaceM2: 0,
      peakLoadKw: 0,
      irradiance: 1550,
      loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
    },
    {
      id: "elec-hosur",
      name: "Purchased electricity",
      bu: "Hosur Machining Plant",
      kwh: [31_900_000, 33_500_000],
      tariffPerKwh: 7.8,
      gridEf: 0.71,
      roofSpaceM2: 24_000,
      peakLoadKw: 6200,
      irradiance: 1700,
      loadSplit: { lightingPct: 12, motorPct: 64, hvacPct: 14 },
      facilityType: "factory",
      existingSolarKwp: 1800,
      actions: {
        efficiency: { enabled: true, ledPct: 90, motorPct: 50, bmsPct: 45, ledCapex: 5_400_000, motorCapex: 34_000_000, bmsCapex: 9_500_000, startYear: 2026, targetYear: 2030 },
        generation: { enabled: true, solarKwp: 2500, batteryKwh: 3500, exportMode: "netMetering", solarCapexPerKw: 40_000, batteryCapexPerKwh: 23_000, subsidyPct: 0, startYear: 2026, targetYear: 2030 },
      },
    },
    {
      id: "solar-hosur",
      name: "Solar onsite",
      bu: "Hosur Machining Plant",
      kwh: [2_150_000, 2_400_000],
      tariffPerKwh: 3.1,
      gridEf: 0,
      roofSpaceM2: 0,
      peakLoadKw: 0,
      irradiance: 1700,
      loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
    },
    {
      id: "irec-hosur",
      name: "I-REC",
      bu: "Hosur Machining Plant",
      kwh: [3_500_000, 5_000_000],
      tariffPerKwh: 0.45,
      gridEf: 0,
      roofSpaceM2: 0,
      peakLoadKw: 0,
      irradiance: 1700,
      loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
    },
    {
      id: "elec-pune-corp",
      name: "Purchased electricity",
      bu: "Pune Corporate Office",
      kwh: [940_000, 980_000],
      tariffPerKwh: 10.5,
      gridEf: 0.71,
      roofSpaceM2: 700,
      peakLoadKw: 260,
      irradiance: 1550,
      loadSplit: { lightingPct: 30, motorPct: 10, hvacPct: 45 },
      facilityType: "office",
      actions: {
        efficiency: { enabled: true, ledPct: 100, motorPct: 15, bmsPct: 85, ledCapex: 1_100_000, motorCapex: 600_000, bmsCapex: 1_800_000, startYear: 2026, targetYear: 2028 },
        generation: { enabled: true, solarKwp: 120, batteryKwh: 0, exportMode: "netMetering", solarCapexPerKw: 46_000, batteryCapexPerKwh: 26_000, subsidyPct: 0, startYear: 2027, targetYear: 2029 },
      },
    },
  ],

  procurement: {
    enabled: true,
    ppaPct: 35,
    greenTariffPct: 5,
    recPct: 10,
    ppaStrikeDeltaPerKwh: -1.2,
    greenTariffPremiumPerKwh: 0.7,
    recPricePerKwh: 0.45,
    re100Exclusion: false,
    startYear: 2026,
    targetYear: 2031,
  },

  scope1Scenarios: [
    {
      id: "s1-no-furnace-capex",
      name: "Efficiency only (no furnace capex)",
      note: "What the plan delivers if the board defers electrification of the reheat furnaces entirely.",
      byAsset: {
        "png-reheat": { electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 1, tariffPerKwh: 8.9, assetCapex: 0, startYear: 2028, targetYear: 2033 } },
        "png-reheat-2": { electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 1, tariffPerKwh: 8.9, assetCapex: 0, startYear: 2028, targetYear: 2033 } },
        "fo-heattreat": { electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 1, tariffPerKwh: 7.8, assetCapex: 0, startYear: 2027, targetYear: 2032 } },
      },
    },
    {
      id: "s1-coal-exit-2028",
      name: "Coal exit via biomass by 2028",
      note: "The other way off coal: biomass firing instead of an electric hot-air generator, done by 2028. Trades a INR 4.4 cr electric conversion for a INR 1.5 cr burner retrofit, and gives up about 2 points of 2030 abatement for it.",
      byAsset: {
        // Electrification must come OFF for this to mean anything. The levers
        // stack efficiency -> electrify -> fuel switch, so the base plan's
        // 100%-capacity electric conversion leaves the biomass switch no fuel
        // to act on: raising the blend alone changed neither tonnes nor capex.
        "coal-hag": {
          electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 3, tariffPerKwh: 8.9, assetCapex: 0, startYear: 2026, targetYear: 2029 },
          fuelSwitch: { enabled: true, altFuel: "biomass", blendPct: 100, efficiencyPenaltyPct: 4, altFuelPricePerUnit: 5_200, retrofitCapex: 15_000_000, startYear: 2026, targetYear: 2028 },
        },
      },
      assumptions: { carbonPricePerTonne: 3000 },
    },
  ],

  scope2Scenarios: [
    {
      id: "s2-base-ppa",
      name: "Open-access PPA only",
      note: "No new rooftop; the whole Scope 2 move comes from a group-captive PPA.",
      byFacility: {
        "elec-chakan": { generation: { enabled: false, solarKwp: 0, batteryKwh: 0, exportMode: "netMetering", solarCapexPerKw: 41_000, batteryCapexPerKwh: 23_000, subsidyPct: 0, startYear: 2026, targetYear: 2029 } },
        "elec-hosur": { generation: { enabled: false, solarKwp: 0, batteryKwh: 0, exportMode: "netMetering", solarCapexPerKw: 40_000, batteryCapexPerKwh: 23_000, subsidyPct: 0, startYear: 2026, targetYear: 2030 } },
      },
      procurement: { ppaPct: 65, greenTariffPct: 5, recPct: 5 },
    },
    {
      id: "s2-max-onsite",
      name: "Max on-site + PPA",
      note: "Rooftop at the roof cap on both plants, PPA covering the rest.",
      byFacility: {
        "elec-chakan": { generation: { enabled: true, solarKwp: 4600, batteryKwh: 8000, exportMode: "netMetering", solarCapexPerKw: 41_000, batteryCapexPerKwh: 23_000, subsidyPct: 0, startYear: 2026, targetYear: 2028 } },
        "elec-hosur": { generation: { enabled: true, solarKwp: 2500, batteryKwh: 6000, exportMode: "netMetering", solarCapexPerKw: 40_000, batteryCapexPerKwh: 23_000, subsidyPct: 0, startYear: 2026, targetYear: 2028 } },
      },
      procurement: { ppaPct: 50, greenTariffPct: 10, recPct: 15, targetYear: 2029 },
    },
  ],

  esg: {
    water: {
      2024: {
        withdrawalKl: 174_000,
        consumptionKl: 109_000,
        dischargeKl: 65_000,
        withdrawalBySource: { ground: 82_000, thirdParty: 75_000, surface: 13_000, other: 4_000 },
        dischargeByDest: { thirdParty: 46_000, surface: 13_000, other: 6_000 },
      },
      2025: {
        withdrawalKl: 168_000,
        consumptionKl: 106_000,
        dischargeKl: 62_000,
        withdrawalBySource: { ground: 78_000, thirdParty: 74_000, surface: 12_000, other: 4_000 },
        dischargeByDest: { thirdParty: 44_000, surface: 12_000, other: 6_000 },
      },
    },
    waste: {
      2024: {
        generatedT: 4_692, disposedT: 604, recoveredT: 4_088,
        byCategory: {
          plastic: { generatedT: 82, disposedT: 24, recoveredT: 58 },
          ewaste: { generatedT: 6, disposedT: 1, recoveredT: 5 },
          biomedical: { generatedT: 2, disposedT: 2, recoveredT: 0 },
          cnd: { generatedT: 248, disposedT: 160, recoveredT: 88 },
          battery: { generatedT: 13, disposedT: 0, recoveredT: 13 },
          radioactive: { generatedT: 0, disposedT: 0, recoveredT: 0 },
          otherHaz: { generatedT: 336, disposedT: 214, recoveredT: 122 },
          otherNonHaz: { generatedT: 4_005, disposedT: 203, recoveredT: 3_802 },
        },
      },
      2025: {
        generatedT: 4_873, disposedT: 562, recoveredT: 4_311,
        byCategory: {
          plastic: { generatedT: 86, disposedT: 20, recoveredT: 66 },
          ewaste: { generatedT: 7, disposedT: 1, recoveredT: 6 },
          biomedical: { generatedT: 2, disposedT: 2, recoveredT: 0 },
          cnd: { generatedT: 265, disposedT: 158, recoveredT: 107 },
          battery: { generatedT: 15, disposedT: 0, recoveredT: 15 },
          radioactive: { generatedT: 0, disposedT: 0, recoveredT: 0 },
          otherHaz: { generatedT: 320, disposedT: 196, recoveredT: 124 },
          otherNonHaz: { generatedT: 4_178, disposedT: 185, recoveredT: 3_993 },
        },
      },
    },
  },

  goals: [
    {
      id: "goal-mfg-sbti",
      name: "Cut Scope 1+2 emissions 42% by 2030 (SBTi 1.5 degC)",
      category: "emissions",
      templateId: "abs_sbti",
      metric: "emissions_t",
      direction: "reduce",
      scope: "s1s2",
      baseYear: 2025,
      targetYear: 2030,
      targetPct: 42,
      assignee: "esg",
      milestones: [
        { id: "m-m1", year: 2027, reductionPct: 14 },
        { id: "m-m2", year: 2028, reductionPct: 24 },
        { id: "m-m3", year: 2030, reductionPct: 42 },
      ],
    },
    {
      id: "goal-mfg-energy",
      name: "Cut process energy intensity 20% by 2030",
      category: "energy",
      templateId: "energy_efficiency",
      metric: "energy_kwh",
      direction: "reduce",
      scope: "s1s2",
      baseYear: 2025,
      targetYear: 2030,
      targetPct: 20,
      assignee: "plant",
      milestones: [
        { id: "m-m4", year: 2027, reductionPct: 8 },
        { id: "m-m5", year: 2030, reductionPct: 20 },
      ],
    },
    {
      id: "goal-mfg-waste",
      name: "Zero waste to landfill by 2030",
      category: "waste",
      templateId: "zero_waste_landfill",
      metric: "waste_diversion_pct",
      direction: "increase",
      scope: "s1s2",
      baseYear: 2025,
      targetYear: 2030,
      targetPct: 99,
      assignee: "plant",
      milestones: [
        { id: "m-m6", year: 2028, reductionPct: 95 },
        { id: "m-m7", year: 2030, reductionPct: 99 },
      ],
    },
  ],
};
