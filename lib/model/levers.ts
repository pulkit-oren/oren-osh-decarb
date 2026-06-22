/* ============================================================
   Lever transforms — each rewrites the real fuel/gas profile of
   ONE asset and returns the tonnes moved. Pure functions; the
   compute aggregator scales them by ambition and ramp. Spec §5.
   ============================================================ */

import { combustionCO2e, combustionEnergyKJ, refrigerantCO2e } from "./baseline";
import { getAltFuel, getRefrigerant } from "./factors";
import type {
  AltFuelId,
  CombustionAsset,
  FuelUnit,
  RefrigerantId,
  RefrigerationSystem,
} from "./types";

/* ---------- A. Fuel switching ---------- */

export interface FuelSwitchInput {
  altFuel: AltFuelId;
  blendPct: number; // share of energy displaced
  efficiencyPenaltyPct: number;
}

export interface FuelSwitchResult {
  abatementT: number; // Scope 1 tonnes removed
  biogenicT: number; // reported separately (not Scope 1)
  newScope1T: number;
  altVolume: number;
  altUnit: FuelUnit;
}

export function applyFuelSwitch(a: CombustionAsset, cfg: FuelSwitchInput): FuelSwitchResult {
  const baseCO2e = combustionCO2e(a);
  const baseEnergy = combustionEnergyKJ(a);
  const b = clamp01(cfg.blendPct / 100);
  const penalty = clamp01(cfg.efficiencyPenaltyPct / 100);

  const fossilRemaining = (1 - b) * baseCO2e;
  const displacedEnergy = b * baseEnergy;
  // Lower CV + efficiency penalty → more biofuel energy input needed.
  const bioEnergyInput = penalty < 1 ? displacedEnergy / (1 - penalty) : displacedEnergy;

  const alt = getAltFuel(cfg.altFuel);
  const altVolume = bioEnergyInput / (alt.densityKgPerUnit * alt.cvKJperKg);
  const bioTotalCO2e = (altVolume * alt.co2eTotalPerUnit) / 1000;
  const biogenicT = bioTotalCO2e * alt.biogenicFraction;
  const bioFossilT = bioTotalCO2e - biogenicT; // CH4/N2O + non-bio → Scope 1

  const newScope1T = fossilRemaining + bioFossilT;
  return {
    abatementT: baseCO2e - newScope1T,
    biogenicT,
    newScope1T,
    altVolume,
    altUnit: alt.unit,
  };
}

/* ---------- B. Electrification (Scope 1 → Scope 2 shift) ---------- */

export interface ElectrificationInput {
  transitionPct: number; // share of fossil energy electrified
  cop: number; // heat-pump COP (stationary) / EV efficiency ratio (mobile)
  renewableSourcingPct: number;
  gridEf: number; // kgCO2e/kWh
}

export interface ElectrificationResult {
  scope1AbatementT: number;
  scope2AddedT: number;
  kWh: number;
}

export function applyElectrification(
  a: CombustionAsset,
  cfg: ElectrificationInput,
): ElectrificationResult {
  const baseCO2e = combustionCO2e(a);
  const baseEnergy = combustionEnergyKJ(a);
  const t = clamp01(cfg.transitionPct / 100);
  const cop = cfg.cop > 0 ? cfg.cop : 1;

  const scope1AbatementT = t * baseCO2e;
  const electrifiedEnergyKJ = t * baseEnergy;
  const kWh = electrifiedEnergyKJ / 3600 / cop; // kJ → kWh, then COP gain
  const cleanFrac = clamp01(cfg.renewableSourcingPct / 100);
  const scope2AddedT = (kWh * cfg.gridEf * (1 - cleanFrac)) / 1000;

  return { scope1AbatementT, scope2AddedT, kWh };
}

/* ---------- C. Fugitive / refrigerant ---------- */

export interface RefrigerantInput {
  transitionPct: number; // share of charge moved to alt gas
  altRefrigerant: RefrigerantId;
  leakImprovementPct: number; // reduction in leak rate
}

export interface RefrigerantResult {
  abatementT: number;
  newFugitiveT: number;
}

export function applyRefrigerant(
  s: RefrigerationSystem,
  cfg: RefrigerantInput,
): RefrigerantResult {
  const base = refrigerantCO2e(s);
  const baseGwp = getRefrigerant(s.refrigerant).gwp;
  const alt = getRefrigerant(cfg.altRefrigerant);
  const g = clamp01(cfg.transitionPct / 100);
  // Leak fix first: better maintenance cuts the annual top-up (the leak).
  const topUp = s.toppedUpKg * (1 - clamp01(cfg.leakImprovementPct / 100));

  const untransitioned = ((1 - g) * topUp * baseGwp) / 1000;
  // The switched portion needs less charge (volAdj), so it leaks proportionally less mass.
  const transitioned = (g * topUp * alt.volAdj * alt.gwp) / 1000;
  const newFugitiveT = untransitioned + transitioned;

  return { abatementT: base - newFugitiveT, newFugitiveT };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
