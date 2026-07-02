/* ============================================================
   ESG data — domain types for the Environment pillar's Water and
   Waste inventories, modelled at BRSR/GRI granularity: water broken
   down by withdrawal source and discharge destination, waste across
   the eight BRSR categories with generated / recovered / disposed
   for each. Headline totals are always kept in sync with the
   breakdowns so the Goals engine can read them directly.
   Pure data, no React. Energy & Emissions stays in the
   Scope 1 / Scope 2 stores.
   ============================================================ */

// ─── Water: withdrawal sources & discharge destinations ─────────────────────

export type WaterSourceId = "surface" | "ground" | "thirdParty" | "sea" | "other";

export const WATER_SOURCES: { key: WaterSourceId; label: string; hint: string; emoji: string }[] = [
  { key: "surface", label: "Surface water", hint: "Rivers, lakes, reservoirs, canals", emoji: "🏞️" },
  { key: "ground", label: "Groundwater", hint: "Borewells, dug wells, springs", emoji: "🕳️" },
  { key: "thirdParty", label: "Third-party water", hint: "Municipal supply, private tankers, other organisations", emoji: "🚰" },
  { key: "sea", label: "Seawater / desalinated", hint: "Direct seawater use or desalinated supply", emoji: "🌊" },
  { key: "other", label: "Others", hint: "Rainwater harvested, produced water, unclassified", emoji: "🌧️" },
];

export type DischargeDestId = "surface" | "ground" | "sea" | "thirdParty" | "other";

export const DISCHARGE_DESTS: { key: DischargeDestId; label: string; hint: string; emoji: string }[] = [
  { key: "surface", label: "To surface water", hint: "Rivers, lakes — after treatment as required", emoji: "🏞️" },
  { key: "ground", label: "To groundwater", hint: "Recharge pits, percolation, land application", emoji: "🕳️" },
  { key: "sea", label: "To seawater", hint: "Marine outfalls", emoji: "🌊" },
  { key: "thirdParty", label: "To third parties", hint: "Common effluent plants, municipal sewers, other organisations", emoji: "🏭" },
  { key: "other", label: "Others", hint: "Unclassified discharge routes", emoji: "💧" },
];

/** Annual water balance, kilolitres (1 kL = 1 m³). Totals mirror the breakdowns. */
export interface WaterYear {
  /** Total water drawn from all sources. */
  withdrawalKl: number;
  /** Withdrawal minus discharge — water not returned. */
  consumptionKl: number;
  /** Treated/untreated water released back to the environment or third parties. */
  dischargeKl: number;
  /** Withdrawal by source (kL). Absent on legacy totals-only entries. */
  withdrawalBySource?: Partial<Record<WaterSourceId, number>>;
  /** Discharge by destination (kL). Absent on legacy totals-only entries. */
  dischargeByDest?: Partial<Record<DischargeDestId, number>>;
}

// ─── Waste: the eight BRSR categories ────────────────────────────────────────

export type WasteCategoryId =
  | "plastic" | "ewaste" | "biomedical" | "cnd"
  | "battery" | "radioactive" | "otherHaz" | "otherNonHaz";

export const WASTE_CATEGORIES: { key: WasteCategoryId; label: string; hint: string; emoji: string }[] = [
  { key: "plastic", label: "Plastic waste", hint: "Packaging, films, PET, rigid plastics", emoji: "🧴" },
  { key: "ewaste", label: "E-waste", hint: "IT equipment, batteries in devices, cables, lamps", emoji: "💻" },
  { key: "biomedical", label: "Bio-medical waste", hint: "Clinic / OHC waste, sharps, contaminated items", emoji: "🩺" },
  { key: "cnd", label: "Construction & demolition", hint: "Debris, concrete, rubble from projects", emoji: "🧱" },
  { key: "battery", label: "Battery waste", hint: "Lead-acid, lithium-ion and other batteries", emoji: "🔋" },
  { key: "radioactive", label: "Radioactive waste", hint: "Sources from gauges, instruments (if any)", emoji: "☢️" },
  { key: "otherHaz", label: "Other hazardous", hint: "Used oil, solvents, paint sludge, contaminated rags", emoji: "⚠️" },
  { key: "otherNonHaz", label: "Other non-hazardous", hint: "Food/canteen, paper, metal scrap, garden, MSW", emoji: "🗑️" },
];

/** One waste category's annual quantities, metric tonnes. */
export interface WasteCatYear {
  /** Total generated in this category. */
  generatedT: number;
  /** Sent to disposal — landfill, incineration without recovery. */
  disposedT: number;
  /** Diverted from disposal — recycled, reused, recovered. */
  recoveredT: number;
}

/** Annual waste balance, metric tonnes. Totals mirror the per-category breakdown. */
export interface WasteYear extends WasteCatYear {
  /** Per-BRSR-category quantities. Absent on legacy totals-only entries. */
  byCategory?: Partial<Record<WasteCategoryId, WasteCatYear>>;
}

// ─── State ───────────────────────────────────────────────────────────────────

export type WaterByYear = Record<number, WaterYear>;
export type WasteByYear = Record<number, WasteYear>;

export interface EsgState {
  water: WaterByYear;
  waste: WasteByYear;
}

export const EMPTY_ESG_STATE: EsgState = { water: {}, waste: {} };

export const EMPTY_WATER_YEAR: WaterYear = { withdrawalKl: 0, consumptionKl: 0, dischargeKl: 0 };
export const EMPTY_WASTE_YEAR: WasteYear = { generatedT: 0, disposedT: 0, recoveredT: 0 };
export const EMPTY_WASTE_CAT: WasteCatYear = { generatedT: 0, disposedT: 0, recoveredT: 0 };

// ─── Derivations ─────────────────────────────────────────────────────────────

const sum = (rec: Partial<Record<string, number>> | undefined) =>
  Object.values(rec ?? {}).reduce((s: number, v) => s + (v ?? 0), 0);

/** Share of generated waste diverted from disposal (0..100). */
export function wasteDiversionPct(w: WasteYear | undefined): number {
  if (!w || w.generatedT <= 0) return 0;
  return Math.min(100, (w.recoveredT / w.generatedT) * 100);
}

/** GRI 303-5 style consumption suggestion: withdrawal − discharge, floored at 0. */
export function suggestedConsumptionKl(w: WaterYear | undefined): number {
  if (!w) return 0;
  return Math.max(0, w.withdrawalKl - w.dischargeKl);
}

// ─── Breakdown normalisation (legacy totals → breakdowns) ────────────────────

/* Entries saved before the per-source model have totals but no breakdowns.
   Normalising folds such a total into the "Others" bucket so the number stays
   visible and editable; entries that already have breakdowns re-derive their
   totals from them (the breakdowns are the source of truth). */

export function normalizeWaterYear(w: WaterYear | undefined): WaterYear {
  const base = w ?? EMPTY_WATER_YEAR;
  const withdrawalBySource = base.withdrawalBySource
    ?? (base.withdrawalKl > 0 ? { other: base.withdrawalKl } : {});
  const dischargeByDest = base.dischargeByDest
    ?? (base.dischargeKl > 0 ? { other: base.dischargeKl } : {});
  return {
    ...base,
    withdrawalBySource,
    dischargeByDest,
    withdrawalKl: sum(withdrawalBySource),
    dischargeKl: sum(dischargeByDest),
  };
}

export function normalizeWasteYear(w: WasteYear | undefined): WasteYear {
  const base = w ?? EMPTY_WASTE_YEAR;
  const byCategory = base.byCategory
    ?? (base.generatedT > 0 || base.disposedT > 0 || base.recoveredT > 0
      ? { otherNonHaz: { generatedT: base.generatedT, disposedT: base.disposedT, recoveredT: base.recoveredT } }
      : {});
  const cats = Object.values(byCategory).filter(Boolean) as WasteCatYear[];
  return {
    ...base,
    byCategory,
    generatedT: cats.reduce((s, c) => s + c.generatedT, 0),
    disposedT: cats.reduce((s, c) => s + c.disposedT, 0),
    recoveredT: cats.reduce((s, c) => s + c.recoveredT, 0),
  };
}
