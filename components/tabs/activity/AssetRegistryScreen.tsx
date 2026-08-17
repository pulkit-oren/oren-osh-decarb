"use client";

/* ============================================================
   Asset registry editor — Task 8. List / add / edit / remove the
   company-level assets that fuel entries will (in a later task) be
   split across. Mirrors BusinessUnitsScreen's structure and idiom:
   a card with an inline add-form, a plain row list, remove per row.
   Edit is the one addition — an inline form that reuses the same
   field set, opened per-row.

   Deleting a referenced asset must fail with a VISIBLE inline error,
   not silently or via a crash. removeUnit (lib/assets/store.tsx)
   throws synchronously from its function body, before any setState
   call, specifically so this component's own try/catch can catch it
   and put the message in state — an error boundary would not see
   this, because nothing ever reaches render in a broken state.
   ============================================================ */

import { useState } from "react";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAssets } from "@/lib/assets/store";
import { useScenario } from "@/lib/store";
import { referencedAssetIds } from "@/lib/assets/helpers";
import type { Asset, AssetCategory } from "@/lib/assets/types";
import type { Nav } from "./shared";

type BuUnit = { name: string; aggregate: boolean };

type Props = {
  setNav: (n: Nav) => void;
  buUnits: BuUnit[];
};

type FormState = {
  name: string;
  category: AssetCategory;
  buId: string;
  unitCount: number;
  remainingLife: number;
  opex: number;
};

const CATEGORIES: AssetCategory[] = ["stationary", "mobile", "electrical"];

const BLANK_FORM: FormState = {
  name: "", category: "stationary", buId: "", unitCount: 1, remainingLife: 10, opex: 0,
};

function AssetForm({
  form, setForm, buUnits, onSubmit, onCancel, submitLabel,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  buUnits: BuUnit[];
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 mb-4 pb-4 border-b border-line/60">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Name</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Boiler 1"
            className="border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Category</span>
          <div className="inline-flex gap-1 rounded-lg bg-surface-muted p-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm({ ...form, category: c })}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors",
                  form.category === c ? "bg-white text-brand-700 shadow-card" : "text-ink-soft"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Business unit</span>
          <select
            value={form.buId}
            onChange={(e) => setForm({ ...form, buId: e.target.value })}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
          >
            <option value="">Company-wide</option>
            {buUnits.map((u) => (
              <option key={u.name} value={u.name}>{u.name}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Number of units</span>
          <input
            type="number"
            value={form.unitCount}
            onChange={(e) => setForm({ ...form, unitCount: Number(e.target.value) })}
            className="border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Remaining life (years)</span>
          <input
            type="number"
            value={form.remainingLife}
            onChange={(e) => setForm({ ...form, remainingLife: Number(e.target.value) })}
            className="border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Annual opex</span>
          <input
            type="number"
            value={form.opex}
            onChange={(e) => setForm({ ...form, opex: Number(e.target.value) })}
            className="border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
          />
        </label>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-brand-300 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!form.name.trim()}
          className="rounded-lg bg-brand-500 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

export function AssetRegistryScreen({ setNav, buUnits }: Props) {
  const { assets, addUnit, updateUnit, removeUnit } = useAssets();
  const { selectedAssets } = useScenario();
  const referencedIds = referencedAssetIds(selectedAssets);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK_FORM);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(BLANK_FORM);

  const [error, setError] = useState<string | null>(null);

  const startAdd = () => {
    setForm(BLANK_FORM);
    setEditingId(null);
    setAdding(true);
  };
  const cancelAdd = () => {
    setAdding(false);
    setForm(BLANK_FORM);
  };
  const submitAdd = () => {
    const name = form.name.trim();
    if (!name) return;
    addUnit({ ...form, name });
    setAdding(false);
    setForm(BLANK_FORM);
  };

  const startEdit = (a: Asset) => {
    setEditForm({
      name: a.name, category: a.category, buId: a.buId,
      unitCount: a.unitCount, remainingLife: a.remainingLife, opex: a.opex,
    });
    setAdding(false);
    setError(null);
    setEditingId(a.id);
  };
  const cancelEdit = () => setEditingId(null);
  const submitEdit = () => {
    if (!editingId) return;
    const name = editForm.name.trim();
    if (!name) return;
    updateUnit(editingId, { ...editForm, name });
    setEditingId(null);
  };

  // removeUnit throws SYNCHRONOUSLY (before any setAssets call) when the
  // asset is referenced — this try/catch is what actually reaches that
  // throw, unlike a setState updater which React would swallow and
  // re-raise during render, past any caller's catch.
  const handleRemove = (id: string) => {
    try {
      removeUnit(id, referencedIds);
      setError(null);
      if (editingId === id) setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div key="assets" className="screen-in flex flex-col gap-5 max-w-3xl">
      <button onClick={() => setNav({ level: "home" })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit">
        <ArrowLeft size={16} /> Back to activity data
      </button>
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Assets</h1>
        <p className="text-sm text-ink-soft mt-0.5">Manage the equipment your fuel entries can be split across.</p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Your assets</div>
          {!adding && (
            <button onClick={startAdd} className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600 transition-colors">
              <Plus size={14} /> Add asset
            </button>
          )}
        </div>

        {adding && (
          <AssetForm form={form} setForm={setForm} buUnits={buUnits} onSubmit={submitAdd} onCancel={cancelAdd} submitLabel="Add" />
        )}

        {assets.length === 0 ? (
          <p className="text-sm text-ink-faint">No assets yet — add your first.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {assets.map((a) => (
              <div key={a.id} className="rounded-xl border border-line/60 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-surface-muted grid place-items-center text-ink-soft font-bold text-xs shrink-0">
                    {a.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block font-medium text-ink truncate">{a.name}</span>
                    <span className="text-[11px] text-ink-soft capitalize">
                      {a.category} · {a.buId || "Company-wide"} · {a.unitCount} unit{a.unitCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <button onClick={() => startEdit(a)} aria-label={`Edit ${a.name}`} className="p-1.5 rounded-lg text-ink-faint hover:text-brand-600 transition-colors">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleRemove(a.id)} aria-label={`Remove ${a.name}`} className="p-1.5 rounded-lg text-ink-faint hover:text-red-500 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
                {editingId === a.id && (
                  <div className="mt-3 pt-3 border-t border-line/60">
                    <AssetForm form={editForm} setForm={setEditForm} buUnits={buUnits} onSubmit={submitEdit} onCancel={cancelEdit} submitLabel="Save" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-ink-faint mt-3">Assets let a fuel entry be split across specific equipment — the allocation panel that uses this registry lands in a later task.</p>
      </div>
    </div>
  );
}
