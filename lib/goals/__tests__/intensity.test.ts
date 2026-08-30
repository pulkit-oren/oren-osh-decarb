/* Intensity goals divide by output. Until this was wired, GoalsState.output
   was stored, persisted and labelled "per ₹ crore revenue" — and read by
   nothing, so an emissions-intensity goal was scored on absolute tonnes and
   the word intensity was decoration. For a growing company the two targets are
   not close: they diverge by the whole of the growth. */

import { describe, it, expect } from "vitest";
import {
  actualsSeries, baseValueFor, isIntensityGoal, metricForYear, outputForYear,
  rawMetricForYear, type Inventories,
} from "../select";
import type { Goal } from "../types";
import type { CombustionByYear } from "@/lib/model/types";

const combustion: CombustionByYear = {
  2024: [{ id: "b", name: "Boiler", category: "stationary", fuelType: "diesel", unit: "L", annualVolume: 100_000, opex: 9_000_000, remainingLife: 10, unitCount: 1 }],
  2025: [{ id: "b", name: "Boiler", category: "stationary", fuelType: "diesel", unit: "L", annualVolume: 110_000, opex: 10_000_000, remainingLife: 10, unitCount: 1 }],
};

const inv = (output?: Record<number, number>): Inventories => ({
  combustion, refrigeration: {}, facilities: {}, output,
});

const goal = (templateId: Goal["templateId"]): Goal => ({
  id: "g", name: "g", category: "emissions", templateId, metric: "emissions_t",
  direction: "reduce", scope: "s1", baseYear: 2025, targetYear: 2030, targetPct: 42,
  milestones: [], createdAt: 0,
});

describe("isIntensityGoal", () => {
  it("reads the template, not the metric", () => {
    // Both carry metric `emissions_t`; only the template separates them.
    expect(isIntensityGoal(goal("intensity"))).toBe(true);
    expect(isIntensityGoal(goal("abs_sbti"))).toBe(false);
  });
});

describe("outputForYear", () => {
  it("treats zero, negative and missing alike — none is a usable denominator", () => {
    expect(outputForYear(inv({ 2025: 0 }), 2025)).toBeUndefined();
    expect(outputForYear(inv({ 2025: -5 }), 2025)).toBeUndefined();
    expect(outputForYear(inv({}), 2025)).toBeUndefined();
    expect(outputForYear(inv({ 2025: 2400 }), 2025)).toBe(2400);
  });
});

describe("metricForYear", () => {
  it("divides an intensity goal by output", () => {
    const i = inv({ 2025: 2400 });
    const absolute = rawMetricForYear(goal("intensity"), i, 2025);
    expect(absolute).toBeGreaterThan(0);
    expect(metricForYear(goal("intensity"), i, 2025)).toBeCloseTo(absolute / 2400, 9);
  });

  it("leaves an absolute goal absolute even when output exists", () => {
    const i = inv({ 2025: 2400 });
    expect(metricForYear(goal("abs_sbti"), i, 2025)).toBeCloseTo(rawMetricForYear(goal("abs_sbti"), i, 2025), 9);
  });

  it("returns NaN rather than the absolute figure when the denominator is missing", () => {
    // Falling back to absolute tonnes would answer a different question while
    // looking entirely plausible — the exact failure this fix exists to end.
    expect(metricForYear(goal("intensity"), inv({}), 2025)).toBeNaN();
  });
});

describe("actualsSeries", () => {
  it("plots only years that have BOTH halves of the ratio", () => {
    const years = actualsSeries(goal("intensity"), inv({ 2025: 2400 })).map((p) => p.year);
    expect(years).toEqual([2025]); // 2024 has emissions but no output
  });

  it("plots every year with data for an absolute goal", () => {
    const years = actualsSeries(goal("abs_sbti"), inv({ 2025: 2400 })).map((p) => p.year);
    expect(years).toEqual([2024, 2025]);
  });
});

describe("the divergence this fixes", () => {
  it("separates an absolute cut from an intensity cut by the whole of the growth", () => {
    /* The arithmetic a board needs to see. Emissions flat, output up 33.8%
       (6%/yr for five years): absolute reduction is zero, intensity reduction
       is 25%. Scoring an intensity goal on absolute tonnes reports the first
       number against a target set on the second. */
    const flat: CombustionByYear = { 2025: combustion[2025], 2030: combustion[2025] };
    const i: Inventories = {
      combustion: flat, refrigeration: {}, facilities: {},
      output: { 2025: 1000, 2030: 1338 },
    };
    const g = goal("intensity");

    const absBase = rawMetricForYear(g, i, 2025);
    const absEnd = rawMetricForYear(g, i, 2030);
    expect(absEnd / absBase).toBeCloseTo(1, 6); // absolute: no progress at all

    const intBase = baseValueFor(g, i);
    const intEnd = metricForYear(g, i, 2030);
    expect(1 - intEnd / intBase).toBeCloseTo(0.2526, 3); // intensity: a 25% cut
  });
});
