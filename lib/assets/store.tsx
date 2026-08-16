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
import { migrateAssets } from "@/lib/store-helpers";
import {
  addAsset, removeAsset, updateAsset, upsertAsset, ASSET_KEY_BASE,
} from "./helpers";
import type { Asset, AssetRegistry } from "./types";

interface AssetsStoreShape extends AssetRegistry {
  /** True once the one-time hydration effect has run — lets a consumer (e.g.
   *  Task 4's wiring) gate work until the persisted registry has actually
   *  loaded, instead of racing it. */
  hydrated: boolean;
  addUnit: (init: Omit<Asset, "id">) => void;
  /** Insert-or-replace by an EXPLICIT id, unlike addUnit (which always mints
   *  a fresh one). This is what the combustion-entry-creation handlers in
   *  lib/store.tsx must use, reusing the entry's own id as the asset id —
   *  matching migrateAssets's contract exactly, so the historical-backfill
   *  migration finds the asset already present on the next hydration and
   *  mints nothing. Using addUnit there instead mints a SECOND, differently-
   *  id'd self-asset every time the app reloads a session with new entries,
   *  because migrateAssets keys its idempotence on the ENTRY id, not on
   *  whatever fresh id addUnit minted. */
  upsertUnit: (asset: Asset) => void;
  updateUnit: (id: string, patch: Partial<Asset>) => void;
  removeUnit: (id: string, referencedIds: string[]) => void;
  /** Backfill one Asset per not-yet-migrated combustion entry. Not called
   *  from anywhere in this file yet — a future caller must gate this on
   *  `hydrated` to avoid racing the hydration effect above (an unconditional
   *  setAssets from a child mount effect firing before this provider's own
   *  hydration effect would discard the just-migrated assets when hydration
   *  lands the persisted registry). */
  ensureAssetsFor: (combustion: unknown) => void;
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

  const upsertUnit: AssetsStoreShape["upsertUnit"] = (asset) =>
    setAssets((prev) => upsertAsset({ assets: prev }, asset).assets);

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

  /* migrateAssets ALWAYS returns a fresh `{ assets: [...] }` — the spread in
   * its own implementation makes a new array even when it mints nothing new.
   * Calling setAssets with that fresh-but-unchanged result on every call
   * would make the registry object identity change every time, which is
   * exactly the shape of an infinite loop for any caller that lists this
   * registry (or this function) in a useEffect/useMemo dependency array: new
   * identity -> effect reruns -> ensureAssetsFor runs again -> new identity
   * -> ... So this compares the resulting ids against the current registry
   * first and returns WITHOUT calling setAssets when nothing changed. */
  const ensureAssetsFor: AssetsStoreShape["ensureAssetsFor"] = (combustion) => {
    const next = migrateAssets(combustion, { assets });
    const unchanged = next.assets.length === assets.length
      && next.assets.every((a, i) => a.id === assets[i].id);
    if (unchanged) return;
    setAssets(next.assets);
  };

  const value: AssetsStoreShape = {
    assets, hydrated,
    addUnit, upsertUnit, updateUnit, removeUnit, ensureAssetsFor,
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
