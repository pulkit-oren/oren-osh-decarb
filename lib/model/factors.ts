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
  /* ---- Liquid fossil fuels (DEFRA 2022–2025, kgCO2e per litre) ---- */
  diesel: {
    id: "diesel", label: "Diesel (HSD)", unit: "L", densityKgPerUnit: 0.83057, cvKJperKg: 42839, renewable: false, efSource: "DEFRA",
    co2eFactor: 2.57082, co2eByYear: { 2022: 2.56, 2023: 2.51, 2024: 2.51279, 2025: 2.57082 }, typicalPricePerUnit: 92,
  },
  petrol: {
    id: "petrol", label: "Petrol", unit: "L", densityKgPerUnit: 0.746204, cvKJperKg: 43061, renewable: false, efSource: "DEFRA",
    co2eFactor: 2.06916, co2eByYear: { 2022: 2.16, 2023: 2.1, 2024: 2.0844, 2025: 2.06916 }, typicalPricePerUnit: 105,
  },
  fuelOil: {
    id: "fuelOil", label: "Furnace / fuel oil (FO)", unit: "L", densityKgPerUnit: 0.983284, cvKJperKg: 40752, renewable: false, efSource: "DEFRA",
    co2eFactor: 3.17492, co2eByYear: { 2022: 3.18, 2023: 3.17, 2024: 3.17493, 2025: 3.17492 }, typicalPricePerUnit: 62,
  },
  ldo: {
    id: "ldo", label: "Light diesel oil (LDO)", unit: "L", densityKgPerUnit: 0.86, cvKJperKg: 42000, renewable: false, efSource: "DEFRA",
    co2eFactor: 2.7595, co2eByYear: { 2022: 2.7595, 2023: 2.7595, 2024: 2.7595, 2025: 2.7595 }, typicalPricePerUnit: 85,
  },
  kerosene: {
    id: "kerosene", label: "Kerosene / SKO", unit: "L", densityKgPerUnit: 0.802568, cvKJperKg: 43865, renewable: false, efSource: "DEFRA",
    co2eFactor: 2.54016, co2eByYear: { 2022: 2.54, 2023: 2.54, 2024: 2.54015, 2025: 2.54016 }, typicalPricePerUnit: 78,
  },
  naphtha: {
    id: "naphtha", label: "Naphtha", unit: "kg", densityKgPerUnit: 1, cvKJperKg: 44500, renewable: false, efSource: "DEFRA",
    co2eFactor: 3.1313, co2eByYear: { 2022: 3.1313, 2023: 3.1313, 2024: 3.1313, 2025: 3.1313 }, typicalPricePerUnit: 70,
  },

  /* ---- Gaseous fossil fuels ---- */
  lpg: {
    id: "lpg", label: "LPG", unit: "L", densityKgPerUnit: 0.529749, cvKJperKg: 45944, renewable: false, efSource: "DEFRA",
    co2eFactor: 1.55713, co2eByYear: { 2022: 1.56, 2023: 1.56, 2024: 1.55713, 2025: 1.55713 }, typicalPricePerUnit: 58,
  },
  propane: {
    id: "propane", label: "Propane", unit: "kg", densityKgPerUnit: 1, cvKJperKg: 46300, renewable: false, efSource: "DEFRA",
    co2eFactor: 2.99711, co2eByYear: { 2022: 2.99711, 2023: 2.99711, 2024: 2.99711, 2025: 2.99711 }, typicalPricePerUnit: 80,
  },
  butane: {
    id: "butane", label: "Butane", unit: "kg", densityKgPerUnit: 1, cvKJperKg: 45750, renewable: false, efSource: "DEFRA",
    co2eFactor: 3.03307, co2eByYear: { 2022: 3.03307, 2023: 3.03307, 2024: 3.03307, 2025: 3.03307 }, typicalPricePerUnit: 80,
  },
  cng: {
    id: "cng", label: "CNG", unit: "kg", densityKgPerUnit: 1, cvKJperKg: 45745, renewable: false, efSource: "DEFRA",
    co2eFactor: 2.69952, co2eByYear: { 2022: 2.69952, 2023: 2.69952, 2024: 2.69952, 2025: 2.69952 }, typicalPricePerUnit: 88,
  },
  png: {
    id: "png", label: "Piped / natural gas (PNG)", unit: "m3", densityKgPerUnit: 0.802, cvKJperKg: 45745, renewable: false, efSource: "DEFRA",
    co2eFactor: 2.06672, co2eByYear: { 2022: 2.02, 2023: 2.04, 2024: 2.04542, 2025: 2.06672 }, typicalPricePerUnit: 50,
  },

  /* ---- Solid fossil fuels (kgCO2e per tonne) ---- */
  coal: {
    id: "coal", label: "Coal (steam / industrial)", unit: "t", densityKgPerUnit: 1000, cvKJperKg: 25405, renewable: false, efSource: "DEFRA",
    co2eFactor: 2395.28994, co2eByYear: { 2022: 2411.43, 2023: 2396.48, 2024: 2399.43994, 2025: 2395.28994 }, typicalPricePerUnit: 6000,
  },
  cokingCoal: {
    id: "cokingCoal", label: "Coking coal (metallurgical)", unit: "t", densityKgPerUnit: 1000, cvKJperKg: 28300, renewable: false, efSource: "DEFRA",
    co2eFactor: 3165.24, co2eByYear: { 2022: 3165.24, 2023: 3165.24, 2024: 3165.24, 2025: 3165.24 }, typicalPricePerUnit: 20000,
  },
  lignite: {
    id: "lignite", label: "Lignite (brown coal)", unit: "t", densityKgPerUnit: 1000, cvKJperKg: 11900, renewable: false, efSource: "DEFRA",
    co2eFactor: 1185.62, co2eByYear: { 2022: 1185.62, 2023: 1185.62, 2024: 1185.62, 2025: 1185.62 }, typicalPricePerUnit: 3200,
  },
  petcoke: {
    id: "petcoke", label: "Petroleum coke (petcoke)", unit: "t", densityKgPerUnit: 1000, cvKJperKg: 32000, renewable: false, efSource: "DEFRA",
    co2eFactor: 3386.4, co2eByYear: { 2022: 3386.4, 2023: 3386.4, 2024: 3386.4, 2025: 3386.4 }, typicalPricePerUnit: 14000,
  },

  /* ---- Biomass / renewable fuels ----
     The combustion CO₂ is biogenic (carbon recently absorbed by the plant), so under
     the GHG Protocol / BRSR it is reported SEPARATELY and excluded from gross Scope 1.
     Only the CH₄ and N₂O from combustion stay in Scope 1 — that is `co2eFactor` here.
     `biogenicCO2ePerUnit` carries the biogenic CO₂ for transparent reporting. */
  biogas: {
    id: "biogas", label: "Biogas", unit: "m3", densityKgPerUnit: 1.15, cvKJperKg: 20000, renewable: true, efSource: "DEFRA",
    co2eFactor: 0.02262, co2eByYear: { 2022: 0.02262, 2023: 0.02262, 2024: 0.02262, 2025: 0.02262 },
    biogenicCO2ePerUnit: 1.1908, typicalPricePerUnit: 25,
  },
  bioCng: {
    id: "bioCng", label: "Bio-CNG (compressed biogas)", unit: "kg", densityKgPerUnit: 1, cvKJperKg: 48000, renewable: true, efSource: "DEFRA",
    co2eFactor: 0.1209, co2eByYear: { 2022: 0.1209, 2023: 0.1209, 2024: 0.1209, 2025: 0.1209 },
    biogenicCO2ePerUnit: 2.6086, typicalPricePerUnit: 75,
  },
  bioBriquettes: {
    id: "bioBriquettes", label: "Bio-briquettes / pellets", unit: "t", densityKgPerUnit: 1000, cvKJperKg: 16200, renewable: true, efSource: "DEFRA",
    co2eFactor: 28.0, co2eByYear: { 2022: 28.0, 2023: 28.0, 2024: 28.0, 2025: 28.0 },
    biogenicCO2ePerUnit: 1560.0, typicalPricePerUnit: 8000,
  },
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
  R507A: { id: "R507A", label: "R-507A (HFC)",   gwp: 3985,  era: "legacy", natural: false, volAdj: 1, note: "High-GWP HFC blend — commercial freezing." },
  R404A: { id: "R404A", label: "R-404A (HFC)",   gwp: 3922,  era: "legacy", natural: false, volAdj: 1, note: "Very high GWP — being phased down under Kigali." },
  R125:  { id: "R125",  label: "R-125 (HFC)",    gwp: 3500,  era: "legacy", natural: false, volAdj: 1, note: "High-GWP HFC blend component." },
  R408A: { id: "R408A", label: "R-408A (HFC)",   gwp: 3152,  era: "legacy", natural: false, volAdj: 1, note: "R-502 retrofit blend — high GWP." },
  R422D: { id: "R422D", label: "R-422D (HFC)",   gwp: 2729,  era: "legacy", natural: false, volAdj: 1, note: "R-22 retrofit blend — high GWP." },
  R417A: { id: "R417A", label: "R-417A (HFC)",   gwp: 2346,  era: "legacy", natural: false, volAdj: 1, note: "R-22 drop-in — high GWP." },
  R410A: { id: "R410A", label: "R-410A (HFC)",   gwp: 2088,  era: "legacy", natural: false, volAdj: 1, note: "Common HVAC HFC — high GWP, moving to R-32 / R-290." },
  R407C: { id: "R407C", label: "R-407C (HFC)",   gwp: 1774,  era: "legacy", natural: false, volAdj: 1, note: "R-22 replacement HFC blend — high GWP." },
  R409A: { id: "R409A", label: "R-409A (HCFC)",  gwp: 1585,  era: "legacy", natural: false, volAdj: 1, note: "HCFC blend — ozone-depleting, phasing out." },
  R407A: { id: "R407A", label: "R-407A (HFC)",   gwp: 2107,  era: "legacy", natural: false, volAdj: 1, note: "R-22 / R-404A alternative blend — high GWP, phasing down." },
  R438A: { id: "R438A", label: "R-438A (HFC)",   gwp: 2265,  era: "legacy", natural: false, volAdj: 1, note: "R-22 retrofit blend (MO99) — high GWP." },

  // Current — transitional, moderate / lower GWP
  R407F: { id: "R407F", label: "R-407F (HFC)",   gwp: 1825,  era: "current", natural: false, volAdj: 1, note: "Lower-GWP R-404A retrofit for supermarkets." },
  R134a: { id: "R134a", label: "R-134a (HFC)",   gwp: 1430,  era: "current", natural: false, volAdj: 1, note: "Single-component HFC — still widely used, being replaced by R-1234yf." },
  R449A: { id: "R449A", label: "R-449A (HFO/HFC)", gwp: 1397, era: "current", natural: false, volAdj: 1, note: "R-404A replacement, ~65% lower GWP." },
  R448A: { id: "R448A", label: "R-448A (HFO/HFC)", gwp: 1387, era: "current", natural: false, volAdj: 1, note: "R-404A replacement for commercial refrigeration." },
  R452A: { id: "R452A", label: "R-452A (HFO/HFC)", gwp: 2140, era: "current", natural: false, volAdj: 1, note: "R-404A replacement for transport & commercial refrigeration. A1." },
  R427A: { id: "R427A", label: "R-427A (HFC)",   gwp: 2138, era: "current", natural: false, volAdj: 1, note: "R-22 retrofit blend (Forane 427A). Non-flammable A1." },
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
  mobile: ["diesel", "petrol", "cng", "lpg", "propane", "butane", "bioCng"],
  stationary: [
    "diesel", "fuelOil", "ldo", "kerosene", "naphtha",
    "png", "lpg", "propane", "butane", "cng",
    "coal", "cokingCoal", "lignite", "petcoke",
    "biogas", "bioCng", "bioBriquettes", "biomass", "bagasse", "riceHusk",
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
