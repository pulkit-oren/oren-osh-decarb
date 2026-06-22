/* Background engine constants — spec midpoints. The curve choices are
   documented in docs/superpowers/specs/2026-06-12-scope2-module-design.md
   so auditors challenge the curve, not the code. */

export const LED_REDUCTION = 0.55; // LED cuts the lighting load 50-60%
export const MOTOR_REDUCTION = 0.125; // IE4/VFD cuts the motor load 10-15%
export const BMS_REDUCTION = 0.175; // BMS cuts HVAC + other load 15-20%
export const M2_PER_KW = 5.5; // roof space needed per kW of solar
/** Battery sized to half a day's average generation captures all spill. */
export const BATTERY_FULL_CAPTURE_DAYS = 0.5;
/** Max spill fraction with no battery (solar sized ≥ load self-consumes ~50%). */
export const SOLAR_ONLY_SPILL = 0.5;
