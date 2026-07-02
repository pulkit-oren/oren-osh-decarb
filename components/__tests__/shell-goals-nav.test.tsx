// @vitest-environment jsdom
// Integration regression: clicking the "Goals & targets" nav in the real Shell
// must render the goals screen (Topbar + GoalsTab) without crashing. This is
// the exact user flow that broke when the tab was added without a Topbar title.
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Shell } from "../Shell";

afterEach(cleanup);

describe("Shell → Goals & targets navigation", () => {
  it("renders the goals screen when the nav item is clicked", () => {
    render(<Shell />);

    // The desktop sidebar button is labelled by its tab name.
    const goalsButtons = screen.getAllByRole("button", { name: "Goals & targets" });
    fireEvent.click(goalsButtons[0]);

    // Topbar title for the goals tab + the goals sub-view toggle render.
    expect(screen.getAllByText("Goals & targets").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Set up goal").length).toBeGreaterThan(0);
    expect(screen.getByText("No goals to track yet")).toBeTruthy();
  });
});
