export function siteList(assets: { site?: string }[]): string[] {
  const set = new Set<string>();
  for (const a of assets) {
    const s = (a.site ?? "").trim();
    if (s) set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function filterBySite<T extends { site?: string }>(assets: T[], site: string): T[] {
  if (!site) return assets;
  return assets.filter((a) => (a.site ?? "").trim() === site);
}
