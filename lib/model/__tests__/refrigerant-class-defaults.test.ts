import { describe, expect, it } from "vitest";
import { defaultSystemActions } from "@/lib/model/segments";
import { RECOMMENDED_ALT_BY_SYSTEM } from "@/lib/model/factors";
import type { RefrigerationSystem } from "@/lib/model/types";

function sys(over: Partial<RefrigerationSystem>): RefrigerationSystem {
  return { id: "r1", name: "x", systemType: "retailRefrigeration", refrigerant: "R404A", toppedUpKg: 5, gasCostPerKg: 900, ...over };
}

describe("defaultSystemActions — equipment-class seeding", () => {
  it("no class reproduces the system-type default", () => {
    const d = defaultSystemActions(sys({}));
    expect(d.gasSwitch.altRefrigerant).toBe(RECOMMENDED_ALT_BY_SYSTEM.retailRefrigeration);
  });

  it("a display case sharpens the swap to R-290", () => {
    const d = defaultSystemActions(sys({ equipmentClass: "displayCase" }));
    expect(d.gasSwitch.altRefrigerant).toBe("R290");
  });

  it("a supermarket rack sharpens the swap to R-744 (differs from the retail default)", () => {
    const d = defaultSystemActions(sys({ equipmentClass: "supermarketRack" }));
    expect(d.gasSwitch.altRefrigerant).toBe("R744");
  });
});
