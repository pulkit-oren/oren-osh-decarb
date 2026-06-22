import { describe, expect, it } from "vitest";
import { LEGACY_SCOPE1_KEY, loadRegistry, REGISTRY_KEY, type StorageLike } from "../helpers";
import { SEED_ENTRIES, seedIfEmpty } from "../seed";

function fakeStorage(seed: Record<string, string> = {}): StorageLike {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe("Ventive seed", () => {
  it("the bundle contains the Ventive Hospitality company", () => {
    const reg = JSON.parse(SEED_ENTRIES[REGISTRY_KEY]);
    expect(reg.companies.some((c: { name: string }) => c.name === "Ventive Hospitality")).toBe(true);
  });

  it("seeds an empty browser, then loadRegistry returns Ventive", () => {
    const s = fakeStorage();
    expect(seedIfEmpty(s)).toBe(true);
    const reg = loadRegistry(s);
    expect(reg.companies.map((c) => c.name)).toContain("Ventive Hospitality");
    // its datasets are present too
    expect(s.getItem(`osh-scope1-planner-v4::${reg.activeId}`)).toBeTruthy();
    expect(s.getItem(`osh-scope2-planner-v1::${reg.activeId}`)).toBeTruthy();
  });

  it("does NOT overwrite a browser that already has a registry", () => {
    const s = fakeStorage({ [REGISTRY_KEY]: '{"companies":[{"id":"c-0","name":"Mine","createdAt":0}],"activeId":"c-0"}' });
    expect(seedIfEmpty(s)).toBe(false);
    expect(loadRegistry(s).companies[0].name).toBe("Mine");
  });

  it("does NOT seed over pre-multi-company legacy data (lets it migrate)", () => {
    const s = fakeStorage({ [LEGACY_SCOPE1_KEY]: '{"baseYear":2024}' });
    expect(seedIfEmpty(s)).toBe(false);
  });
});
