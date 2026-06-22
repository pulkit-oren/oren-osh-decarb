/* Pillar 1 — energy efficiency. LED / motor-VFD / BMS deployment sliders
   shrink the facility's load before solar or procurement see it. */

import { BMS_REDUCTION, LED_REDUCTION, MOTOR_REDUCTION } from "./constants";
import type { EfficiencyAction, Facility } from "./types";

export interface EfficiencyResult {
  ledKwh: number;
  motorKwh: number;
  bmsKwh: number;
  savedKwh: number;
  residualLoadKwh: number;
  capex: number;
  opexSaving: number;
}

export function applyEfficiency(f: Facility, a: EfficiencyAction): EfficiencyResult {
  if (!a.enabled) {
    return { ledKwh: 0, motorKwh: 0, bmsKwh: 0, savedKwh: 0, residualLoadKwh: f.annualLoadKwh, capex: 0, opexSaving: 0 };
  }
  const { lightingPct, motorPct, hvacPct } = f.loadSplit;
  const otherPct = Math.max(0, 100 - lightingPct - motorPct - hvacPct);
  const ledKwh = f.annualLoadKwh * (lightingPct / 100) * LED_REDUCTION * (a.ledPct / 100);
  const motorKwh = f.annualLoadKwh * (motorPct / 100) * MOTOR_REDUCTION * (a.motorPct / 100);
  const bmsKwh = f.annualLoadKwh * ((hvacPct + otherPct) / 100) * BMS_REDUCTION * (a.bmsPct / 100);
  const savedKwh = ledKwh + motorKwh + bmsKwh;
  return {
    ledKwh, motorKwh, bmsKwh, savedKwh,
    residualLoadKwh: f.annualLoadKwh - savedKwh,
    capex: a.ledCapex * (a.ledPct / 100) + a.motorCapex * (a.motorPct / 100) + a.bmsCapex * (a.bmsPct / 100),
    opexSaving: savedKwh * f.tariffPerKwh,
  };
}
