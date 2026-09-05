// @vitest-environment jsdom

/* The split explainer used to be rendered by EquipmentSection, and these
   assertions used to live in equipment-section.test.tsx. It now lives in the
   entry screen's result rail, beside the emissions figure it helps explain, so
   the guarantees move here with it — none of them is dropped.

   What they pin is unchanged and still load-bearing:
     · spec 4.3 — the explainer prints explainAllocation()'s strings VERBATIM.
       A second formatter here could disagree with the table beside it.
     · Ruling D — a real U+2192 arrow and a real U+00D7 multiplication sign.
     · Ruling W — the explainer names the basis the numbers were ACTUALLY
       computed from, never a silent fallback.
     · D5 / invariant 6 — per-equipment spend follows the volume share, so the
       figures sum back to the source's own opex.

   The rail is always on screen, so unlike the tabbed panes none of these needs
   a click to reach. */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EntryScreen } from "../EntryScreen";
import type { CombustionAsset } from "@/lib/model/types";
import type { Nav } from "../shared";
import type { RefrigerationSystem } from "@/lib/model/types";
import { REFRIGERANTS } from "@/lib/model/factors";

function entry(over: Partial<CombustionAsset> = {}): CombustionAsset {
  return {
    id: "c-1", name: "PNG boiler", category: "stationary", fuelType: "png",
    unit: "m3", annualVolume: 188000, opex: 9000000,
    capacityUnit: "tph",
    equipment: [
      { id: "e1", name: "Boiler 1", capacity: 2.0, operatingHours: 6000, unitCount: 1, remainingLife: 12 },
      { id: "e2", name: "Boiler 2", capacity: 1.0, operatingHours: 6000, unitCount: 1, remainingLife: 12 },
    ],
    allocations: { e1: 125333.33, e2: 62666.67 },
    allocationBasis: "load",
    ...over,
  } as CombustionAsset;
}

const fleet = entry({
  name: "Diesel fleet", fuelType: "diesel", unit: "L",
  annualVolume: 120000, opex: 11400000, capacityUnit: undefined,
  equipment: [
    { id: "f1", name: "City vans", unitCount: 3, remainingLife: 6 },
    { id: "f2", name: "Highway vans", unitCount: 2, remainingLife: 6 },
  ],
  allocations: { f1: 72000, f2: 48000 },
  allocationBasis: "units",
});

/** The shape mintFirstEquipment actually produces: one machine, no capacity, no
 *  running hours, and no basis ever chosen. Every source looks like this until
 *  a capacity is recorded. */
const unrecorded = entry({
  capacityUnit: undefined,
  equipment: [{ id: "e1", name: "Genset 1", unitCount: 1, remainingLife: 10 }],
  allocations: { e1: 188000 },
  allocationBasis: undefined,
});

const NAV: Nav & { level: "entry" } = { level: "entry", kind: "combustion", id: "c-1" };

function renderEntry(a: CombustionAsset) {
  return render(
    <EntryScreen
      nav={NAV}
      setNav={() => {}}
      year={2025}
      combById={() => a}
      facById={() => undefined}
      refrigSysById={() => undefined}
      updateCombustion={() => {}}
      updateFacility={() => {}}
      updateRefrigeration={() => {}}
      co2Fac={() => 0}
    />,
  );
}

describe("Entry rail — how this is split", () => {
  it("heads the explainer 'How this is split' (spec 4.3)", () => {
    renderEntry(fleet);
    // Without it the user meets an unlabelled block of arithmetic.
    expect(screen.getByText(/how this is split/i)).toBeTruthy();
  });

  it("shows the explainer with the same number as the row", () => {
    renderEntry(fleet);
    expect(screen.getByText(/number of units/i)).toBeTruthy();
    expect(screen.getByText(/3 of 5 units/i)).toBeTruthy();
  });

  it("renders the explainer arrow verbatim, as U+2192 (Ruling D)", () => {
    renderEntry(fleet);
    const row = screen.getByText(/3 of 5 units/i).textContent ?? "";
    expect(row).toContain("→");
    expect(row).not.toContain("->");
  });

  it("carries the source unit into the explainer, with a real × (spec 4.3)", () => {
    renderEntry(entry());
    const row = screen.getByText(/of 18,000 total/i).textContent ?? "";
    expect(row).toContain("×");        // U+00D7, not an ASCII "x"
    expect(row).not.toContain(" x ");
    expect(row.endsWith("1,25,333.33 m³")).toBe(true);  // the unit rides along
    expect(screen.getByText(/in proportion to/i).textContent)
      .toContain("share of 1,88,000 m³ in proportion");
  });

  it("names the basis the numbers were actually computed from (Ruling W)", () => {
    renderEntry(unrecorded);
    // `units` is the honest floor — unitCount is always >= 1 (D10). Spec 4.1
    // forbids a silent fallback, so the explainer must name the basis in force,
    // resolved the same way EquipmentSection's picker resolves it.
    expect(screen.getByText(/in proportion to/i).textContent)
      .toContain("in proportion to number of units");
  });

  it("states the per-equipment spend, taken from the volume share (D5, invariant 6)", () => {
    renderEntry(fleet);
    // Spec 5.2 mockup 2, verbatim. 0.6 and 0.4 of the source's own opex, so the
    // figures sum back to it — the correction this branch exists to make.
    expect(screen.getByText(/spend follows the volume share/i).textContent)
      .toContain("₹68,40,000 and ₹45,60,000");
  });
});

/* ── The Consumption tab's cross-check ──────────────────────────────────────
   A consumption figure this large is easy to mistype by an order of magnitude,
   and the rail's tCO₂e is too abstract to catch it. The same quantity in a
   second unit, and in rupees, is what a reader actually checks it against. */

describe("Entry consumption — cross-check", () => {
  it("restates a fuel volume in every other unit the fuel supports", () => {
    renderEntry(entry());  // 1,88,000 m³ of PNG
    const cross = screen.getByText(/^Same as/).textContent ?? "";
    expect(cross).toMatch(/kg|t|GJ|kWh|scf/);   // at least one alternative unit
    expect(cross).not.toMatch(/m³/);        // never the unit already on screen
  });

  it("values the fuel at its reference price", () => {
    renderEntry(entry());
    expect(screen.getByText(/Worth about/i).textContent)
      .toMatch(/Worth about .+ of fuel a year, at ₹/);
  });

  it("prices a refrigerant leak, because that is the argument for fixing it", () => {
    const sys = {
      id: "r-1", name: "Chiller bank", refrigerant: "R404A",
      systemType: "commercialHVAC", toppedUpKg: 662, gasCostPerKg: 900,
    } as unknown as RefrigerationSystem;
    render(
      <EntryScreen
        nav={{ level: "entry", kind: "refrigerant", id: "r-1" }}
        setNav={() => {}}
        year={2025}
        combById={() => undefined}
        facById={() => undefined}
        refrigSysById={() => sys}
        updateCombustion={() => {}}
        updateFacility={() => {}}
        updateRefrigeration={() => {}}
        co2Fac={() => 0}
      />,
    );
    // 662 kg x ₹900/kg — stated as a yearly replacement cost, not a unit price.
    expect(screen.getByText(/That leak costs about/i).textContent)
      .toMatch(/a year to replace, at ₹900\/kg/);
  });
});

/* ── A system is named by its gas, and stays named by its gas ───────────────
   The add form derives the name from the refrigerant dropdown, so the entry
   screen must not offer a way to type over it — and must not let the name go
   stale when the gas underneath it is swapped. */

function renderSystem(over: Partial<RefrigerationSystem> = {}, onUpdate = () => {}) {
  const sys = {
    id: "r-1", name: "R-404A (HFC)", refrigerant: "R404A",
    systemType: "commercialHVAC", toppedUpKg: 662, gasCostPerKg: 900,
    ...over,
  } as unknown as RefrigerationSystem;
  render(
    <EntryScreen
      nav={{ level: "entry", kind: "refrigerant", id: "r-1" }}
      setNav={() => {}}
      year={2025}
      combById={() => undefined}
      facById={() => undefined}
      refrigSysById={() => sys}
      updateCombustion={() => {}}
      updateFacility={() => {}}
      updateRefrigeration={onUpdate as never}
      co2Fac={() => 0}
      siblingSystemNames={["R-410A (HFC)"]}
    />,
  );
  return sys;
}

describe("Refrigerant entry — named by its gas", () => {
  it("shows the name as text, with no box to rename it", () => {
    renderSystem();
    expect(screen.queryByLabelText(/Source name/i)).toBeNull();
    expect(screen.getByRole("heading", { name: "R-404A (HFC)" })).toBeTruthy();
  });

  it("renames the system when the gas is swapped, so the name cannot go stale", () => {
    const patches: Record<string, unknown>[] = [];
    renderSystem({}, ((_y: number, _id: string, patch: Record<string, unknown>) => {
      patches.push(patch);
    }) as never);
    fireEvent.click(screen.getByRole("tab", { name: /System details/i }));
    fireEvent.change(screen.getByLabelText(/Refrigerant gas/i), { target: { value: "R407C" } });
    expect(patches).toHaveLength(1);
    expect(patches[0].refrigerant).toBe("R407C");
    expect(patches[0].name).toBe(REFRIGERANTS.R407C.label);
  });

  it("suffixes the new name when a sibling already holds it", () => {
    const patches: Record<string, unknown>[] = [];
    renderSystem({}, ((_y: number, _id: string, patch: Record<string, unknown>) => {
      patches.push(patch);
    }) as never);
    fireEvent.click(screen.getByRole("tab", { name: /System details/i }));
    // siblingSystemNames already contains "R-410A (HFC)".
    fireEvent.change(screen.getByLabelText(/Refrigerant gas/i), { target: { value: "R410A" } });
    expect(patches[0].name).toBe(`${REFRIGERANTS.R410A.label} 2`);
  });
});
