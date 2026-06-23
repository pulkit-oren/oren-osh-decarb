"use client";

import { ArrowLeft } from "lucide-react";
import type { useScenario } from "@/lib/store";
import type { useScope2 } from "@/lib/scope2/store";
import { combustionCO2e, refrigerantCO2e } from "@/lib/model/baseline";
import { FUELS, REFRIGERANTS } from "@/lib/model/factors";
import { fuelFamily } from "@/lib/activity-groups";
import { fyLabel } from "@/lib/model/types";
import { cn, fmt } from "@/lib/utils";
import { facCO2e, unitLabel } from "./shared";

type S1 = ReturnType<typeof useScenario>;
type S2 = ReturnType<typeof useScope2>;

export function ScopeScreen({
  scope,
  s1,
  s2,
  year,
  onBack,
}: {
  scope: 1 | 2;
  s1: S1;
  s2: S2;
  year: number;
  onBack: () => void;
}) {
  const groups: {
    label: string;
    rows: { id: string; name: string; bu?: string; raw: string; t: number; excluded?: boolean }[];
  }[] = [];

  if (scope === 1) {
    for (const fam of ["liquid", "gas", "solid"] as const) {
      const rows = s1.selectedAssets
        .filter((a) => fuelFamily(a.fuelType) === fam && a.annualVolume > 0)
        .map((a) => ({
          id: a.id,
          name: FUELS[a.fuelType].label,
          bu: a.bu,
          raw: `${fmt(a.annualVolume)} ${unitLabel(a.unit)}`,
          t: combustionCO2e(a),
          excluded: a.excluded,
        }));
      if (rows.length) {
        groups.push({ label: `Fuels – ${fam[0].toUpperCase() + fam.slice(1)}`, rows });
      }
    }
    const otherRows = s1.selectedAssets
      .filter((a) => fuelFamily(a.fuelType) === null && a.annualVolume > 0)
      .map((a) => ({
        id: a.id,
        name: FUELS[a.fuelType].label,
        bu: a.bu,
        raw: `${fmt(a.annualVolume)} ${unitLabel(a.unit)}`,
        t: combustionCO2e(a),
        excluded: a.excluded,
      }));
    if (otherRows.length) {
      groups.push({ label: "Other Fuels", rows: otherRows });
    }
    const refRows = s1.selectedSystems
      .filter((sy) => sy.toppedUpKg > 0)
      .map((sy) => ({
      id: sy.id,
      name: REFRIGERANTS[sy.refrigerant].label,
      bu: sy.bu,
      raw: `${fmt(sy.toppedUpKg)} kg`,
      t: refrigerantCO2e(sy),
      excluded: sy.excluded,
    }));
    if (refRows.length) {
      groups.push({ label: "Refrigerants", rows: refRows });
    }
  } else {
    const rows = s2.selectedFacilities
      .filter((f) => f.annualLoadKwh > 0)
      .map((f) => ({
      id: f.id,
      name: f.name,
      bu: f.bu,
      raw: `${fmt(f.annualLoadKwh)} kWh`,
      t: facCO2e(f),
      excluded: f.excluded,
    }));
    if (rows.length) {
      groups.push({ label: "Electricity", rows });
    }
  }

  const total = groups
    .flatMap((g) => g.rows)
    .filter((r) => !r.excluded)
    .reduce((s, r) => s + r.t, 0);

  return (
    <div className="screen-in flex flex-col gap-5">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"
      >
        <ArrowLeft size={16} /> All activity data
      </button>

      <div className="rounded-xl3 border border-line/60 bg-surface shadow-card px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">
          Scope {scope} · {fyLabel(year)}
        </h1>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Total</div>
          <div className="text-2xl font-extrabold tabular-nums">
            {fmt(total)} <span className="text-sm text-ink-soft">tCO₂e</span>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-ink-faint">No Scope {scope} sources yet.</p>
      ) : (
        groups.map((g) => (
          <div
            key={g.label}
            className="rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden"
          >
            <div className="px-4 py-2.5 bg-gradient-to-r from-brand-50 to-transparent text-sm font-semibold text-ink">
              {g.label}
            </div>
            {g.rows.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 border-t border-line/40",
                  r.excluded && "opacity-50",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {r.name}
                  {r.bu ? (
                    <span className="text-ink-faint font-normal"> · {r.bu}</span>
                  ) : null}
                </span>
                <span className="text-sm tabular-nums text-ink-soft shrink-0 w-32 text-right">
                  {r.raw}
                </span>
                <span className="text-sm font-semibold tabular-nums shrink-0 w-24 text-right">
                  {fmt(r.t)} t
                  {r.excluded ? (
                    <span className="text-[10px] text-amber-700"> · excl</span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
