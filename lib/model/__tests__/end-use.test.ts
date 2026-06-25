import { describe, expect, it } from "vitest";
import { END_USES, endUsesFor, type EndUseId } from "@/lib/model/end-use";

const ALL_IDS: EndUseId[] = ["car","van","truck","bus","forklift","heavyEquip","boiler","furnaceKiln","generator","dryer","spaceHeat","otherProcess"];

describe("end-use taxonomy", () => {
  it("has a profile for every id, keyed correctly", () => {
    for (const id of ALL_IDS) {
      expect(END_USES[id]).toBeTruthy();
      expect(END_USES[id].id).toBe(id);
    }
  });

  it("splits mobile vs stationary", () => {
    const mobile = endUsesFor("mobile").map((p) => p.id);
    const stationary = endUsesFor("stationary").map((p) => p.id);
    expect(mobile).toEqual(["car","van","truck","bus","forklift","heavyEquip"]);
    expect(stationary).toEqual(["boiler","furnaceKiln","generator","dryer","spaceHeat","otherProcess"]);
  });

  it("marks a high-temp kiln as hard to electrify and a truck as feasible", () => {
    expect(END_USES.furnaceKiln.electrify.feasible).toBe("hard");
    expect(END_USES.truck.electrify.feasible).toBe("yes");
    expect(END_USES.truck.electrify.capexPerUnit).toBeGreaterThan(0);
  });
});
