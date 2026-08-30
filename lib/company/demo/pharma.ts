/* ============================================================
   Demo company 1 of 3 - PHARMACEUTICALS.

   Nirmaya Pharmaceuticals Ltd: a mid-cap Indian formulations-plus-API
   business, the shape SEBI's top-1000 BRSR filers actually have - a
   solvent-heavy API site in the Gujarat chemical belt, a sterile
   formulations plant in Telangana, and a leased corporate office.

   What makes the sector's footprint distinctive, and why the numbers
   below look the way they do:
     - Steam is the whole game. API reactors, distillation and drying
       run on saturated steam, so PNG boilers plus a furnace-oil
       thermic fluid heater dominate Scope 1 combustion.
     - Cleanrooms never switch off. Grade C/D air handling runs 8,760
       h/yr at 20-24 degC and 45-55% RH, which is why formulations
       carries a large refrigerant charge and a heavy electricity bill
       relative to its output.
     - Cold chain adds R404A. Stability chambers and 2-8 degC rooms
       are a small mass of gas doing a lot of damage at GWP 3922.
   ============================================================ */

import type { DemoCompany } from "./types";

export const PHARMA: DemoCompany = {
  slug: "nirmaya-pharma",
  name: "Nirmaya Pharmaceuticals Ltd",
  sector: "Pharmaceuticals",
  profile:
    "API + formulations, ~INR 2,400 cr revenue. Ankleshwar API block, Hyderabad sterile formulations, Mumbai corporate office.",

  bus: [
    { name: "Ankleshwar API Plant", aggregate: true },
    { name: "Hyderabad Formulations", aggregate: true },
    { name: "Mumbai Corporate Office", aggregate: true },
  ],

  assumptions: {
    gridEf: 0.71,
    renewableSourcingPct: 55,
    recPricePerKwh: 0.45,
    carbonPricePerTonne: 2000,
    infraCapex: 24_000_000,
    discountRatePct: 11,
    maintenanceShareOfSpendPct: 18,
    evMaintenanceRatioPct: 65,
    heatPumpMaintenanceRatioPct: 70,
    fuelEscalationPct: 5,
    elecEscalationPct: 3.5,
    otherEscalationPct: 0,
  },

  sources: [
    {
      id: "png-boilers",
      name: "PNG steam boilers",
      category: "stationary",
      fuelType: "png",
      unit: "m3",
      bu: "Ankleshwar API Plant",
      capacityUnit: "tph",
      volume: [2_310_000, 2_455_000],
      opex: [124_700_000, 135_000_000],
      equipment: [
        { id: "png-boilers", name: "IJT boiler #1 (10 TPH)", capacity: 10, operatingHours: 7200, unitCount: 1, remainingLife: 11, endUse: "boiler" },
        { id: "png-boiler-2", name: "IJT boiler #2 (8 TPH)", capacity: 8, operatingHours: 5400, unitCount: 1, remainingLife: 13, endUse: "boiler" },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 8, capex: 9_000_000, startYear: 2026, targetYear: 2028 },
        electrify: { enabled: true, unitsToConvert: 0, capacityPct: 35, cop: 2.8, tariffPerKwh: 8.6, assetCapex: 78_000_000, startYear: 2027, targetYear: 2031 },
        fuelSwitch: { enabled: true, altFuel: "biogas", blendPct: 30, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 32, retrofitCapex: 14_000_000, startYear: 2027, targetYear: 2030 },
      },
    },
    {
      id: "fo-tfh",
      name: "Furnace-oil thermic fluid heater",
      category: "stationary",
      fuelType: "fuelOil",
      unit: "L",
      bu: "Ankleshwar API Plant",
      capacityUnit: "kW",
      volume: [648_000, 612_000],
      opex: [43_600_000, 41_500_000],
      equipment: [
        { id: "fo-tfh", name: "TFH - solvent recovery (800 kW)", capacity: 800, operatingHours: 6600, unitCount: 1, remainingLife: 9, endUse: "tfh" },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 6, capex: 3_500_000, startYear: 2026, targetYear: 2028 },
        electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 1, tariffPerKwh: 8.6, assetCapex: 0, startYear: 2027, targetYear: 2032 },
        fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 45, efficiencyPenaltyPct: 3, altFuelPricePerUnit: 82, retrofitCapex: 6_500_000, startYear: 2026, targetYear: 2029 },
      },
    },
    {
      id: "dg-ankleshwar",
      name: "DG sets - Ankleshwar",
      category: "stationary",
      fuelType: "diesel",
      unit: "L",
      bu: "Ankleshwar API Plant",
      capacityUnit: "kVA",
      volume: [332_000, 298_000],
      opex: [32_800_000, 29_900_000],
      equipment: [
        { id: "dg-ankleshwar", name: "DG 1250 kVA (x2)", capacity: 1250, operatingHours: 900, unitCount: 2, remainingLife: 8, endUse: "generator" },
        { id: "dg-ank-standby", name: "DG 750 kVA standby", capacity: 750, operatingHours: 620, unitCount: 1, remainingLife: 6, endUse: "generator" },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 10, capex: 2_200_000, startYear: 2026, targetYear: 2028 },
        electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 1, tariffPerKwh: 8.6, assetCapex: 0, startYear: 2027, targetYear: 2032 },
        fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 82, retrofitCapex: 1_800_000, startYear: 2026, targetYear: 2029 },
      },
    },
    {
      id: "dg-hyderabad",
      name: "DG sets - Hyderabad",
      category: "stationary",
      fuelType: "diesel",
      unit: "L",
      bu: "Hyderabad Formulations",
      capacityUnit: "kVA",
      volume: [171_000, 165_000],
      opex: [17_200_000, 16_700_000],
      equipment: [
        { id: "dg-hyderabad", name: "DG 1000 kVA (x2)", capacity: 1000, operatingHours: 780, unitCount: 2, remainingLife: 10, endUse: "generator" },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 10, capex: 1_500_000, startYear: 2026, targetYear: 2028 },
        electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 1, tariffPerKwh: 8.2, assetCapex: 0, startYear: 2027, targetYear: 2032 },
        fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 82, retrofitCapex: 1_200_000, startYear: 2026, targetYear: 2029 },
      },
    },
    {
      id: "briquette-boiler",
      name: "Biomass briquette boiler",
      category: "stationary",
      fuelType: "bioBriquettes",
      unit: "t",
      bu: "Hyderabad Formulations",
      capacityUnit: "tph",
      volume: [1_620, 1_880],
      opex: [13_400_000, 15_600_000],
      equipment: [
        { id: "briquette-boiler", name: "Briquette boiler (6 TPH)", capacity: 6, operatingHours: 6800, unitCount: 1, remainingLife: 12, endUse: "boiler" },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 7, capex: 2_800_000, startYear: 2026, targetYear: 2029 },
        electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 1, tariffPerKwh: 8.2, assetCapex: 0, startYear: 2027, targetYear: 2032 },
        fuelSwitch: { enabled: false, altFuel: "biomass", blendPct: 0, efficiencyPenaltyPct: 0, altFuelPricePerUnit: 5000, retrofitCapex: 0, startYear: 2027, targetYear: 2032 },
      },
    },
    {
      id: "lcv-fleet",
      name: "Distribution LCVs (diesel)",
      category: "mobile",
      fuelType: "diesel",
      unit: "L",
      bu: "Hyderabad Formulations",
      volume: [176_000, 182_000],
      opex: [19_400_000, 20_100_000],
      equipment: [
        { id: "lcv-fleet", name: "Cold-chain LCV fleet", unitCount: 8, remainingLife: 5, endUse: "van" },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 5, capex: 900_000, startYear: 2026, targetYear: 2028 },
        electrify: { enabled: true, unitsToConvert: 5, capacityPct: 0, cop: 3.2, tariffPerKwh: 8.2, assetCapex: 2_500_000, purchaseTiming: "replacement", replacementPremiumPct: 38, startYear: 2027, targetYear: 2031 },
        fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 82, retrofitCapex: 0, startYear: 2026, targetYear: 2029 },
      },
    },
    {
      id: "car-fleet",
      name: "Executive fleet (petrol)",
      category: "mobile",
      fuelType: "petrol",
      unit: "L",
      bu: "Mumbai Corporate Office",
      volume: [84_000, 86_000],
      opex: [9_700_000, 9_900_000],
      equipment: [
        { id: "car-fleet", name: "Company cars", unitCount: 12, remainingLife: 4, endUse: "car" },
      ],
      actions: {
        efficiency: { enabled: false, savingPct: 0, capex: 0, startYear: 2026, targetYear: 2030 },
        electrify: { enabled: true, unitsToConvert: 9, capacityPct: 0, cop: 3.5, tariffPerKwh: 11.2, assetCapex: 1_800_000, purchaseTiming: "replacement", replacementPremiumPct: 35, startYear: 2026, targetYear: 2030 },
        fuelSwitch: { enabled: false, altFuel: "ethanol", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 70, retrofitCapex: 0, startYear: 2027, targetYear: 2032 },
        flexFuel: { enabled: true, unitsToConvert: 3, altFuel: "ethanol", highBlendPct: 85, vehicleCapex: 350_000, startYear: 2028, targetYear: 2031 },
      },
    },
    {
      id: "lpg-utility",
      name: "LPG - canteen and QC labs",
      category: "stationary",
      fuelType: "lpg",
      unit: "L",
      bu: "Hyderabad Formulations",
      volume: [112_000, 118_000],
      opex: [6_900_000, 7_300_000],
      equipment: [
        { id: "lpg-utility", name: "Canteen kitchen + lab burners", unitCount: 1, remainingLife: 8, endUse: "cooking" },
      ],
      actions: {
        efficiency: { enabled: false, savingPct: 0, capex: 0, startYear: 2026, targetYear: 2030 },
        electrify: { enabled: true, unitsToConvert: 0, capacityPct: 60, cop: 2.5, tariffPerKwh: 8.2, assetCapex: 6_500_000, startYear: 2027, targetYear: 2031 },
        fuelSwitch: { enabled: false, altFuel: "biogas", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 32, retrofitCapex: 0, startYear: 2027, targetYear: 2032 },
      },
    },
  ],

  systems: [
    {
      id: "chillers-ankleshwar",
      name: "Process chillers - Ankleshwar",
      systemType: "industrialColdStorage",
      refrigerant: "R134a",
      bu: "Ankleshwar API Plant",
      toppedUpKg: [285, 268],
      gasCostPerKg: 1150,
      actions: {
        gasSwitch: { enabled: true, transitionPct: 50, altRefrigerant: "R717", retrofitCapex: 22_000_000, startYear: 2027, targetYear: 2031 },
        leakFix: { enabled: true, leakImprovementPct: 45, capex: 2_400_000, startYear: 2026, targetYear: 2028 },
      },
    },
    {
      id: "coldrooms-hyderabad",
      name: "Cold rooms 2-8 degC - Hyderabad",
      systemType: "industrialColdStorage",
      refrigerant: "R404A",
      bu: "Hyderabad Formulations",
      toppedUpKg: [164, 152],
      gasCostPerKg: 950,
      actions: {
        gasSwitch: { enabled: true, transitionPct: 70, altRefrigerant: "R744", retrofitCapex: 16_000_000, startYear: 2026, targetYear: 2030 },
        leakFix: { enabled: true, leakImprovementPct: 55, capex: 1_900_000, startYear: 2026, targetYear: 2028 },
      },
    },
    {
      id: "ahu-hyderabad",
      name: "Cleanroom AHUs and VRF - Hyderabad",
      systemType: "commercialHVAC",
      refrigerant: "R410A",
      bu: "Hyderabad Formulations",
      toppedUpKg: [430, 412],
      gasCostPerKg: 1200,
      actions: {
        gasSwitch: { enabled: true, transitionPct: 55, altRefrigerant: "R454B", retrofitCapex: 18_500_000, startYear: 2027, targetYear: 2031 },
        leakFix: { enabled: true, leakImprovementPct: 40, capex: 3_100_000, startYear: 2026, targetYear: 2029 },
      },
    },
    {
      id: "vrf-mumbai",
      name: "Office VRF - Mumbai",
      systemType: "commercialHVAC",
      refrigerant: "R32",
      bu: "Mumbai Corporate Office",
      toppedUpKg: [96, 92],
      gasCostPerKg: 1200,
      actions: {
        gasSwitch: { enabled: false, transitionPct: 0, altRefrigerant: "R454B", retrofitCapex: 0, startYear: 2028, targetYear: 2032 },
        leakFix: { enabled: true, leakImprovementPct: 35, capex: 600_000, startYear: 2026, targetYear: 2028 },
      },
    },
  ],

  facilities: [
    {
      id: "elec-ankleshwar",
      name: "Purchased electricity",
      bu: "Ankleshwar API Plant",
      kwh: [36_800_000, 38_400_000],
      tariffPerKwh: 8.6,
      gridEf: 0.71,
      roofSpaceM2: 42_000,
      peakLoadKw: 7200,
      irradiance: 1650,
      loadSplit: { lightingPct: 12, motorPct: 62, hvacPct: 18 },
      facilityType: "factory",
      existingSolarKwp: 3000,
      actions: {
        efficiency: { enabled: true, ledPct: 90, motorPct: 55, bmsPct: 70, ledCapex: 9_500_000, motorCapex: 42_000_000, bmsCapex: 18_000_000, startYear: 2026, targetYear: 2030 },
        generation: { enabled: true, solarKwp: 4200, batteryKwh: 6000, exportMode: "netMetering", solarCapexPerKw: 42_000, batteryCapexPerKwh: 24_000, subsidyPct: 0, startYear: 2026, targetYear: 2029 },
      },
    },
    {
      id: "solar-ankleshwar",
      name: "Solar onsite",
      bu: "Ankleshwar API Plant",
      kwh: [3_900_000, 4_350_000],
      tariffPerKwh: 3.2,
      gridEf: 0,
      roofSpaceM2: 0,
      peakLoadKw: 0,
      irradiance: 1650,
      loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
    },
    {
      id: "vppa-ankleshwar",
      name: "Virtual PPA",
      bu: "Ankleshwar API Plant",
      kwh: [9_000_000, 12_500_000],
      tariffPerKwh: 4.1,
      gridEf: 0,
      roofSpaceM2: 0,
      peakLoadKw: 0,
      irradiance: 1650,
      loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
    },
    {
      id: "elec-hyderabad",
      name: "Purchased electricity",
      bu: "Hyderabad Formulations",
      kwh: [20_600_000, 21_900_000],
      tariffPerKwh: 8.2,
      gridEf: 0.71,
      roofSpaceM2: 26_000,
      peakLoadKw: 4100,
      irradiance: 1600,
      loadSplit: { lightingPct: 14, motorPct: 38, hvacPct: 42 },
      facilityType: "factory",
      existingSolarKwp: 1400,
      actions: {
        efficiency: { enabled: true, ledPct: 85, motorPct: 40, bmsPct: 80, ledCapex: 6_200_000, motorCapex: 21_000_000, bmsCapex: 15_500_000, startYear: 2026, targetYear: 2030 },
        generation: { enabled: true, solarKwp: 2600, batteryKwh: 3000, exportMode: "netMetering", solarCapexPerKw: 43_000, batteryCapexPerKwh: 24_000, subsidyPct: 0, startYear: 2026, targetYear: 2030 },
      },
    },
    {
      id: "solar-hyderabad",
      name: "Solar onsite",
      bu: "Hyderabad Formulations",
      kwh: [1_700_000, 1_950_000],
      tariffPerKwh: 3.4,
      gridEf: 0,
      roofSpaceM2: 0,
      peakLoadKw: 0,
      irradiance: 1600,
      loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
    },
    {
      id: "irec-hyderabad",
      name: "I-REC",
      bu: "Hyderabad Formulations",
      kwh: [3_000_000, 4_200_000],
      tariffPerKwh: 0.45,
      gridEf: 0,
      roofSpaceM2: 0,
      peakLoadKw: 0,
      irradiance: 1600,
      loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
    },
    {
      id: "elec-mumbai",
      name: "Purchased electricity",
      bu: "Mumbai Corporate Office",
      kwh: [1_690_000, 1_742_000],
      tariffPerKwh: 11.2,
      gridEf: 0.71,
      roofSpaceM2: 900,
      peakLoadKw: 420,
      irradiance: 1500,
      loadSplit: { lightingPct: 30, motorPct: 10, hvacPct: 45 },
      facilityType: "office",
      actions: {
        efficiency: { enabled: true, ledPct: 100, motorPct: 20, bmsPct: 90, ledCapex: 1_800_000, motorCapex: 900_000, bmsCapex: 2_400_000, startYear: 2026, targetYear: 2028 },
        generation: { enabled: false, solarKwp: 0, batteryKwh: 0, exportMode: "netMetering", solarCapexPerKw: 48_000, batteryCapexPerKwh: 26_000, subsidyPct: 0, startYear: 2027, targetYear: 2030 },
      },
    },
  ],

  procurement: {
    enabled: true,
    ppaPct: 30,
    greenTariffPct: 10,
    recPct: 15,
    ppaStrikeDeltaPerKwh: -0.9,
    greenTariffPremiumPerKwh: 0.75,
    recPricePerKwh: 0.45,
    re100Exclusion: false,
    startYear: 2026,
    targetYear: 2030,
  },

  scope1Scenarios: [
    {
      id: "s1-committed",
      name: "Committed plan (board-approved)",
      note: "The capex already in the FY27 plan: boiler tuning, B20 across DG and TFH, cold-room CO2 swap.",
      byAsset: {
        "png-boilers": { electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 2.8, tariffPerKwh: 8.6, assetCapex: 0, startYear: 2027, targetYear: 2031 } },
        "png-boiler-2": { electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 2.8, tariffPerKwh: 8.6, assetCapex: 0, startYear: 2027, targetYear: 2031 } },
      },
    },
    {
      id: "s1-accelerated",
      name: "Accelerated 2030",
      note: "Steam electrification pulled forward and doubled; 50% biogas blend on the PNG boilers.",
      byAsset: {
        "png-boilers": {
          electrify: { enabled: true, unitsToConvert: 0, capacityPct: 65, cop: 2.8, tariffPerKwh: 8.6, assetCapex: 142_000_000, startYear: 2026, targetYear: 2030 },
          fuelSwitch: { enabled: true, altFuel: "biogas", blendPct: 50, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 32, retrofitCapex: 22_000_000, startYear: 2026, targetYear: 2029 },
        },
        "png-boiler-2": {
          electrify: { enabled: true, unitsToConvert: 0, capacityPct: 65, cop: 2.8, tariffPerKwh: 8.6, assetCapex: 96_000_000, startYear: 2026, targetYear: 2030 },
          fuelSwitch: { enabled: true, altFuel: "biogas", blendPct: 50, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 32, retrofitCapex: 15_000_000, startYear: 2026, targetYear: 2029 },
        },
      },
      assumptions: { carbonPricePerTonne: 3500 },
    },
  ],

  scope2Scenarios: [
    {
      id: "s2-onsite-first",
      name: "On-site first",
      note: "Maximise rooftop and efficiency before signing any contractual renewables.",
      procurement: { enabled: false, ppaPct: 0, greenTariffPct: 0, recPct: 0 },
    },
    {
      id: "s2-re100-2030",
      name: "RE100 by 2030",
      note: "Rooftop at roof cap plus open-access PPA covering the balance of addressable load.",
      byFacility: {
        "elec-ankleshwar": { generation: { enabled: true, solarKwp: 4600, batteryKwh: 9000, exportMode: "netMetering", solarCapexPerKw: 42_000, batteryCapexPerKwh: 24_000, subsidyPct: 0, startYear: 2026, targetYear: 2028 } },
      },
      procurement: { ppaPct: 55, greenTariffPct: 15, recPct: 25, targetYear: 2030 },
    },
  ],

  esg: {
    water: {
      2024: {
        withdrawalKl: 712_000,
        consumptionKl: 458_000,
        dischargeKl: 254_000,
        withdrawalBySource: { ground: 224_000, thirdParty: 406_000, surface: 62_000, other: 20_000 },
        dischargeByDest: { thirdParty: 206_000, surface: 32_000, other: 16_000 },
      },
      2025: {
        withdrawalKl: 685_000,
        consumptionKl: 445_000,
        dischargeKl: 240_000,
        withdrawalBySource: { ground: 210_000, thirdParty: 395_000, surface: 60_000, other: 20_000 },
        dischargeByDest: { thirdParty: 195_000, surface: 30_000, other: 15_000 },
      },
    },
    waste: {
      2024: {
        generatedT: 3_486, disposedT: 1_642, recoveredT: 1_844,
        byCategory: {
          plastic: { generatedT: 198, disposedT: 46, recoveredT: 152 },
          ewaste: { generatedT: 11, disposedT: 1, recoveredT: 10 },
          biomedical: { generatedT: 17, disposedT: 17, recoveredT: 0 },
          cnd: { generatedT: 312, disposedT: 190, recoveredT: 122 },
          battery: { generatedT: 8, disposedT: 0, recoveredT: 8 },
          radioactive: { generatedT: 0, disposedT: 0, recoveredT: 0 },
          otherHaz: { generatedT: 1_986, disposedT: 1_190, recoveredT: 796 },
          otherNonHaz: { generatedT: 954, disposedT: 198, recoveredT: 756 },
        },
      },
      2025: {
        generatedT: 3_419, disposedT: 1_509, recoveredT: 1_910,
        byCategory: {
          plastic: { generatedT: 210, disposedT: 38, recoveredT: 172 },
          ewaste: { generatedT: 12, disposedT: 1, recoveredT: 11 },
          biomedical: { generatedT: 18, disposedT: 18, recoveredT: 0 },
          cnd: { generatedT: 340, disposedT: 195, recoveredT: 145 },
          battery: { generatedT: 9, disposedT: 0, recoveredT: 9 },
          radioactive: { generatedT: 0, disposedT: 0, recoveredT: 0 },
          otherHaz: { generatedT: 1_850, disposedT: 1_060, recoveredT: 790 },
          otherNonHaz: { generatedT: 980, disposedT: 197, recoveredT: 783 },
        },
      },
    },
  },

  goals: [
    {
      id: "goal-pharma-sbti",
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
        { id: "m-p1", year: 2027, reductionPct: 15 },
        { id: "m-p2", year: 2028, reductionPct: 25 },
        { id: "m-p3", year: 2030, reductionPct: 42 },
      ],
    },
    {
      id: "goal-pharma-re",
      name: "80% renewable electricity by 2030",
      category: "energy",
      templateId: "renewable_pct",
      metric: "renewable_pct",
      direction: "increase",
      scope: "s2",
      baseYear: 2025,
      targetYear: 2030,
      targetPct: 80,
      assignee: "plant",
      milestones: [
        { id: "m-p4", year: 2027, reductionPct: 45 },
        { id: "m-p5", year: 2030, reductionPct: 80 },
      ],
    },
    {
      id: "goal-pharma-water",
      name: "Cut freshwater withdrawal 25% by 2030",
      category: "water",
      templateId: "water_withdrawal",
      metric: "water_withdrawal_kl",
      direction: "reduce",
      scope: "s1s2",
      baseYear: 2025,
      targetYear: 2030,
      targetPct: 25,
      assignee: "plant",
      milestones: [
        { id: "m-p6", year: 2028, reductionPct: 12 },
        { id: "m-p7", year: 2030, reductionPct: 25 },
      ],
    },
  ],
};
