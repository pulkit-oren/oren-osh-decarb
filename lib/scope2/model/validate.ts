/* Non-blocking data-quality warnings for the Scope 2 inputs — surfaced in
   the UI, never thrown. Mirrors lib/model/validate.ts style. */

import { M2_PER_KW } from "./constants";
import type { Facility, Scope2Levers } from "./types";

export function validateScope2(facilities: Facility[], levers: Scope2Levers): string[] {
  const warnings: string[] = [];

  for (const f of facilities) {
    const { lightingPct, motorPct, hvacPct } = f.loadSplit;
    const sum = lightingPct + motorPct + hvacPct;
    if (sum > 100) warnings.push(`${f.name}: load split sums to ${sum}% (max 100%).`);
    if (f.annualLoadKwh < 0) warnings.push(`${f.name}: annual load is negative.`);
    if (f.gridEf < 0) warnings.push(`${f.name}: grid emission factor is negative.`);

    const acts = levers.byFacility[f.id];
    if (acts?.generation.enabled && acts.generation.solarKwp > 0) {
      const cap = Math.max(0, f.roofSpaceM2 / M2_PER_KW - (f.existingSolarKwp ?? 0));
      if (acts.generation.solarKwp > cap) {
        const existingNote = f.existingSolarKwp ? ` after ${Math.round(f.existingSolarKwp)} kWp already installed` : "";
        warnings.push(
          `${f.name}: new solar sized at ${Math.round(acts.generation.solarKwp)} kWp exceeds the ` +
          `${Math.round(cap)} kWp roof headroom${existingNote} (${M2_PER_KW} m²/kW) — capped in the model.`,
        );
      }
    }
  }

  const p = levers.procurement;
  const pSum = p.ppaPct + p.greenTariffPct + p.recPct;
  if (p.enabled && pSum > 100) {
    warnings.push(`Procurement instruments sum to ${pSum}% of the addressable load — clamped to 100%.`);
  }

  return warnings;
}
