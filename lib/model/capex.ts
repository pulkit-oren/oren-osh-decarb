/* ============================================================
   CAPEX line registry — the fifteen things in this model that
   consume capital, plus the one procurement line that consumes
   none and has to say so.

   Models push flat CapexContribution records from the SAME
   expressions that already accumulate their lever capex, so the
   breakdown and the total are one set of additions. groupCapexLines
   holds the only interesting logic: quantity-weighted rate
   averaging and mixed-rate detection. Pure: no React, no I/O.
   ============================================================ */

/** Where a rate is stored, so the UI knows what a line-level edit writes to.
 *  `null` means the driver has no editable rate (procurement is priced per kWh
 *  in the procurement action, not as capital). */
export type CapexEditTarget =
  | { kind: "s1-asset"; action: "efficiency"; field: "capex" }
  | { kind: "s1-asset"; action: "electrify"; field: "assetCapex" }
  | { kind: "s1-asset"; action: "fuelSwitch"; field: "retrofitCapex" }
  | { kind: "s1-asset"; action: "flexFuel"; field: "vehicleCapex" }
  | { kind: "s1-system"; action: "leakFix"; field: "capex" }
  | { kind: "s1-system"; action: "chargeReduction"; field: "capex" }
  | { kind: "s1-system"; action: "gasSwitch"; field: "retrofitCapex" }
  | { kind: "s1-assumption"; field: "infraCapex" }
  | { kind: "s2-facility"; action: "efficiency"; field: "ledCapex" | "motorCapex" | "bmsCapex" }
  | { kind: "s2-facility"; action: "generation"; field: "solarCapexPerKw" | "batteryCapexPerKwh" | "subsidyPct" };

interface DriverMeta {
  label: string;
  scope: 1 | 2;
  /** The LeverSummary id this driver's spend rolls up into. */
  leverId: string;
  unitLabel?: string;
  rateLabel?: string;
  /** Keep the line even at zero — see spec 5.2. */
  alwaysShow?: boolean;
  edit: CapexEditTarget | null;
}

/* Declaration order IS display order: Scope 2 equipment, then Scope 1
   equipment, then the one line that costs no capital. */
export const CAPEX_DRIVERS = {
  "s2-led":            { label: "LED lighting",                  scope: 2, leverId: "efficiency",      edit: { kind: "s2-facility", action: "efficiency", field: "ledCapex" } },
  "s2-motor":          { label: "Motors / VFD",                   scope: 2, leverId: "efficiency",      edit: { kind: "s2-facility", action: "efficiency", field: "motorCapex" } },
  "s2-bms":            { label: "Building management system",     scope: 2, leverId: "efficiency",      edit: { kind: "s2-facility", action: "efficiency", field: "bmsCapex" } },
  // leverId matches Scope2LeverSummary.id ("generation" — see
  // lib/scope2/model/index.ts), NOT the "solar" wording of the driver labels.
  "s2-solar":          { label: "Rooftop solar",                  scope: 2, leverId: "generation", unitLabel: "kW",  rateLabel: "per kW",   edit: { kind: "s2-facility", action: "generation", field: "solarCapexPerKw" } },
  "s2-battery":        { label: "Battery",                        scope: 2, leverId: "generation", unitLabel: "kWh", rateLabel: "per kWh",  edit: { kind: "s2-facility", action: "generation", field: "batteryCapexPerKwh" } },
  "s2-solar-subsidy":  { label: "Solar subsidy",                  scope: 2, leverId: "generation",           edit: { kind: "s2-facility", action: "generation", field: "subsidyPct" } },
  "s1-efficiency":     { label: "Efficiency package",             scope: 1, leverId: "efficiency",      edit: { kind: "s1-asset", action: "efficiency", field: "capex" } },
  "s1-ev":             { label: "Electric vehicles",              scope: 1, leverId: "electrification", unitLabel: "vehicles", rateLabel: "per vehicle", edit: { kind: "s1-asset", action: "electrify", field: "assetCapex" } },
  "s1-heatpump":       { label: "Heat pumps / electric boilers",  scope: 1, leverId: "electrification", edit: { kind: "s1-asset", action: "electrify", field: "assetCapex" } },
  "s1-charging-infra": { label: "Charging + grid upgrade",        scope: 1, leverId: "electrification", edit: { kind: "s1-assumption", field: "infraCapex" } },
  "s1-fuel-retrofit":  { label: "Fuel-switch retrofit",           scope: 1, leverId: "fuelSwitch",      edit: { kind: "s1-asset", action: "fuelSwitch", field: "retrofitCapex" } },
  "s1-flexfuel":       { label: "Flex-fuel conversion",           scope: 1, leverId: "fuelSwitch", unitLabel: "vehicles", rateLabel: "per vehicle", edit: { kind: "s1-asset", action: "flexFuel", field: "vehicleCapex" } },
  "s1-ldar":           { label: "Leak-fix / LDAR programme",      scope: 1, leverId: "refrigerant",     edit: { kind: "s1-system", action: "leakFix", field: "capex" } },
  "s1-charge-cut":     { label: "Charge reduction",               scope: 1, leverId: "refrigerant",     edit: { kind: "s1-system", action: "chargeReduction", field: "capex" } },
  "s1-gas-retrofit":   { label: "Gas-switch retrofit",            scope: 1, leverId: "refrigerant",     edit: { kind: "s1-system", action: "gasSwitch", field: "retrofitCapex" } },
  // LAST deliberately: the only line that is not capital, so it reads as a
  // footer under the equipment rather than interrupting it mid-table.
  "s2-procurement":    { label: "Green electricity",              scope: 2, leverId: "procurement", alwaysShow: true, edit: null },
} as const satisfies Record<string, DriverMeta>;

export type CapexDriverId = keyof typeof CAPEX_DRIVERS;

/** One source's spend on one driver, pushed by the model. */
export interface CapexContribution {
  driverId: CapexDriverId;
  /** Asset / system / facility id, or "portfolio" for a company-wide lump. */
  sourceId: string;
  amount: number;
  /** Only when the driver genuinely decomposes: quantity x rate == amount. */
  quantity?: number;
  rate?: number;
}

export interface CapexLine {
  driverId: CapexDriverId;
  label: string;
  scope: 1 | 2;
  leverId: string;
  amount: number;
  sourceIds: string[];
  edit: CapexEditTarget | null;
  /** Present only for drivers that decompose. */
  unit?: { quantity: number; rate: number; unitLabel: string; rateLabel: string };
  /** Sources disagree about the rate, so `unit.rate` is a weighted average and
   *  a line-level edit would flatten them. */
  mixed: boolean;
}

const ORDER = Object.keys(CAPEX_DRIVERS) as CapexDriverId[];

export function groupCapexLines(contribs: CapexContribution[]): CapexLine[] {
  const lines: CapexLine[] = [];

  for (const driverId of ORDER) {
    const mine = contribs.filter((x) => x.driverId === driverId);
    if (mine.length === 0) continue;

    const meta = CAPEX_DRIVERS[driverId] as DriverMeta;
    const amount = mine.reduce((s, x) => s + x.amount, 0);
    if (amount === 0 && !meta.alwaysShow) continue;

    const priced = mine.filter((x) => x.quantity !== undefined && x.rate !== undefined);
    let unit: CapexLine["unit"];
    let mixed = false;
    if (priced.length > 0 && meta.unitLabel && meta.rateLabel) {
      const quantity = priced.reduce((s, x) => s + x.quantity!, 0);
      // Weighted by the quantity the rate multiplies. A plain mean would give a
      // 1 kW site the same say as a 999 kW one.
      const weighted = priced.reduce((s, x) => s + x.rate! * x.quantity!, 0);
      unit = {
        quantity,
        rate: quantity > 0 ? weighted / quantity : (priced[0].rate ?? 0),
        unitLabel: meta.unitLabel,
        rateLabel: meta.rateLabel,
      };
      mixed = priced.some((x) => Math.abs(x.rate! - priced[0].rate!) > 1e-9);
    }

    lines.push({
      driverId, label: meta.label, scope: meta.scope, leverId: meta.leverId,
      amount, sourceIds: mine.map((x) => x.sourceId), edit: meta.edit, unit, mixed,
    });
  }
  return lines;
}

export const sumCapexLines = (lines: CapexLine[]): number =>
  lines.reduce((s, l) => s + l.amount, 0);
