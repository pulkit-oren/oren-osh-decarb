/* ============================================================
   Pure store helpers. uniqueId never collides with ids already
   persisted in localStorage — the old module-level counter reset
   to 0 on every page load and could mint duplicates.
   ============================================================ */

import { DEFAULT_SETTINGS } from "./defaults";
import { defaultSystemActions } from "./model/segments";
import type {
  CombustionAsset, LeverSettings, RefrigerantId, RefrigerationByYear, RefrigerationSystem, SystemActions,
} from "./model/types";
import type { Asset, AssetRegistry } from "./assets/types";

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

/** category values a CombustionAsset can legitimately carry. Checked against
 *  this literal set, not just `typeof === "string"` — a corrupted persisted
 *  entry with e.g. `category: "foo"` is a string but not a valid
 *  AssetCategory, and would otherwise sail through into `Asset.category` as
 *  a value the type system swears cannot exist. */
const VALID_COMBUSTION_CATEGORIES = new Set(["stationary", "mobile"]);

/** Mint one Asset per fuel entry, reusing the entry's id as the asset's id —
 *  that reuse is the entire reason no lever migration is needed, since
 *  LeverSettings is keyed by entry id and an asset sharing that id keeps every
 *  saved scenario resolving. Never mints a fresh id: an entry with no usable
 *  string id is skipped, since inventing one would silently break that
 *  guarantee. Idempotent (keyed on id presence, first occurrence across years
 *  wins) so it can run on every hydration without disturbing a user's later
 *  edits to an already-migrated asset. Reads the entries only — never mutates
 *  them — and never throws. Both parameters are typed `unknown`, matching
 *  migrateRefrigeration/migrateSettings: this runs against unvalidated
 *  localStorage inside a hydration effect, and a trusted-shape signature
 *  would let a call site skip casting on a guarantee that isn't real. */
export function migrateAssets(combustion: unknown, existing: unknown): AssetRegistry {
  const existingAssets: Asset[] = Array.isArray((existing as { assets?: unknown } | null | undefined)?.assets)
    ? (existing as AssetRegistry).assets
    : [];
  const seen = new Set(existingAssets.map((a) => a.id));
  const minted: Asset[] = [];

  const byYear = combustion && typeof combustion === "object" ? (combustion as Record<number, unknown>) : {};
  for (const list of Object.values(byYear)) {
    if (!Array.isArray(list)) continue; // a year's value that isn't an array — tolerate, skip
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue; // null / non-object entry
      const e = raw as Partial<CombustionAsset>;

      if (typeof e.id !== "string" || e.id.length === 0) continue; // no usable string id: SKIP, never mint one
      if (seen.has(e.id)) continue; // already an asset (idempotent run, or a later-year duplicate) — first occurrence wins

      // name/category are required on Asset. Skipping costs nothing in reported
      // emissions: a non-byAsset entry still passes through resolveAssets() by
      // reference regardless of whether an asset exists for it. Defaulting
      // instead would seat an invented name/category that later electrification-
      // eligibility logic (Tasks 8/9) would treat as ground truth — the same
      // out-of-union-value-from-persisted-JSON bug class the plan's Provenance
      // section records as having cost two review rounds elsewhere in this port.
      if (typeof e.name !== "string") continue;
      if (typeof e.category !== "string" || !VALID_COMBUSTION_CATEGORIES.has(e.category)) continue;

      seen.add(e.id);
      minted.push({
        id: e.id,
        name: e.name,
        category: e.category,
        unitCount: e.unitCount ?? 0,
        remainingLife: e.remainingLife ?? 0,
        opex: e.opex ?? 0,
        buId: e.bu ?? "",
      });
    }
  }

  return { assets: [...existingAssets, ...minted] };
}
