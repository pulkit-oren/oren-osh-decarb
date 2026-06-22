import { FUELS } from "@/lib/model/factors";
import type { FuelId, FuelUnit } from "@/lib/model/types";

/** Units a fuel can be displayed in: its reference unit plus the mass units,
 *  convertible via the fuel density. (Emissions are always computed on the
 *  reference-unit quantity; these are display-only conversions.) */
export function displayUnits(fuelId: FuelId): FuelUnit[] {
  const ref = FUELS[fuelId].unit;
  const out: FuelUnit[] = [ref];
  for (const u of ["kg", "t"] as FuelUnit[]) if (!out.includes(u)) out.push(u);
  return out;
}

const kgPerRef = (fuelId: FuelId) => FUELS[fuelId].densityKgPerUnit;

/** Reference-unit quantity → display-unit quantity. */
export function fromRef(valueRef: number, fuelId: FuelId, to: FuelUnit): number {
  const ref = FUELS[fuelId].unit;
  if (to === ref) return valueRef;
  const kg = valueRef * kgPerRef(fuelId);
  if (to === "kg") return kg;
  if (to === "t") return kg / 1000;
  return valueRef;
}

/** Display-unit quantity → reference-unit quantity. */
export function toRef(valueDisp: number, fuelId: FuelId, from: FuelUnit): number {
  const ref = FUELS[fuelId].unit;
  if (from === ref) return valueDisp;
  const d = kgPerRef(fuelId) || 1;
  if (from === "kg") return valueDisp / d;
  if (from === "t") return (valueDisp * 1000) / d;
  return valueDisp;
}
