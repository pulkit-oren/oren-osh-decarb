/* Pure asset-registry helpers — id minting reuses lib/store-helpers.
   Every function returns a new registry; none mutate their input.
   Mirrors lib/bu/helpers.ts. */

import { uniqueId } from "@/lib/store-helpers";
import type { Asset, AssetRegistry } from "./types";

export const ASSET_KEY_BASE = "osh-assets-v1";
export const assetKey = (companyId: string) => `${ASSET_KEY_BASE}::${companyId}`;

export function addAsset(reg: AssetRegistry, init: Omit<Asset, "id">): AssetRegistry {
  const name = init.name.trim();
  if (!name) return reg;
  const id = uniqueId("a", reg.assets.map((a) => a.id));
  return { assets: [...reg.assets, { ...init, id, name }] };
}

export function updateAsset(reg: AssetRegistry, id: string, patch: Partial<Asset>): AssetRegistry {
  return { assets: reg.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
}

/** Remove an asset. `referencedIds` is the set of asset ids still allocated to by
 *  any entry; removing a referenced asset throws so callers can surface a message. */
export function removeAsset(reg: AssetRegistry, id: string, referencedIds: string[]): AssetRegistry {
  if (referencedIds.includes(id)) {
    throw new Error(`Asset ${id} is referenced by one or more fuel entries`);
  }
  return { assets: reg.assets.filter((a) => a.id !== id) };
}

/** Insert an asset with an explicit id, or replace it if the id already exists.
 *  Used by the migration to mint assets that reuse their entry's id. */
export function upsertAsset(reg: AssetRegistry, asset: Asset): AssetRegistry {
  if (reg.assets.some((a) => a.id === asset.id)) {
    return { assets: reg.assets.map((a) => (a.id === asset.id ? asset : a)) };
  }
  return { assets: [...reg.assets, asset] };
}

export function assetsForBu(reg: AssetRegistry, buId: string): Asset[] {
  return reg.assets.filter((a) => a.buId === buId);
}

/** Every asset id referenced by a list of entries' byAsset allocation maps. */
export function referencedAssetIds(
  entries: { allocationMode?: string; assetAllocations?: Record<string, unknown> }[],
): string[] {
  const ids = new Set<string>();
  for (const e of entries) {
    if (e.allocationMode === "byAsset" && e.assetAllocations) {
      for (const id of Object.keys(e.assetAllocations)) ids.add(id);
    }
  }
  return [...ids];
}
