import { describe, it, expect } from "vitest";
import { defaultSystemActions } from "../segments";
import { RECOMMENDED_ALT_BY_SYSTEM } from "../factors";
import type { RefrigerationSystem } from "../types";

const sys = (systemType: RefrigerationSystem["systemType"]): RefrigerationSystem => ({
  id: "x", name: "X", systemType, refrigerant: "R404A", toppedUpKg: 10, gasCostPerKg: 500,
});

describe("defaultSystemActions", () => {
  it("starts with both actions off and the recommended gas for the system type", () => {
    const d = defaultSystemActions(sys("industrialColdStorage"));
    expect(d.gasSwitch.enabled).toBe(false);
    expect(d.leakFix.enabled).toBe(false);
    expect(d.gasSwitch.altRefrigerant).toBe("R717");
    expect(d.gasSwitch.targetYear).toBeGreaterThan(d.gasSwitch.startYear);
  });

  it("recommended swap map covers every system type", () => {
    expect(RECOMMENDED_ALT_BY_SYSTEM.industrialColdStorage).toBe("R717");
    expect(RECOMMENDED_ALT_BY_SYSTEM.commercialHVAC).toBe("R454B");
    expect(RECOMMENDED_ALT_BY_SYSTEM.retailRefrigeration).toBe("R290");
  });
});
