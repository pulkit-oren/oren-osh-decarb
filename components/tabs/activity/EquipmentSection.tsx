"use client";

/* The entry screen's equipment editor — the one place a user sees the machines
   inside a single combustion source and splits the source's volume across them
   (spec 5.2).

   Three rules shape everything below.

   1. Every write goes onto the EQUIPMENT, never flat onto the entry.
      resolveEquipment() stamps unitCount / remainingLife / endUse onto the rows
      it emits FROM the equipment and ignores anything flat on the source, so a
      flat write moves the input and leaves the model untouched. The controls
      here are the last three that were still flat.

   2. The capacity UNIT lives on the source, the capacity NUMBERS on the rows
      (D9). A source therefore cannot hold incommensurable capacities, and the
      unit is rendered once — never repeated per row.

   3. The explainer prints explainAllocation()'s strings VERBATIM. Re-formatting
      the numbers here would be a second formatting implementation that could
      disagree with the figure beside it — exactly the drift spec 4.3 forbids.
      weightsFor() is the single source of truth both it and computeAllocation
      already share. */

import { useState } from "react";
import { Plus, X, RotateCcw } from "lucide-react";
import { basisAvailability, clampAllocation, computeAllocation, explainAllocation, unallocated } from "@/lib/equipment/allocate";
import { mintFirstEquipment } from "@/lib/equipment/migrate";
import type { AllocationBasis, CapacityUnit, Equipment } from "@/lib/equipment/types";
import type { CombustionAsset } from "@/lib/model/types";
import { endUsesFor, type EndUseId } from "@/lib/model/end-use";
import { FUELS } from "@/lib/model/factors";
import { fmt } from "@/lib/utils";
import { unitLabel } from "./shared";

type Props = {
  entry: CombustionAsset;
  /** Applied by EntryScreen via updateCombustion(year, entry.id, patch). Only
   *  ever carries equipment / allocations / allocationBasis / capacityUnit. */
  onChange: (patch: Partial<CombustionAsset>) => void;
  /** Prior-year per-equipment volumes, for the "carryForward" basis. */
  previousAllocation?: Record<string, number>;
  /** True when a scenario lever is keyed to this equipment id — removing it
   *  would orphan the lever, so the removal is confirmed rather than silent.
   *  Optional: a caller without the scenario store simply omits it. */
  hasLever?: (equipmentId: string) => boolean;
};

const CAPACITY_UNITS: CapacityUnit[] = ["kW", "kVA", "TR", "tph"];

/** Deliberately NOT "Number of units": that exact phrase is what
 *  explainAllocation() prints in its formula line, and a second element
 *  carrying it would make the explainer un-addressable. */
const BASIS_LABEL: Record<AllocationBasis, string> = {
  load: "Load (capacity × running hours)",
  capacity: "Rated capacity",
  units: "Unit count",
  even: "Even split",
  carryForward: "Last year's split",
  manual: "Manual (typed by hand)",
};
const BASES = Object.keys(BASIS_LABEL) as AllocationBasis[];

let _eqSeq = 0;
/** Ids only have to be unique within one source's equipment list. */
const nextEquipmentId = () => `eq-${Date.now().toString(36)}-${_eqSeq++}`;

const CELL = "w-full border border-line rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400";
const NUMCELL = `${CELL} text-right tabular-nums`;
const TH = "text-left text-[10px] uppercase tracking-wide text-ink-faint font-bold px-2 pb-2";

/** A blank number input must read as "not recorded", not as 0 — `capacity`
 *  absent is what excludes a row from the capacity/load bases. */
const numOrUndef = (raw: string): number | undefined => {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function EquipmentSection({ entry, onChange, previousAllocation, hasLever }: Props) {
  // Ruling K: `equipment` is optional on the type — D8 is a runtime invariant
  // enforced at the write points, so this reader must tolerate absence.
  const equipment: Equipment[] = entry.equipment ?? [];
  const basis: AllocationBasis = entry.allocationBasis ?? "load";
  const volume = Number.isFinite(entry.annualVolume) ? entry.annualVolume : 0;
  const alloc = entry.allocations ?? {};
  const unit = unitLabel(entry.unit);

  const [notice, setNotice] = useState<string | null>(null);
  const [pendingUnit, setPendingUnit] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Equipment | null>(null);

  const avail = basisAvailability(equipment, previousAllocation);
  const explain = explainAllocation({ entryVolume: volume, basis, equipment, previous: previousAllocation });
  const leftover = unallocated(volume, alloc);
  const unitTotal = equipment.reduce((s, e) => s + (e.unitCount || 0), 0);

  /** Recompute the split for a given equipment list + basis. Under `manual`
   *  computeAllocation returns the existing map untouched, which would keep a
   *  removed row's key and miss a new row's — so manual is projected onto the
   *  current list here instead. */
  function reallocate(eq: Equipment[], b: AllocationBasis, existing: Record<string, number>): Record<string, number> {
    if (b === "manual") {
      const out: Record<string, number> = {};
      for (const e of eq) out[e.id] = existing[e.id] ?? 0;
      return clampAllocation(volume, out);
    }
    return computeAllocation({ entryVolume: volume, basis: b, equipment: eq, previous: previousAllocation });
  }

  const writeEquipment = (next: Equipment[]) => {
    setNotice(null);
    onChange({ equipment: next, allocations: reallocate(next, basis, alloc) });
  };

  /** Every attribute edit lands on the equipment — never flat on the entry. */
  const patchRow = (id: string, patch: Partial<Equipment>) =>
    writeEquipment(equipment.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const onAdd = () => {
    // Ruling O: the FIRST equipment of a source is only ever minted by the one
    // shared helper. Anything beyond the first is this screen's own row.
    const fresh: Equipment = equipment.length === 0
      ? mintFirstEquipment(entry)
      : { id: nextEquipmentId(), name: `Equipment ${equipment.length + 1}`, unitCount: 1, remainingLife: 10 };
    writeEquipment([...equipment, fresh]);
  };

  const commitRemoval = (eq: Equipment) => {
    setPendingRemoval(null);
    writeEquipment(equipment.filter((e) => e.id !== eq.id));
  };

  const onRemove = (eq: Equipment) => {
    // D8: a source is never without equipment. Advisory-free — this one is a
    // hard block, because the resolver degrades an empty source into a single
    // unexpanded row and silently drops the split.
    if (equipment.length <= 1) {
      setNotice("A source must keep at least one equipment. Add another before removing this one.");
      return;
    }
    if (hasLever?.(eq.id)) { setPendingRemoval(eq); return; }
    commitRemoval(eq);
  };

  const onPickCapacityUnit = (raw: string) => {
    const next = (raw || undefined) as CapacityUnit | undefined;
    if (next === entry.capacityUnit) return;
    // D9: the numbers already typed were entered against the OLD unit. Changing
    // it silently would reinterpret every capacity on the source.
    if (equipment.some((e) => e.capacity != null)) { setPendingUnit(raw); return; }
    setNotice(null);
    onChange({ capacityUnit: next });
  };

  const onPickBasis = (b: AllocationBasis) => {
    setNotice(null);
    onChange({ allocationBasis: b, allocations: reallocate(equipment, b, alloc) });
  };

  /** Typing a volume is a declaration that the split is hand-made: it switches
   *  the basis to manual and writes ONLY that row. Invariant 3 then caps the
   *  map at the source total, scaling proportionally rather than rejecting the
   *  edit, so the user never loses their relative intent. */
  const onVolume = (id: string, raw: string) => {
    const wanted: Record<string, number> = {};
    for (const e of equipment) wanted[e.id] = alloc[e.id] ?? 0;
    wanted[id] = numOrUndef(raw) ?? 0;
    const clamped = clampAllocation(volume, wanted);
    const scaled = Object.keys(wanted).some((k) => Math.abs((clamped[k] ?? 0) - wanted[k]) > 0.005);
    setNotice(scaled
      ? `That is more than the ${fmt(volume)} ${unit} on this source, so the split was scaled back to fit.`
      : null);
    onChange({ allocationBasis: "manual", allocations: clamped });
  };

  const endUseOptions = endUsesFor(entry.category);

  return (
    <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
      {/* ── Source header: the capacity unit is declared ONCE, here (D9) ── */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Equipment</div>
          <p className="text-sm text-ink-soft mt-1">
            {entry.name} · {FUELS[entry.fuelType].label} · {entry.bu || "Central"} · {fmt(volume)} {unit}/yr
          </p>
        </div>
        <label className="block shrink-0">
          <span className="text-xs font-semibold text-ink-soft">Capacity measured in</span>
          <select
            aria-label="Capacity measured in"
            value={entry.capacityUnit ?? ""}
            onChange={(e) => onPickCapacityUnit(e.target.value)}
            className="mt-1.5 block border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
          >
            <option value="">— not recorded</option>
            {CAPACITY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      </div>

      {notice && (
        <p role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {notice}
        </p>
      )}

      {/* ── The equipment table ── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[52rem]">
          <thead>
            <tr>
              <th className={TH}>Equipment</th>
              <th className={TH}>Capacity{entry.capacityUnit ? ` (${entry.capacityUnit})` : ""}</th>
              <th className={TH}>Running hours</th>
              <th className={TH}>Units</th>
              <th className={TH}>Remaining life</th>
              <th className={TH}>End-use</th>
              <th className={TH}>Volume ({unit})</th>
              <th className={TH}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((eq) => (
              <tr key={eq.id} data-testid={`equipment-row-${eq.id}`} className="align-middle">
                <td className="px-2 py-1">
                  <input
                    aria-label="Equipment name" value={eq.name} className={`${CELL} min-w-[9rem]`}
                    onChange={(e) => patchRow(eq.id, { name: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number" min={0} aria-label="Capacity" placeholder="—"
                    value={eq.capacity ?? ""} className={`${NUMCELL} w-24`}
                    onChange={(e) => patchRow(eq.id, { capacity: numOrUndef(e.target.value) })}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number" min={0} aria-label="Running hours" placeholder="—"
                    value={eq.operatingHours ?? ""} className={`${NUMCELL} w-24`}
                    onChange={(e) => patchRow(eq.id, { operatingHours: numOrUndef(e.target.value) })}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number" min={1} aria-label="Number of units"
                    value={eq.unitCount} className={`${NUMCELL} w-20`}
                    onChange={(e) => patchRow(eq.id, { unitCount: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number" min={0} max={40} aria-label="Remaining life"
                    value={eq.remainingLife} className={`${NUMCELL} w-20`}
                    onChange={(e) => patchRow(eq.id, { remainingLife: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    aria-label="Equipment / end-use" value={eq.endUse ?? ""} className={`${CELL} min-w-[9rem]`}
                    onChange={(e) => patchRow(eq.id, { endUse: (e.target.value || undefined) as EndUseId | undefined })}
                  >
                    <option value="">Unspecified</option>
                    {endUseOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number" min={0} aria-label="Volume"
                    value={alloc[eq.id] ?? 0} className={`${NUMCELL} w-28`}
                    onChange={(e) => onVolume(eq.id, e.target.value)}
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <button
                    type="button" onClick={() => onRemove(eq)} aria-label={`Remove ${eq.name}`}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-faint hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <X size={13} /> Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} />
              {/* Invariant 7: two five-unit rows out of one five-van fleet double
                  the mobile capex in segments.ts. The running total is what makes
                  that visible — advisory, never a block on the edit. */}
              <td className="px-2 pt-1 text-right text-[11px] font-semibold text-ink-soft whitespace-nowrap">
                {unitTotal} units total
              </td>
              <td colSpan={4} className="px-2 pt-1 text-[11px] text-ink-faint">
                Count every identical machine — the total should equal the fleet or plant this source bills for.
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <button
        type="button" onClick={onAdd}
        className="group mt-3 inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/40 text-brand-700 font-semibold text-sm px-4 py-2 hover:border-brand-400 hover:bg-brand-50 transition-colors w-fit"
      >
        <span className="grid place-items-center w-5 h-5 rounded-full bg-brand-500 text-white group-hover:bg-brand-600 transition-colors">
          <Plus size={14} strokeWidth={2.5} />
        </span>
        Add equipment
      </button>

      {/* ── How the volume is split ── */}
      <div className="mt-5 border-t border-line/70 pt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-semibold text-ink-soft">Split by</span>
          <select
            aria-label="Split by" value={basis}
            onChange={(e) => onPickBasis(e.target.value as AllocationBasis)}
            className="mt-1.5 block border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
          >
            {BASES.map((b) => (
              <option key={b} value={b} disabled={avail[b] != null}>{BASIS_LABEL[b]}</option>
            ))}
          </select>
        </label>
        {basis !== "manual" && (
          <button
            type="button" onClick={() => onChange({ allocations: reallocate(equipment, basis, alloc) })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink hover:border-brand-300 transition-colors"
          >
            <RotateCcw size={14} /> Redistribute
          </button>
        )}
      </div>

      {/* A basis is disabled WITH ITS REASON rather than hidden — the shipped
          version silently fell back to `even`, which made a wrong split look
          computed (spec 4.1). */}
      {BASES.some((b) => avail[b]) && (
        <ul className="mt-2 space-y-0.5">
          {BASES.filter((b) => avail[b]).map((b) => (
            <li key={b} className="text-[11px] text-ink-faint">
              <span className="font-semibold text-ink-soft">{BASIS_LABEL[b]}</span> unavailable — {avail[b]}
            </li>
          ))}
        </ul>
      )}

      {/* Verbatim from explainAllocation — see rule 3 in the module comment. */}
      {explain && (
        <div className="mt-3 rounded-lg bg-surface-muted px-3 py-2.5">
          <p className="text-[12px] text-ink-soft">{explain.formula}</p>
          <p className="mt-1 text-[12px] font-mono text-ink break-words">{explain.row}</p>
        </div>
      )}

      {leftover > 0 && (
        <p className="mt-3 text-[12px] text-amber-800">
          {fmt(leftover)} {unit}/yr unallocated — it still reaches the model as an unassigned remainder, but no lever can act on it.
        </p>
      )}

      {/* ── D9 confirm: the typed capacities were entered against the old unit ── */}
      {pendingUnit !== null && (
        <div role="alertdialog" aria-modal="true" aria-label="Change the capacity unit" className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-ink">
            Change the capacity unit to {pendingUnit || "not recorded"}?
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">
            The capacity figures already typed stay as they are and will now be read as {pendingUnit || "unrecorded"}. Retype them if they were measured in {entry.capacityUnit}.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                const next = (pendingUnit || undefined) as CapacityUnit | undefined;
                setPendingUnit(null);
                setNotice(null);
                onChange({ capacityUnit: next });
              }}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
            >
              Change the unit
            </button>
            <button
              type="button" onClick={() => setPendingUnit(null)}
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink-soft hover:text-ink transition-colors"
            >
              Keep {entry.capacityUnit ?? "as is"}
            </button>
          </div>
        </div>
      )}

      {/* ── Lever confirm: levers are keyed by equipment id ── */}
      {pendingRemoval && (
        <div role="alertdialog" aria-modal="true" aria-label="Remove equipment with a lever" className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <p className="text-sm font-semibold text-ink">Remove {pendingRemoval.name}?</p>
          <p className="mt-1 text-[12px] text-ink-soft">
            A scenario lever is set on this equipment. Removing it drops that lever from the plan.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button" onClick={() => commitRemoval(pendingRemoval)}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
            >
              Remove it anyway
            </button>
            <button
              type="button" onClick={() => setPendingRemoval(null)}
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink-soft hover:text-ink transition-colors"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
