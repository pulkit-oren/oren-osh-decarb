/* ============================================================
   Pure store helpers. uniqueId never collides with ids already
   persisted in localStorage — the old module-level counter reset
   to 0 on every page load and could mint duplicates.
   ============================================================ */

import { DEFAULT_SETTINGS } from "./defaults";
import { defaultSystemActions } from "./model/segments";
import type { LeverSettings, RefrigerantId, RefrigerationByYear, RefrigerationSystem, SystemActions } from "./model/types";

/** Upgrade persisted refrigeration data to the mass-balance shape: older
 *  systems stored chargeKg + leakRatePct; the topped-up (leaked) mass is
 *  their product. Leaves already-migrated systems untouched. */
export function migrateRefrigeration(raw: unknown): RefrigerationByYear {
  const byYear = (raw ?? {}) as Record<number, (Partial<RefrigerationSystem> & { chargeKg?: number; leakRatePct?: number })[]>;
  const out: RefrigerationByYear = {};
  for (const [year, list] of Object.entries(byYear)) {
    out[Number(year)] = (list ?? []).map((s) => {
      const toppedUpKg = s.toppedUpKg ?? Math.round((s.chargeKg ?? 0) * ((s.leakRatePct ?? 0) / 100));
      return {
        id: s.id!, name: s.name ?? "System", systemType: s.systemType ?? "commercialHVAC",
        refrigerant: s.refrigerant ?? "R410A", toppedUpKg, gasCostPerKg: s.gasCostPerKg ?? 900,
        bu: s.bu, excluded: s.excluded,
      };
    });
  }
  return out;
}

/** First unused `prefix-N`, scanning the ids currently in state. */
export function uniqueId(prefix: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  let i = 0;
  while (taken.has(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}

/** All ids across every year of a by-year record. */
export function allIds(byYear: Record<number, { id: string }[]>): string[] {
  return Object.values(byYear).flat().map((x) => x.id);
}

/** Shape of the pre-migration global refrigerant config. */
interface LegacyRefrigerantCfg {
  enabled: boolean;
  transitionPct: number;
  altRefrigerant: RefrigerantId;
  leakImprovementPct: number;
  retrofitCapex: number;
  startYear: number;
  rampYears: number;
}

/** Upgrade persisted settings (or a saved scenario's settings) to the per-system shape.
 *  Legacy global config fans out to every system; capex splits pro-rata by charge. */
export function migrateSettings(raw: unknown, systems: RefrigerationSystem[]): LeverSettings {
  const r = raw as Partial<LeverSettings> & { refrigerant?: LegacyRefrigerantCfg };
  const base = {
    byAsset: r.byAsset ?? {},
    assumptions: r.assumptions ?? DEFAULT_SETTINGS.assumptions,
  };

  if (r.bySystem) {
    const bySystem: Record<string, SystemActions> = { ...r.bySystem };
    for (const sys of systems) if (!bySystem[sys.id]) bySystem[sys.id] = defaultSystemActions(sys);
    return { ...base, bySystem };
  }

  const legacy: LegacyRefrigerantCfg = r.refrigerant ?? {
    enabled: false, transitionPct: 0, altRefrigerant: "R290", leakImprovementPct: 0,
    retrofitCapex: 0, startYear: 2026, rampYears: 4,
  };
  const targetYear = legacy.startYear + Math.max(0, legacy.rampYears - 1);
  const totalTopUp = systems.reduce((s, x) => s + x.toppedUpKg, 0);
  let capexLeft = legacy.retrofitCapex;
  const bySystem: Record<string, SystemActions> = {};
  systems.forEach((sys, i) => {
    const last = i === systems.length - 1;
    const share = last ? capexLeft : totalTopUp > 0 ? Math.round((legacy.retrofitCapex * sys.toppedUpKg) / totalTopUp) : 0;
    capexLeft -= share;
    bySystem[sys.id] = {
      gasSwitch: {
        enabled: legacy.enabled, transitionPct: legacy.transitionPct, altRefrigerant: legacy.altRefrigerant,
        retrofitCapex: share, startYear: legacy.startYear, targetYear,
      },
      leakFix: {
        enabled: legacy.enabled, leakImprovementPct: legacy.leakImprovementPct,
        startYear: legacy.startYear, targetYear,
      },
    };
  });
  return { ...base, bySystem };
}
