"use client";

/* ============================================================
   Asset allocation panel — Task 10. Lets a user split one fuel
   entry's annualVolume across the company's assets, writing
   `allocationMode: "byAsset"` + `assetAllocations` back onto the
   entry via `onChange`.

   Reads the asset registry itself via useAssetsOptional() — never
   the throwing useAssets() — so it degrades gracefully with NO
   AssetProvider above it: components/tabs/__tests__/empty-field-
   guards.test.tsx (frozen) renders EntryScreen's fuel branch wrapped
   in CompanyProvider -> ScenarioProvider -> Scope2Provider ->
   EsgProvider only, and this panel is a child of that branch.

   Everything else — total, unit, the entry's business unit, the
   CURRENT allocation, basis, weightAttribute, and the prior-period
   figures `carryForward` needs — arrives as props. In particular
   `previous` must be looked up by whichever component already holds
   the scenario store (ActivityDataTab) and threaded down; this panel
   never reaches into that store itself.
   ============================================================ */

import { useState } from "react";
import { useAssetsOptional } from "@/lib/assets/store";
import { computeAllocation, clampAllocation, unallocated } from "@/lib/assets/allocate";
import type { AllocationBasis, WeightAttribute } from "@/lib/assets/types";
import { fmt } from "@/lib/utils";

export interface AssetAllocationPanelProps {
  /** The entry's annualVolume, in its reference unit. */
  total: number;
  /** Reference-unit label (e.g. "L", "kg", "m³") — display only. */
  unit: string;
  /** The entry's business unit (bare name; "" = company-wide / unassigned).
   *  Compared name-to-name against each asset's buId (lib/assets/types.ts). */
  bu: string;
  /** Current per-asset volumes, keyed by asset id — FLAT numbers, not the
   *  `{ volume }` wrapper CombustionAsset.assetAllocations persists as. */
  allocations: Record<string, number>;
  basis: AllocationBasis;
  weightAttribute?: WeightAttribute;
  /** Prior-period per-asset volumes for "carryForward". Absent ⇒
   *  computeAllocation falls back to even weighting. */
  previous?: Record<string, number>;
  onChange: (patch: {
    allocationMode: "byAsset";
    assetAllocations: Record<string, { volume: number }>;
    allocationBasis: AllocationBasis;
    weightAttribute?: WeightAttribute;
  }) => void;
}

const BASIS_OPTIONS: { value: AllocationBasis; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "even", label: "Even (per unit)" },
  { value: "weighted", label: "Weighted" },
  { value: "carryForward", label: "Carry forward (prior year)" },
];

const WEIGHT_OPTIONS: { value: WeightAttribute; label: string }[] = [
  { value: "ratedCapacity", label: "Rated capacity" },
  { value: "operatingHours", label: "Operating hours" },
  { value: "unitCount", label: "Unit count" },
  { value: "lastPeriod", label: "Last period" },
];

function wrapVolumes(alloc: Record<string, number>): Record<string, { volume: number }> {
  return Object.fromEntries(Object.entries(alloc).map(([id, volume]) => [id, { volume }]));
}

export function AssetAllocationPanel({
  total, unit, bu, allocations, basis, weightAttribute, previous, onChange,
}: AssetAllocationPanelProps) {
  const registry = useAssetsOptional();
  const [overflow, setOverflow] = useState(false);

  // Filter to non-electrical assets in this entry's BU. An unfiltered list
  // would let a user allocate onto an asset resolveAssets() silently drops
  // (lib/assets/resolve.ts only keeps non-electrical, registry-present ids),
  // so the panel would read "fully allocated" while the engine reports a
  // remainder.
  const eligible = registry.assets.filter(
    (a) => a.category !== "electrical" && (a.buId || "") === (bu || ""),
  );

  if (eligible.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        No assets in this business unit yet. Add one from the Assets screen to split this entry across equipment.
      </p>
    );
  }

  const unallocatedVol = unallocated(total, allocations);

  const commit = (
    nextBasis: AllocationBasis,
    nextWeightAttribute: WeightAttribute | undefined,
    computed: Record<string, number>,
  ) => {
    const rawSum = Object.values(computed).reduce((s, v) => s + (v || 0), 0);
    const clamped = clampAllocation(total, computed);
    setOverflow(rawSum > total + 0.005);
    onChange({
      allocationMode: "byAsset",
      assetAllocations: wrapVolumes(clamped),
      allocationBasis: nextBasis,
      weightAttribute: nextWeightAttribute,
    });
  };

  // Recomputes from scratch using CURRENT inputs — this is what "Redistribute"
  // calls, and what a basis/weight-attribute change calls too. Needed because
  // (a) a computed basis goes stale once the entry's total changes and
  // nothing re-derives it automatically, and (b) re-selecting an
  // already-selected <option> fires no onChange in a real browser, so the
  // user needs an explicit action independent of the <select> firing.
  const redistribute = (nextBasis: AllocationBasis, nextWeightAttribute: WeightAttribute | undefined) => {
    const computed = computeAllocation({
      entryVolume: total,
      basis: nextBasis,
      assets: eligible,
      weightAttribute: nextWeightAttribute,
      previous,
      existing: allocations,
    });
    commit(nextBasis, nextWeightAttribute, computed);
  };

  const onBasisChange = (nextBasis: AllocationBasis) => redistribute(nextBasis, weightAttribute);
  const onWeightChange = (attr: WeightAttribute) => redistribute("weighted", attr);
  const onRedistribute = () => redistribute(basis, weightAttribute);

  // A direct row edit is always a manual override — it takes effect
  // immediately (not gated behind Redistribute), and clamps if it now
  // overshoots the entry total.
  const onRowChange = (assetId: string, value: number) => {
    const nextRaw = { ...allocations, [assetId]: value };
    commit("manual", undefined, nextRaw);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Split by</span>
          <select
            value={basis}
            onChange={(e) => onBasisChange(e.target.value as AllocationBasis)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
            aria-label="Allocation basis"
          >
            {BASIS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {basis === "weighted" && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Weight by</span>
            <select
              value={weightAttribute ?? "unitCount"}
              onChange={(e) => onWeightChange(e.target.value as WeightAttribute)}
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
              aria-label="Weight attribute"
            >
              {WEIGHT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        )}

        {basis !== "manual" && (
          <button
            type="button"
            onClick={onRedistribute}
            className="rounded-lg border border-brand-300 text-brand-700 px-3 py-2 text-sm font-semibold hover:bg-brand-50 transition-colors"
          >
            Redistribute
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {eligible.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-line/60 px-3 py-2">
            <span className="text-sm text-ink truncate">{a.name}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                min={0}
                value={allocations[a.id] ?? 0}
                onChange={(e) => onRowChange(a.id, Number(e.target.value))}
                aria-label={`${a.name} allocation`}
                className="w-28 rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:border-brand-400"
              />
              <span className="text-xs text-ink-soft">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm text-ink-soft">
        Unallocated: <strong className="text-ink tabular-nums">{fmt(unallocatedVol)}</strong> {unit}
      </p>

      {overflow && (
        <p role="alert" className="text-[11px] text-amber-700">
          Allocations exceeded the entry total — scaled down proportionally to fit.
        </p>
      )}
    </div>
  );
}
