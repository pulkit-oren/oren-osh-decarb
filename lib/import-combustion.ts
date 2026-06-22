import { FUELS } from "@/lib/model/factors";
import type { CombustionAsset, FuelId } from "@/lib/model/types";

const FUEL_LOOKUP: Record<string, FuelId> = (() => {
  const m: Record<string, FuelId> = {};
  for (const id of Object.keys(FUELS) as FuelId[]) {
    m[id.toLowerCase()] = id;
    m[FUELS[id].label.toLowerCase()] = id;
  }
  return m;
})();

export function matchFuel(token: string): FuelId | null {
  return FUEL_LOOKUP[token.trim().toLowerCase()] ?? null;
}

export interface ParsedRow {
  asset: Omit<CombustionAsset, "id">;
  matched: boolean;
}

export function parseCombustionRows(text: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const delim = line.includes("\t") ? "\t" : ",";
    const cols = line.split(delim).map((c) => c.replace(/^"|"$/g, "").trim());
    const name = cols[0] || "Imported fuel";
    const amount = Number((cols[1] ?? "").replace(/[^0-9.\-]/g, "")) || 0;
    if (amount <= 0) continue;
    const fuelTok = cols[2] ?? "";
    const matchedId = matchFuel(fuelTok);
    const fuelId = matchedId ?? "diesel";
    out.push({
      asset: {
        name,
        category: "stationary",
        fuelType: fuelId,
        unit: FUELS[fuelId].unit,
        annualVolume: amount,
        opex: Math.round(amount * (FUELS[fuelId].typicalPricePerUnit ?? 0)),
        remainingLife: 10,
        unitCount: 1,
      },
      matched: matchedId != null,
    });
  }
  return out;
}
