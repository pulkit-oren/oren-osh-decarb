// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { EquipmentSection } from "../EquipmentSection";
import type { CombustionAsset } from "@/lib/model/types";

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

describe("EquipmentSection", () => {
  it("lists every equipment with its volume", () => {
    render(<EquipmentSection entry={entry()} onChange={() => {}} />);
    // Names are inline-editable inputs, so they carry a display VALUE rather
    // than text content (the brief's getByText guess predates that decision).
    expect(screen.getByDisplayValue("Boiler 1")).toBeTruthy();
    expect(screen.getByDisplayValue("Boiler 2")).toBeTruthy();
    expect(within(screen.getByTestId("equipment-row-e1")).getByLabelText(/volume/i)).toBeTruthy();
  });

  it("shows the capacity unit once, on the source, not per row (D9)", () => {
    render(<EquipmentSection entry={entry()} onChange={() => {}} />);
    const selector = screen.getByLabelText(/capacity measured in/i);
    expect((selector as HTMLSelectElement).value).toBe("tph");
    expect(screen.queryAllByText(/2\.0\s*tph/)).toHaveLength(0);
  });

  it("shows the running unit total (invariant 7)", () => {
    render(<EquipmentSection entry={fleet} onChange={() => {}} />);
    expect(screen.getByText(/5 units total/i)).toBeTruthy();
  });

  it("updates the unit total as a count is edited, without blocking the edit", () => {
    const onChange = vi.fn();
    render(<EquipmentSection entry={fleet} onChange={onChange} />);
    const row = screen.getByTestId("equipment-row-f1");
    fireEvent.change(within(row).getByLabelText(/units/i), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalled();
    const patch = onChange.mock.calls[0][0];
    expect(patch.equipment[0].unitCount).toBe(5);
  });

  it("writes the count onto the equipment, never flat on the entry", () => {
    const onChange = vi.fn();
    render(<EquipmentSection entry={fleet} onChange={onChange} />);
    const row = screen.getByTestId("equipment-row-f1");
    fireEvent.change(within(row).getByLabelText(/remaining life/i), { target: { value: "9" } });
    const patch = onChange.mock.calls[0][0];
    // resolveEquipment stamps these three FROM the equipment and ignores
    // anything flat, so a flat write would move the input and not the model.
    expect(patch.remainingLife).toBeUndefined();
    expect(patch.equipment[0].remainingLife).toBe(9);
  });

  it("adds equipment", () => {
    const onChange = vi.fn();
    render(<EquipmentSection entry={entry()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /add equipment/i }));
    expect(onChange.mock.calls[0][0].equipment).toHaveLength(3);
  });

  it("blocks deleting the last equipment (D8)", () => {
    const one = entry({ equipment: [{ id: "e1", name: "Only", unitCount: 1, remainingLife: 10 }], allocations: { e1: 188000 } });
    const onChange = vi.fn();
    render(<EquipmentSection entry={one} onChange={onChange} />);
    const row = screen.getByTestId("equipment-row-e1");
    fireEvent.click(within(row).getByRole("button", { name: /remove/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/at least one/i);
  });

  it("disables a basis with its stated reason rather than hiding it", () => {
    const noHours = entry({
      equipment: [
        { id: "e1", name: "B1", capacity: 2, unitCount: 1, remainingLife: 10 },
        { id: "e2", name: "B2", capacity: 1, unitCount: 1, remainingLife: 10 },
      ],
    });
    render(<EquipmentSection entry={noHours} onChange={() => {}} />);
    const load = screen.getByRole("option", { name: /load/i }) as HTMLOptionElement;
    expect(load.disabled).toBe(true);
    expect(screen.getByText(/2 equipment have no running hours/i)).toBeTruthy();
  });

  it("shows the explainer with the same number as the row", () => {
    render(<EquipmentSection entry={fleet} onChange={() => {}} />);
    expect(screen.getByText(/number of units/i)).toBeTruthy();
    expect(screen.getByText(/3 of 5 units/i)).toBeTruthy();
  });

  it("renders the explainer arrow verbatim, as U+2192 (Ruling D)", () => {
    render(<EquipmentSection entry={fleet} onChange={() => {}} />);
    const row = screen.getByText(/3 of 5 units/i).textContent ?? "";
    expect(row).toContain("→");
    expect(row).not.toContain("->");
  });

  it("switches to manual when a volume is typed, and writes only that row", () => {
    const onChange = vi.fn();
    render(<EquipmentSection entry={fleet} onChange={onChange} />);
    const row = screen.getByTestId("equipment-row-f1");
    fireEvent.change(within(row).getByLabelText(/volume/i), { target: { value: "60000" } });
    const patch = onChange.mock.calls[0][0];
    expect(patch.allocationBasis).toBe("manual");
    expect(patch.allocations.f1).toBe(60000);
    expect(patch.allocations.f2).toBe(48000);
  });

  it("announces a clamped overshoot through an alert (invariant 3)", () => {
    const onChange = vi.fn();
    render(<EquipmentSection entry={fleet} onChange={onChange} />);
    const row = screen.getByTestId("equipment-row-f1");
    fireEvent.change(within(row).getByLabelText(/volume/i), { target: { value: "500000" } });
    expect(screen.getByRole("alert").textContent).toMatch(/scaled back/i);
  });

  it("states the leftover under manual (invariant 2)", () => {
    const under = entry({ allocationBasis: "manual", allocations: { e1: 100000, e2: 50000 } });
    render(<EquipmentSection entry={under} onChange={() => {}} />);
    expect(screen.getByText(/unallocated/i).textContent).toMatch(/38,000/);
  });

  it("hides Redistribute under manual - there is no formula to redistribute from", () => {
    render(<EquipmentSection entry={entry({ allocationBasis: "manual" })} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /redistribute/i })).toBeNull();
  });

  it("confirms before changing the capacity unit when capacities exist (D9)", () => {
    const onChange = vi.fn();
    render(<EquipmentSection entry={entry()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/capacity measured in/i), { target: { value: "kW" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /change the unit/i }));
    expect(onChange.mock.calls[0][0].capacityUnit).toBe("kW");
  });

  it("heads the explainer 'How this is split' (spec 4.3)", () => {
    render(<EquipmentSection entry={fleet} onChange={() => {}} />);
    // Without it the user meets an unlabelled block of arithmetic.
    expect(screen.getByText(/how this is split/i)).toBeTruthy();
  });

  it("carries the source unit into the explainer, with a real × (spec 4.3)", () => {
    render(<EquipmentSection entry={entry()} onChange={() => {}} />);
    const row = screen.getByText(/of 18,000 total/i).textContent ?? "";
    expect(row).toContain("×");        // U+00D7, not an ASCII "x"
    expect(row).not.toContain(" x ");
    expect(row.endsWith("1,25,333.33 m³")).toBe(true);  // the unit rides along
    expect(screen.getByText(/in proportion to/i).textContent)
      .toContain("share of 1,88,000 m³ in proportion");
  });

  it("states the per-equipment spend, taken from the volume share (D5, invariant 6)", () => {
    render(<EquipmentSection entry={fleet} onChange={() => {}} />);
    // Spec 5.2 mockup 2, verbatim. 0.6 and 0.4 of the source's own opex, so the
    // figures sum back to it — the correction this branch exists to make.
    expect(screen.getByText(/spend follows the volume share/i).textContent)
      .toContain("₹68,40,000 and ₹45,60,000");
  });

  it("shows Unallocated even when it is zero (invariant 2)", () => {
    render(<EquipmentSection entry={fleet} onChange={() => {}} />);
    expect(screen.getByText(/unallocated/i).textContent).toMatch(/Unallocated:\s*0\s*L/);
  });

  it("warns before removing an equipment that carries a lever", () => {
    const onChange = vi.fn();
    render(<EquipmentSection entry={fleet} onChange={onChange} hasLever={(id) => id === "f1"} />);
    const levered = screen.getByTestId("equipment-row-f1");
    fireEvent.click(within(levered).getByRole("button", { name: /remove/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toMatch(/lever/i);
    fireEvent.click(screen.getByRole("button", { name: /remove it anyway/i }));
    expect(onChange.mock.calls[0][0].equipment.map((e: { id: string }) => e.id)).toEqual(["f2"]);
  });

  it("removes an equipment with no lever without a confirm", () => {
    const onChange = vi.fn();
    render(<EquipmentSection entry={fleet} onChange={onChange} hasLever={(id) => id === "f1"} />);
    const clean = screen.getByTestId("equipment-row-f2");
    fireEvent.click(within(clean).getByRole("button", { name: /remove/i }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onChange.mock.calls[0][0].equipment.map((e: { id: string }) => e.id)).toEqual(["f1"]);
  });

  it("tolerates a source with no equipment at all (Ruling K) and mints through the shared helper (Ruling O)", () => {
    const bare = entry({ equipment: undefined, allocations: undefined, endUse: "boiler" } as Partial<CombustionAsset>);
    const onChange = vi.fn();
    render(<EquipmentSection entry={bare} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /add equipment/i }));
    const minted = onChange.mock.calls[0][0].equipment;
    expect(minted).toHaveLength(1);
    // mintFirstEquipment reuses the entry id (so a saved lever still resolves)
    // and carries the entry's endUse across — the two things the hand-written
    // copies of this literal got wrong.
    expect(minted[0].id).toBe("c-1");
    expect(minted[0].endUse).toBe("boiler");
  });
});
