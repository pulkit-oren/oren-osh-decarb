/** Asset life per Scope 1 lever family. Drives the evaluation window, so an EV
 *  and a boiler retrofit stop being levelised over the same horizon. */
export const S1_LIFETIME_YEARS: Record<"efficiency" | "electrification" | "fuelSwitch" | "refrigerant", number> = {
  efficiency: 7,       // economiser packages, telematics kit
  electrification: 10, // blended EV (8) / heat pump & electric boiler (15)
  fuelSwitch: 15,      // burner retrofits, conversion kit
  refrigerant: 12,     // retrofit ↔ system replacement blend
};

/** Scope 2 families. `efficiency` is 8 here, not 7 — LED and BMS retrofits
 *  outlive a burner tune. Deliberately a separate table. */
export const S2_LIFETIME_YEARS: Record<"efficiency" | "generation" | "procurement", number> = {
  efficiency: 8, generation: 25, procurement: 10,
};

/** The window a lever is levelised over: from first install to the end of the
 *  LAST tranche's life. Chosen so every tranche gets its full life inside the
 *  window, which is what makes reinvestment and residual value both zero — see
 *  spec §5. Shortening this to `startYear + life` reintroduces both. */
export function windowFor(startYear: number, targetYear: number, assetLifeYears: number): { firstYear: number; lastYear: number } {
  const lastInstall = Math.max(startYear, targetYear);
  const life = Math.max(0, assetLifeYears);
  return { firstYear: startYear, lastYear: lastInstall + Math.max(0, life - 1) };
}
