"use client";

/* The plan against what actually happened.

   Both halves have been in the store all along — several financial years of
   inventory, and a trajectory projected from a base year — with nothing joining
   them. This is the join, and the three states it keeps apart matter more than
   the arithmetic: a year before the base has no plan to be measured against, the
   base year is an anchor rather than performance, and only the years after it
   carry a variance that means anything.

   Location-based on both sides. Comparing a market-based plan against a
   location-based inventory would report a variance that is really an accounting
   difference. */

import { useMemo } from "react";
import { GitCompareArrows, AlertTriangle } from "lucide-react";
import { useScenario } from "@/lib/store";
import { useOptionalScope2 } from "@/lib/scope2/store";
import { combineTrajectories } from "@/lib/model/combined";
import { s1TotalForYear, s2TotalForYear, type Inventories } from "@/lib/goals/select";
import { anchorDisagrees, latestTracked, planVsActual } from "@/lib/variance";
import { FY_YEARS, fyLabel } from "@/lib/model/types";
import { fmt } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";

const STATUS_LABEL = {
  history: "Before the plan",
  anchor: "Base year",
  ahead: "Ahead of plan",
  behind: "Behind plan",
  "on-track": "On track",
} as const;

const STATUS_CLASS = {
  history: "bg-surface-muted text-ink-faint",
  anchor: "bg-surface-muted text-ink-soft",
  ahead: "bg-brand-50 text-brand-700",
  behind: "bg-amber-50 text-amber-700",
  "on-track": "bg-brand-50 text-brand-700",
} as const;

export function VariancePanel() {
  const { result, combustion, refrigeration, baseYear } = useScenario();
  const s2 = useOptionalScope2();

  const rows = useMemo(() => {
    if (!s2) return [];
    const inv: Inventories = { combustion, refrigeration, facilities: s2.facilities };
    const trajectory = combineTrajectories(result.trajectory, s2.result.trajectoryLocation);

    const actualByYear: Record<number, number> = {};
    for (const y of FY_YEARS) {
      const hasS1 = (combustion[y]?.length ?? 0) > 0 || (refrigeration[y]?.length ?? 0) > 0;
      const hasS2 = (s2.facilities[y]?.length ?? 0) > 0;
      if (!hasS1 && !hasS2) continue; // no measurement is not a measurement of zero
      actualByYear[y] = s1TotalForYear(inv, y) + s2TotalForYear(inv, y);
    }
    return planVsActual({ baseYear, trajectory, actualByYear });
  }, [combustion, refrigeration, s2, result.trajectory, baseYear]);

  if (rows.length === 0) return null;
  const tracked = latestTracked(rows);
  const anchorOff = anchorDisagrees(rows);

  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><GitCompareArrows size={17} className="text-brand-600" />Plan against outcome</span>}
        subtitle="What the plan projected for each closed year, against what the inventory actually reported."
      />

      {anchorOff && (
        <div className="mt-3 flex gap-2.5 items-start rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" strokeWidth={2.2} />
          <p className="text-[13px] text-amber-900 leading-snug">
            The base year does not match the plan&apos;s own starting point, which means the trajectory
            was built from different data than it is being compared against. Fix that before reading
            anything into the years below.
          </p>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="text-left font-bold py-2 pr-4">Year</th>
              <th className="text-right font-bold py-2 px-3">Planned</th>
              <th className="text-right font-bold py-2 px-3">Actual</th>
              <th className="text-right font-bold py-2 px-3">Variance</th>
              <th className="text-left font-bold py-2 pl-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year} className="border-t border-line/60">
                <td className="py-2.5 pr-4 font-semibold text-ink">{fyLabel(r.year)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-ink-soft">
                  {r.plannedT === undefined ? "—" : fmt(Math.round(r.plannedT))}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-ink">{fmt(Math.round(r.actualT))}</td>
                <td className={`py-2.5 px-3 text-right tabular-nums font-semibold ${
                  r.varianceT === undefined ? "text-ink-faint"
                    : r.varianceT < 0 ? "text-brand-600" : r.varianceT > 0 ? "text-amber-600" : "text-ink-soft"
                }`}>
                  {r.varianceT === undefined
                    ? "—"
                    : `${r.varianceT > 0 ? "+" : r.varianceT < 0 ? "−" : ""}${fmt(Math.abs(Math.round(r.varianceT)))}`}
                </td>
                <td className="py-2.5 pl-4">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_CLASS[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 pt-3 border-t border-line/60 text-[13px] text-ink-soft">
        {tracked === null ? (
          <>
            No year after the base year has closed with data entered yet, so there is nothing to
            track against the plan. This fills in as each financial year completes.
          </>
        ) : (
          <>
            Most recent tracked year: <strong className="text-ink font-semibold">{fyLabel(tracked.year)}</strong>,{" "}
            {tracked.variancePct === undefined ? "" : `${Math.abs(tracked.variancePct).toFixed(1)}% `}
            {tracked.status === "ahead" ? "below the plan" : tracked.status === "behind" ? "above the plan" : "in line with the plan"}.
          </>
        )}
      </p>
    </Card>
  );
}
