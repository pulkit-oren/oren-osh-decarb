// @vitest-environment jsdom

/* The stack the balance screen draws while a dial is moving. Its whole promise
   is that it cannot disagree with the numbers printed underneath it, and that
   over-delivery is never drawn past the end of the bar. */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GapStack, type GapSegment } from "../GapStack";
import { FAMILY_IDX } from "@/lib/model/palette";

const segs: GapSegment[] = [
  { key: "efficiency", label: "Efficiency", tonnes: 6_000, colorIdx: FAMILY_IDX.efficiency },
  { key: "procurement", label: "Procurement", tonnes: 5_500, colorIdx: FAMILY_IDX.procurement },
  { key: "solar", label: "Solar onsite", tonnes: 4_150, colorIdx: FAMILY_IDX.generation },
];

describe("GapStack", () => {
  it("says what is allocated against what is required", () => {
    render(<GapStack segments={segs} requiredT={23_090} targetPct={42} targetYear={2030} />);
    expect(screen.getByText(/15,650 of 23,090/)).toBeTruthy();
  });

  it("names the shortfall rather than leaving it to be subtracted", () => {
    render(<GapStack segments={segs} requiredT={23_090} targetPct={42} targetYear={2030} />);
    expect(screen.getByText("Still to find")).toBeTruthy();
    expect(screen.getByText("7,440 t")).toBeTruthy();
  });

  it("drops a lever contributing nothing", () => {
    render(
      <GapStack
        segments={[...segs, { key: "refrig", label: "Refrigerant", tonnes: 0, colorIdx: FAMILY_IDX.refrigerant }]}
        requiredT={23_090} targetPct={42} targetYear={2030}
      />,
    );
    expect(screen.queryByText("Refrigerant")).toBeNull();
  });

  it("spells over-delivery out in words instead of drawing past the end", () => {
    // A bar sweeping beyond its own target is a picture of a number that does
    // not exist. The surplus is stated; the geometry stays honest.
    render(<GapStack segments={segs} requiredT={10_000} targetPct={42} targetYear={2030} />);
    expect(screen.getByText(/over-delivers by/)).toBeTruthy();
    expect(screen.queryByText("Still to find")).toBeNull();
  });

  it("asks for a target before drawing anything", () => {
    render(<GapStack segments={segs} requiredT={0} targetPct={0} targetYear={2030} />);
    expect(screen.getByText(/Set a target above zero/)).toBeTruthy();
  });

  it("describes itself to a screen reader, not only to the eye", () => {
    render(<GapStack segments={segs} requiredT={23_090} targetPct={42} targetYear={2030} />);
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("Efficiency 6,000");
    expect(label).toContain("Short by 7,440");
  });
});
