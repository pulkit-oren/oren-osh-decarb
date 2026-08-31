"use client";

/* The premises Compare mixes runs on, in one place.

   Extracted rather than added to BalanceTab.tsx, which is already ~700 lines.

   Two rules this file must keep:
   - It computes NO business-as-usual. The chart's line is the `rows` prop,
     which is the same `combineTrajectories` output the result rail reads.
   - Reset CLEARS `bauGrowthPct`. Writing the derived number into it would
     freeze today's history into the saved scenario. */

import { useMemo } from "react";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import {
  BAU_GROWTH_MAX_PCT, BAU_GROWTH_MIN_PCT, describeBauPremise,
  scope1ActualSeries, scope2ActualSeries, type DerivedGrowth, type YearPoint,
} from "@/lib/bau";
import { targetPosition, type CombinedRow } from "@/lib/model/combined";
import { CURRENCY } from "@/lib/defaults";
import { NumField } from "@/components/tabs/activity/fields";
import { InfoTip } from "@/components/ui/InfoTip";
import { BauChart } from "@/components/charts/BauChart";
import { fmt } from "@/lib/utils";

const H = "text-[10px] uppercase tracking-wide text-ink-faint font-bold";

/** One short line naming the basis a derived rate was measured on — the
 *  number is unauditable without it. `noun` is what to call a source in this
 *  scope ("sources" / "facilities"), matching keptCount's units.
 *
 *  `basis` is only ever "total" via deriveScopeNBau's fallback (an empty
 *  intersection, or a restricted first total that is not positive) — so a
 *  "total" basis with nothing in `joined`/`left` is the degenerate edge of
 *  that fallback, not the ordinary no-change case (which is "like-for-like"
 *  with empty joined/left, handled below). */
function bauBasisLine(d: DerivedGrowth | null, noun: string): string {
  if (!d) return "Not enough years of data — falling back to 1 %/yr";
  const joined = d.joined ?? [];
  const left = d.left ?? [];
  const excluded = [...joined, ...left];

  if (d.basis === "total") {
    return excluded.length > 0
      ? `measured on all ${noun}; a like-for-like basis was not available`
      : `measured on all ${noun} — the set did not change`;
  }

  const count = d.keptCount ?? 0;
  const base = `measured on the ${count} ${noun} present in both FY${d.fromYear} and FY${d.toYear}`;
  if (excluded.length === 0) return base;

  const clauses: string[] = [];
  if (joined.length > 0) clauses.push(`${joined.join(", ")} joined after FY${d.fromYear}`);
  if (left.length > 0) clauses.push(`${left.join(", ")} left before FY${d.toYear}`);
  const verb = excluded.length > 1 ? "are" : "is";
  return `${base}. ${clauses.join("; ")} and ${verb} excluded.`;
}

export function AssumptionsPanel({
  rows, year, target, capexBudget, setCapexBudget, invalidate,
}: {
  /* combineTrajectories output. The brief's inline type here was narrower
     ({ year; bau; net }[]) than what targetPosition (below) actually
     requires — CombinedRow also carries target/s1Net/s2Net/onTrack, which
     BalanceTab's real `rows` value already has. Typed as CombinedRow[] so
     tsc reflects what is actually passed, with no change to what this
     component reads from it or computes. */
  rows: CombinedRow[];
  year: number;
  target: number;
  capexBudget: number;
  setCapexBudget: (v: number) => void;
  invalidate: () => void;
}) {
  const s1 = useScenario();
  const s2 = useScope2();
  const a = s1.settings.assumptions;

  /* Combined actuals: the two scopes' series added year by year. Shown, never
     used to derive — each scope derives its own rate in its own store. */
  const actuals: YearPoint[] = useMemo(() => {
    const s1s = scope1ActualSeries(s1.combustion, s1.refrigeration);
    const s2s = scope2ActualSeries(s2.facilities);
    const byYear = new Map<number, number>();
    for (const p of [...s1s, ...s2s]) byYear.set(p.year, (byYear.get(p.year) ?? 0) + p.totalT);
    return [...byYear.entries()].map(([y, totalT]) => ({ year: y, totalT })).sort((x, z) => x.year - z.year);
  }, [s1.combustion, s1.refrigeration, s2.facilities]);

  const { base, bauAtYear, requiredT } = targetPosition(rows, year, target);
  const override = a.bauGrowthPct;
  const setGrowth = (v: number | undefined) => { invalidate(); s1.updateAssumptions({ bauGrowthPct: v }); };
  const pctLabel = (n: number) => `${n >= 0 ? "" : "−"}${Math.abs(n).toFixed(1)} %/yr`;

  /* What the field will fall back to if left blank — BOTH scopes' rates, in the
     Scope 1 / Scope 2 order the block on the left lists them.
     It showed Scope 1's derived rate alone, under a hint that says the override
     applies to both scopes: on the shipped inventories it read `2.8` while
     Scope 2 was actually running at 7.5. Resolved through the same
     describeBauPremise the rail uses (override deliberately `undefined` here —
     this describes the state the field is being compared AGAINST), so a scope
     with too few years shows the 1.0 %/yr floor it will really use rather than
     disappearing. */
  const derivedPremise = describeBauPremise(undefined, s1.derivedBau, s2.derivedBau);
  const overridePlaceholder = derivedPremise.single
    ? derivedPremise.s1Pct.toFixed(1)
    : `${derivedPremise.s1Pct.toFixed(1)} / ${derivedPremise.s2Pct.toFixed(1)}`;

  return (
    <div className="h-full min-h-0 overflow-y-auto p-6 space-y-7">
      {/* ── 1. Business as usual ───────────────────────────────────────── */}
      <section>
        <div className={H}>1 &middot; Business as usual</div>

        <div className="mt-2.5 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="text-[11px] text-ink-soft flex items-center gap-1">
              From your data
              <InfoTip text="Compound annual growth between the earliest financial year you have an inventory for and your base year. Every year is plotted below, so an odd year is visible rather than hidden." />
            </div>
            <div className="text-2xl font-extrabold tabular-nums text-ink">
              {s1.derivedBau ? pctLabel(s1.derivedBau.pct) : "—"}
              <span className="text-[11px] font-semibold text-ink-faint ml-2">Scope 1</span>
            </div>
            <div className="text-[11px] text-ink-faint mt-1">{bauBasisLine(s1.derivedBau, "sources")}</div>

            <div className="text-sm font-extrabold tabular-nums text-ink mt-3">
              {s2.derivedBau ? pctLabel(s2.derivedBau.pct) : "—"}
              <span className="text-[11px] font-semibold text-ink-faint ml-2">Scope 2</span>
            </div>
            <div className="text-[11px] text-ink-faint mt-1">{bauBasisLine(s2.derivedBau, "facilities")}</div>
          </div>

          <label className="block">
            <span className="text-[11px] text-ink-soft flex items-center gap-1">
              Use instead
              <InfoTip text={`One rate, applied to both scopes, replacing the per-scope rates on the left. Leave blank to let each scope follow its own history — the greyed-out figure is what is in play now (Scope 1 / Scope 2). Zero is a valid premise: a flat business-as-usual. Accepted range ${BAU_GROWTH_MIN_PCT} to ${BAU_GROWTH_MAX_PCT} %/yr.`} />
            </span>
            <span className="mt-1.5 flex items-center gap-2">
              <input
                /* min/max bound the SPINNER only — typing past them is still
                   possible, so the same bounds are enforced where the value is
                   read, in resolveBauGrowthPct. Following the precedent in
                   lib/finance/assumptions.ts. Without either, a typed 1000000
                   was accepted and made every downstream figure meaningless. */
                type="number" step={0.1}
                min={BAU_GROWTH_MIN_PCT} max={BAU_GROWTH_MAX_PCT}
                aria-label="BAU growth override"
                placeholder={overridePlaceholder}
                value={override ?? ""}
                onChange={(e) => setGrowth(e.target.value === "" ? undefined : Number(e.target.value))}
                className="w-24 border border-line rounded-lg px-3 py-2 text-sm bg-white text-right tabular-nums focus:outline-none focus:border-brand-400"
              />
              <span className="text-xs text-ink-faint">%/yr</span>
              <button
                type="button"
                onClick={() => setGrowth(undefined)}
                disabled={override == null}
                className="text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:text-ink-faint disabled:cursor-default"
              >
                Reset to derived
              </button>
            </span>
          </label>
        </div>

        <p className="mt-3 text-[11px] text-ink-soft leading-relaxed max-w-2xl">
          Business-as-usual reaches <strong className="text-ink tabular-nums">{fmt(bauAtYear)} t</strong> by {year},
          against a {s1.baseYear} base of <strong className="text-ink tabular-nums">{fmt(base)} t</strong> — so{" "}
          <strong className="text-ink tabular-nums">{fmt(requiredT)} t</strong> has to come out of that path to hit {target}%.
        </p>

        <div className="mt-3">
          <BauChart actuals={actuals} bau={rows} baseYear={s1.baseYear} />
        </div>
      </section>

      {/* ── 2. Mix inputs ─────────────────────────────────────────────── */}
      <section>
        <div className={H}>2 &middot; Mix inputs</div>
        <div className="mt-2.5 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="text-[11px] text-ink-soft">Target</div>
            <div className="text-sm font-extrabold tabular-nums text-ink">{target}% by {year}</div>
            <div className="text-[11px] text-ink-faint mt-0.5">set in the band above</div>
          </div>
          <label className="block">
            <span className="text-[11px] text-ink-soft flex items-center gap-1">
              CAPEX budget
              <InfoTip text="Ceiling on the capital a suggested mix may commit. Leave blank for no cap." />
            </span>
            <span className="mt-1.5 flex items-center gap-2">
              <input
                type="number" min={0} step={1_000_000}
                aria-label="CAPEX budget"
                placeholder="no cap"
                value={capexBudget === 0 ? "" : capexBudget}
                onChange={(e) => { invalidate(); setCapexBudget(Math.max(0, Number(e.target.value) || 0)); }}
                className="w-40 border border-line rounded-lg px-3 py-2 text-sm bg-white text-right tabular-nums focus:outline-none focus:border-brand-400"
              />
              <span className="text-xs text-ink-faint">{CURRENCY}</span>
            </span>
          </label>
        </div>
      </section>

      {/* ── 3. CAPEX rates — reserved, see the plan's Scope note ───────── */}
      <section>
        <div className={H}>3 &middot; CAPEX rates</div>
        <p className="mt-2 text-[11px] text-ink-faint rounded-xl2 border border-dashed border-line px-4 py-5 max-w-2xl">
          The editable rate table lands here once both scopes emit their capital
          lines. Scope 2 does not yet, and a table showing Scope 1 alone would
          silently omit solar, battery and lighting — usually the largest lines
          in a plan. Rates stay editable per source in the Scope 1 and Scope 2
          screens until then.
        </p>
      </section>

      {/* ── 4. Running costs & finance ────────────────────────────────── */}
      <section>
        <div className={H}>4 &middot; Running costs &amp; finance</div>
        <div className="mt-2.5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <NumField label="Discount rate (WACC)" suffix="%" step={0.5} min={0}
            hint="Discounts every year's cash and tonnes back to the base year — drives ₹/t, NPV and payback."
            value={a.discountRatePct ?? 10}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ discountRatePct: v }); }} />
          <NumField label="Fuel escalation" suffix="%/yr" step={0.5}
            hint="How fast fuel prices rise each year."
            value={a.fuelEscalationPct ?? 5}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ fuelEscalationPct: v }); }} />
          <NumField label="Electricity escalation" suffix="%/yr" step={0.5}
            hint="How fast the grid tariff rises each year."
            value={a.elecEscalationPct ?? 3}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ elecEscalationPct: v }); }} />
          <NumField label="Other escalation" suffix="%/yr" step={0.5}
            hint="Growth for everything else — certificates, maintenance."
            value={a.otherEscalationPct ?? 0}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ otherEscalationPct: v }); }} />
          <NumField label="Maintenance share of spend" suffix="%" step={5}
            hint="Share of an asset's annual bill that is maintenance; fuel is the rest."
            value={a.maintenanceShareOfSpendPct ?? 20}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ maintenanceShareOfSpendPct: v }); }} />
          <NumField label="EV maintenance vs ICE" suffix="%" step={5}
            hint="EVs still need maintenance — this share of the displaced maintenance is added back."
            value={a.evMaintenanceRatioPct ?? 65}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ evMaintenanceRatioPct: v }); }} />
          <NumField label="Heat-pump maintenance" suffix="%" step={5}
            hint="Heat-pump / electric-boiler maintenance as a share of the plant it replaces."
            value={a.heatPumpMaintenanceRatioPct ?? 70}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ heatPumpMaintenanceRatioPct: v }); }} />
          <NumField label="Certificate price" suffix={`${CURRENCY}/kWh`} step={0.05}
            hint="REC / green-tariff premium per kWh — the one place either scope reads it from."
            value={a.recPricePerKwh ?? 0.45}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ recPricePerKwh: v }); }} />
          <NumField label="Carbon price" suffix={`${CURRENCY}/t`} step={250}
            hint="Internal carbon price — shown as a uniform sensitivity, never mixed into the cash view."
            value={a.carbonPricePerTonne}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ carbonPricePerTonne: v }); }} />
          <NumField label="Grid emission factor" suffix="kgCO₂e/kWh" step={0.01}
            hint="How dirty the local grid is per unit of electricity, in the base year."
            value={a.gridEf}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ gridEf: v }); }} />
          <NumField label="Grid decline" suffix="%/yr" step={0.5}
            hint="How fast the grid cleans each year — every Scope 2 tonne falls with it."
            value={a.gridEfDeclinePctPerYear ?? 0}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ gridEfDeclinePctPerYear: v }); }} />
          <NumField label="Infrastructure CAPEX" suffix={CURRENCY} step={1_000_000}
            hint="One-off charging / grid-upgrade cost, charged once when any electrification is on."
            value={a.infraCapex}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ infraCapex: v }); }} />
        </div>
        <p className="mt-3 text-[11px] text-ink-faint">
          These are the same figures the Scope 1 source screens edit — one place, not a copy.
        </p>
      </section>
    </div>
  );
}
