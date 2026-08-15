// @vitest-environment jsdom
// AssetProvider / useAssets / useAssetsOptional.
//
// The load-bearing case: removeUnit on a referenced asset must be caught
// SYNCHRONOUSLY by the caller's own try/catch. Throwing from inside a
// setState updater does not reach the caller — React's eager-reducer path
// swallows it and re-raises during render instead — so removeUnit validates
// before it ever calls setAssets. See lib/assets/store.tsx for the full
// rationale.
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssetProvider, useAssets, useAssetsOptional } from "../store";
import { assetKey } from "../helpers";
import type { Asset, AssetRegistry } from "../types";

const KEY = assetKey("test-co");

const seedAsset: Asset = {
  id: "a-0", name: "Genset", buId: "bu-0", category: "stationary",
  unitCount: 1, remainingLife: 10, opex: 0,
};

/** Probe: calls removeUnit inside the caller's OWN try/catch — exactly the
 *  shape a real "delete asset" button would use — and renders the outcome. */
function RemoveProbe({ referencedIds }: { referencedIds: string[] }) {
  const { assets, removeUnit } = useAssets();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <div data-testid="count">{assets.length}</div>
      {error && <div data-testid="error">{error}</div>}
      <button
        onClick={() => {
          try {
            removeUnit("a-0", referencedIds);
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        remove
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.setItem(KEY, JSON.stringify({ assets: [seedAsset] }));
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("AssetProvider hydration + persistence", () => {
  it("hydrates a seeded registry from localStorage on mount", () => {
    render(<AssetProvider storageKey={KEY}><RemoveProbe referencedIds={[]} /></AssetProvider>);
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("does not overwrite a seeded registry with the pre-hydration empty default", () => {
    render(<AssetProvider storageKey={KEY}><RemoveProbe referencedIds={[]} /></AssetProvider>);
    const saved = JSON.parse(window.localStorage.getItem(KEY)!) as AssetRegistry;
    expect(saved.assets).toHaveLength(1);
    expect(saved.assets[0].id).toBe("a-0");
  });
});

describe("removeUnit — synchronous throw contract", () => {
  it("is caught synchronously by the caller when the asset is referenced, and removes nothing", () => {
    render(<AssetProvider storageKey={KEY}><RemoveProbe referencedIds={["a-0"]} /></AssetProvider>);
    expect(screen.getByTestId("count").textContent).toBe("1");

    fireEvent.click(screen.getByText("remove"));

    // Caught synchronously: the error reached the DOM via the caller's own
    // catch block, not via an error boundary / render crash.
    expect(screen.getByTestId("error").textContent).toMatch(/referenced/);
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("removes the asset and throws nothing when it is unreferenced", () => {
    render(<AssetProvider storageKey={KEY}><RemoveProbe referencedIds={[]} /></AssetProvider>);
    expect(screen.getByTestId("count").textContent).toBe("1");

    fireEvent.click(screen.getByText("remove"));

    expect(screen.queryByTestId("error")).toBeNull();
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("persists a successful removal to localStorage", () => {
    render(<AssetProvider storageKey={KEY}><RemoveProbe referencedIds={[]} /></AssetProvider>);
    fireEvent.click(screen.getByText("remove"));
    const saved = JSON.parse(window.localStorage.getItem(KEY)!) as AssetRegistry;
    expect(saved.assets).toHaveLength(0);
  });
});

describe("useAssets outside a provider", () => {
  it("throws", () => {
    function Bare() {
      useAssets();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/AssetProvider/);
  });
});

describe("useAssetsOptional", () => {
  it("returns an empty registry when there is no provider", () => {
    function Capture({ into }: { into: AssetRegistry[] }) {
      into.push(useAssetsOptional());
      return null;
    }
    const captured: AssetRegistry[] = [];
    render(<Capture into={captured} />);
    expect(captured[0].assets).toEqual([]);
  });

  it("returns a module-level constant, not a fresh object literal per call", () => {
    function Capture({ into }: { into: AssetRegistry[] }) {
      into.push(useAssetsOptional());
      return null;
    }
    const captured: AssetRegistry[] = [];
    render(<Capture into={captured} />);
    render(<Capture into={captured} />);
    expect(captured).toHaveLength(2);
    expect(captured[0]).toBe(captured[1]);
  });
});

/** Probe exposing addUnit/updateUnit directly — distinct from RemoveProbe,
 *  which only exposes removeUnit. */
function CrudProbe() {
  const { assets, addUnit, updateUnit } = useAssets();
  return (
    <div>
      <div data-testid="names">
        {assets.map((a) => `${a.id}:${a.name}:${a.unitCount}`).join(",")}
      </div>
      <button
        onClick={() => addUnit({
          name: "Boiler", buId: "bu-0", category: "stationary", unitCount: 1, remainingLife: 5, opex: 0,
        })}
      >
        add
      </button>
      <button onClick={() => updateUnit("a-0", { unitCount: 9 })}>update</button>
    </div>
  );
}

describe("addUnit / updateUnit", () => {
  it("addUnit adds a new asset visible through the hook", () => {
    render(<AssetProvider storageKey={KEY}><CrudProbe /></AssetProvider>);
    expect(screen.getByTestId("names").textContent).toBe("a-0:Genset:1");

    fireEvent.click(screen.getByText("add"));

    expect(screen.getByTestId("names").textContent).toBe("a-0:Genset:1,a-1:Boiler:1");
  });

  it("updateUnit patches one asset in place", () => {
    render(<AssetProvider storageKey={KEY}><CrudProbe /></AssetProvider>);

    fireEvent.click(screen.getByText("update"));

    expect(screen.getByTestId("names").textContent).toBe("a-0:Genset:9");
  });
});

describe("ensureAssetsFor — idempotence guard", () => {
  it("mints once, then no-ops on a repeat call with the same combustion (registry object identity unchanged)", () => {
    // migrateAssets always returns a FRESH { assets: [...] } array, even when
    // it mints nothing new. Without the length/id-equality guard in
    // ensureAssetsFor, a second call with the same combustion would still
    // call setAssets with that fresh-but-equivalent array, giving the
    // registry a new identity every call — exactly the shape of an infinite
    // loop for a consumer that depends on it. This asserts object identity,
    // not just count, so a regression reintroducing that unconditional
    // setAssets would fail this test even though the asset CONTENT would
    // still look correct.
    const combustion = {
      2025: [{
        id: "c-1", name: "New Genset", category: "stationary", unitCount: 2, remainingLife: 5, opex: 100,
      }],
    };
    const captured: Asset[][] = [];
    function EnsureProbe() {
      const { assets, ensureAssetsFor } = useAssets();
      captured.push(assets);
      return <button onClick={() => ensureAssetsFor(combustion)}>ensure</button>;
    }

    // Start from an empty registry so the first call actually mints "c-1".
    window.localStorage.removeItem(KEY);
    render(<AssetProvider storageKey={KEY}><EnsureProbe /></AssetProvider>);

    fireEvent.click(screen.getByText("ensure")); // mints "c-1"
    const afterFirst = captured[captured.length - 1];
    expect(afterFirst.map((a) => a.id)).toEqual(["c-1"]);

    fireEvent.click(screen.getByText("ensure")); // nothing new left to mint
    const afterSecond = captured[captured.length - 1];

    expect(afterSecond).toBe(afterFirst);
  });
});
