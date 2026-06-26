import { applyEfficiency } from "./efficiency";
import { applyGeneration } from "./generation";
import { facilityTypeProfile } from "./facility-type";
import { M2_PER_KW } from "./constants";
import type { Facility, FacilityActions } from "./types";

export type Scope2LeverKind = "efficiency" | "generation";
export interface Scope2SuggestedAction { lever: Scope2LeverKind; patch: Record<string, number | string | boolean>; }
export interface Scope2Suggestion { headline: string; why: string; actions: Scope2SuggestedAction[]; altHeadline?: string; altActions?: Scope2SuggestedAction[]; }

const TARGET_YEAR = 2030;

export function roofCapKwp(f: Facility): number {
  return Math.max(0, f.roofSpaceM2 / M2_PER_KW - (f.existingSolarKwp ?? 0));
}

export function capexForFacility(f: Facility, acts: FacilityActions): number {
  let c = 0;
  if (acts.efficiency.enabled) c += applyEfficiency(f, acts.efficiency).capex;
  if (acts.generation.enabled) {
    const residual = acts.efficiency.enabled ? applyEfficiency(f, acts.efficiency).residualLoadKwh : f.annualLoadKwh;
    c += applyGeneration(f, acts.generation, residual).capex;
  }
  return c;
}

export function facilityImpact(f: Facility, acts: FacilityActions): { baseT: number; afterT: number } {
  const baseT = (f.annualLoadKwh * f.gridEf) / 1000;
  const eff = acts.efficiency.enabled ? applyEfficiency(f, acts.efficiency) : null;
  const residual = eff ? eff.residualLoadKwh : f.annualLoadKwh;
  const gen = acts.generation.enabled ? applyGeneration(f, acts.generation, residual) : null;
  const savedKwh = (eff?.savedKwh ?? 0) + (gen?.usedOnSiteKwh ?? 0);
  const afterT = Math.max(0, baseT - (savedKwh * f.gridEf) / 1000);
  return { baseT, afterT };
}

export function suggestForFacility(f: Facility): Scope2Suggestion {
  const prof = facilityTypeProfile(f);
  const ls = f.loadSplit;
  const cap = roofCapKwp(f);
  const solarStrong = prof ? prof.solar.feasible === "strong" || prof.solar.feasible === "good" : cap > 0;

  const efficiency: Scope2SuggestedAction = {
    lever: "efficiency",
    patch: { enabled: true, ledPct: ls.lightingPct > 0 ? 100 : 0, motorPct: ls.motorPct > 0 ? 100 : 0, bmsPct: ls.hvacPct > 0 ? 100 : 0, targetYear: TARGET_YEAR },
  };
  const solar: Scope2SuggestedAction | null = cap > 0
    ? { lever: "generation", patch: { enabled: true, solarKwp: Math.round(cap), targetYear: TARGET_YEAR } }
    : null;

  const dominant = ls.lightingPct >= ls.motorPct && ls.lightingPct >= ls.hvacPct ? "lighting (LED)"
    : ls.motorPct >= ls.hvacPct ? "motors (VFDs)" : "HVAC (BMS)";

  if (solar && solarStrong) {
    return {
      headline: `Add ${Math.round(cap)} kWp solar + efficiency by ${TARGET_YEAR}`,
      why: prof?.solar.note ?? `Roof fits ~${Math.round(cap)} kWp; pair it with ${dominant} efficiency.`,
      actions: [solar, efficiency],
      altHeadline: "Or start with efficiency only",
      altActions: [efficiency],
    };
  }
  return {
    headline: `Cut load with efficiency — ${dominant} first`,
    why: solar ? `Roof solar is limited here; lead with ${dominant}.` : `No roof headroom; lead with ${dominant}.`,
    actions: [efficiency],
    altHeadline: solar ? `Or add ${Math.round(cap)} kWp solar` : undefined,
    altActions: solar ? [solar] : undefined,
  };
}

export const efficiencyTip = (f: Facility) => {
  const ls = f.loadSplit;
  const d = ls.lightingPct >= ls.motorPct && ls.lightingPct >= ls.hvacPct ? "Lighting-heavy load → LED is the quick win."
    : ls.motorPct >= ls.hvacPct ? "Motor-heavy load → VFDs give the biggest cut." : "HVAC-heavy load → a BMS pays back well.";
  return d;
};
export const solarTip = (f: Facility) => `Roof fits about ${Math.round(roofCapKwp(f))} kWp of new solar (${M2_PER_KW} m²/kW).`;
