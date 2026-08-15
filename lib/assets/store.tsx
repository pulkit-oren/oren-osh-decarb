"use client";

/* ============================================================
   Asset registry store — company-level, year-independent asset
   identities that fuel entries allocate onto (lib/assets/types.ts,
   helpers.ts). Persists per-company to localStorage, mirroring the
   Goals / Scenario / Scope2 providers.
   ============================================================ */

import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from "react";
import {
  addAsset, removeAsset, updateAsset, ASSET_KEY_BASE,
} from "./helpers";
import type { Asset, AssetRegistry } from "./types";

interface AssetsStoreShape extends AssetRegistry {
  addUnit: (init: Omit<Asset, "id">) => void;
  updateUnit: (id: string, patch: Partial<Asset>) => void;
  removeUnit: (id: string, referencedIds: string[]) => void;
}

const Ctx = createContext<AssetsStoreShape | null>(null);
const DEFAULT_LS_KEY = ASSET_KEY_BASE;

/** Module-level constant, not a fresh `{ assets: [] }` literal per call —
 *  useAssetsOptional() hands this SAME object back every time there is no
 *  provider. A new object identity on every render would defeat any
 *  downstream `useMemo` keyed on the registry (e.g. the resolved-asset memos
 *  in lib/store.tsx), since a memo dependency that "changes" every render
 *  recomputes every render regardless of whether the data actually changed. */
const EMPTY_REGISTRY: AssetRegistry = { assets: [] };

function load(key: string): AssetRegistry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as AssetRegistry) : null;
  } catch {
    return null;
  }
}

export function AssetProvider({
  children,
  storageKey = DEFAULT_LS_KEY,
}: {
  children: ReactNode;
  storageKey?: string;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration */
    const p = load(storageKey);
    if (p && Array.isArray(p.assets)) setAssets(p.assets);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Both setAssets and setHydrated land in this SAME effect/commit, so
    // there is no intermediate render where hydrated is true but assets is
    // still the pre-hydration []  — that gap is what would let the persist
    // effect below fire once with an empty registry and clobber a real
    // saved one before the hydrated data ever reached state.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time per mount; key changes remount
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const data: AssetRegistry = { assets };
    window.localStorage.setItem(storageKey, JSON.stringify(data));
  }, [assets, hydrated, storageKey]);

  const addUnit: AssetsStoreShape["addUnit"] = (init) =>
    setAssets((prev) => addAsset({ assets: prev }, init).assets);

  const updateUnit: AssetsStoreShape["updateUnit"] = (id, patch) =>
    setAssets((prev) => updateAsset({ assets: prev }, id, patch).assets);

  /* removeUnit validates BEFORE touching setAssets, deliberately diverging
   * from the obvious "just throw inside the updater" shape. Throwing from
   * inside a setState updater does not reach the caller's try/catch — React
   * runs updaters eagerly outside the normal render flow, swallows the
   * throw there, and re-raises it during the next render instead, where no
   * caller-side catch is listening. This was confirmed empirically in the
   * predecessor repo: a probe of exactly this pattern logged
   * ESCAPED-TO-RENDER, meaning an inline "this asset is in use" error
   * message built on a caller try/catch would never display. Validating
   * here in the plain function body — before any setState call — throws on
   * the normal synchronous call stack, where the caller's try/catch (e.g. a
   * "delete asset" button handler) actually catches it. removeAsset's own
   * guard is left in place as defence in depth for any other caller that
   * reaches it directly. */
  const removeUnit: AssetsStoreShape["removeUnit"] = (id, referencedIds) => {
    if (referencedIds.includes(id)) {
      throw new Error(`Asset ${id} is referenced by one or more fuel entries`);
    }
    setAssets((prev) => removeAsset({ assets: prev }, id, referencedIds).assets);
  };

  const value: AssetsStoreShape = {
    assets,
    addUnit, updateUnit, removeUnit,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssets(): AssetsStoreShape {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAssets must be used within AssetProvider");
  return v;
}

/** Non-throwing accessor for consumers that may render with or without an
 *  AssetProvider in the tree (e.g. ScenarioProvider, which pre-existing
 *  tests mount standalone). Returns the registry only — no mutators — since
 *  a read-only escape hatch is all a memo consumer needs. */
export function useAssetsOptional(): AssetRegistry {
  const v = useContext(Ctx);
  return v ?? EMPTY_REGISTRY;
}
