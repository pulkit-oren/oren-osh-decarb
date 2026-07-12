/* ============================================================
   Stationary decarbonisation alternatives — the reference catalog
   from "Stationary Energy Decarbonisation Alternatives.xlsx"
   (Equipment Alternatives sheet), keyed by end-use. Each entry is
   one alternative with its category, indicative Scope 1 reduction,
   maturity, capex intensity and key considerations. `lever` marks
   which modeller lever the alternative maps to (undefined = shown
   as guidance only — e.g. emerging H₂, solar thermal supplements).
   Pure data.
   ============================================================ */

import type { EndUseId } from "./end-use";

export type AlternativeCategory =
  | "Energy efficiency" | "Electrification" | "Renewable fuel switch" | "Renewable"
  | "Transitional fuel switch" | "Emerging" | "Demand reduction" | "Renewable procurement";

export type Maturity = "Commercial" | "Early commercial" | "Emerging";
export type CapexBand = "Low" | "Low-Medium" | "Medium" | "Medium-High" | "High";

export interface EquipmentAlternative {
  title: string;
  category: AlternativeCategory;
  reduction: string; // indicative Scope 1 reduction vs the fossil incumbent
  maturity: Maturity;
  capex: CapexBand;
  note: string;
  /** Which modeller lever this maps to, when it does. */
  lever?: "electrify" | "fuelSwitch" | "efficiency";
}

export const EQUIPMENT_ALTERNATIVES: Partial<Record<EndUseId, EquipmentAlternative[]>> = {
  boiler: [
    { title: "Efficiency package: economiser, O₂ trim, condensate & blowdown heat recovery, insulation", category: "Energy efficiency", reduction: "5–15%", maturity: "Commercial", capex: "Low", note: "First step regardless of fuel pathway — paybacks typically under 2 years.", lever: "efficiency" },
    { title: "Biomass briquette / pellet fired boiler", category: "Renewable fuel switch", reduction: "90–100% (biogenic CO₂ outside scopes)", maturity: "Commercial", capex: "Medium", note: "Secure long-term briquette supply, fuel storage and ash handling. Widely adopted in Indian textiles, food and pharma.", lever: "fuelSwitch" },
    { title: "Biogas / compressed biogas (CBG) firing", category: "Renewable fuel switch", reduction: "90–100% (biogenic)", maturity: "Commercial", capex: "Low-Medium", note: "Burner retrofit on existing gas boilers; CBG availability improving under SATAT. Onsite biogas where organic waste exists.", lever: "fuelSwitch" },
    { title: "Electrode / electric resistance boiler", category: "Electrification", reduction: "100% Scope 1 (shifts to Scope 2 — near zero with RE)", maturity: "Commercial", capex: "Medium", note: "Needs contracted demand and grid capacity; economics driven by electricity vs fuel tariff. Pair with solar / open access / green tariff.", lever: "electrify" },
    { title: "Industrial heat pump / MVR (up to ~150–165 °C)", category: "Electrification", reduction: "100% Scope 1 with RE + 50–70% less energy input (COP 2–4)", maturity: "Early commercial", capex: "High", note: "Best where low-grade waste heat feeds the source side; strong fit for hot water and low-pressure steam.", lever: "electrify" },
    { title: "Solar thermal pre-heating (flat plate / parabolic trough)", category: "Renewable", reduction: "10–30% of boiler fuel", maturity: "Commercial", capex: "Medium", note: "Feedwater / process pre-heat cuts firing. Needs land or roof area; strong solar resource in India and the UAE." },
    { title: "Green-hydrogen-ready burners (H₂ blend → 100%)", category: "Emerging", reduction: "Up to 100% at full H₂", maturity: "Emerging", capex: "High", note: "Post-2030 lever: burner and safety changes, NOₓ management, green H₂ cost currently high." },
  ],
  generator: [
    { title: "DG right-sizing, synchronisation and load management", category: "Energy efficiency", reduction: "5–15% of DG fuel", maturity: "Commercial", capex: "Low", note: "Avoid part-load running of oversized sets; shed non-critical loads automatically during outages.", lever: "efficiency" },
    { title: "Solar PV + battery storage (BESS)", category: "Electrification", reduction: "80–100% of DG runtime displaced", maturity: "Commercial", capex: "Medium-High", note: "Size the battery for critical loads and outage duration; retain a small DG for statutory or extreme contingency.", lever: "electrify" },
    { title: "Grid reliability upgrade + green tariff / open access RE", category: "Electrification", reduction: "DG runtime to near zero", maturity: "Commercial", capex: "Low-Medium", note: "Dual / express feeders cut outage hours so the DG is genuinely standby only.", lever: "electrify" },
    { title: "B20 → B100 biodiesel or HVO drop-in", category: "Renewable fuel switch", reduction: "15–90% by blend (biogenic)", maturity: "Commercial", capex: "Low", note: "Minimal modification up to B20; verify OEM warranty, IS 15607 fuel quality, supply reliability. HVO is a premium full drop-in.", lever: "fuelSwitch" },
    { title: "Gas genset on PNG with future biomethane", category: "Transitional fuel switch", reduction: "20–25% on PNG; 90%+ on biomethane", maturity: "Commercial", capex: "Medium", note: "Fossil PNG is transitional only — the value is the future CBG / biomethane pathway." },
    { title: "Hydrogen fuel-cell backup power", category: "Emerging", reduction: "100% Scope 1", maturity: "Emerging", capex: "High", note: "Gaining traction for data centres and telecom; green H₂ supply chain still developing." },
  ],
  tfh: [
    { title: "Biomass fired TFH", category: "Renewable fuel switch", reduction: "90–100% (biogenic)", maturity: "Commercial", capex: "Medium", note: "Proven in Indian process industry; needs fuel yard, feeding system and ash handling.", lever: "fuelSwitch" },
    { title: "Electric thermic fluid heater", category: "Electrification", reduction: "100% Scope 1 (shifts to Scope 2)", maturity: "Commercial", capex: "Medium", note: "Simple, precise control, no local emissions — pair with RE procurement.", lever: "electrify" },
    { title: "High-temperature heat pump (duties below ~160 °C)", category: "Electrification", reduction: "100% Scope 1 with RE + energy input cut", maturity: "Early commercial", capex: "High", note: "Only the lower end of the TFH duty range — screen duties by actual temperature first.", lever: "electrify" },
    { title: "Concentrated solar thermal (parabolic trough) supplement", category: "Renewable", reduction: "15–40% of fuel", maturity: "Early commercial", capex: "High", note: "Suits high-DNI locations — strong case in the UAE and western India." },
  ],
  furnace: [
    { title: "Regenerative / recuperative burners + oxy-fuel combustion", category: "Energy efficiency", reduction: "15–40% fuel reduction", maturity: "Commercial", capex: "Medium", note: "Recovers flue-gas heat to preheat combustion air; oxy-fuel cuts fuel use and flue losses.", lever: "efficiency" },
    { title: "Induction furnace (melting)", category: "Electrification", reduction: "100% Scope 1 (shifts to Scope 2)", maturity: "Commercial", capex: "High", note: "Standard route for steel and non-ferrous melting; high connected load — pair with an RE PPA.", lever: "electrify" },
    { title: "Electric resistance / electric arc heating", category: "Electrification", reduction: "100% Scope 1", maturity: "Commercial", capex: "High", note: "Resistance for heat treatment, arc for steel melting; assess power quality and demand charges.", lever: "electrify" },
    { title: "Hydrogen blend firing → 100% H₂", category: "Emerging", reduction: "Proportional to blend, up to 100%", maturity: "Emerging", capex: "High", note: "Demonstrations in glass and steel reheating; NOₓ control and burner redesign required." },
  ],
  kiln: [
    { title: "Alternative fuels & raw materials (AFR): RDF, biomass, agro-residue co-processing", category: "Renewable fuel switch", reduction: "10–40% by thermal substitution rate", maturity: "Commercial", capex: "Medium", note: "Indian cement majors run 15–25% TSR with roadmaps beyond 30%; needs feeding systems and waste-fuel quality control.", lever: "fuelSwitch" },
    { title: "Waste heat recovery (WHR) power generation", category: "Energy efficiency", reduction: "Offsets 20–30% of plant electricity", maturity: "Commercial", capex: "High", note: "Cuts Scope 2 rather than kiln Scope 1 — standard in Indian cement." },
    { title: "Electric or hydrogen kiln technology", category: "Emerging", reduction: "Up to 100%", maturity: "Emerging", capex: "High", note: "Pilot stage globally for cement and lime — a long-term lever; monitor development." },
  ],
  dryer: [
    { title: "Heat pump dryer", category: "Electrification", reduction: "100% Scope 1 + 40–60% less energy input", maturity: "Commercial", capex: "Medium", note: "Excellent fit below ~90 °C; improves product quality control in food and agro drying.", lever: "electrify" },
    { title: "Electric hot air generator", category: "Electrification", reduction: "100% Scope 1 (shifts to Scope 2)", maturity: "Commercial", capex: "Low-Medium", note: "Straightforward replacement — pair with RE.", lever: "electrify" },
    { title: "Biomass fired HAG with heat exchanger", category: "Renewable fuel switch", reduction: "90–100% (biogenic)", maturity: "Commercial", capex: "Medium", note: "Indirect heating keeps flue gas off the product.", lever: "fuelSwitch" },
    { title: "Solar air heating", category: "Renewable", reduction: "20–50% of fuel", maturity: "Commercial", capex: "Low-Medium", note: "Simple collectors pre-heat drying air — strong fit for daytime drying loads." },
  ],
  oven: [
    { title: "Electric oven with precise zone control", category: "Electrification", reduction: "100% Scope 1", maturity: "Commercial", capex: "Medium", note: "Better temperature uniformity; no combustion products in the oven atmosphere.", lever: "electrify" },
    { title: "Infrared (IR) / ultraviolet (UV) curing", category: "Electrification", reduction: "100% Scope 1 + 30–50% less energy", maturity: "Commercial", capex: "Medium", note: "Much faster cure cycles for coatings, smaller footprint.", lever: "electrify" },
  ],
  cooking: [
    { title: "Induction and electric cooking equipment", category: "Electrification", reduction: "100% Scope 1", maturity: "Commercial", capex: "Low-Medium", note: "Kitchen staff training and cookware change; better indoor air quality and safety.", lever: "electrify" },
    { title: "Onsite biogas from canteen / food waste", category: "Renewable fuel switch", reduction: "Displaces 10–40% of cooking fuel", maturity: "Commercial", capex: "Low-Medium", note: "Closes the loop on wet waste — supports waste disclosures as a co-benefit.", lever: "fuelSwitch" },
  ],
  absorptionChiller: [
    { title: "High-efficiency electric chillers (magnetic bearing, VFD) with RE power", category: "Electrification", reduction: "100% Scope 1 with RE", maturity: "Commercial", capex: "Medium-High", note: "Modern electric chillers reach far higher COPs than absorption machines; district cooling relevant in the UAE.", lever: "electrify" },
    { title: "Waste-heat or solar driven absorption cooling", category: "Renewable", reduction: "Up to 100% of firing fuel", maturity: "Commercial", capex: "Medium", note: "Retain absorption machines only where genuine waste heat exists." },
  ],
  firePump: [
    { title: "HVO or biodiesel in the retained diesel pump", category: "Renewable fuel switch", reduction: "80–90% of the small residual (biogenic)", maturity: "Commercial", capex: "Low", note: "Testing hours are minimal — low materiality but an easy win.", lever: "fuelSwitch" },
    { title: "Electric motor driven fire pump with assured backup supply", category: "Electrification", reduction: "100% Scope 1", maturity: "Commercial", capex: "Medium", note: "Must satisfy fire codes and insurer (TAC / NFPA 20) requirements — a diesel unit is often retained by code.", lever: "electrify" },
  ],
  captivePower: [
    { title: "Replace generation with RE PPA (solar / wind / hybrid) + BESS", category: "Renewable procurement", reduction: "Up to 100% of captive Scope 1", maturity: "Commercial", capex: "Medium", note: "Round-the-clock RE contracts now available in India; review captive policy, banking and open-access rules per state.", lever: "electrify" },
    { title: "Biomass co-firing in coal fired units", category: "Renewable fuel switch", reduction: "5–20% at typical co-firing rates", maturity: "Commercial", capex: "Low-Medium", note: "Fuel-handling modifications; aligned with Indian co-firing policy direction.", lever: "fuelSwitch" },
    { title: "Hydrogen-blend-ready gas turbines", category: "Emerging", reduction: "Proportional to blend", maturity: "Early commercial", capex: "High", note: "OEMs offer 20–50% H₂-capable machines today; 100% H₂ machines in development." },
  ],
  spaceHeat: [
    { title: "Air / water source heat pumps", category: "Electrification", reduction: "100% Scope 1 + 60–75% less energy than resistance", maturity: "Commercial", capex: "Low-Medium", note: "Standard hotel retrofit with strong paybacks; hybrid with solar water heating works well.", lever: "electrify" },
    { title: "Solar water heating systems", category: "Renewable", reduction: "60–80% of water-heating fuel", maturity: "Commercial", capex: "Low-Medium", note: "Mature — mandated in several Indian municipal byelaws." },
  ],
  otherProcess: [
    { title: "Efficiency first: insulation, waste-heat recovery, right-sizing", category: "Energy efficiency", reduction: "5–20%", maturity: "Commercial", capex: "Low", note: "Question the demand, then improve efficiency — before any fuel switch.", lever: "efficiency" },
    { title: "Biomass / biogas firing where electrification doesn't fit", category: "Renewable fuel switch", reduction: "90–100% (biogenic)", maturity: "Commercial", capex: "Medium", note: "Match the renewable fuel to the duty and local supply.", lever: "fuelSwitch" },
    { title: "Electrify (heat pump / resistance) + renewable power", category: "Electrification", reduction: "100% Scope 1 with RE", maturity: "Commercial", capex: "Medium", note: "Shifts Scope 1 to Scope 2, which falls to near zero with renewable electricity.", lever: "electrify" },
  ],
};

/** Alternatives for an asset's end-use (stationary reference), or []. */
export function alternativesFor(endUse: EndUseId | undefined): EquipmentAlternative[] {
  return endUse ? EQUIPMENT_ALTERNATIVES[endUse] ?? [] : [];
}
