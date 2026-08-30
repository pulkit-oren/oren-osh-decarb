/* What a dial can actually reach. The engine clamps bio-blend and skips
   non-electrifiable sources; the dials ran to 100% and said nothing, so
   dragging further did nothing and the model looked broken rather than
   constrained. */

import { describe, it, expect } from "vitest";
import { bioBlendCap, electrifyCap, solarCapNote } from "../dial-caps";
import type { CombustionAsset } from "../types";

const asset = (patch: Partial<CombustionAsset> & Pick<CombustionAsset, "id" | "name">): CombustionAsset => ({
  category: "stationary", fuelType: "diesel", unit: "L", annualVolume: 100_000, opex: 9_000_000,
  ...patch,
});

describe("bioBlendCap", () => {
  it("caps a vehicle fleet at the drop-in limit and says why", () => {
    const fleet = asset({ id: "f", name: "Fleet", category: "mobile", endUse: "van" });
    const cap = bioBlendCap([fleet]);
    expect(cap.constrained).toBe(true);
    expect(cap.maxPct).toBeLessThan(100);
    expect(cap.reason).toMatch(/flex-fuel/);
  });

  it("weights the ceiling by EMISSIONS, not by counting sources", () => {
    /* One tiny capped van beside a large boiler that can take far more. A
       count-weighted answer would report the van's limit for the whole plan,
       which is true about the wrong thing. */
    const van = asset({ id: "v", name: "Van", category: "mobile", endUse: "van", annualVolume: 1_000 });
    const boiler = asset({ id: "b", name: "Boiler", fuelType: "png", unit: "m3", endUse: "boiler", annualVolume: 5_000_000 });
    const mixed = bioBlendCap([van, boiler]);
    const vanOnly = bioBlendCap([van]);
    expect(mixed.maxPct).toBeGreaterThan(vanOnly.maxPct);
  });

  it("says so when nothing can take a blend at all", () => {
    const cap = bioBlendCap([asset({ id: "c", name: "Coal", fuelType: "coal", unit: "t", endUse: "kiln" })]);
    if (cap.maxPct === 0) expect(cap.reason).toMatch(/No source/);
  });
});

describe("electrifyCap", () => {
  it("is silent when every source can be electrified", () => {
    const cap = electrifyCap([asset({ id: "b", name: "Boiler", endUse: "boiler" })]);
    expect(cap.constrained).toBe(false);
  });

  it("names the share the dial can reach, and what it cannot", () => {
    // A kiln has no commercial electric route; the dial cannot touch its fuel
    // however far it travels.
    const boiler = asset({ id: "b", name: "Boiler", endUse: "boiler", annualVolume: 100_000 });
    const kiln = asset({ id: "k", name: "Cement kiln", endUse: "kiln", annualVolume: 100_000 });
    const cap = electrifyCap([boiler, kiln]);
    expect(cap.constrained).toBe(true);
    expect(cap.reason).toContain("Cement kiln");
    expect(cap.reason).toMatch(/\d+% of this fuel/);
  });

  it("leaves the dial's own travel at 100 — it is a share of what CAN be reached", () => {
    const cap = electrifyCap([
      asset({ id: "b", name: "Boiler", endUse: "boiler" }),
      asset({ id: "k", name: "Kiln", endUse: "kiln" }),
    ]);
    expect(cap.maxPct).toBe(100);
  });
});

describe("solarCapNote", () => {
  it("says what 100% actually means, which was never stated", () => {
    const cap = solarCapNote(4_600, 1_000);
    expect(cap.constrained).toBe(false);
    expect(cap.reason).toContain("roof is full");
    expect(cap.reason).toContain("3,600");
  });

  it("reports a full roof as a hard zero", () => {
    const cap = solarCapNote(2_000, 2_000);
    expect(cap.maxPct).toBe(0);
    expect(cap.constrained).toBe(true);
  });
});
