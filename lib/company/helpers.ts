/* ============================================================
   Pure company-registry helpers. The registry (list of companies +
   the active one) and each company's planner data live in separate
   localStorage entries; everything here takes a Storage-like object
   so it stays unit-testable without a browser.
   ============================================================ */

import { uniqueId } from "@/lib/store-helpers";

export interface Company {
  id: string;
  name: string;
  createdAt: number;
}

export interface CompanyRegistry {
  companies: Company[];
  activeId: string;
}

/** Minimal Storage surface — localStorage satisfies it. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const REGISTRY_KEY = "osh-companies-v1";
/** Pre-multi-company keys — migrated to the first company on first load. */
export const LEGACY_SCOPE1_KEY = "osh-scope1-planner-v4";
export const LEGACY_SCOPE2_KEY = "osh-scope2-planner-v1";

export const scope1Key = (companyId: string) => `${LEGACY_SCOPE1_KEY}::${companyId}`;
export const scope2Key = (companyId: string) => `${LEGACY_SCOPE2_KEY}::${companyId}`;

export const DEFAULT_COMPANY_NAME = "Acme Industries Ltd";

/** A dataset with no fuels, systems or facilities — for "start blank".
 *  Shapes mirror each store's Persisted interface; missing fields fall
 *  back to defaults inside the stores' hydration/migration. */
export function blankScope1Payload(baseYear = 2025): string {
  return JSON.stringify({
    combustion: {},
    refrigeration: {},
    settings: { byAsset: {}, bySystem: {} },
    scenarios: [],
    baseYear,
  });
}

export function blankScope2Payload(baseYear = 2025): string {
  return JSON.stringify({
    facilities: {},
    levers: { byFacility: {} },
    scenarios: [],
    baseYear,
  });
}

/** Load the registry, creating it (and migrating any legacy single-company
 *  data into the first company) on first run. Always returns a registry
 *  with ≥1 company and a valid activeId. */
export function loadRegistry(storage: StorageLike): CompanyRegistry {
  try {
    const raw = storage.getItem(REGISTRY_KEY);
    if (raw) {
      const reg = JSON.parse(raw) as CompanyRegistry;
      if (reg.companies?.length) {
        if (!reg.companies.some((c) => c.id === reg.activeId)) reg.activeId = reg.companies[0].id;
        return reg;
      }
    }
  } catch {
    /* corrupted registry — fall through and rebuild */
  }

  const first: Company = { id: "c-0", name: DEFAULT_COMPANY_NAME, createdAt: Date.now() };
  // Carry pre-multi-company data over so nothing is lost.
  const legacy1 = storage.getItem(LEGACY_SCOPE1_KEY);
  if (legacy1 !== null) storage.setItem(scope1Key(first.id), legacy1);
  const legacy2 = storage.getItem(LEGACY_SCOPE2_KEY);
  if (legacy2 !== null) storage.setItem(scope2Key(first.id), legacy2);

  const reg: CompanyRegistry = { companies: [first], activeId: first.id };
  storage.setItem(REGISTRY_KEY, JSON.stringify(reg));
  return reg;
}

export function saveRegistry(storage: StorageLike, reg: CompanyRegistry): void {
  storage.setItem(REGISTRY_KEY, JSON.stringify(reg));
}

/** Add a company and make it active. `blank: true` seeds an empty dataset;
 *  otherwise the stores fall back to the bundled sample data. */
export function addCompanyToRegistry(
  storage: StorageLike,
  reg: CompanyRegistry,
  name: string,
  blank: boolean,
): CompanyRegistry {
  const id = uniqueId("c", reg.companies.map((c) => c.id));
  if (blank) {
    storage.setItem(scope1Key(id), blankScope1Payload());
    storage.setItem(scope2Key(id), blankScope2Payload());
  }
  const next: CompanyRegistry = {
    companies: [...reg.companies, { id, name: name.trim(), createdAt: Date.now() }],
    activeId: id,
  };
  saveRegistry(storage, next);
  return next;
}

/** Remove a company and its datasets. The last company cannot be removed. */
export function deleteCompanyFromRegistry(
  storage: StorageLike,
  reg: CompanyRegistry,
  id: string,
): CompanyRegistry {
  if (reg.companies.length <= 1) return reg;
  const companies = reg.companies.filter((c) => c.id !== id);
  if (companies.length === reg.companies.length) return reg;
  storage.removeItem(scope1Key(id));
  storage.removeItem(scope2Key(id));
  const next: CompanyRegistry = {
    companies,
    activeId: reg.activeId === id ? companies[0].id : reg.activeId,
  };
  saveRegistry(storage, next);
  return next;
}
