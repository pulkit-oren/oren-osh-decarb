// @vitest-environment jsdom
// An initiative assigned to a persona appears in that persona's "Assigned to me"
// view, and not in another persona's.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GoalsProvider } from "@/lib/goals/store";
import { GoalsAssigned } from "../GoalsAssigned";
import type { Goal, Initiative } from "@/lib/goals/types";

const goal: Goal = {
  id: "g-0", name: "Cut S1+2 42%", category: "emissions", templateId: "abs_sbti",
  metric: "emissions_t", direction: "reduce", scope: "s1s2", baseYear: 2024, targetYear: 2030,
  targetPct: 42, milestones: [], createdAt: 1,
};
const init: Initiative = {
  id: "i-0", goalId: "g-0", name: "Electrify the forklift fleet", scope: "s1",
  status: "in_progress", startYear: 2025, targetYear: 2030, metricImpact: 120, budget: 0,
  progressPct: 40, auto: false, assignee: "plant",
};

beforeEach(() => {
  window.localStorage.setItem("osh-goals-v1", JSON.stringify({ goals: [goal], initiatives: [init], output: {} }));
});
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("Assigned to me", () => {
  it("shows the persona's initiative under its goal", () => {
    render(<GoalsProvider><GoalsAssigned persona="plant" /></GoalsProvider>);
    expect(screen.getByText("Electrify the forklift fleet")).toBeTruthy();
    expect(screen.getByText("Cut S1+2 42%")).toBeTruthy();
  });

  it("shows an empty state for a persona with nothing assigned", () => {
    render(<GoalsProvider><GoalsAssigned persona="cfo" /></GoalsProvider>);
    expect(screen.getByText(/Nothing assigned/)).toBeTruthy();
    expect(screen.queryByText("Electrify the forklift fleet")).toBeNull();
  });
});
