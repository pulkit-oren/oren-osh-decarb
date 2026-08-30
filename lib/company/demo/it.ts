/* ============================================================
   Demo company 3 of 3 - INFORMATION TECHNOLOGY.

   Zenith Digital Services Ltd: an IT services exporter with three
   owned campuses - Bengaluru (Whitefield), a Pune SEZ, and a
   Hyderabad offshore development centre.

   What makes the sector's footprint distinctive, and why this dataset
   looks so different from the other two:
     - Scope 1 is a rounding error. There is no process heat at all;
       combustion is DG backup, a shuttle fleet and food-court LPG.
       Scope 2 is roughly thirty times larger, so the whole
       decarbonisation question is an electricity-procurement question.
     - Refrigerants are nearly half of Scope 1 - 1,734 t against
       2,075 t of combustion in FY2025-26. Centrifugal chillers and
       data-hall precision AC hold a large charge, so fugitive losses
       very nearly outweigh every litre of diesel burned on site. In
       manufacturing the same line is 4% of Scope 1.
     - Contractual renewables do the heavy lifting. Indian IT campuses
       buy open access aggressively, which is why the VPPA and I-REC
       records here are large relative to purchased grid units - and
       why location-based and market-based Scope 2 diverge so sharply.
   ============================================================ */

import type { DemoCompany } from "./types";

export const IT_SERVICES: DemoCompany = {
  slug: "zenith-digital",
  name: "Zenith Digital Services Ltd",
  sector: "Information technology services",
  profile:
    "IT services exporter, ~INR 9,200 cr revenue, ~34,000 seats. Bengaluru campus, Pune SEZ campus, Hyderabad ODC.",

  bus: [
    { name: "Bengaluru Campus", aggregate: true },
    { name: "Pune SEZ Campus", aggregate: true },
    { name: "Hyderabad ODC", aggregate: true },
  ],

  assumptions: {
    gridEf: 0.71,
    renewableSourcingPct: 70,
    recPricePerKwh: 0.45,
    carbonPricePerTonne: 2000,
    infraCapex: 18_000_000,
    discountRatePct: 10,
    maintenanceShareOfSpendPct: 22,
    evMaintenanceRatioPct: 60,
    heatPumpMaintenanceRatioPct: 70,
    fuelEscalationPct: 5,
    elecEscalationPct: 3,
    otherEscalationPct: 0,
  },

  sources: [
    {
      id: "dg-bengaluru",
      name: "DG sets - Bengaluru campus",
      category: "stationary",
      fuelType: "diesel",
      unit: "L",
      bu: "Bengaluru Campus",
      capacityUnit: "kVA",
      volume: [252_000, 268_000],
      opex: [27_700_000, 29_500_000],
      equipment: [
        { id: "dg-bengaluru", name: "DG 2000 kVA (x6)", capacity: 2000, operatingHours: 210, unitCount: 6, remainingLife: 9, endUse: "generator" },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 12, capex: 2_600_000, startYear: 2026, targetYear: 2028 },
        electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 1, tariffPerKwh: 8.4, assetCapex: 0, startYear: 2027, targetYear: 2032 },
        fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 82, retrofitCapex: 1_800_000, startYear: 2026, targetYear: 2029 },
      },
    },
    {
      id: "dg-pune",
      name: "DG sets - Pune SEZ",
      category: "stationary",
      fuelType: "diesel",
      unit: "L",
      bu: "Pune SEZ Campus",
      capacityUnit: "kVA",
      volume: [136_000, 142_000],
      opex: [15_000_000, 15_600_000],
      equipment: [
        { id: "dg-pune", name: "DG 1500 kVA (x4)", capacity: 1500, operatingHours: 190, unitCount: 4, remainingLife: 12, endUse: "generator" },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 12, capex: 1_700_000, startYear: 2026, targetYear: 2028 },
        electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 1, tariffPerKwh: 9.1, assetCapex: 0, startYear: 2027, targetYear: 2032 },
        fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 82, retrofitCapex: 1_200_000, startYear: 2026, targetYear: 2029 },
      },
    },
    {
      id: "dg-hyderabad-odc",
      name: "DG sets - Hyderabad ODC",
      category: "stationary",
      fuelType: "diesel",
      unit: "L",
      bu: "Hyderabad ODC",
      capacityUnit: "kVA",
      volume: [178_000, 186_000],
      opex: [19_600_000, 20_500_000],
      equipment: [
        { id: "dg-hyderabad-odc", name: "DG 1500 kVA (x5)", capacity: 1500, operatingHours: 230, unitCount: 5, remainingLife: 10, endUse: "generator" },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 12, capex: 2_100_000, startYear: 2026, targetYear: 2028 },
        electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 1, tariffPerKwh: 7.9, assetCapex: 0, startYear: 2027, targetYear: 2032 },
        fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 82, retrofitCapex: 1_500_000, startYear: 2026, targetYear: 2029 },
      },
    },
    {
      id: "shuttle-fleet",
      name: "Employee shuttle fleet (diesel)",
      category: "mobile",
      fuelType: "diesel",
      unit: "L",
      bu: "Bengaluru Campus",
      volume: [92_000, 96_000],
      opex: [10_100_000, 10_600_000],
      equipment: [
        { id: "shuttle-fleet", name: "Owned shuttle buses", unitCount: 14, remainingLife: 6, endUse: "bus" },
      ],
      actions: {
        efficiency: { enabled: true, savingPct: 8, capex: 1_200_000, startYear: 2026, targetYear: 2029 },
        electrify: { enabled: true, unitsToConvert: 10, capacityPct: 0, cop: 3, tariffPerKwh: 8.4, assetCapex: 15_000_000, purchaseTiming: "replacement", replacementPremiumPct: 42, startYear: 2027, targetYear: 2032 },
        fuelSwitch: { enabled: true, altFuel: "biodiesel", blendPct: 20, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 82, retrofitCapex: 0, startYear: 2026, targetYear: 2028 },
      },
    },
    {
      id: "exec-cars",
      name: "Executive cars (petrol)",
      category: "mobile",
      fuelType: "petrol",
      unit: "L",
      bu: "Bengaluru Campus",
      volume: [71_000, 74_000],
      opex: [8_100_000, 8_500_000],
      equipment: [
        { id: "exec-cars", name: "Company cars", unitCount: 22, remainingLife: 4, endUse: "car" },
      ],
      actions: {
        efficiency: { enabled: false, savingPct: 0, capex: 0, startYear: 2026, targetYear: 2030 },
        electrify: { enabled: true, unitsToConvert: 18, capacityPct: 0, cop: 3.5, tariffPerKwh: 8.4, assetCapex: 1_800_000, purchaseTiming: "replacement", replacementPremiumPct: 35, startYear: 2026, targetYear: 2029 },
        fuelSwitch: { enabled: false, altFuel: "ethanol", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 70, retrofitCapex: 0, startYear: 2028, targetYear: 2032 },
        flexFuel: { enabled: true, unitsToConvert: 4, altFuel: "ethanol", highBlendPct: 85, vehicleCapex: 320_000, startYear: 2027, targetYear: 2030 },
      },
    },
    {
      id: "lpg-foodcourt",
      name: "LPG - food courts",
      category: "stationary",
      fuelType: "lpg",
      unit: "L",
      bu: "Bengaluru Campus",
      volume: [88_000, 92_000],
      opex: [5_400_000, 5_700_000],
      equipment: [
        { id: "lpg-foodcourt", name: "Campus food-court kitchens", unitCount: 1, remainingLife: 7, endUse: "cooking", dutyTempC: 200 },
      ],
      actions: {
        efficiency: { enabled: false, savingPct: 0, capex: 0, startYear: 2026, targetYear: 2030 },
        electrify: { enabled: true, unitsToConvert: 0, capacityPct: 75, cop: 1.8, tariffPerKwh: 8.4, assetCapex: 8_500_000, startYear: 2026, targetYear: 2030 },
        fuelSwitch: { enabled: false, altFuel: "bioCng", blendPct: 0, efficiencyPenaltyPct: 2, altFuelPricePerUnit: 92, retrofitCapex: 0, startYear: 2028, targetYear: 2032 },
      },
    },
  ],

  systems: [
    {
      id: "chillers-bengaluru",
      name: "Centrifugal chillers - Bengaluru",
      systemType: "commercialHVAC",
      refrigerant: "R134a",
      bu: "Bengaluru Campus",
      toppedUpKg: [402, 385],
      chargeKg: 4400,
      gasCostPerKg: 1150,
      actions: {
        gasSwitch: { enabled: true, transitionPct: 60, altRefrigerant: "R1234ze", retrofitCapex: 28_000_000, startYear: 2027, targetYear: 2032 },
        leakFix: { enabled: true, leakImprovementPct: 50, capex: 3_400_000, startYear: 2026, targetYear: 2028 },
      },
    },
    {
      id: "vrf-pune-campus",
      name: "VRF and ducted splits - Pune",
      systemType: "commercialHVAC",
      refrigerant: "R410A",
      bu: "Pune SEZ Campus",
      toppedUpKg: [308, 295],
      chargeKg: 3400,
      gasCostPerKg: 1200,
      actions: {
        gasSwitch: { enabled: true, transitionPct: 65, altRefrigerant: "R454B", retrofitCapex: 14_500_000, startYear: 2026, targetYear: 2031 },
        leakFix: { enabled: true, leakImprovementPct: 45, capex: 2_200_000, startYear: 2026, targetYear: 2028 },
      },
    },
    {
      id: "pac-data-halls",
      name: "Precision AC - data halls",
      systemType: "commercialHVAC",
      refrigerant: "R407C",
      bu: "Hyderabad ODC",
      toppedUpKg: [176, 168],
      chargeKg: 1850,
      gasCostPerKg: 900,
      actions: {
        gasSwitch: { enabled: true, transitionPct: 70, altRefrigerant: "R32", retrofitCapex: 9_800_000, startYear: 2026, targetYear: 2030 },
        leakFix: { enabled: true, leakImprovementPct: 55, capex: 1_800_000, startYear: 2026, targetYear: 2028 },
      },
    },
    {
      id: "chillers-hyderabad-odc",
      name: "Chillers - Hyderabad ODC",
      systemType: "commercialHVAC",
      refrigerant: "R134a",
      bu: "Hyderabad ODC",
      toppedUpKg: [252, 240],
      chargeKg: 2800,
      gasCostPerKg: 1150,
      actions: {
        gasSwitch: { enabled: true, transitionPct: 55, altRefrigerant: "R1234ze", retrofitCapex: 17_000_000, startYear: 2028, targetYear: 2032 },
        leakFix: { enabled: true, leakImprovementPct: 50, capex: 2_100_000, startYear: 2026, targetYear: 2029 },
      },
    },
  ],

  facilities: [
    {
      id: "elec-bengaluru",
      name: "Purchased electricity",
      bu: "Bengaluru Campus",
      kwh: [74_000_000, 78_000_000],
      tariffPerKwh: 8.4,
      gridEf: 0.71,
      roofSpaceM2: 34_000,
      peakLoadKw: 14_500,
      irradiance: 1500,
      demandChargePerKvaMonth: 390,
      loadSplit: { lightingPct: 18, motorPct: 14, hvacPct: 55 },
      facilityType: "office",
      existingSolarKwp: 2500,
      actions: {
        efficiency: { enabled: true, ledPct: 100, motorPct: 45, bmsPct: 95, ledCapex: 14_000_000, motorCapex: 18_000_000, bmsCapex: 32_000_000, startYear: 2026, targetYear: 2029 },
        generation: { enabled: true, solarKwp: 3400, batteryKwh: 8000, exportMode: "netMetering", peakShavingKw: 1_800, solarCapexPerKw: 44_000, batteryCapexPerKwh: 25_000, subsidyPct: 0, startYear: 2026, targetYear: 2030 },
      },
    },
    {
      id: "solar-bengaluru",
      name: "Solar onsite",
      bu: "Bengaluru Campus",
      kwh: [5_100_000, 5_600_000],
      tariffPerKwh: 3.5,
      gridEf: 0,
      roofSpaceM2: 0,
      peakLoadKw: 0,
      irradiance: 1500,
      loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
    },
    {
      id: "vppa-bengaluru",
      name: "Virtual PPA",
      bu: "Bengaluru Campus",
      kwh: [36_000_000, 42_000_000],
      tariffPerKwh: 4.2,
      gridEf: 0,
      roofSpaceM2: 0,
      peakLoadKw: 0,
      irradiance: 1500,
      loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
    },
    {
      id: "elec-pune-sez",
      name: "Purchased electricity",
      bu: "Pune SEZ Campus",
      kwh: [39_800_000, 41_500_000],
      tariffPerKwh: 9.1,
      gridEf: 0.71,
      roofSpaceM2: 18_000,
      peakLoadKw: 7800,
      irradiance: 1550,
      loadSplit: { lightingPct: 20, motorPct: 12, hvacPct: 52 },
      facilityType: "office",
      existingSolarKwp: 900,
      actions: {
        efficiency: { enabled: true, ledPct: 100, motorPct: 40, bmsPct: 85, ledCapex: 7_600_000, motorCapex: 9_500_000, bmsCapex: 17_000_000, startYear: 2026, targetYear: 2029 },
        generation: { enabled: true, solarKwp: 2200, batteryKwh: 4000, exportMode: "netMetering", solarCapexPerKw: 45_000, batteryCapexPerKwh: 25_000, subsidyPct: 0, startYear: 2026, targetYear: 2030 },
      },
    },
    {
      id: "solar-pune-sez",
      name: "Solar onsite",
      bu: "Pune SEZ Campus",
      kwh: [1_850_000, 2_100_000],
      tariffPerKwh: 3.4,
      gridEf: 0,
      roofSpaceM2: 0,
      peakLoadKw: 0,
      irradiance: 1550,
      loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
    },
    {
      id: "vppa-pune-sez",
      name: "Virtual PPA",
      bu: "Pune SEZ Campus",
      kwh: [14_000_000, 18_000_000],
      tariffPerKwh: 4.4,
      gridEf: 0,
      roofSpaceM2: 0,
      peakLoadKw: 0,
      irradiance: 1550,
      loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
    },
    {
      id: "elec-hyderabad-odc",
      name: "Purchased electricity",
      bu: "Hyderabad ODC",
      kwh: [51_000_000, 54_000_000],
      tariffPerKwh: 7.9,
      gridEf: 0.71,
      roofSpaceM2: 22_000,
      peakLoadKw: 9800,
      irradiance: 1600,
      loadSplit: { lightingPct: 14, motorPct: 12, hvacPct: 62 },
      facilityType: "office",
      existingSolarKwp: 600,
      actions: {
        efficiency: { enabled: true, ledPct: 100, motorPct: 35, bmsPct: 90, ledCapex: 9_800_000, motorCapex: 11_000_000, bmsCapex: 24_000_000, startYear: 2026, targetYear: 2029 },
        generation: { enabled: true, solarKwp: 3000, batteryKwh: 6000, exportMode: "netMetering", solarCapexPerKw: 43_000, batteryCapexPerKwh: 25_000, subsidyPct: 0, startYear: 2026, targetYear: 2030 },
      },
    },
    {
      id: "solar-hyderabad-odc",
      name: "Solar onsite",
      bu: "Hyderabad ODC",
      kwh: [1_200_000, 1_400_000],
      tariffPerKwh: 3.3,
      gridEf: 0,
      roofSpaceM2: 0,
      peakLoadKw: 0,
      irradiance: 1600,
      loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
    },
    {
      id: "irec-hyderabad-odc",
      name: "I-REC",
      bu: "Hyderabad ODC",
      kwh: [16_000_000, 20_000_000],
      tariffPerKwh: 0.45,
      gridEf: 0,
      roofSpaceM2: 0,
      peakLoadKw: 0,
      irradiance: 1600,
      loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
    },
  ],

  procurement: {
    enabled: true,
    ppaPct: 55,
    greenTariffPct: 10,
    recPct: 20,
    contractWindPct: 25,
    ppaStrikeDeltaPerKwh: -1.4,
    greenTariffPremiumPerKwh: 0.6,
    recPricePerKwh: 0.45,
    re100Exclusion: false,
    // Karnataka / Telangana campuses. IT parks often negotiate a lighter
    // stack than heavy industry, and banking matters more to a 24x7 load.
    openAccessCharges: {
      crossSubsidySurchargePerKwh: 0.85,
      additionalSurchargePerKwh: 0.15,
      wheelingChargePerKwh: 0.4,
      bankingLossPct: 4,
    },
    startYear: 2026,
    targetYear: 2029,
  },

  scope1Scenarios: [
    {
      id: "s1-refrigerant-first",
      name: "Refrigerant-first",
      note: "Fugitive gas is the largest Scope 1 line here, so this pulls every chiller swap forward and drops the fleet capex.",
      byAsset: {
        "shuttle-fleet": { electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 3, tariffPerKwh: 8.4, assetCapex: 0, startYear: 2027, targetYear: 2032 } },
        "exec-cars": { electrify: { enabled: false, unitsToConvert: 0, capacityPct: 0, cop: 3.5, tariffPerKwh: 8.4, assetCapex: 0, startYear: 2026, targetYear: 2029 } },
      },
      bySystem: {
        "chillers-bengaluru": { gasSwitch: { enabled: true, transitionPct: 90, altRefrigerant: "R1234ze", retrofitCapex: 38_000_000, startYear: 2026, targetYear: 2029 } },
        "chillers-hyderabad-odc": { gasSwitch: { enabled: true, transitionPct: 90, altRefrigerant: "R1234ze", retrofitCapex: 24_000_000, startYear: 2026, targetYear: 2029 } },
      },
    },
    {
      id: "s1-full-fleet-ev",
      name: "Full fleet electrification",
      note: "Every shuttle and car converted by 2029, funded ahead of the chiller programme.",
      byAsset: {
        "shuttle-fleet": { electrify: { enabled: true, unitsToConvert: 14, capacityPct: 0, cop: 3, tariffPerKwh: 8.4, assetCapex: 15_000_000, purchaseTiming: "replacement", replacementPremiumPct: 42, startYear: 2026, targetYear: 2029 } },
        "exec-cars": { electrify: { enabled: true, unitsToConvert: 22, capacityPct: 0, cop: 3.5, tariffPerKwh: 8.4, assetCapex: 1_800_000, purchaseTiming: "replacement", replacementPremiumPct: 35, startYear: 2026, targetYear: 2028 } },
      },
    },
  ],

  scope2Scenarios: [
    {
      id: "s2-contract-only",
      name: "Contractual only",
      note: "No new rooftop or efficiency capex - the RE100 claim rides entirely on PPAs and I-RECs.",
      byFacility: {
        "elec-bengaluru": { generation: { enabled: false, solarKwp: 0, batteryKwh: 0, exportMode: "netMetering", solarCapexPerKw: 44_000, batteryCapexPerKwh: 25_000, subsidyPct: 0, startYear: 2026, targetYear: 2030 } },
        "elec-pune-sez": { generation: { enabled: false, solarKwp: 0, batteryKwh: 0, exportMode: "netMetering", solarCapexPerKw: 45_000, batteryCapexPerKwh: 25_000, subsidyPct: 0, startYear: 2026, targetYear: 2030 } },
        "elec-hyderabad-odc": { generation: { enabled: false, solarKwp: 0, batteryKwh: 0, exportMode: "netMetering", solarCapexPerKw: 43_000, batteryCapexPerKwh: 25_000, subsidyPct: 0, startYear: 2026, targetYear: 2030 } },
      },
      procurement: { ppaPct: 75, greenTariffPct: 10, recPct: 15, targetYear: 2028 },
    },
    {
      id: "s2-re100-2028",
      name: "RE100 by 2028",
      note: "Efficiency plus rooftop at cap, with PPAs closing the gap two years earlier than the base plan.",
      procurement: { ppaPct: 70, greenTariffPct: 12, recPct: 18, targetYear: 2028 },
    },
  ],

  esg: {
    water: {
      2024: {
        withdrawalKl: 404_000,
        consumptionKl: 148_000,
        dischargeKl: 256_000,
        withdrawalBySource: { thirdParty: 338_000, ground: 52_000, other: 14_000 },
        dischargeByDest: { thirdParty: 204_000, ground: 38_000, other: 14_000 },
      },
      2025: {
        withdrawalKl: 420_000,
        consumptionKl: 152_000,
        dischargeKl: 268_000,
        withdrawalBySource: { thirdParty: 352_000, ground: 54_000, other: 14_000 },
        dischargeByDest: { thirdParty: 214_000, ground: 40_000, other: 14_000 },
      },
    },
    waste: {
      2024: {
        generatedT: 1_546, disposedT: 402, recoveredT: 1_144,
        byCategory: {
          plastic: { generatedT: 139, disposedT: 44, recoveredT: 95 },
          ewaste: { generatedT: 82, disposedT: 4, recoveredT: 78 },
          biomedical: { generatedT: 4, disposedT: 4, recoveredT: 0 },
          cnd: { generatedT: 196, disposedT: 128, recoveredT: 68 },
          battery: { generatedT: 34, disposedT: 0, recoveredT: 34 },
          radioactive: { generatedT: 0, disposedT: 0, recoveredT: 0 },
          otherHaz: { generatedT: 20, disposedT: 12, recoveredT: 8 },
          otherNonHaz: { generatedT: 1_071, disposedT: 210, recoveredT: 861 },
        },
      },
      2025: {
        generatedT: 1_638, disposedT: 378, recoveredT: 1_260,
        byCategory: {
          plastic: { generatedT: 148, disposedT: 38, recoveredT: 110 },
          ewaste: { generatedT: 96, disposedT: 3, recoveredT: 93 },
          biomedical: { generatedT: 4, disposedT: 4, recoveredT: 0 },
          cnd: { generatedT: 180, disposedT: 118, recoveredT: 62 },
          battery: { generatedT: 38, disposedT: 0, recoveredT: 38 },
          radioactive: { generatedT: 0, disposedT: 0, recoveredT: 0 },
          otherHaz: { generatedT: 22, disposedT: 13, recoveredT: 9 },
          otherNonHaz: { generatedT: 1_150, disposedT: 202, recoveredT: 948 },
        },
      },
    },
  },

  goals: [
    {
      id: "goal-it-re100",
      name: "RE100 - 100% renewable electricity by 2030",
      category: "energy",
      templateId: "re100",
      metric: "renewable_pct",
      direction: "increase",
      scope: "s2",
      baseYear: 2025,
      targetYear: 2030,
      targetPct: 100,
      assignee: "esg",
      milestones: [
        { id: "m-i1", year: 2027, reductionPct: 75 },
        { id: "m-i2", year: 2028, reductionPct: 90 },
        { id: "m-i3", year: 2030, reductionPct: 100 },
      ],
    },
    {
      id: "goal-it-netzero",
      name: "Net zero Scope 1+2 by 2040",
      category: "emissions",
      templateId: "netzero",
      metric: "emissions_t",
      direction: "reduce",
      scope: "s1s2",
      baseYear: 2025,
      targetYear: 2040,
      targetPct: 90,
      residualPct: 10,
      assignee: "ceo",
      milestones: [
        { id: "m-i4", year: 2030, reductionPct: 55 },
        { id: "m-i5", year: 2035, reductionPct: 75 },
        { id: "m-i6", year: 2040, reductionPct: 90 },
      ],
    },
    {
      id: "goal-it-ewaste",
      name: "100% e-waste recovery by 2028",
      category: "waste",
      templateId: "waste_recovery",
      metric: "waste_diversion_pct",
      direction: "increase",
      scope: "s1s2",
      baseYear: 2025,
      targetYear: 2028,
      targetPct: 95,
      assignee: "plant",
      milestones: [
        { id: "m-i7", year: 2027, reductionPct: 88 },
        { id: "m-i8", year: 2028, reductionPct: 95 },
      ],
    },
  ],
};
