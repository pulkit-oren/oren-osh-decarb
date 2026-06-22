import { describe, expect, it } from "vitest";
import { addCompanyToRegistry, loadRegistry, REGISTRY_KEY, scope1Key, scope2Key, type StorageLike } from "../helpers";
import { exportAllData, importAllData } from "../transfer";

function fakeStorage(seed: Record<string, string> = {}): StorageLike & { dump: () => Record<string, string> } {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

describe("export / import all data", () => {
  it("bundles the registry and every company's datasets", () => {
    const s = fakeStorage();
    let reg = loadRegistry(s); // creates default company c-0
    s.setItem(scope1Key(reg.activeId), '{"baseYear":2025,"combustion":{}}');
    reg = addCompanyToRegistry(s, reg, "Ventive Hospitality", true);
    s.setItem(scope2Key(reg.activeId), '{"baseYear":2026,"facilities":{}}');

    const bundle = exportAllData(s, 1_700_000_000_000);
    expect(bundle.app).toBe("osh-decarb");
    expect(bundle.entries[REGISTRY_KEY]).toBeTruthy();
    expect(Object.keys(bundle.entries)).toContain(scope1Key("c-0"));
    expect(Object.keys(bundle.entries)).toContain(scope2Key(reg.activeId));
  });

  it("round-trips into a fresh (different-origin) storage", () => {
    const src = fakeStorage();
    let reg = loadRegistry(src);
    reg = addCompanyToRegistry(src, reg, "Ventive Hospitality", false);
    src.setItem(scope1Key(reg.activeId), '{"baseYear":2025}');
    const json = JSON.stringify(exportAllData(src, 1));

    const dest = fakeStorage(); // simulates the deployed site, empty
    const { companies } = importAllData(dest, json);
    expect(companies).toBe(2); // default + Ventive
    expect(dest.getItem(REGISTRY_KEY)).toBe(src.getItem(REGISTRY_KEY));
    expect(dest.getItem(scope1Key(reg.activeId))).toBe('{"baseYear":2025}');
    // the imported data drives the registry on the destination
    expect(loadRegistry(dest).companies.map((c) => c.name)).toContain("Ventive Hospitality");
  });

  it("rejects a file that isn't an OSH export", () => {
    const dest = fakeStorage();
    expect(() => importAllData(dest, '{"hello":"world"}')).toThrow(/OSH dashboard export/);
    expect(() => importAllData(dest, "not json")).toThrow(/valid JSON/);
  });
});
