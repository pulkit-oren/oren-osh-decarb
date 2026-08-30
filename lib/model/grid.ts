/* ============================================================
   The grid gets cleaner. Everything here exists because it didn't.

   `gridEf` was a single scalar applied to every year out to 2050, so
   the model priced a 2045 kilowatt-hour at India's 2025 carbon
   intensity. The obvious consequence is overstated Scope 2 abatement.
   The consequence that actually changes decisions is subtler:

     - Every Scope 2 lever scales linearly with the grid factor, so
       their ranking AGAINST EACH OTHER survives a frozen grid intact.
     - Electrification does not. Its abatement is fuel-side, but the
       load it adds is charged at the grid factor - forever, at 0.71.

   So a frozen grid is not a neutral simplification. It is a standing
   penalty on the one lever that gets cheaper as the grid cleans, and
   that lever is the one heavy industry depends on. Fixing this moves
   electrification up the MACC where it belongs.

   The decline rate is an ASSUMPTION and is editable, defaulted rather
   than hidden: CEA's published grid factor has fallen steadily and
   India's stated capacity pipeline continues it. The default here
   takes 0.71 to roughly 0.59 by 2030 and 0.41 by 2040, which is
   deliberately more conservative than the NDC pathway - a model
   should not hand the user free abatement it cannot be held to.
   ============================================================ */

/** Default annual decline in grid carbon intensity, % per year. */
export const GRID_EF_DECLINE_PCT_DEFAULT = 3.5;

/** The factor never falls below this share of its base-year value. A grid at
 *  literal zero would make every Scope 2 lever worth infinitely little and
 *  divide-by-zero the ₹/tonne of anything measured against it. */
export const GRID_EF_FLOOR_RATIO = 0.1;

/** Multiplier on the base-year grid factor for `year`, in (0, 1].
 *  Years before the base year return 1 - the past is not re-stated. */
export function gridEfMultiplier(year: number, baseYear: number, declinePctPerYear?: number): number {
  const pct = Number.isFinite(declinePctPerYear as number)
    ? (declinePctPerYear as number)
    : GRID_EF_DECLINE_PCT_DEFAULT;
  // A negative rate (a dirtying grid) is representable; it is a legitimate
  // stress case for a captive-coal geography. Only the floor is enforced.
  const n = year - baseYear;
  if (n <= 0) return 1;
  const raw = Math.pow(1 - pct / 100, n);
  return Math.max(GRID_EF_FLOOR_RATIO, raw);
}

/** The grid factor itself in `year`, kgCO2e/kWh. */
export function gridEfForYear(
  baseEf: number, year: number, baseYear: number, declinePctPerYear?: number,
): number {
  return baseEf * gridEfMultiplier(year, baseYear, declinePctPerYear);
}

/** Bound the multiplier as a function, for handing to buildTrajectory. */
export function gridFactorFn(baseYear: number, declinePctPerYear?: number): (year: number) => number {
  return (year: number) => gridEfMultiplier(year, baseYear, declinePctPerYear);
}
