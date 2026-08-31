/* groupCapexLines — the one place per-source capex contributions become the
   display-ready lines the mix card shows. Pure arithmetic: no model runs. */

import { describe, expect, it } from "vitest";
import { CAPEX_DRIVERS, groupCapexLines, sumCapexLines, type CapexContribution } from "../capex";

const c = (over: Partial<CapexContribution> & Pick<CapexContribution, "driverId" | "sourceId" | "amount">): CapexContribution =>
  ({ quantity: undefined, rate: undefined, ...over });

describe("groupCapexLines", () => {
  it("aggregates one driver across sources into a single line", () => {
    const lines = groupCapexLines([
      c({ driverId: "s2-led", sourceId: "f1", amount: 100 }),
      c({ driverId: "s2-led", sourceId: "f2", amount: 250 }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].driverId).toBe("s2-led");
    expect(lines[0].amount).toBe(350);
    expect(lines[0].sourceIds).toEqual(["f1", "f2"]);
    expect(lines[0].label).toBe(CAPEX_DRIVERS["s2-led"].label);
  });

  it("drops drivers that spent nothing, and keeps ones flagged alwaysShow", () => {
    const lines = groupCapexLines([
      c({ driverId: "s2-led", sourceId: "f1", amount: 0 }),
      c({ driverId: "s2-procurement", sourceId: "portfolio", amount: 0 }),
    ]);
    // A zero-spend equipment line is noise; the zero-CAPEX procurement line is
    // the on-screen answer to "why is the Lowest CAPEX plan so cheap", so it
    // stays. See spec section 5.2.
    expect(lines.map((l) => l.driverId)).toEqual(["s2-procurement"]);
  });

  it("carries quantity x rate when every source agrees on the rate", () => {
    const lines = groupCapexLines([
      c({ driverId: "s2-solar", sourceId: "f1", amount: 200, quantity: 4, rate: 50 }),
      c({ driverId: "s2-solar", sourceId: "f2", amount: 300, quantity: 6, rate: 50 }),
    ]);
    expect(lines[0].unit).toEqual({ quantity: 10, rate: 50, unitLabel: "kW", rateLabel: "per kW" });
    expect(lines[0].mixed).toBe(false);
  });

  /* Weighted by the quantity the rate multiplies (kW here), never by anything
     else — a plain mean would misreport a 1 kW site and a 999 kW site. */
  it("reports a quantity-weighted rate and flags it mixed when sources differ", () => {
    const lines = groupCapexLines([
      c({ driverId: "s2-solar", sourceId: "f1", amount: 100, quantity: 10, rate: 10 }),
      c({ driverId: "s2-solar", sourceId: "f2", amount: 900, quantity: 30, rate: 30 }),
    ]);
    expect(lines[0].mixed).toBe(true);
    expect(lines[0].unit!.quantity).toBe(40);
    expect(lines[0].unit!.rate).toBeCloseTo(1_000 / 40, 9); // 25, not (10+30)/2
  });

  it("omits the unit block entirely for a lump-sum driver", () => {
    const lines = groupCapexLines([c({ driverId: "s1-ldar", sourceId: "sys1", amount: 100 })]);
    expect(lines[0].unit).toBeUndefined();
  });

  it("orders lines by the registry, so the card reads the same way every time", () => {
    const lines = groupCapexLines([
      c({ driverId: "s2-procurement", sourceId: "portfolio", amount: 0 }),
      c({ driverId: "s1-ldar", sourceId: "sys1", amount: 5 }),
      c({ driverId: "s2-led", sourceId: "f1", amount: 5 }),
    ]);
    const order = Object.keys(CAPEX_DRIVERS);
    const got = lines.map((l) => order.indexOf(l.driverId));
    expect(got).toEqual([...got].sort((a, b) => a - b));
  });

  it("sumCapexLines totals every line including negative ones", () => {
    const lines = groupCapexLines([
      c({ driverId: "s2-solar", sourceId: "f1", amount: 1_000 }),
      c({ driverId: "s2-solar-subsidy", sourceId: "f1", amount: -300 }),
    ]);
    expect(sumCapexLines(lines)).toBe(700);
  });
});

describe("CAPEX_DRIVERS", () => {
  it("gives every driver a label, a lever and an edit target or an explicit null", () => {
    for (const [id, d] of Object.entries(CAPEX_DRIVERS)) {
      expect(d.label, id).toBeTruthy();
      expect(d.leverId, id).toBeTruthy();
      expect(d.scope === 1 || d.scope === 2, id).toBe(true);
      expect(d.edit !== undefined, `${id} must state its edit target or null`).toBe(true);
    }
  });
});
