/* ============================================================
   Default Scope 2 inventory — each FY (2021→2027) has its own list
   of facilities with a gentle rising load trend anchored at FY2025.
   Ids persist across years so scenario plans follow facilities.
   ============================================================ */

import { FY_YEARS } from "@/lib/model/types";
import type {
  FacilitiesByYear, Facility, FacilityActions, ProcurementSettings, Scope2Levers,
} from "./model/types";

export const DEFAULT_BASE_YEAR = 2025;

/** Gentle rising trend anchored at FY2025 = 1.0. */
function trend(year: number): number {
  return 1 + 0.02 * (year - 2025);
}

interface FacilitySpec extends Omit<Facility, "annualLoadKwh" | "year"> {
  load2025: number;
  fromYear: number;
}

const FACILITY_SPECS: FacilitySpec[] = [
  {
    id: "f-pune", name: "Pune plant", load2025: 4_200_000, tariffPerKwh: 8.5,
    loadSplit: { lightingPct: 15, motorPct: 55, hvacPct: 20 },
    roofSpaceM2: 9000, peakLoadKw: 1200, gridEf: 0.71, irradiance: 1500,
    isolated: false, fromYear: 2021,
  },
  {
    id: "f-london", name: "London office", load2025: 800_000, tariffPerKwh: 14,
    loadSplit: { lightingPct: 25, motorPct: 10, hvacPct: 40 },
    roofSpaceM2: 1200, peakLoadKw: 350, gridEf: 0.21, irradiance: 950,
    isolated: false, fromYear: 2021,
  },
  {
    id: "f-island", name: "Island resort", load2025: 1_100_000, tariffPerKwh: 22,
    loadSplit: { lightingPct: 20, motorPct: 15, hvacPct: 45 },
    roofSpaceM2: 2500, peakLoadKw: 600, gridEf: 0.65, irradiance: 1700,
    isolated: true, fromYear: 2023,
  },
];

function facilityFor(s: FacilitySpec, year: number): Facility {
  const { load2025, fromYear, ...rest } = s;
  void fromYear;
  return { ...rest, annualLoadKwh: Math.round(load2025 * trend(year)) };
}

const byYear: FacilitiesByYear = {};
for (const y of FY_YEARS) {
  byYear[y] = FACILITY_SPECS.filter((s) => y >= s.fromYear).map((s) => facilityFor(s, y));
}
export const DEFAULT_FACILITIES_BY_YEAR = byYear;

/** Per-facility lever defaults — disabled, CAPEX heuristics scaled off the load. */
export function defaultFacilityActions(f: Facility): FacilityActions {
  return {
    efficiency: {
      enabled: false, ledPct: 0, motorPct: 0, bmsPct: 0,
      ledCapex: Math.round(f.annualLoadKwh * 0.4),
      motorCapex: Math.round(f.annualLoadKwh * 0.9),
      bmsCapex: Math.round(f.annualLoadKwh * 0.5),
      startYear: 2026, targetYear: 2030,
    },
    generation: {
      enabled: false, solarKwp: 0, batteryKwh: 0, exportMode: "netMetering",
      solarCapexPerKw: 45_000, batteryCapexPerKwh: 28_000, subsidyPct: 0,
      startYear: 2026, targetYear: 2030,
    },
  };
}

export const DEFAULT_PROCUREMENT: ProcurementSettings = {
  enabled: false, ppaPct: 0, greenTariffPct: 0, recPct: 0,
  ppaStrikeDeltaPerKwh: -0.5, greenTariffPremiumPerKwh: 0.8, recPricePerKwh: 0.45,
  re100Exclusion: false, startYear: 2026, targetYear: 2030,
};

const baseFacilities = DEFAULT_FACILITIES_BY_YEAR[DEFAULT_BASE_YEAR] ?? [];
export const DEFAULT_SCOPE2_LEVERS: Scope2Levers = {
  byFacility: Object.fromEntries(baseFacilities.map((f) => [f.id, defaultFacilityActions(f)])),
  procurement: DEFAULT_PROCUREMENT,
};
