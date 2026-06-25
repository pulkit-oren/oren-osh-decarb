/* ============================================================
   Domain types for the Scope 2 decarbonization engine.
   Pure data — no React, no I/O. Mirrors the spec's three pillars:
   efficiency, on-site generation, renewable procurement.
   ============================================================ */

export { FY_YEARS, fyLabel } from "@/lib/model/types";

/* ---------- Baseline facilities (user data) ---------- */

export interface LoadSplit {
  lightingPct: number; // 0..100
  motorPct: number;
  hvacPct: number;
  /* remainder up to 100 is the implicit "other" load */
}

export interface Facility {
  id: string; // persists across FYs — copy-year keeps ids so plans follow facilities
  name: string;
  annualLoadKwh: number; // total grid draw for the FY
  tariffPerKwh: number;
  loadSplit: LoadSplit;
  roofSpaceM2: number; // physical cap for solar sizing
  peakLoadKw: number; // battery-sizing context (display guardrail, not computed)
  gridEf: number; // location-based grid factor, kgCO2e/kWh
  irradiance: number; // kWh/kWp/yr — geography-specific solar yield
  isolated: boolean; // captive/island grid — excluded from procurement
  /* ---- what's already in place (optional; absent = 0) ---- */
  /** On-site solar already installed (kWp) — reduces the roof headroom for the
   *  new-solar lever. (Its generation is already netted out of annualLoadKwh.) */
  existingSolarKwp?: number;
  /** Share of this site's electricity already covered by PPAs/RECs (0..100).
   *  Lowers the MARKET-BASED baseline; new procurement adds on top. Ignored for
   *  isolated grids (market instruments unavailable). */
  existingRenewablePct?: number;
  /** Business unit this entry belongs to. Absent ⇒ Central (consolidated). */
  bu?: string;
  /** Building/facility class — presets the load split & drives solar-feasibility guidance. Absent ⇒ unspecified. */
  facilityType?: import("./facility-type").FacilityTypeId;
  /** When true, excluded from all footprint totals (a non-aggregated BU). */
  excluded?: boolean;
  year?: number;
}

export type FacilitiesByYear = Record<number, Facility[]>;

/* ---------- Per-facility actions (the scenario) ---------- */

export interface EfficiencyAction {
  enabled: boolean;
  ledPct: number; // 0..100 deployment
  motorPct: number;
  bmsPct: number;
  ledCapex: number; // full-deployment cost; scaled by the slider
  motorCapex: number;
  bmsCapex: number;
  startYear: number;
  targetYear: number;
}

export type ExportMode = "netMetering" | "zeroExport";

export interface GenerationAction {
  enabled: boolean;
  solarKwp: number; // hard-capped at roofSpaceM2 / M2_PER_KW
  batteryKwh: number;
  exportMode: ExportMode;
  solarCapexPerKw: number;
  batteryCapexPerKwh: number;
  subsidyPct: number; // 0..100, deducted from generation CAPEX
  startYear: number;
  targetYear: number;
}

export interface FacilityActions {
  efficiency: EfficiencyAction;
  generation: GenerationAction;
}

/* ---------- Portfolio-wide procurement ---------- */

export interface ProcurementSettings {
  enabled: boolean;
  ppaPct: number; // 0..100 of addressable load
  greenTariffPct: number;
  recPct: number; // combined ppa+gt+rec clamped to ≤ 100
  ppaStrikeDeltaPerKwh: number; // negative = cheaper than grid (savings)
  greenTariffPremiumPerKwh: number;
  recPricePerKwh: number;
  re100Exclusion: boolean; // deduct isolated load from the denominator
  startYear: number;
  targetYear: number;
}

export interface Scope2Levers {
  byFacility: Record<string, FacilityActions>; // keyed by Facility id
  procurement: ProcurementSettings;
}

export interface Scope2Scenario {
  id: string;
  name: string;
  levers: Scope2Levers;
  savedAt: number;
}
