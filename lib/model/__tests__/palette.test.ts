/* The palette is family-indexed and validated. The previous one failed three of
   five checks — green against olive sat at ΔE 7.6 for NORMAL colour vision, and
   olive against terracotta at ΔE 3.1 under deuteranopia — on the two charts
   whose whole job is saying which lever did what. */

import { describe, it, expect } from "vitest";
import {
  FAMILY_COLORS, FAMILY_HUE, FAMILY_HUE_DEEP, FAMILY_IDX,
  FAMILY_COLOR_FALLBACK, familyColor,
} from "../palette";
import { compute } from "@/lib/model";
import { computeScope2 } from "@/lib/scope2/model";
import { DEFAULT_ASSETS, DEFAULT_SYSTEMS, DEFAULT_SETTINGS } from "@/lib/defaults";

describe("the palette itself", () => {
  it("holds six hues, not eight — the split rides on shade instead", () => {
    const hues = new Set(Object.values(FAMILY_HUE));
    // Six lever families plus one neutral for context that is not a lever.
    expect(hues.size).toBe(7);
  });

  it("gives every family a distinct hue", () => {
    expect(new Set(Object.values(FAMILY_HUE)).size).toBe(Object.keys(FAMILY_HUE).length);
  });

  it("makes each deep step DARKER than its family hue, not lighter", () => {
    // A lighter tint would fall under the 3:1 contrast floor against the
    // surface, and a contrast failure is not dismissable by adding a legend.
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const k of Object.keys(FAMILY_HUE) as (keyof typeof FAMILY_HUE)[]) {
      expect(lum(FAMILY_HUE_DEEP[k]), `${k} deep step`).toBeLessThan(lum(FAMILY_HUE[k]));
    }
  });

  it("resolves every index it defines", () => {
    for (const idx of Object.values(FAMILY_IDX)) {
      expect(FAMILY_COLORS[idx], `index ${idx}`).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("falls back to a neutral rather than inventing a hue", () => {
    // A generated colour would silently join the categorical set and destroy
    // the separation the palette exists to guarantee.
    expect(familyColor(99)).toBe(FAMILY_COLOR_FALLBACK);
    expect(familyColor(-1)).toBe(FAMILY_COLOR_FALLBACK);
  });
});

describe("what the engines actually emit", () => {
  const s1 = compute(DEFAULT_ASSETS, DEFAULT_SYSTEMS, DEFAULT_SETTINGS, 2025);

  it("colours a lever family the same in both scopes", () => {
    const facilities = [{
      id: "f1", name: "Purchased electricity", annualLoadKwh: 10_000_000, tariffPerKwh: 8.5,
      loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
      roofSpaceM2: 5_000, peakLoadKw: 2_000, gridEf: 0.71, irradiance: 1_600, isolated: false,
    }];
    const s2 = computeScope2(facilities, {
      byFacility: {}, procurement: {
        enabled: false, ppaPct: 0, greenTariffPct: 0, recPct: 0, ppaStrikeDeltaPerKwh: 0,
        greenTariffPremiumPerKwh: 0, recPricePerKwh: 0.45, re100Exclusion: false,
        startYear: 2026, targetYear: 2030,
      },
    }, 2025, DEFAULT_SETTINGS.assumptions);

    const s1Eff = s1.levers.find((l) => l.id === "efficiency")!;
    const s2Eff = s2.levers.find((l) => l.id === "efficiency")!;
    // Efficiency is efficiency whichever scope it sits in. Before this, the two
    // scopes picked from the same array by unrelated indices.
    expect(familyColor(s1Eff.colorIdx)).toBe(familyColor(s2Eff.colorIdx));
    expect(familyColor(s1Eff.colorIdx)).toBe(FAMILY_HUE.efficiency);
  });

  it("keeps a split family recognisably one family", () => {
    const byKey = Object.fromEntries(s1.segments.map((x) => [x.key, x.colorIdx]));
    const pairs: [string, string, keyof typeof FAMILY_HUE][] = [
      ["eff-mobile", "eff-stationary", "efficiency"],
      ["elec-mobile", "elec-stationary", "electrify"],
      ["fuel-mobile", "fuel-stationary", "fuelSwitch"],
      ["ref-leak", "ref-gas", "refrigerant"],
    ];
    for (const [a, b, family] of pairs) {
      if (byKey[a] === undefined || byKey[b] === undefined) continue;
      const colours = [familyColor(byKey[a]), familyColor(byKey[b])];
      // Two different marks...
      expect(colours[0]).not.toBe(colours[1]);
      // ...both drawn from the one family.
      expect(colours).toContain(FAMILY_HUE[family]);
      expect(colours).toContain(FAMILY_HUE_DEEP[family]);
    }
  });

  it("never emits an index the palette cannot resolve", () => {
    for (const w of s1.wedges) expect(familyColor(w.colorIdx)).not.toBe(FAMILY_COLOR_FALLBACK);
    for (const l of s1.levers) expect(familyColor(l.colorIdx)).not.toBe(FAMILY_COLOR_FALLBACK);
  });
});
