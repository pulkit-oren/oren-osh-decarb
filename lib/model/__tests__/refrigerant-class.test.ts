import { describe, expect, it } from "vitest";
import { REFRIG_CLASSES, REFRIG_CLASS_LIST, refrigClassesFor, refrigClassProfile, type RefrigClassId } from "@/lib/model/refrigerant-class";

const IDS: RefrigClassId[] = ["splitAc","vrf","chiller","packagedRooftop","coldRoom","blastFreezer","ammoniaPlant","displayCase","supermarketRack","bottleCooler"];

describe("refrigerant equipment-class taxonomy", () => {
  it("has a self-consistent profile for every id", () => {
    for (const id of IDS) {
      expect(REFRIG_CLASSES[id]).toBeTruthy();
      expect(REFRIG_CLASSES[id].id).toBe(id);
    }
  });

  it("exposes a stable 10-item list", () => {
    expect(REFRIG_CLASS_LIST.map((p) => p.id)).toEqual(IDS);
  });

  it("filters classes by parent system type", () => {
    expect(refrigClassesFor("retailRefrigeration").map((p) => p.id)).toEqual(["displayCase","supermarketRack","bottleCooler"]);
    expect(refrigClassesFor("commercialHVAC").map((p) => p.id)).toEqual(["splitAc","vrf","chiller","packagedRooftop"]);
  });

  it("maps classes to finer low-GWP swaps", () => {
    expect(REFRIG_CLASSES.displayCase.recommendedAlt).toBe("R290");
    expect(REFRIG_CLASSES.chiller.recommendedAlt).toBe("R1234ze");
    expect(REFRIG_CLASSES.coldRoom.recommendedAlt).toBe("R717");
  });

  it("refrigClassProfile resolves or returns undefined", () => {
    expect(refrigClassProfile({ equipmentClass: "splitAc" })?.id).toBe("splitAc");
    expect(refrigClassProfile({})).toBeUndefined();
  });
});
