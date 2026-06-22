import { describe, expect, it } from "vitest";
import {
  addCompanyToRegistry, blankScope1Payload, blankScope2Payload, DEFAULT_COMPANY_NAME,
  deleteCompanyFromRegistry, LEGACY_SCOPE1_KEY, LEGACY_SCOPE2_KEY, loadRegistry,
  REGISTRY_KEY, scope1Key, scope2Key, type StorageLike,
} from "../helpers";

function fakeStorage(seed: Record<string, string> = {}): StorageLike & { dump: () => Record<string, string> } {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

describe("loadRegistry", () => {
  it("first run creates one default company and persists the registry", () => {
    const s = fakeStorage();
    const reg = loadRegistry(s);
    expect(reg.companies).toHaveLength(1);
    expect(reg.companies[0].name).toBe(DEFAULT_COMPANY_NAME);
    expect(reg.activeId).toBe(reg.companies[0].id);
    expect(s.getItem(REGISTRY_KEY)).toBeTruthy();
  });

  it("migrates legacy single-company data into the first company", () => {
    const s = fakeStorage({
      [LEGACY_SCOPE1_KEY]: '{"baseYear":2024}',
      [LEGACY_SCOPE2_KEY]: '{"baseYear":2023}',
    });
    const reg = loadRegistry(s);
    const id = reg.companies[0].id;
    expect(s.getItem(scope1Key(id))).toBe('{"baseYear":2024}');
    expect(s.getItem(scope2Key(id))).toBe('{"baseYear":2023}');
  });

  it("returns an existing registry untouched and repairs a stale activeId", () => {
    const s = fakeStorage();
    const reg = loadRegistry(s);
    const withGhost = { ...reg, activeId: "nope" };
    s.setItem(REGISTRY_KEY, JSON.stringify(withGhost));
    const reloaded = loadRegistry(s);
    expect(reloaded.activeId).toBe(reg.companies[0].id);
  });

  it("rebuilds from a corrupted registry", () => {
    const s = fakeStorage({ [REGISTRY_KEY]: "{not json" });
    const reg = loadRegistry(s);
    expect(reg.companies).toHaveLength(1);
  });
});

describe("addCompanyToRegistry", () => {
  it("adds, activates, and mints a fresh id", () => {
    const s = fakeStorage();
    let reg = loadRegistry(s);
    reg = addCompanyToRegistry(s, reg, "  Globex Corp  ", false);
    expect(reg.companies).toHaveLength(2);
    expect(reg.companies[1].name).toBe("Globex Corp");
    expect(reg.activeId).toBe(reg.companies[1].id);
    expect(new Set(reg.companies.map((c) => c.id)).size).toBe(2);
    // sample-data start: no payload written — stores seed their defaults
    expect(s.getItem(scope1Key(reg.activeId))).toBeNull();
  });

  it("blank start seeds empty datasets for both scopes", () => {
    const s = fakeStorage();
    let reg = loadRegistry(s);
    reg = addCompanyToRegistry(s, reg, "Initech", true);
    const p1 = JSON.parse(s.getItem(scope1Key(reg.activeId))!);
    const p2 = JSON.parse(s.getItem(scope2Key(reg.activeId))!);
    expect(p1.combustion).toEqual({});
    expect(p1.scenarios).toEqual([]);
    expect(p2.facilities).toEqual({});
  });
});

describe("deleteCompanyFromRegistry", () => {
  it("removes the company and its datasets, re-pointing active", () => {
    const s = fakeStorage();
    let reg = loadRegistry(s);
    reg = addCompanyToRegistry(s, reg, "Globex", true);
    const doomed = reg.activeId;
    reg = deleteCompanyFromRegistry(s, reg, doomed);
    expect(reg.companies).toHaveLength(1);
    expect(reg.activeId).toBe(reg.companies[0].id);
    expect(s.getItem(scope1Key(doomed))).toBeNull();
    expect(s.getItem(scope2Key(doomed))).toBeNull();
  });

  it("refuses to delete the last company", () => {
    const s = fakeStorage();
    const reg = loadRegistry(s);
    expect(deleteCompanyFromRegistry(s, reg, reg.activeId)).toBe(reg);
  });
});

describe("blank payloads", () => {
  it("parse and carry the expected base year", () => {
    expect(JSON.parse(blankScope1Payload(2026)).baseYear).toBe(2026);
    expect(JSON.parse(blankScope2Payload()).baseYear).toBe(2025);
  });
});
