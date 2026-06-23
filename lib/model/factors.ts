/* ============================================================
   Emission-factor library — sourced from
   "Scope 1_GHG emission factors.xlsx" (Emission Factor 2025 sheet),
   DEFRA columns 2022–2025. Refrigerant GWPs are AR5 100-yr.
   Values are data, not code — swap a number and the engine
   re-derives. See spec §5.
   ============================================================ */

import type {
  AltFuelFactor,
  AltFuelId,
  FuelFactor,
  FuelId,
  RefrigerantFactor,
  RefrigerantId,
  RefrigerationSystem,
} from "./types";

/** Latest DEFRA year we hold factors for. */
export const LATEST_DEFRA_YEAR = 2025;
/** DEFRA years present in the workbook. */
export const DEFRA_YEARS = [2022, 2023, 2024, 2025];

export const FUELS: Record<FuelId, FuelFactor> = {
  /* ---- Liquid fossil fuels — workbook "Fuels - Liquid" (DEFRA 2022–2025, kgCO2e per litre) ---- */
  diesel: {
    id: "diesel", label: "Diesel", unit: "L", densityKgPerUnit: 0.830565, cvKJperKg: 42839,
    renewable: false, efSource: "DEFRA", excelCategory: "liquid",
    co2eFactor: 2.57082, co2eByYear: { 2022: 2.56, 2023: 2.51, 2024: 2.51279, 2025: 2.57082 },
    typicalPricePerUnit: 92,
  },
  petrol: {
    id: "petrol", label: "Petrol", unit: "L", densityKgPerUnit: 0.746204, cvKJperKg: 43061,
    renewable: false, efSource: "DEFRA", excelCategory: "liquid",
    co2eFactor: 2.06916, co2eByYear: { 2022: 2.16, 2023: 2.1, 2024: 2.0844, 2025: 2.06916 },
    typicalPricePerUnit: 105,
  },
  fuelOil: {
    id: "fuelOil", label: "Fuel Oil / Furnace Oil", unit: "L", densityKgPerUnit: 0.983284, cvKJperKg: 40752,
    renewable: false, efSource: "DEFRA", excelCategory: "liquid",
    co2eFactor: 3.17492, co2eByYear: { 2022: 3.18, 2023: 3.17, 2024: 3.17493, 2025: 3.17492 },
    typicalPricePerUnit: 62,
  },
  kerosene: {
    id: "kerosene", label: "Kerosene / Burning Oil", unit: "L", densityKgPerUnit: 0.802568, cvKJperKg: 43865,
    renewable: false, efSource: "DEFRA", excelCategory: "liquid",
    co2eFactor: 2.54016, co2eByYear: { 2022: 2.54, 2023: 2.54, 2024: 2.54015, 2025: 2.54016 },
    typicalPricePerUnit: 78,
  },
  lubricants: {
    id: "lubricants", label: "Lubricants", unit: "L", densityKgPerUnit: 0.864304, cvKJperKg: 40752,
    renewable: false, efSource: "DEFRA", excelCategory: "liquid",
    co2eFactor: 2.74934, co2eByYear: { 2022: 2.75, 2023: 2.75, 2024: 2.74934, 2025: 2.74934 },
    typicalPricePerUnit: 62,
  },
  residualFuelOil: {
    id: "residualFuelOil", label: "Residual Fuel Oil", unit: "L", densityKgPerUnit: 0.983284, cvKJperKg: 40752,
    renewable: false, efSource: "DEFRA", excelCategory: "liquid",
    co2eFactor: 3.17492, co2eByYear: { 2022: 3.18, 2023: 3.17, 2024: 3.17493, 2025: 3.17492 },
    typicalPricePerUnit: 62,
  },
  marineHfoVlsfo: {
    id: "marineHfoVlsfo", label: "Marine Heavy Fuel Oil (VLSFO)", unit: "L",
    renewable: false, efSource: "DEFRA", excelCategory: "liquid",
    co2eFactor: 3.10202, co2eByYear: { 2022: 3.11, 2023: 3.1, 2024: 3.10202, 2025: 3.10202 },
    typicalPricePerUnit: 62,
  },
  marineHfoHsfo: {
    id: "marineHfoHsfo", label: "Marine Heavy Fuel Oil (HSFO)", unit: "L",
    renewable: false, efSource: "IMO", excelCategory: "liquid",
    co2eFactor: 3.1251428, co2eByYear: {},
    typicalPricePerUnit: 60,
  },
  marineLfoUlsfo: {
    id: "marineLfoUlsfo", label: "Marine Light Fuel Oil (ULSFO)", unit: "L",
    renewable: false, efSource: "IMO", excelCategory: "liquid",
    co2eFactor: 2.9952936, co2eByYear: {},
    typicalPricePerUnit: 62,
  },
  marineLfoVlsfo: {
    id: "marineLfoVlsfo", label: "Marine Light Fuel Oil (VLSFO)", unit: "L",
    renewable: false, efSource: "IMO", excelCategory: "liquid",
    co2eFactor: 2.9952936, co2eByYear: {},
    typicalPricePerUnit: 62,
  },
  marineGasOil: {
    id: "marineGasOil", label: "Marine Gas Oil (ULSGO)", unit: "L",
    renewable: false, efSource: "DEFRA", excelCategory: "liquid",
    co2eFactor: 2.77139, co2eByYear: { 2022: 2.78, 2023: 2.77, 2024: 2.77139, 2025: 2.77139 },
    typicalPricePerUnit: 62,
  },
  jetFuel: {
    id: "jetFuel", label: "Jet Fuel (Aviation Turbine Fuel)", unit: "L", densityKgPerUnit: 0.800, cvKJperKg: 43905,
    renewable: false, efSource: "DEFRA", excelCategory: "liquid",
    co2eFactor: 2.54269, co2eByYear: { 2022: 2.55, 2023: 2.54, 2024: 2.54269, 2025: 2.54269 },
    typicalPricePerUnit: 80,
  },
  aviationGasoline: {
    id: "aviationGasoline", label: "Aviation Gasoline (Aviation Spirit)", unit: "L", densityKgPerUnit: 0.729927, cvKJperKg: 44797,
    renewable: false, efSource: "DEFRA", excelCategory: "liquid",
    co2eFactor: 2.33116, co2eByYear: { 2022: 2.33, 2023: 2.33, 2024: 2.33116, 2025: 2.33116 },
    typicalPricePerUnit: 80,
  },
  biodiesel: {
    id: "biodiesel", label: "Biodiesel", unit: "t",
    renewable: true, efSource: "IPCC", excelCategory: "liquid",
    co2eFactor: 1924.62, co2eByYear: {},
    typicalPricePerUnit: 78000,
  },

  /* ---- App-only liquid fuels (no Excel row — not shown in Activity tab) ---- */
  ldo: {
    id: "ldo", label: "Light diesel oil (LDO)", unit: "L", densityKgPerUnit: 0.86, cvKJperKg: 42000, renewable: false, efSource: "DEFRA",
    co2eFactor: 2.7595, co2eByYear: { 2022: 2.7595, 2023: 2.7595, 2024: 2.7595, 2025: 2.7595 }, typicalPricePerUnit: 85,
  },
  naphtha: {
    id: "naphtha", label: "Naphtha", unit: "kg", densityKgPerUnit: 1, cvKJperKg: 44500, renewable: false, efSource: "DEFRA",
    co2eFactor: 3.1313, co2eByYear: { 2022: 3.1313, 2023: 3.1313, 2024: 3.1313, 2025: 3.1313 }, typicalPricePerUnit: 70,
  },

  /* ---- Gaseous fuels — workbook "Fuels - Gas" ---- */
  lpg: {
    id: "lpg", label: "Liquefied Petroleum Gases (LPG)", unit: "L", densityKgPerUnit: 0.529749, cvKJperKg: 45944,
    renewable: false, efSource: "DEFRA", excelCategory: "gas",
    co2eFactor: 1.55713, co2eByYear: { 2022: 1.56, 2023: 1.56, 2024: 1.55713, 2025: 1.55713 },
    typicalPricePerUnit: 58,
  },
  propane: {
    id: "propane", label: "Propane", unit: "kg", densityKgPerUnit: 1, cvKJperKg: 46300,
    renewable: false, efSource: "DEFRA", excelCategory: "gas",
    co2eFactor: 2.99711, co2eByYear: { 2022: 2.99711, 2023: 2.99711, 2024: 2.99711, 2025: 2.99711 },
    typicalPricePerUnit: 80,
  },
  butane: {
    id: "butane", label: "Butane", unit: "kg", densityKgPerUnit: 1, cvKJperKg: 45750,
    renewable: false, efSource: "DEFRA", excelCategory: "gas",
    co2eFactor: 3.03307, co2eByYear: { 2022: 3.03307, 2023: 3.03307, 2024: 3.03307, 2025: 3.03307 },
    typicalPricePerUnit: 80,
  },
  cng: {
    id: "cng", label: "Compressed Natural Gas (CNG) - KG", unit: "kg", densityKgPerUnit: 1, cvKJperKg: 45745,
    renewable: false, efSource: "DEFRA", excelCategory: "gas",
    co2eFactor: 2.69952, co2eByYear: { 2022: 2.69952, 2023: 2.69952, 2024: 2.69952, 2025: 2.69952 },
    typicalPricePerUnit: 88,
  },
  png: {
    id: "png", label: "Piped Natural Gas (PNG)", unit: "m3", densityKgPerUnit: 0.802, cvKJperKg: 45745,
    renewable: false, efSource: "DEFRA", excelCategory: "gas",
    co2eFactor: 2.06672, co2eByYear: { 2022: 2.02, 2023: 2.04, 2024: 2.04542, 2025: 2.06672 },
    typicalPricePerUnit: 50,
  },
  lng: {
    id: "lng", label: "Liquefied Natural Gas (LNG)", unit: "L", densityKgPerUnit: 0.452489, cvKJperKg: 45745,
    renewable: false, efSource: "DEFRA", excelCategory: "gas",
    co2eFactor: 1.17797, co2eByYear: { 2022: 1.56, 2023: 1.17, 2024: 1.17216, 2025: 1.17797 },
    typicalPricePerUnit: 62,
  },
  cngScm: {
    id: "cngScm", label: "Compressed Natural Gas (CNG) - SCM", unit: "m3", densityKgPerUnit: 175, cvKJperKg: 45745,
    renewable: false, efSource: "DEFRA", excelCategory: "gas",
    co2eFactor: 0.4507, co2eByYear: { 2022: 0.44, 2023: 0.45, 2024: 0.44942, 2025: 0.4507 },
    typicalPricePerUnit: 50,
  },
  biogas: {
    id: "biogas", label: "Biogas", unit: "m3", densityKgPerUnit: 1.15, cvKJperKg: 20000,
    renewable: true, efSource: "DEFRA", excelCategory: "gas",
    co2eFactor: 0.02262, co2eByYear: { 2022: 0.02262, 2023: 0.02262, 2024: 0.02262, 2025: 0.02262 },
    biogenicCO2ePerUnit: 1.1908, typicalPricePerUnit: 25,
  },
  landfillGas: {
    id: "landfillGas", label: "Landfill gas", unit: "t",
    renewable: true, efSource: "DEFRA", excelCategory: "gas",
    co2eFactor: 0.69696, co2eByYear: { 2025: 0.69696 },
    typicalPricePerUnit: 25,
  },

  /* ---- App-only gaseous fuels ---- */
  bioCng: {
    id: "bioCng", label: "Bio-CNG (compressed biogas)", unit: "kg", densityKgPerUnit: 1, cvKJperKg: 48000, renewable: true, efSource: "DEFRA",
    co2eFactor: 0.1209, co2eByYear: { 2022: 0.1209, 2023: 0.1209, 2024: 0.1209, 2025: 0.1209 },
    biogenicCO2ePerUnit: 2.6086, typicalPricePerUnit: 75,
  },

  /* ---- Solid fuels — workbook "Fuels - Solid" (kgCO2e per tonne unless noted) ---- */
  coal: {
    id: "coal", label: "Coal (Industrial)", unit: "t", cvKJperKg: 25405,
    renewable: false, efSource: "DEFRA", excelCategory: "solid",
    co2eFactor: 2395.28994, co2eByYear: { 2022: 2411.43, 2023: 2396.48, 2024: 2399.43994, 2025: 2395.28994 },
    typicalPricePerUnit: 6000,
  },
  cokingCoal: {
    id: "cokingCoal", label: "Coal - Coking", unit: "t", cvKJperKg: 30240,
    renewable: false, efSource: "DEFRA", excelCategory: "solid",
    co2eFactor: 3164.65002, co2eByYear: { 2022: 3165.24, 2023: 3164.65, 2024: 3164.65002, 2025: 3164.65002 },
    typicalPricePerUnit: 20000,
  },
  lignite: {
    id: "lignite", label: "Coal - Lignite", unit: "t",
    renewable: false, efSource: "IPCC", excelCategory: "solid",
    co2eFactor: 1210.72, co2eByYear: {},
    typicalPricePerUnit: 3200,
  },
  petcoke: {
    id: "petcoke", label: "Petroleum Coke", unit: "t", cvKJperKg: 33972,
    renewable: false, efSource: "DEFRA", excelCategory: "solid",
    co2eFactor: 3386.57168, co2eByYear: { 2022: 3386.87, 2023: 3386.57, 2024: 3386.57168, 2025: 3386.57168 },
    typicalPricePerUnit: 14000,
  },
  coalAnthracite: {
    id: "coalAnthracite", label: "Coal - Anthracite", unit: "t",
    renewable: false, efSource: "IPCC", excelCategory: "solid",
    co2eFactor: 2643.09, co2eByYear: {},
    typicalPricePerUnit: 6000,
  },
  coalBituminous: {
    id: "coalBituminous", label: "Coal - Bituminous", unit: "t",
    renewable: false, efSource: "IPCC", excelCategory: "solid",
    co2eFactor: 2458.88, co2eByYear: {},
    typicalPricePerUnit: 6000,
  },
  coalBriquettes: {
    id: "coalBriquettes", label: "Coal - Briquettes", unit: "t",
    renewable: false, efSource: "IPCC", excelCategory: "solid",
    co2eFactor: 2032.32, co2eByYear: {},
    typicalPricePerUnit: 6000,
  },
  coalElectricity: {
    id: "coalElectricity", label: "Coal (Electricity Generation)", unit: "t", cvKJperKg: 23826,
    renewable: false, efSource: "DEFRA", excelCategory: "solid",
    co2eFactor: 2225.22448, co2eByYear: { 2022: 2270.45, 2023: 2199.33, 2024: 2262.11448, 2025: 2225.22448 },
    typicalPricePerUnit: 6000,
  },
  woodPellets: {
    id: "woodPellets", label: "Wood Pellets", unit: "t", densityKgPerUnit: 650, cvKJperKg: 17280,
    renewable: true, efSource: "DEFRA", excelCategory: "solid",
    co2eFactor: 55.19389, co2eByYear: { 2022: 50.55459, 2023: 51.56192, 2024: 54.33654, 2025: 55.19389 },
    typicalPricePerUnit: 8000,
  },
  woodChips: {
    id: "woodChips", label: "Wood Chips", unit: "t", densityKgPerUnit: 253, cvKJperKg: 13600,
    renewable: true, efSource: "DEFRA", excelCategory: "solid",
    co2eFactor: 43.43964, co2eByYear: { 2022: 39.78833, 2023: 40.58114, 2024: 42.76487, 2025: 43.43964 },
    typicalPricePerUnit: 5000,
  },
  woodLogs: {
    id: "woodLogs", label: "Wood Logs", unit: "t", densityKgPerUnit: 425, cvKJperKg: 14710,
    renewable: true, efSource: "DEFRA", excelCategory: "solid",
    co2eFactor: 46.98508, co2eByYear: { 2022: 43.03576, 2023: 43.89327, 2024: 46.25524, 2025: 46.98508 },
    typicalPricePerUnit: 5000,
  },
  bioBriquettes: {
    id: "bioBriquettes", label: "Bio Briquettes", unit: "t", cvKJperKg: 16200,
    renewable: true, efSource: "DEFRA", excelCategory: "liquid",
    co2eFactor: 28.0, co2eByYear: { 2022: 28.0, 2023: 28.0, 2024: 28.0, 2025: 28.0 },
    biogenicCO2ePerUnit: 1560.0, typicalPricePerUnit: 8000,
  },

  /* ---- App-only solid / biomass fuels ---- */
  biomass: {
    id: "biomass", label: "Biomass (wood / agro-residue)", unit: "t", densityKgPerUnit: 1000, cvKJperKg: 15000, renewable: true, efSource: "DEFRA",
    co2eFactor: 32.0, co2eByYear: { 2022: 32.0, 2023: 32.0, 2024: 32.0, 2025: 32.0 },
    biogenicCO2ePerUnit: 1450.0, typicalPricePerUnit: 5000,
  },
  bagasse: {
    id: "bagasse", label: "Bagasse (sugarcane)", unit: "t", densityKgPerUnit: 1000, cvKJperKg: 9600, renewable: true, efSource: "DEFRA",
    co2eFactor: 24.0, co2eByYear: { 2022: 24.0, 2023: 24.0, 2024: 24.0, 2025: 24.0 },
    biogenicCO2ePerUnit: 950.0, typicalPricePerUnit: 2800,
  },
  riceHusk: {
    id: "riceHusk", label: "Rice husk", unit: "t", densityKgPerUnit: 1000, cvKJperKg: 13200, renewable: true, efSource: "DEFRA",
    co2eFactor: 35.0, co2eByYear: { 2022: 35.0, 2023: 35.0, 2024: 35.0, 2025: 35.0 },
    biogenicCO2ePerUnit: 1380.0, typicalPricePerUnit: 4000,
  },
};

export const ALT_FUELS: Record<AltFuelId, AltFuelFactor> = {
  // Mostly-biogenic combustion: only the CH4/N2O + non-bio remainder counts to Scope 1.
  // `maxBlendPct` is the share usable in EXISTING equipment without modification.
  biodiesel: {
    id: "biodiesel", label: "Biodiesel", unit: "L", densityKgPerUnit: 0.89, cvKJperKg: 37200, co2eTotalPerUnit: 2.50, biogenicFraction: 0.93,
    maxBlendPct: 20, stationaryMaxBlendPct: 100,
    blendNote: "Vehicle engines run up to ~B20; boilers/burners take much more with a burner retrofit.",
  },
  ethanol: {
    id: "ethanol", label: "Ethanol", unit: "L", densityKgPerUnit: 0.789, cvKJperKg: 26800, co2eTotalPerUnit: 1.51, biogenicFraction: 0.95,
    maxBlendPct: 20, blendNote: "Existing petrol vehicles run up to E20. E85/E100 needs flex-fuel vehicles (a vehicle switch, not a blend).",
  },
  biogas: {
    id: "biogas", label: "Biogas (biomethane)", unit: "m3", densityKgPerUnit: 1.15, cvKJperKg: 20000, co2eTotalPerUnit: 1.24, biogenicFraction: 0.98,
    maxBlendPct: 100, blendNote: "Upgraded biomethane is a drop-in for natural-gas (PNG) equipment.",
  },
  bioCng: {
    id: "bioCng", label: "Bio-CNG (CBG)", unit: "kg", densityKgPerUnit: 1, cvKJperKg: 48000, co2eTotalPerUnit: 2.75, biogenicFraction: 0.96,
    maxBlendPct: 100, blendNote: "Compressed bio-gas (CBG, SATAT) is a drop-in for existing CNG vehicles.",
  },
  biomass: {
    id: "biomass", label: "Biomass (co-firing)", unit: "t", densityKgPerUnit: 1000, cvKJperKg: 15000, co2eTotalPerUnit: 1482, biogenicFraction: 0.978,
    maxBlendPct: 50, stationaryMaxBlendPct: 50,
    blendNote: "Co-firing biomass in a coal/solid-fuel boiler — typically ~10–20% as-is, higher with mill/burner upgrades.",
  },
};

/** Which low-carbon fuel can be blended into each fossil fuel — matched to the
 *  engine/burner. Liquid → biodiesel, petrol → ethanol, gas → biomethane/bio-CNG,
 *  solid (coal etc.) → biomass co-firing. Fuels not listed have no drop-in bio
 *  alternative in this model (use electrification instead). */
export const ALT_FUELS_BY_FUEL: Partial<Record<FuelId, AltFuelId[]>> = {
  diesel: ["biodiesel"],
  fuelOil: ["biodiesel"],
  ldo: ["biodiesel"],
  kerosene: ["biodiesel"],
  petrol: ["ethanol"],
  png: ["biogas"],
  cng: ["bioCng"],
  coal: ["biomass"],
  cokingCoal: ["biomass"],
  lignite: ["biomass"],
  petcoke: ["biomass"],
};

/** Blend cap for a fuel-switch, context-aware: stationary boilers take far
 *  more bio than vehicle engines. */
export function maxBlendPctFor(category: "mobile" | "stationary", altFuel: AltFuelId): number {
  const f = ALT_FUELS[altFuel];
  return category === "stationary" && f.stationaryMaxBlendPct != null ? f.stationaryMaxBlendPct : f.maxBlendPct;
}

/* ---------- Refrigerants (AR5 100-yr GWP) ---------- */

export const REFRIGERANTS: Record<RefrigerantId, RefrigerantFactor> = {
  // Legacy — very high GWP / ozone-depleting, phasing out
  R12:   { id: "R12",   label: "R-12 (CFC)",     gwp: 10200, era: "legacy", natural: false, volAdj: 1, note: "CFC — banned (Montreal). Ozone-depleting, service only." },
  R11:   { id: "R11",   label: "R-11 (CFC)",     gwp: 4660,  era: "legacy", natural: false, volAdj: 1, note: "CFC — banned. Legacy chillers only." },
  R502:  { id: "R502",  label: "R-502 (CFC)",    gwp: 4657,  era: "legacy", natural: false, volAdj: 1, note: "CFC blend — banned. Old low-temp refrigeration." },
  R22:   { id: "R22",   label: "R-22 (HCFC)",    gwp: 1810,  era: "legacy", natural: false, volAdj: 1, note: "HCFC — ozone-depleting, banned for new equipment." },
  R23:   { id: "R23",   label: "R-23 (HFC)",     gwp: 14800, era: "legacy", natural: false, volAdj: 1, note: "Ultra-high GWP — very low-temp / cascade systems." },
  R143a: { id: "R143a", label: "R-143a (HFC)",   gwp: 4470,  era: "legacy", natural: false, volAdj: 1, note: "High-GWP HFC component of R-404A/R-507A." },
  R507A: { id: "R507A", label: "R-507A (HFC)",   gwp: 3985,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "High-GWP HFC blend — commercial freezing." },
  R404A: { id: "R404A", label: "R-404A (HFC)",   gwp: 3943,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Very high GWP — being phased down under Kigali." },
  R125:  { id: "R125",  label: "R-125 (HFC)",    gwp: 3500,  era: "legacy", natural: false, volAdj: 1, note: "High-GWP HFC blend component." },
  R408A: { id: "R408A", label: "R-408A (HFC)",   gwp: 2430,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "R-502 retrofit blend — high GWP." },
  R422D: { id: "R422D", label: "R-422D (HFC)",   gwp: 2473,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "R-22 retrofit blend — high GWP." },
  R417A: { id: "R417A", label: "R-417A (HFC)",   gwp: 2127,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "R-22 drop-in — high GWP." },
  R410A: { id: "R410A", label: "R-410A (HFC)",   gwp: 1924,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Common HVAC HFC — high GWP, moving to R-32 / R-290." },
  R407C: { id: "R407C", label: "R-407C (HFC)",   gwp: 1624,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "R-22 replacement HFC blend — high GWP." },
  R409A: { id: "R409A", label: "R-409A (HCFC)",  gwp: 1585,  era: "legacy", natural: false, volAdj: 1, note: "HCFC blend — ozone-depleting, phasing out." },
  R407A: { id: "R407A", label: "R-407A (HFC)",   gwp: 1923,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "R-22 / R-404A alternative blend — high GWP, phasing down." },
  R438A: { id: "R438A", label: "R-438A (HFC)",   gwp: 2059,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "R-22 retrofit blend (MO99) — high GWP." },

  // Current — transitional, moderate / lower GWP
  R407F: { id: "R407F", label: "R-407F (HFC)",   gwp: 1674,  era: "current", natural: false, volAdj: 1, inExcel: true, note: "Lower-GWP R-404A retrofit for supermarkets." },
  R134a: { id: "R134a", label: "R-134a (HFC)",   gwp: 1430,  era: "current", natural: false, volAdj: 1, note: "Single-component HFC — still widely used, being replaced by R-1234yf." },
  R449A: { id: "R449A", label: "R-449A (HFO/HFC)", gwp: 1397, era: "current", natural: false, volAdj: 1, note: "R-404A replacement, ~65% lower GWP." },
  R448A: { id: "R448A", label: "R-448A (HFO/HFC)", gwp: 1387, era: "current", natural: false, volAdj: 1, note: "R-404A replacement for commercial refrigeration." },
  R452A: { id: "R452A", label: "R-452A (HFO/HFC)", gwp: 2140, era: "current", natural: false, volAdj: 1, note: "R-404A replacement for transport & commercial refrigeration. A1." },
  R427A: { id: "R427A", label: "R-427A (HFC)",   gwp: 2024, era: "current", natural: false, volAdj: 1, inExcel: true, note: "R-22 retrofit blend (Forane 427A). Non-flammable A1." },
  R513A: { id: "R513A", label: "R-513A (HFO/HFC)", gwp: 631, era: "current", natural: false, volAdj: 1, note: "R-134a replacement, ~56% lower GWP, non-flammable." },
  R450A: { id: "R450A", label: "R-450A (HFO/HFC)", gwp: 605, era: "current", natural: false, volAdj: 1, note: "R-134a replacement (Solstice N13)." },
  R466A: { id: "R466A", label: "R-466A (HFC)",   gwp: 733,   era: "current", natural: false, volAdj: 1, note: "Non-flammable (A1) R-410A replacement." },
  R515B: { id: "R515B", label: "R-515B (HFO/HFC)", gwp: 293, era: "current", natural: false, volAdj: 1, note: "Non-flammable (A1) R-134a replacement for chillers." },
  R32:   { id: "R32",   label: "R-32 (HFC)",     gwp: 675,   era: "current", natural: false, volAdj: 0.7, note: "Single-component, ~70% lower GWP than R-410A. Mildly flammable (A2L)." },
  R454B: { id: "R454B", label: "R-454B (HFO/HFC)", gwp: 466, era: "current", natural: false, volAdj: 0.95, note: "Leading R-410A replacement for new heat pumps. A2L." },
  R455A: { id: "R455A", label: "R-455A (HFO/HFC)", gwp: 148, era: "current", natural: false, volAdj: 0.9, note: "Low-GWP A2L blend (with CO₂) for refrigeration & heat pumps." },
  R152a: { id: "R152a", label: "R-152a (HFC)",   gwp: 124,   era: "current", natural: false, volAdj: 1, note: "Low-GWP HFC — mildly flammable (A2)." },

  // Future — ultra-low GWP HFOs + natural refrigerants
  R1234ze: { id: "R1234ze", label: "R-1234ze (HFO)", gwp: 1, era: "future", natural: false, volAdj: 1, note: "HFO, GWP <1. Chillers / heat pumps. Mildly flammable." },
  R1234yf: { id: "R1234yf", label: "R-1234yf (HFO)", gwp: 1, era: "future", natural: false, volAdj: 1, note: "HFO, GWP <1. Automotive A/C standard. A2L." },
  R1233zd: { id: "R1233zd", label: "R-1233zd (HFO)", gwp: 1, era: "future", natural: false, volAdj: 1, note: "HFO, GWP ~1, non-flammable (A1). Low-pressure centrifugal chillers." },
  R1336mzz: { id: "R1336mzz", label: "R-1336mzz (HFO)", gwp: 2, era: "future", natural: false, volAdj: 1, note: "HFO, GWP ~2, non-flammable (A1). High-temperature heat pumps / ORC." },
  R600a: { id: "R600a", label: "R-600a (Isobutane)", gwp: 3, era: "future", natural: true, volAdj: 0.5, note: "Natural, near-zero GWP. Domestic / light commercial. Flammable (A3)." },
  R1270: { id: "R1270", label: "R-1270 (Propene)",   gwp: 2, era: "future", natural: true, volAdj: 0.45, note: "Natural hydrocarbon, near-zero GWP. Flammable (A3)." },
  R290:  { id: "R290",  label: "R-290 (Propane)",    gwp: 3, era: "future", natural: true, volAdj: 0.45, note: "Natural, near-zero GWP, excellent efficiency. Flammable — charge limits." },
  R170:  { id: "R170",  label: "R-170 (Ethane)",     gwp: 6, era: "future", natural: true, volAdj: 0.4, note: "Natural, ultra-low GWP. Very low-temp cascade systems. Highly flammable (A3)." },
  R744:  { id: "R744",  label: "R-744 (CO₂)",        gwp: 1, era: "future", natural: true, volAdj: 0.90, note: "Natural, GWP 1, non-flammable. High pressure — transcritical design." },
  R717:  { id: "R717",  label: "R-717 (Ammonia)",    gwp: 0, era: "future", natural: true, volAdj: 0.50, note: "Natural, zero GWP, best efficiency. Toxic — industrial, trained staff." },
  R718:  { id: "R718",  label: "R-718 (Water)",      gwp: 0, era: "future", natural: true, volAdj: 1.0, note: "Natural, zero GWP, non-toxic. Niche high-temp / absorption." },

  // Added from Emission Factor 2025 workbook
  R401A: { id: "R401A", label: "R-401A", gwp: 18,    era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R401B: { id: "R401B", label: "R-401B", gwp: 15,    era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R401C: { id: "R401C", label: "R-401C", gwp: 21,    era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R402A: { id: "R402A", label: "R-402A", gwp: 1902,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R402B: { id: "R402B", label: "R-402B", gwp: 1205,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R403A: { id: "R403A", label: "R-403A", gwp: 1780,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R403B: { id: "R403B", label: "R-403B", gwp: 3471,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R405A: { id: "R405A", label: "R-405A", gwp: 3920,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R407B: { id: "R407B", label: "R-407B", gwp: 2547,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R407D: { id: "R407D", label: "R-407D", gwp: 1487,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R407E: { id: "R407E", label: "R-407E", gwp: 1425,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R410B: { id: "R410B", label: "R-410B", gwp: 2048,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R411A: { id: "R411A", label: "R-411A", gwp: 15,    era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R411B: { id: "R411B", label: "R-411B", gwp: 4,     era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R412A: { id: "R412A", label: "R-412A", gwp: 445,   era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R413A: { id: "R413A", label: "R-413A", gwp: 1945,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R415A: { id: "R415A", label: "R-415A", gwp: 25,    era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R415B: { id: "R415B", label: "R-415B", gwp: 104,   era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R416A: { id: "R416A", label: "R-416A", gwp: 767,   era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R417B: { id: "R417B", label: "R-417B", gwp: 2742,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R417C: { id: "R417C", label: "R-417C", gwp: 1643,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R418A: { id: "R418A", label: "R-418A", gwp: 3,     era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R419A: { id: "R419A", label: "R-419A", gwp: 2688,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R419B: { id: "R419B", label: "R-419B", gwp: 2161,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R420A: { id: "R420A", label: "R-420A", gwp: 1144,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R421A: { id: "R421A", label: "R-421A", gwp: 2385,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R421B: { id: "R421B", label: "R-421B", gwp: 2890,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R422A: { id: "R422A", label: "R-422A", gwp: 2847,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R422B: { id: "R422B", label: "R-422B", gwp: 2290,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R422C: { id: "R422C", label: "R-422C", gwp: 2794,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R422E: { id: "R422E", label: "R-422E", gwp: 2350,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R423A: { id: "R423A", label: "R-423A", gwp: 2274,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R424A: { id: "R424A", label: "R-424A", gwp: 2212,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R425A: { id: "R425A", label: "R-425A", gwp: 1431,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R426A: { id: "R426A", label: "R-426A", gwp: 1371,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R428A: { id: "R428A", label: "R-428A", gwp: 3417,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R429A: { id: "R429A", label: "R-429A", gwp: 13.8,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R430A: { id: "R430A", label: "R-430A", gwp: 105,   era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R431A: { id: "R431A", label: "R-431A", gwp: 40,    era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R434A: { id: "R434A", label: "R-434A", gwp: 3075,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R435A: { id: "R435A", label: "R-435A", gwp: 27.6,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R437A: { id: "R437A", label: "R-437A", gwp: 1639,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R439A: { id: "R439A", label: "R-439A", gwp: 1828,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R440A: { id: "R440A", label: "R-440A", gwp: 156,   era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R442A: { id: "R442A", label: "R-442A", gwp: 1754,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R444A: { id: "R444A", label: "R-444A", gwp: 88,    era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R445A: { id: "R445A", label: "R-445A", gwp: 117,   era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R500:  { id: "R500",  label: "R-500",  gwp: 36,    era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R503:  { id: "R503",  label: "R-503",  gwp: 4972,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R504:  { id: "R504",  label: "R-504",  gwp: 326,   era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R508A: { id: "R508A", label: "R-508A", gwp: 11607, era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R508B: { id: "R508B", label: "R-508B", gwp: 11698, era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R509A: { id: "R509A", label: "R-509A", gwp: 4984,  era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R511A: { id: "R511A", label: "R-511A", gwp: 6.9,   era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
  R512A: { id: "R512A", label: "R-512A", gwp: 196,   era: "legacy", natural: false, volAdj: 1, inExcel: true, note: "Imported from emission-factor workbook." },
};

/** Refrigerants offered as upgrade targets in the lever (low-GWP, deployable). */
export const ALT_REFRIGERANT_IDS: RefrigerantId[] = ["R290", "R744", "R717", "R454B", "R32", "R1234yf", "R600a"];

/** Sensible low-GWP swap per system type, surfaced as a one-click suggestion. */
export const RECOMMENDED_ALT_BY_SYSTEM: Record<RefrigerationSystem["systemType"], RefrigerantId> = {
  industrialColdStorage: "R717", // ammonia — zero GWP, best efficiency; industrial, trained staff
  commercialHVAC: "R454B",       // leading R-410A replacement, mildly flammable (A2L)
  retailRefrigeration: "R290",   // propane — near-zero GWP; charge limits suit smaller systems
};

/** Which fuels are relevant to each asset category — mobile (vehicles) burn a
 *  different set than stationary (boilers, gensets, process). */
export const FUELS_BY_CATEGORY: Record<"stationary" | "mobile", FuelId[]> = {
  mobile: [
    "diesel", "petrol", "cng", "lpg", "propane", "butane", "biodiesel",
    "marineHfoVlsfo", "marineHfoHsfo", "marineLfoUlsfo", "marineLfoVlsfo", "marineGasOil",
    "jetFuel", "aviationGasoline", "bioCng",
  ],
  stationary: [
    "diesel", "fuelOil", "residualFuelOil", "lubricants", "ldo", "kerosene", "naphtha",
    "png", "lng", "cng", "cngScm", "lpg", "propane", "butane",
    "coal", "cokingCoal", "lignite", "petcoke", "coalAnthracite", "coalBituminous", "coalBriquettes", "coalElectricity",
    "biogas", "landfillGas", "biodiesel", "bioBriquettes", "biomass", "bagasse", "riceHusk",
    "woodPellets", "woodChips", "woodLogs",
  ],
};

/** Default India grid emission factor, kgCO2e / kWh (CEA). */
export const GRID_EF_DEFAULT = 0.71;

export function getFuel(id: FuelId): FuelFactor {
  return FUELS[id];
}
export function getAltFuel(id: AltFuelId): AltFuelFactor {
  return ALT_FUELS[id];
}
export function getRefrigerant(id: RefrigerantId): RefrigerantFactor {
  return REFRIGERANTS[id];
}

export interface EFLookup {
  value: number;
  sourceYear: number;
  exact: boolean; // true if the requested year had its own factor
  source: "DEFRA" | "IPCC" | "IMO";
}

/** Non-DEFRA reference years for the badge. */
const SOURCE_YEAR: Record<"IPCC" | "IMO", number> = { IPCC: 2014, IMO: 2024 };

/** Emission factor for a fuel in a given year. DEFRA fuels clamp to the
 *  available DEFRA range; IPCC/IMO fuels return their single year-independent
 *  factor. */
export function efFor(fuelId: FuelId, year: number = LATEST_DEFRA_YEAR): EFLookup {
  const f = FUELS[fuelId];
  if (f.efSource !== "DEFRA") {
    return { value: f.co2eFactor, sourceYear: SOURCE_YEAR[f.efSource], exact: false, source: f.efSource };
  }
  const min = DEFRA_YEARS[0];
  const max = DEFRA_YEARS[DEFRA_YEARS.length - 1];
  const clamped = Math.max(min, Math.min(max, year));
  const value = f.co2eByYear[clamped] ?? f.co2eFactor;
  return { value, sourceYear: clamped, exact: clamped === year && f.co2eByYear[year] != null, source: "DEFRA" };
}

/** @deprecated Use `efFor` instead. Kept for backward compatibility. */
export function defraEF(fuelId: FuelId, year: number = LATEST_DEFRA_YEAR): EFLookup {
  return efFor(fuelId, year);
}

/** Family colour sequence (warm = hardest to abate → cool = easy win). */
export const FAMILY_COLORS = [
  "#F2924A", // 0 amber
  "#D9774B", // 1 terracotta
  "#7FA05A", // 2 olive
  "#3FB76E", // 3 green
  "#1F9E5A", // 4 emerald
  "#0F7873", // 5 teal
  "#2E5E8C", // 6 steel
  "#5C6BC0", // 7 indigo
];
