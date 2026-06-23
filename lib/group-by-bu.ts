/** Group an array of items by their `bu` property.
 *  Items with no `bu` (or `bu === undefined`) land in the "Company-wide"
 *  bucket (empty-string key), which sorts first.  The rest sort
 *  alphabetically.
 */
export const groupByBu = <T extends { bu?: string }>(rows: T[]): [string, T[]][] => {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = r.bu ?? "";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === "" ? -1 : b === "" ? 1 : a.localeCompare(b),
  );
};
