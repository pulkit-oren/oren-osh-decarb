/* Which levers earn a row in the capital breakdown, and in what order.
   Unit-tested rather than asserted through the panel because the shipped
   fixture activates only Scope 1 levers, so a rendered card cannot exercise
   the zero-capital case this selector exists to protect. */
import { describe, expect, it } from "vitest";
import { capitalRowsFrom } from "../balance/AssumptionsPanel";

type L = Parameters<typeof capitalRowsFrom>[0][number];

const lever = (over: Partial<L> & { id: string }): L => ({
  label: over.id, colorIdx: 0, enabled: true, capex: 0, annualOpexDelta: 0, ...over,
});

describe("capitalRowsFrom", () => {
  it("puts both scopes on one list, largest capital first", () => {
    const rows = capitalRowsFrom(
      [lever({ id: "small", capex: 1_000 }), lever({ id: "big", capex: 9_000_000 })],
      [lever({ id: "middle", capex: 400_000 })],
    );
    expect(rows.map((r) => r.id)).toEqual(["big", "middle", "small"]);
  });

  it("tags which engine each row came from", () => {
    const rows = capitalRowsFrom(
      [lever({ id: "s1thing", capex: 10 })],
      [lever({ id: "s2thing", capex: 20 })],
    );
    expect(rows.find((r) => r.id === "s1thing")!.scopeTag).toBe("S1");
    expect(rows.find((r) => r.id === "s2thing")!.scopeTag).toBe("S2");
  });

  it("keeps a lever that spends no capital but changes the yearly bill", () => {
    // Green procurement: no capital, not free. Dropping zero-capital lines is
    // how the answer to "why is the lowest-CAPEX plan so cheap" went missing.
    const rows = capitalRowsFrom(
      [],
      [lever({ id: "procurement", capex: 0, annualOpexDelta: 1_800_000 })],
    );
    expect(rows.map((r) => r.id)).toEqual(["procurement"]);
    expect(rows[0].capex).toBe(0);
  });

  it("sorts a zero-capital lever last without dropping it", () => {
    const rows = capitalRowsFrom(
      [lever({ id: "kit", capex: 5_000_000 })],
      [lever({ id: "procurement", capex: 0, annualOpexDelta: 1_800_000 })],
    );
    expect(rows.map((r) => r.id)).toEqual(["kit", "procurement"]);
  });

  it("leaves out a disabled lever even when it would cost money", () => {
    const rows = capitalRowsFrom(
      [lever({ id: "off", enabled: false, capex: 9_000_000, annualOpexDelta: -500_000 })],
      [],
    );
    expect(rows).toEqual([]);
  });

  it("leaves out an enabled lever that costs nothing either way", () => {
    // Nothing to say, so it says nothing — as distinct from the zero-capital
    // case above, which has a running cost worth stating.
    const rows = capitalRowsFrom([lever({ id: "inert" })], []);
    expect(rows).toEqual([]);
  });

  it("ignores sub-rupee noise rather than rendering a row for it", () => {
    const rows = capitalRowsFrom([lever({ id: "rounding", capex: 0.2, annualOpexDelta: 0.3 })], []);
    expect(rows).toEqual([]);
  });

  it("keeps a saving, not just a cost, as a reason to show a row", () => {
    const rows = capitalRowsFrom([lever({ id: "saver", capex: 0, annualOpexDelta: -900_000 })], []);
    expect(rows.map((r) => r.id)).toEqual(["saver"]);
  });
});
