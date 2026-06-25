"use client";

import { useState } from "react";
import { ArrowLeft, Plus, X, ChevronRight } from "lucide-react";
import { CAT_DEFS, GRAD, CAT_ICON, ICON_COLOR, ScopeBadge, CentralPill, showNum, unitLabel, newId, type Nav, type CatDef } from "./shared";
import { FUELS, FUELS_BY_CATEGORY, REFRIGERANTS } from "@/lib/model/factors";
import { fuelsInExcelFamily, fuelFamily, type FuelFamily } from "@/lib/activity-groups";
import { combustionCO2e, refrigerantCO2e } from "@/lib/model/baseline";
import { fromRef, toRef } from "@/lib/unit-convert";
import { fmt, cn } from "@/lib/utils";
import type { CombustionAsset, FuelId, FuelUnit, RefrigerantId, RefrigerationSystem } from "@/lib/model/types";
import { endUsesFor, type EndUseId } from "@/lib/model/end-use";
import { refrigClassesFor, type RefrigClassId } from "@/lib/model/refrigerant-class";

type BuUnit = { name: string; aggregate: boolean };

type Props = {
  def: CatDef;
  buUnits: BuUnit[];
  combustionAssets: CombustionAsset[];
  refrigerationSystems: RefrigerationSystem[];
  year: number;
  addCombustionAsset: (year: number, asset: CombustionAsset) => void;
  addRefrigerationSystem: (year: number, system: RefrigerationSystem) => void;
  updateCombustion: (year: number, id: string, patch: Partial<CombustionAsset>) => void;
  updateRefrigeration: (year: number, id: string, patch: Partial<RefrigerationSystem>) => void;
  deleteCombustion: (year: number, id: string) => void;
  deleteRefrigeration: (year: number, id: string) => void;
  setNav: (n: Nav) => void;
};

type FuelType = CombustionAsset["category"];
type SystemType = RefrigerationSystem["systemType"];

export function SourceListScreen({
  def,
  buUnits,
  combustionAssets,
  refrigerationSystems,
  year,
  addCombustionAsset,
  addRefrigerationSystem,
  updateCombustion,
  updateRefrigeration,
  deleteCombustion,
  deleteRefrigeration,
  setNav,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("stationary");
  const [selectedFuel, setSelectedFuel] = useState<FuelId | "">("");
  const [selectedGas, setSelectedGas] = useState<RefrigerantId | "">("");
  const [systemType, setSystemType] = useState<SystemType>("commercialHVAC");
  const [selectedBu, setSelectedBu] = useState("");
  const [endUse, setEndUse] = useState<EndUseId | "">("");
  const [equipmentClass, setEquipmentClass] = useState<RefrigClassId | "">("");

  const CatIcon = CAT_ICON[def.meta];
  const isRefrigerant = def.kind === "refrigerant";
  const family = def.key as FuelFamily;

  // Available refrigerant gases (inExcel only)
  const availableGases = isRefrigerant
    ? (Object.values(REFRIGERANTS) as typeof REFRIGERANTS[keyof typeof REFRIGERANTS][]).filter((r) => r.inExcel)
    : [];

  // Initialize selectedFuel/Gas on form open
  const handleOpenForm = () => {
    setSourceName("");
    setFuelType("stationary");
    if (!isRefrigerant) {
      const fuels = fuelsInExcelFamily(family).filter(
        (f) => FUELS_BY_CATEGORY["stationary"].includes(f.id)
      );
      setSelectedFuel(fuels[0]?.id ?? "");
    }
    const gases = (Object.values(REFRIGERANTS) as typeof REFRIGERANTS[keyof typeof REFRIGERANTS][]).filter((r) => r.inExcel);
    setSelectedGas(gases[0]?.id ?? "");
    setSystemType("commercialHVAC");
    setSelectedBu("");
    setEndUse("");
    setEquipmentClass("");
    setShowForm(true);
  };

  // Recalculate available fuels when type changes
  const handleFuelTypeChange = (t: FuelType) => {
    setFuelType(t);
    const fuels = fuelsInExcelFamily(family).filter((f) =>
      FUELS_BY_CATEGORY[t].includes(f.id)
    );
    setSelectedFuel(fuels[0]?.id ?? "");
    setEndUse("");
  };

  // Sources for this category — use shared fuelFamily helper
  const sources = isRefrigerant
    ? refrigerationSystems
    : combustionAssets.filter((a) => fuelFamily(a.fuelType) === family);

  // Total emissions for the category (non-excluded) — derived from the already-filtered sources array
  const totalEmissions = isRefrigerant
    ? refrigerationSystems.filter((s) => !s.excluded).reduce((sum, s) => sum + refrigerantCO2e(s), 0)
    : (sources as CombustionAsset[]).filter((a) => !a.excluded).reduce((sum, a) => sum + combustionCO2e(a), 0);

  const handleAdd = () => {
    if (!sourceName.trim()) return;
    if (isRefrigerant) {
      if (!selectedGas) return;
      addRefrigerationSystem(year, {
        id: newId("r"),
        name: sourceName.trim(),
        systemType,
        refrigerant: selectedGas as RefrigerantId,
        toppedUpKg: 0,
        gasCostPerKg: 900,
        bu: selectedBu || undefined,
        equipmentClass: equipmentClass || undefined,
        excluded: false,
      });
    } else {
      if (!selectedFuel) return;
      const fuelId = selectedFuel as FuelId;
      addCombustionAsset(year, {
        id: newId("c"),
        name: sourceName.trim(),
        category: fuelType,
        fuelType: fuelId,
        unit: FUELS[fuelId].unit,
        annualVolume: 0,
        opex: 0,
        remainingLife: 10,
        unitCount: 1,
        bu: selectedBu || undefined,
        endUse: endUse || undefined,
        excluded: false,
      });
    }
    setShowForm(false);
    setSourceName("");
  };

  const currentFuels = isRefrigerant
    ? []
    : fuelsInExcelFamily(family).filter((f) => FUELS_BY_CATEGORY[fuelType].includes(f.id));

  return (
    <div key={`cat-${def.key}`} className="screen-in flex flex-col gap-5">
      <button
        onClick={() => setNav({ level: "home" })}
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"
      >
        <ArrowLeft size={16} /> All activity data
      </button>

      {/* Header card */}
      <div
        style={{ background: GRAD[def.meta] }}
        className="rounded-xl3 border border-white/60 shadow-card px-6 py-4 flex items-center gap-4"
      >
        <span className="w-12 h-12 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0">
          <CatIcon size={26} strokeWidth={1.9} style={{ color: ICON_COLOR[def.meta] }} />
        </span>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-ink leading-tight">{def.label}</h1>
          <div className="mt-1"><ScopeBadge scope={def.scope} /></div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Total emissions</div>
          <div className="text-2xl font-extrabold tabular-nums text-ink leading-none mt-1">
            {fmt(totalEmissions)}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span>
          </div>
        </div>
      </div>

      {/* Source list */}
      {sources.length > 0 && (
        <div className="rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden divide-y divide-line/40">
          {sources.map((source) => {
            const isComb = !isRefrigerant;
            const asset = source as CombustionAsset;
            const sys = source as RefrigerationSystem;
            const emissions = isComb ? combustionCO2e(asset) : refrigerantCO2e(sys);
            const excluded = source.excluded ?? false;
            const buLabel = source.bu ?? "Company-wide";
            const subLabel = isComb
              ? `${FUELS[asset.fuelType]?.label ?? asset.fuelType} · ${asset.category} · ${buLabel}`
              : `${REFRIGERANTS[sys.refrigerant]?.label ?? sys.refrigerant} · ${sys.systemType} · ${buLabel}`;

            // Inline consumption — show each source's particular unit
            const disp = isComb ? (asset.displayUnit ?? asset.unit) : "kg";
            const consVal = isComb
              ? showNum(fromRef(asset.annualVolume, asset.fuelType, disp as FuelUnit))
              : sys.toppedUpKg;
            const unitTxt = isComb ? `${unitLabel(disp)}/yr` : "kg/yr";
            const openEntry = () =>
              setNav({ level: "entry", kind: isComb ? "combustion" : "refrigerant", id: source.id });

            return (
              <div
                key={source.id}
                onClick={openEntry}
                className={cn(
                  "group flex items-center gap-3 px-4 py-3 hover:bg-brand-50/30 transition-colors cursor-pointer",
                  excluded && "opacity-70"
                )}
              >
                <div className="min-w-0 flex-1">
                  <span className="block font-medium text-ink truncate">{source.name}</span>
                  <span className="text-[11px] text-ink-soft">{subLabel}</span>
                </div>

                {/* Inline consumption input */}
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    value={consVal}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (isComb) {
                        updateCombustion(year, asset.id, { annualVolume: toRef(v, asset.fuelType, disp as FuelUnit) });
                      } else {
                        updateRefrigeration(year, sys.id, { toppedUpKg: v });
                      }
                    }}
                    aria-label={`${source.name} annual consumption`}
                    className="w-24 text-right tabular-nums rounded-lg border border-brand-200 bg-brand-50/50 px-2.5 py-1.5 text-sm focus:outline-none focus:border-brand-400 focus:bg-white"
                  />
                  <span className="text-[11px] text-ink-faint w-14">{unitTxt}</span>
                </div>

                <span className="w-16 text-right text-sm font-semibold tabular-nums shrink-0">
                  {fmt(emissions)} t
                </span>

                <CentralPill
                  included={!excluded}
                  name={source.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isComb) updateCombustion(year, asset.id, { excluded: !asset.excluded });
                    else updateRefrigeration(year, sys.id, { excluded: !sys.excluded });
                  }}
                />

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isComb) deleteCombustion(year, asset.id);
                    else deleteRefrigeration(year, sys.id);
                  }}
                  aria-label={`Remove ${source.name}`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-faint hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                >
                  <X size={14} /> Remove
                </button>

                <button onClick={openEntry} aria-label={`Details for ${source.name}`} className="shrink-0">
                  <ChevronRight size={16} className="text-ink-faint" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add source button / form */}
      {!showForm ? (
        <button
          onClick={handleOpenForm}
          className="group inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/40 text-brand-700 font-semibold text-sm px-4 py-2.5 hover:border-brand-400 hover:bg-brand-50 transition-colors w-fit"
        >
          <span className="grid place-items-center w-5 h-5 rounded-full bg-brand-500 text-white group-hover:bg-brand-600 transition-colors">
            <Plus size={14} strokeWidth={2.5} />
          </span>
          Add a {isRefrigerant ? "system" : "source"}
        </button>
      ) : (
        <div className="rounded-xl3 border border-brand-200 bg-surface shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink">New {isRefrigerant ? "system" : "source"}</h2>
            <button onClick={() => setShowForm(false)} aria-label="Close" className="p-1 -mr-1 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-muted transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Source name */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-ink-soft">Name</label>
              <input
                aria-label="Source name"
                type="text"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder={isRefrigerant ? "e.g. Rooftop chillers" : "e.g. Diesel gensets"}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
              />
            </div>

            {/* Type control */}
            {!isRefrigerant ? (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-ink-soft">Type</label>
                <div className="inline-flex gap-1 rounded-lg bg-surface-muted p-0.5">
                  {(["stationary", "mobile"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => handleFuelTypeChange(t)}
                      className={cn(
                        "flex-1 px-3 py-1.5 rounded-md text-sm font-semibold capitalize transition-colors",
                        fuelType === t ? "bg-surface text-brand-700 shadow-card" : "text-ink-soft hover:text-ink"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-ink-soft">System type</label>
                <select
                  value={systemType}
                  onChange={(e) => { setSystemType(e.target.value as SystemType); setEquipmentClass(""); }}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
                >
                  <option value="commercialHVAC">Commercial HVAC</option>
                  <option value="industrialColdStorage">Industrial Cold Storage</option>
                  <option value="retailRefrigeration">Retail Refrigeration</option>
                </select>
              </div>
            )}

            {/* Equipment class (refrigerant only) */}
            {isRefrigerant && (
              <div className="flex flex-col gap-1">
                <label htmlFor="src-refrig-class" className="text-[11px] font-semibold text-ink-soft">Equipment class</label>
                <select id="src-refrig-class" value={equipmentClass} onChange={(e) => setEquipmentClass(e.target.value as RefrigClassId | "")}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:border-brand-400">
                  <option value="">Unspecified</option>
                  {refrigClassesFor(systemType).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            )}

            {/* Fuel / Gas select */}
            {!isRefrigerant ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="src-fuel-select" className="text-[11px] font-semibold text-ink-soft">Fuel</label>
                <select
                  id="src-fuel-select"
                  value={selectedFuel}
                  onChange={(e) => setSelectedFuel(e.target.value as FuelId)}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
                >
                  {currentFuels.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                  {currentFuels.length === 0 && <option value="" disabled>No fuels available</option>}
                </select>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label htmlFor="src-gas-select" className="text-[11px] font-semibold text-ink-soft">Refrigerant gas</label>
                <select
                  id="src-gas-select"
                  value={selectedGas}
                  onChange={(e) => setSelectedGas(e.target.value as RefrigerantId)}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
                >
                  {availableGases.map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* End-use */}
            {!isRefrigerant && (
              <div className="flex flex-col gap-1">
                <label htmlFor="src-enduse" className="text-[11px] font-semibold text-ink-soft">End-use</label>
                <select id="src-enduse" value={endUse} onChange={(e) => setEndUse(e.target.value as EndUseId | "")}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:border-brand-400">
                  <option value="">Unspecified</option>
                  {endUsesFor(fuelType).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            )}

            {/* Business unit */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-ink-soft">Business unit</label>
              <select
                value={selectedBu}
                onChange={(e) => setSelectedBu(e.target.value)}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
              >
                <option value="">Company-wide</option>
                {buUnits.map((u) => (
                  <option key={u.name} value={u.name}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-4">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm font-medium text-ink-soft hover:text-ink rounded-lg border border-line bg-surface"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!sourceName.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={15} strokeWidth={2.5} /> Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
