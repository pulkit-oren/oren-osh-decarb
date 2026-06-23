// @vitest-environment jsdom
/**
 * Task 8 E1: Scope 2 Builder efficiency/generation lever facility picker
 * must only show facilities with gridEf > 0 (the Purchased/grid records).
 * VPPA, Solar onsite, and I-REC (all gridEf 0) must NOT appear in the picker.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Scope2Provider } from "@/lib/scope2/store";
import { Scope2BuilderTab } from "../BuilderTab";
import type { Facility } from "@/lib/scope2/model/types";

/* ── Seed 4 electricity facilities (grid + vppa + solar + irec) into localStorage ── */

const BASE_YEAR = 2025;

const gridFacility: Facility = {
  id: "f-grid", name: "Purchased", bu: "Pune",
  annualLoadKwh: 4_000_000, tariffPerKwh: 8.5,
  loadSplit: { lightingPct: 15, motorPct: 55, hvacPct: 20 },
  roofSpaceM2: 9000, peakLoadKw: 1200, gridEf: 0.71, irradiance: 1500,
  isolated: false,
};

const vppaFacility: Facility = {
  id: "f-vppa", name: "Virtual PPA", bu: "Pune",
  annualLoadKwh: 500_000, tariffPerKwh: 8.5,
  loadSplit: { lightingPct: 15, motorPct: 55, hvacPct: 20 },
  roofSpaceM2: 0, peakLoadKw: 0, gridEf: 0, irradiance: 1500,
  isolated: false,
};

const solarFacility: Facility = {
  id: "f-solar", name: "Solar onsite", bu: "Pune",
  annualLoadKwh: 300_000, tariffPerKwh: 0,
  loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
  roofSpaceM2: 0, peakLoadKw: 0, gridEf: 0, irradiance: 1500,
  isolated: false,
};

const irecFacility: Facility = {
  id: "f-irec", name: "I-REC", bu: "Pune",
  annualLoadKwh: 200_000, tariffPerKwh: 0,
  loadSplit: { lightingPct: 0, motorPct: 0, hvacPct: 0 },
  roofSpaceM2: 0, peakLoadKw: 0, gridEf: 0, irradiance: 1500,
  isolated: false,
};

function seedAndRender() {
  const persisted = {
    facilities: {
      [BASE_YEAR]: [gridFacility, vppaFacility, solarFacility, irecFacility],
    },
    levers: {
      byFacility: {},
      procurement: {
        enabled: false, ppaPct: 0, greenTariffPct: 0, recPct: 0,
        ppaStrikeDeltaPerKwh: -0.5, greenTariffPremiumPerKwh: 0.8, recPricePerKwh: 0.45,
        re100Exclusion: false, startYear: 2026, targetYear: 2030,
      },
    },
    scenarios: [],
    baseYear: BASE_YEAR,
  };
  window.localStorage.setItem("osh-scope2-planner-v1", JSON.stringify(persisted));

  render(
    <Scope2Provider>
      <Scope2BuilderTab />
    </Scope2Provider>,
  );
}

describe("Scope2BuilderTab — E1: efficiency/generation lever picker (grid-only)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("lists the Purchased (grid) facility in the efficiency/generation picker", () => {
    seedAndRender();
    // The facility picker buttons for eff/gen are in the "Facility" section
    // The grid facility (gridEf 0.71) must appear as a selectable button
    const purchasedBtn = screen.getByRole("button", { name: /^Purchased$/i });
    expect(purchasedBtn).toBeTruthy();
  });

  it("does NOT show Virtual PPA in the efficiency/generation lever picker", () => {
    seedAndRender();
    // gridEf-0 facilities must be filtered out of the eff/gen picker
    expect(screen.queryByRole("button", { name: /^Virtual PPA$/i })).toBeFalsy();
  });

  it("does NOT show Solar onsite in the efficiency/generation lever picker", () => {
    seedAndRender();
    expect(screen.queryByRole("button", { name: /^Solar onsite$/i })).toBeFalsy();
  });

  it("does NOT show I-REC in the efficiency/generation lever picker", () => {
    seedAndRender();
    expect(screen.queryByRole("button", { name: /^I-REC$/i })).toBeFalsy();
  });
});
