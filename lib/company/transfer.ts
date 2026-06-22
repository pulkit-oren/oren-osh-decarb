/* ============================================================
   Export / import all dashboard data. Everything lives in
   localStorage (the company registry + each company's Scope 1 /
   Scope 2 datasets), so this bundles those keys into one JSON file
   that can be moved between machines or origins (e.g. localhost →
   the deployed site). Pure except for the Storage it's handed.
   ============================================================ */

import { loadRegistry, REGISTRY_KEY, scope1Key, scope2Key, type StorageLike } from "./helpers";

export interface DataBundle {
  app: "osh-decarb";
  version: 1;
  exportedAt: number;
  entries: Record<string, string>; // localStorage key → raw JSON value
}

/** Gather the registry and every company's datasets into one bundle. */
export function exportAllData(storage: StorageLike, now: number): DataBundle {
  const reg = loadRegistry(storage);
  const entries: Record<string, string> = {};
  const reg_raw = storage.getItem(REGISTRY_KEY);
  if (reg_raw) entries[REGISTRY_KEY] = reg_raw;
  for (const c of reg.companies) {
    const s1 = storage.getItem(scope1Key(c.id));
    if (s1 !== null) entries[scope1Key(c.id)] = s1;
    const s2 = storage.getItem(scope2Key(c.id));
    if (s2 !== null) entries[scope2Key(c.id)] = s2;
  }
  return { app: "osh-decarb", version: 1, exportedAt: now, entries };
}

/** Restore a bundle into storage (overwrites the registry + those datasets).
 *  Returns the number of companies restored. Throws on an invalid file. */
export function importAllData(storage: StorageLike, raw: string): { companies: number } {
  let bundle: DataBundle;
  try {
    bundle = JSON.parse(raw) as DataBundle;
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (bundle?.app !== "osh-decarb" || !bundle.entries || typeof bundle.entries !== "object") {
    throw new Error("This isn't an OSH dashboard export file.");
  }
  for (const [k, v] of Object.entries(bundle.entries)) {
    if (typeof v === "string") storage.setItem(k, v);
  }
  const regRaw = bundle.entries[REGISTRY_KEY];
  let companies = 0;
  try {
    companies = regRaw ? (JSON.parse(regRaw).companies?.length ?? 0) : 0;
  } catch {
    /* count is best-effort */
  }
  return { companies };
}
