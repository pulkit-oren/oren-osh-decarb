// lib/finance/__tests__/seed-fixture.ts
import { SEED_ENTRIES } from "@/lib/company/seed";
import { migrateEquipment } from "@/lib/equipment/migrate";
import { resolveEquipment } from "@/lib/equipment/resolve";
import type { CombustionAsset, LeverSettings, RefrigerationSystem } from "@/lib/model/types";

const PLANNER_KEY = "osh-scope1-planner-v4::c-1";

/** The Scope 1 planner state the deployed app actually loads, migrated and
 *  resolved exactly as ScenarioProvider does on hydrate. Legacy-shaped at rest
 *  (no `equipment` key), which is the point: this is the real upgrade path. */
export function seedScope1(): {
  raw: CombustionAsset[];
  combustion: CombustionAsset[];
  systems: RefrigerationSystem[];
  settings: LeverSettings;
  baseYear: number;
} {
  const blob = JSON.parse(SEED_ENTRIES[PLANNER_KEY]);
  const migrated = migrateEquipment(blob.combustion);
  const raw = migrated[blob.baseYear] ?? [];
  return {
    raw,
    combustion: resolveEquipment(raw),
    systems: blob.refrigeration[String(blob.baseYear)] ?? [],
    settings: blob.settings,
    baseYear: blob.baseYear,
  };
}

export const sourceNamed = (rows: CombustionAsset[], name: string): CombustionAsset => {
  const hit = rows.find((r) => r.name === name);
  if (!hit) throw new Error(`no source named ${name}; have ${rows.map((r) => r.name).join(", ")}`);
  return hit;
};

/** Captured 2026-08-25 from the seeded company BEFORE the finance rework.
 *  The finance engine must not move physics; Task 10 asserts against these.
 *  If a later change legitimately moves tonnage, that is a separate decision
 *  and these constants get updated in that change, with a reason. */
export const PRE_CHANGE_BASE_TOTAL_T = 40333.0504632319;
export const PRE_CHANGE_TOTAL_ABATEMENT_T = 13848.425992948833;
