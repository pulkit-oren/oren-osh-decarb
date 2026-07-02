// @vitest-environment jsdom
// Integration: the creation wizard inside the real Shell — nav → Set up goal →
// category → target type → configure → Activate → lands in My goals with
// auto-suggested initiatives from the seeded data.
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Shell } from "@/components/Shell";

afterEach(cleanup);

describe("Goals v2 — activate a goal from a template", () => {
  it("walks category → template → configure → Activate and lands in My goals", () => {
    render(<Shell />);

    fireEvent.click(screen.getAllByRole("button", { name: "Goals & targets" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Set up goal" }));

    // Step 1: category boxes
    fireEvent.click(screen.getByRole("button", { name: /Emissions goal/ }));
    // Step 2: target-type cards
    fireEvent.click(screen.getByRole("button", { name: /Absolute reduction/ }));
    // Step 3: configure draft, then activate
    expect(screen.getByDisplayValue("Absolute reduction (SBTi)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Activate goal/ }));

    // Lands in My goals as a box grid — open the goal's detail screen.
    fireEvent.click(screen.getByRole("button", { name: /Absolute reduction/ }));

    // Detail screen: the goal editor + its initiatives table with auto entries.
    expect(screen.getByDisplayValue("Absolute reduction (SBTi)")).toBeTruthy();
    expect(screen.getByText(/Initiatives \(/)).toBeTruthy();
    expect(screen.getAllByText("auto").length).toBeGreaterThan(0);
  });
});
