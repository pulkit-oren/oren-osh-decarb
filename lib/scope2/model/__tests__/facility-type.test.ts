import { describe, expect, it } from "vitest";
import { FACILITY_TYPES, FACILITY_TYPE_LIST, facilityTypeProfile, type FacilityTypeId } from "@/lib/scope2/model/facility-type";

const IDS: FacilityTypeId[] = ["office","warehouse","dataCentre","factory","retail","coldStorage","hotel"];

describe("facility-type taxonomy", () => {
  it("has a self-consistent profile for every id", () => {
    for (const id of IDS) {
      expect(FACILITY_TYPES[id]).toBeTruthy();
      expect(FACILITY_TYPES[id].id).toBe(id);
    }
  });

  it("exposes a stable 7-item list", () => {
    expect(FACILITY_TYPE_LIST.map((p) => p.id)).toEqual(IDS);
  });

  it("load splits never exceed 100%", () => {
    for (const id of IDS) {
      const s = FACILITY_TYPES[id].loadSplit;
      expect(s.lightingPct + s.motorPct + s.hvacPct).toBeLessThanOrEqual(100);
    }
  });

  it("warehouse is strong solar, data centre is limited", () => {
    expect(FACILITY_TYPES.warehouse.solar.feasible).toBe("strong");
    expect(FACILITY_TYPES.dataCentre.solar.feasible).toBe("limited");
    expect(FACILITY_TYPES.warehouse.loadSplit.lightingPct).toBe(55);
  });

  it("facilityTypeProfile resolves or returns undefined", () => {
    expect(facilityTypeProfile({ facilityType: "office" })?.id).toBe("office");
    expect(facilityTypeProfile({})).toBeUndefined();
  });
});
