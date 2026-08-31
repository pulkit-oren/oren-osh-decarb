/* bauBasisLine: the one-line copy that states what basis a derived BAU rate
   was measured on. Pure function, five branches of user-facing text — tested
   directly rather than through the rendered panel, which would be slower and
   less precise about which branch produced which string. */
import { describe, expect, it } from "vitest";
import { bauBasisLine } from "../balance/AssumptionsPanel";
import type { DerivedGrowth } from "@/lib/bau";

const g = (over: Partial<DerivedGrowth>): DerivedGrowth => ({
  pct: 2.1, fromYear: 2021, toYear: 2025, years: 4,
  basis: "like-for-like", keptCount: 2, joined: [], left: [],
  ...over,
});

describe("bauBasisLine", () => {
  it("says nothing was derived when there is no rate", () => {
    expect(bauBasisLine(null, "source", "sources")).toMatch(/not enough years/i);
  });

  it("states the like-for-like basis, the span and the count, with no exclusion clause when nothing was excluded", () => {
    const line = bauBasisLine(g({ keptCount: 2, joined: [], left: [] }), "facility", "facilities");
    expect(line).toBe("measured on the 2 facilities present in both FY2021 and FY2025");
  });

  // The plural bug: "the 1 facilities" is grammatically wrong and is exactly
  // what shipped before this fix — this test must fail against the code
  // that passes one noun for both counts.
  it("uses the singular noun when exactly one source is kept", () => {
    const line = bauBasisLine(g({ keptCount: 1, joined: [], left: [] }), "facility", "facilities");
    expect(line).toBe("measured on the 1 facility present in both FY2021 and FY2025");
  });

  it("uses the singular noun for Scope 1 too", () => {
    const line = bauBasisLine(g({ keptCount: 1, joined: [], left: [] }), "source", "sources");
    expect(line).toBe("measured on the 1 source present in both FY2021 and FY2025");
  });

  it("names a single joined source and states it is excluded", () => {
    const line = bauBasisLine(g({ keptCount: 2, joined: ["Island resort"], left: [] }), "facility", "facilities");
    expect(line).toBe(
      "measured on the 2 facilities present in both FY2021 and FY2025. "
      + "Island resort joined after FY2021 and is excluded.",
    );
  });

  it("names a single left source and states it is excluded", () => {
    const line = bauBasisLine(g({ keptCount: 1, joined: [], left: ["Closed site"] }), "facility", "facilities");
    expect(line).toBe(
      "measured on the 1 facility present in both FY2021 and FY2025. "
      + "Closed site left before FY2025 and is excluded.",
    );
  });

  it("gives each clause its own exclusion statement when one source joins and another leaves", () => {
    const line = bauBasisLine(
      g({ keptCount: 1, joined: ["Genset"], left: ["Boiler"] }), "source", "sources",
    );
    // Each clause must stand alone — neither reads as depending on the other.
    expect(line).toBe(
      "measured on the 1 source present in both FY2021 and FY2025. "
      + "Genset joined after FY2021 and is excluded; Boiler left before FY2025 and is excluded.",
    );
  });

  it("pluralises within a clause when more than one source joins or leaves", () => {
    const line = bauBasisLine(
      g({ keptCount: 1, joined: ["Genset", "Boiler"], left: [] }), "source", "sources",
    );
    expect(line).toBe(
      "measured on the 1 source present in both FY2021 and FY2025. "
      + "Genset, Boiler joined after FY2021 and are excluded.",
    );
  });

  it("states the total basis with the FY span when nothing was excluded (the fallback's degenerate edge)", () => {
    const line = bauBasisLine(
      g({ basis: "total", keptCount: 0, joined: [], left: [] }), "facility", "facilities",
    );
    expect(line).toBe("measured on all facilities, FY2021 to FY2025 — the set did not change");
  });

  it("states the total basis with the FY span when a like-for-like basis could not be used", () => {
    const line = bauBasisLine(
      g({ basis: "total", keptCount: 0, joined: ["New-only site"], left: ["Old-only site"] }),
      "facility", "facilities",
    );
    expect(line).toBe("measured on all facilities, FY2021 to FY2025; a like-for-like basis was not available");
  });

  it("treats a bare (basis-less) DerivedGrowth as non-like-for-like rather than printing '0 sources'", () => {
    // deriveBauGrowth's own return value never sets basis/keptCount/joined/left.
    const bare: DerivedGrowth = { pct: 2.1, fromYear: 2021, toYear: 2025, years: 4 };
    const line = bauBasisLine(bare, "source", "sources");
    expect(line).not.toMatch(/\b0 sources\b/);
    expect(line).toBe("measured on all sources, FY2021 to FY2025 — the set did not change");
  });
});
