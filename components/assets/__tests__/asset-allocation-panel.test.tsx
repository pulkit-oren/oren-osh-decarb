// @vitest-environment jsdom
/**
 * Task 10 — AssetAllocationPanel.
 *
 * Covers: the unallocated readout for empty and partial states; a weighted
 * split computing correctly; the weight selector appearing only for the
 * weighted basis; carryForward with `previous` reproducing prior PROPORTIONS
 * against a different total; even splitting per UNIT (assets with differing
 * unitCount, so it cannot pass under an equal-per-asset implementation);
 * the filter excluding an electrical asset and an asset in a different BU;
 * clamp-and-warn on over-allocation; and the no-provider degrade path
 * (useAssetsOptional — must not throw with no AssetProvider above it).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AssetProvider } from "@/lib/assets/store";
import { assetKey } from "@/lib/assets/helpers";
import type { Asset, AssetRegistry } from "@/lib/assets/types";
import { AssetAllocationPanel } from "../AssetAllocationPanel";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const COMPANY_ID = "panel-test-co";
const ASSETS_KEY = assetKey(COMPANY_ID);

function seedAssets(assets: Asset[]) {
  const registry: AssetRegistry = { assets };
  window.localStorage.setItem(ASSETS_KEY, JSON.stringify(registry));
}

function renderPanel(props: Partial<React.ComponentProps<typeof AssetAllocationPanel>> = {}) {
  const onChange = vi.fn();
  const defaults: React.ComponentProps<typeof AssetAllocationPanel> = {
    total: 1000,
    unit: "L",
    bu: "Pune",
    allocations: {},
    basis: "manual",
    onChange,
  };
  render(
    <AssetProvider storageKey={ASSETS_KEY}>
      <AssetAllocationPanel {...defaults} {...props} />
    </AssetProvider>,
  );
  return { onChange };
}

const stationaryPune = (id: string, over: Partial<Asset> = {}): Asset => ({
  id, name: id, buId: "Pune", category: "stationary",
  unitCount: 1, remainingLife: 10, opex: 0, ...over,
});

/* ── No-provider degrade path ────────────────────────────────────────────── */

describe("AssetAllocationPanel — no AssetProvider", () => {
  it("does not throw and shows a hint instead of a crash", () => {
    const onChange = vi.fn();
    expect(() =>
      render(
        <AssetAllocationPanel
          total={1000} unit="L" bu="Pune" allocations={{}} basis="manual" onChange={onChange}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByText(/no assets/i)).toBeTruthy();
  });
});

/* ── Unallocated readout ──────────────────────────────────────────────────── */

describe("AssetAllocationPanel — unallocated readout", () => {
  it("shows the full total when nothing is allocated", () => {
    seedAssets([stationaryPune("a-0")]);
    renderPanel({ total: 1000, allocations: {} });
    expect(screen.getByText("1,000")).toBeTruthy();
  });

  it("shows the remainder for a partial allocation", () => {
    seedAssets([stationaryPune("a-0"), stationaryPune("a-1")]);
    renderPanel({ total: 1000, allocations: { "a-0": 400 } });
    expect(screen.getByText("600")).toBeTruthy();
  });
});

/* ── Filtering ────────────────────────────────────────────────────────────── */

describe("AssetAllocationPanel — filters the asset list", () => {
  it("excludes an electrical asset and an asset in a different BU", () => {
    seedAssets([
      stationaryPune("eligible-1"),
      stationaryPune("electrical-1", { category: "electrical" }),
      stationaryPune("other-bu-1", { buId: "Mumbai" }),
    ]);
    renderPanel({ bu: "Pune" });
    expect(screen.getByText("eligible-1")).toBeTruthy();
    expect(screen.queryByText("electrical-1")).toBeFalsy();
    expect(screen.queryByText("other-bu-1")).toBeFalsy();
  });
});

/* ── Weight selector visibility ──────────────────────────────────────────── */

describe("AssetAllocationPanel — weight selector visibility", () => {
  it("does NOT show the weight-attribute selector for a non-weighted basis", () => {
    seedAssets([stationaryPune("a-0")]);
    renderPanel({ basis: "even" });
    expect(screen.queryByLabelText(/weight attribute/i)).toBeFalsy();
  });

  it("shows the weight-attribute selector only for the weighted basis", () => {
    seedAssets([stationaryPune("a-0")]);
    renderPanel({ basis: "weighted", weightAttribute: "ratedCapacity" });
    expect(screen.getByLabelText(/weight attribute/i)).toBeTruthy();
  });
});

/* ── Even split — per UNIT, not per asset ────────────────────────────────── */

describe("AssetAllocationPanel — even basis", () => {
  it("splits per unit (differing unitCount), not evenly per asset", () => {
    seedAssets([
      stationaryPune("a-0", { unitCount: 5 }),
      stationaryPune("a-1", { unitCount: 1 }),
    ]);
    const { onChange } = renderPanel({ total: 6000, basis: "even", allocations: {} });

    fireEvent.click(screen.getByRole("button", { name: /redistribute/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      allocationMode: "byAsset",
      allocationBasis: "even",
      assetAllocations: { "a-0": { volume: 5000 }, "a-1": { volume: 1000 } },
    }));
  });
});

/* ── Weighted split ───────────────────────────────────────────────────────── */

describe("AssetAllocationPanel — weighted basis", () => {
  it("computes a weighted split by rated capacity", () => {
    seedAssets([
      stationaryPune("a-0", { ratedCapacity: 1000 }),
      stationaryPune("a-1", { ratedCapacity: 500 }),
    ]);
    const { onChange } = renderPanel({
      total: 3000, basis: "weighted", weightAttribute: "ratedCapacity", allocations: {},
    });

    fireEvent.click(screen.getByRole("button", { name: /redistribute/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      allocationMode: "byAsset",
      allocationBasis: "weighted",
      weightAttribute: "ratedCapacity",
      assetAllocations: { "a-0": { volume: 2000 }, "a-1": { volume: 1000 } },
    }));
  });
});

/* ── carryForward — reuses PRIOR PROPORTIONS, not prior absolute volumes ─── */

describe("AssetAllocationPanel — carryForward basis", () => {
  it("reproduces prior proportions against a different total", () => {
    seedAssets([stationaryPune("a-0"), stationaryPune("a-1")]);
    const { onChange } = renderPanel({
      total: 2000, // prior total was 1000 (750/250 = 75/25 split)
      basis: "carryForward",
      allocations: {},
      previous: { "a-0": 750, "a-1": 250 },
    });

    fireEvent.click(screen.getByRole("button", { name: /redistribute/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      allocationMode: "byAsset",
      allocationBasis: "carryForward",
      assetAllocations: { "a-0": { volume: 1500 }, "a-1": { volume: 500 } },
    }));
  });

  it("reproduces the prior 90/10 proportion against a smaller total, proving `previous` reached computeAllocation", () => {
    seedAssets([stationaryPune("a-0"), stationaryPune("a-1")]);
    const { onChange } = renderPanel({
      total: 500, // prior total was 1000 (900/100 = 90/10 split)
      basis: "carryForward", allocations: {}, previous: { "a-0": 900, "a-1": 100 },
    });

    fireEvent.click(screen.getByRole("button", { name: /redistribute/i }));

    // 90/10 split of the prior year reproduced against the new total —
    // proves `previous` actually reached computeAllocation, since falling
    // back to even weighting would have produced a 250/250 split instead.
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      assetAllocations: { "a-0": { volume: 450 }, "a-1": { volume: 50 } },
    }));
  });
});

/* ── Clamp and warn on over-allocation ────────────────────────────────────── */

describe("AssetAllocationPanel — clamp and warn", () => {
  it("scales an over-allocation back down and shows a warning", () => {
    seedAssets([stationaryPune("a-0"), stationaryPune("a-1")]);
    const { onChange } = renderPanel({
      total: 1000, basis: "manual", allocations: { "a-0": 500, "a-1": 500 },
    });

    fireEvent.change(screen.getByLabelText("a-1 allocation"), { target: { value: "1500" } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      allocationMode: "byAsset",
      allocationBasis: "manual",
      assetAllocations: { "a-0": { volume: 250 }, "a-1": { volume: 750 } },
    }));
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("does NOT show the warning for a within-budget allocation", () => {
    seedAssets([stationaryPune("a-0"), stationaryPune("a-1")]);
    renderPanel({ total: 1000, basis: "manual", allocations: { "a-0": 400, "a-1": 400 } });
    expect(screen.queryByRole("alert")).toBeFalsy();
  });
});
