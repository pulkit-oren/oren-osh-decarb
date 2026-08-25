/** One named running-cost component. Positive = cost, negative = saving.
 *  `kind` selects the price-escalation line in the cashflow series. */
export interface OpexPart {
  label: string;
  amount: number;
  kind?: "fuel" | "elec" | "other";
}

/** How a source's unit price was arrived at. Travels with every derived figure
 *  so the UI can mark estimates and the export can name its assumptions.
 *  `unavailable` is deliberately distinct from `reference`: a fuel with no
 *  reference price must not masquerade as an estimate. */
export type PriceBasis = "measured" | "reference" | "unavailable";

export interface ResolvedPrice {
  pricePerUnit: number;
  basis: PriceBasis;
}

/** A year's annual bill, split into the part efficiency can cut and the part it
 *  cannot. `a.opex` has always been documented as "fuel plus related
 *  maintenance"; nothing honoured it until now. */
export interface SpendSplit {
  fuel: number;
  maintenance: number;
  basis: PriceBasis;
}
