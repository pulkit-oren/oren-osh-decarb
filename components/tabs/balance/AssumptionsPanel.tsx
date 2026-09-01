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
import { FAMILY_COLORS } from "@/lib/model/palette";
import { NumField } from "@/components/tabs/activity/fields";
import { InfoTip } from "@/components/ui/InfoTip";
import { BauChart } from "@/components/charts/BauChart";
import { SettingCard } from "./SettingCard";
import { CapexRateTable } from "./CapexRateTable";
import { cn, fmt, fmtMoney } from "@/lib/utils";

/** The slider's usable band. Deliberately narrower than the accepted range
 *  (`BAU_GROWTH_MIN_PCT`…`BAU_GROWTH_MAX_PCT`): a slider spanning −99.99 to 100
 *  would put every plausible rate inside two pixels. The number field beside it
 *  still accepts anything the engines accept, so the slider covers the band you
 *  would actually drag and typing covers the rest. */
const SLIDER_MIN_PCT = -5;
const SLIDER_MAX_PCT = 15;

/** One short line naming the basis a derived rate was measured on — the
 *  number is unauditable without it. `singular`/`plural` name a source in
 *  this scope ("source"/"sources", "facility"/"facilities"); which one is
 *  used is picked on `keptCount`, so a one-site company reads "the 1
 *  facility", not "the 1 facilities".
 *
 *  Guarded on `basis === "like-for-like"` rather than falling through on
 *  `keptCount ?? 0`: `basis`/`keptCount`/`joined`/`left` are optional on
 *  `DerivedGrowth` (the bare `deriveBauGrowth` primitive never sets them), so
 *  an ungated read would print "measured on the 0 sources present in both…"
 *  for a value that never went through the like-for-like restriction — a
 *  false statement that would still typecheck. Unreachable today because
 *  both stores call `deriveScopeNBau`, which always sets `basis`, but the
 *  guard costs nothing and keeps that true if a caller ever changes. Both
 *  non-like-for-like branches also cover this defensive case, since an
 *  absent `basis` carries no exclusion info either. */
export function bauBasisLine(d: DerivedGrowth | null, singular: string, plural: string): string {
  if (!d) return "Not enough years of data — falling back to 1 %/yr";
  const span = `FY${d.fromYear} to FY${d.toYear}`;

  if (d.basis !== "like-for-like") {
    const excluded = [...(d.joined ?? []), ...(d.left ?? [])];
    return excluded.length > 0
      ? `measured on all ${plural}, ${span}; a like-for-like basis was not available`
      : `measured on all ${plural}, ${span} — the set did not change`;
  }

  const joined = d.joined ?? [];
  const left = d.left ?? [];
  const count = d.keptCount ?? 0;
  const noun = count === 1 ? singular : plural;
  const base = `measured on the ${count} ${noun} present in both FY${d.fromYear} and FY${d.toYear}`;
  if (joined.length === 0 && left.length === 0) return base;

  // Each clause names its own excluded sources AND states that they are
  // excluded — "Genset joined … ; Boiler left …" sharing one trailing "and
  // are excluded" reads as applying to the second clause alone.
  const clauses: string[] = [];
  if (joined.length > 0) {
    clauses.push(`${joined.join(", ")} joined after FY${d.fromYear} and ${joined.length > 1 ? "are" : "is"} excluded`);
  }
  if (left.length > 0) {
    clauses.push(`${left.join(", ")} left before FY${d.toYear} and ${left.length > 1 ? "are" : "is"} excluded`);
  }
  return `${base}. ${clauses.join("; ")}.`;
}

/** One row of the capital breakdown. `scopeTag` is carried rather than derived
 *  from `scope` at render time so the two scopes' levers can share one sorted
 *  list without losing which engine each came from. */
export interface CapitalRow {
  id: string;
  label: string;
  colorIdx: number;
  capex: number;
  annualOpexDelta: number;
  scopeTag: "S1" | "S2";
}

/** Both scopes' levers as one list, largest capital first.
 *
 *  Exported and pure so the selection rules are assertable without a rendered
 *  panel: which levers appear is a judgement (see below), and on the shipped
 *  fixture only Scope 1 levers are active, so the DOM alone cannot exercise the
 *  zero-capital case.
 *
 *  A lever earns a row when it is enabled AND spends capital OR changes the
 *  yearly bill. Green procurement is the reason for that OR: it commits no
 *  capital and is not free, and dropping zero-capital lines is how the answer
 *  to "why is the lowest-CAPEX plan so cheap" went missing. A lever that is
 *  enabled but costs nothing either way has nothing to say and is left out. */
export function capitalRowsFrom(
  s1Levers: readonly { id: string; label: string; colorIdx: number; enabled: boolean; capex: number; annualOpexDelta: number }[],
  s2Levers: readonly { id: string; label: string; colorIdx: number; enabled: boolean; capex: number; annualOpexDelta: number }[],
): CapitalRow[] {
  const merged: CapitalRow[] = [
    ...s1Levers.map((l) => ({ ...l, scopeTag: "S1" as const })),
    ...s2Levers.map((l) => ({ ...l, scopeTag: "S2" as const })),
  ]
    .filter((l) => l.enabled && (l.capex > 0.5 || Math.abs(l.annualOpexDelta) > 0.5))
    .map(({ id, label, colorIdx, capex, annualOpexDelta, scopeTag }) =>
      ({ id, label, colorIdx, capex, annualOpexDelta, scopeTag }));
  return merged.sort((x, z) => z.capex - x.capex);
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

  /* ---- card header summaries: each card's current state, legible folded ---- */

  /* The premise actually in force, through the same resolver the engines use. */
  const inForce = describeBauPremise(override, s1.derivedBau, s2.derivedBau);
  /* "derived", not "from your data": the card body already labels the per-scope
     block "From your data", and two elements carrying the same phrase makes the
     header ambiguous to read and to query. */
  const bauProvenance = inForce.overridden
    ? "your override"
    : s1.derivedBau || s2.derivedBau
      ? "derived"
      : "fallback";
  const bauSummary = `${
    inForce.single
      ? `${inForce.s1Pct.toFixed(1)} %/yr`
      : `${inForce.s1Pct.toFixed(1)} / ${inForce.s2Pct.toFixed(1)} %/yr`
  } · ${bauProvenance}`;

  const mixSummary = `${target}% by ${year} · ${capexBudget > 0 ? `cap ${fmtMoney(capexBudget)}` : "no cap"}`;

  /* The two figures that move the most numbers downstream, of the twelve in
     that card — a discount rate and a fuel escalation reach every ₹/t. */
  const financeSummary = `WACC ${a.discountRatePct ?? 10}% · fuel +${a.fuelEscalationPct ?? 5}%/yr`;

  /* Where the slider rests. An override is one number and sits exactly where it
     was put. With none set there is no single "current" rate to point at — the
     two scopes can be on different derived rates — so it rests on Scope 1's,
     which is the first of the two rates listed directly above it and the one
     the placeholder leads with. The slider is a control, not the readout: the
     per-scope lines beside it are what state the premise. */
  const sliderPct = override ?? derivedPremise.s1Pct;

  /* ---- where the capital goes ---- */

  /* Both scopes' levers on one list, largest capital first. Read from
     `result.levers`, which each engine already returns — this is not a second
     costing pass, and it cannot disagree with the Cost & capital tab.

     A lever that spends nothing but costs something every year still earns a
     row: green procurement is the answer to "why is the Lowest CAPEX plan so
     cheap", and dropping zero-capital lines is how that answer went missing
     before. */
  const capitalRows = useMemo(
    () => capitalRowsFrom(s1.result.levers, s2.result.levers),
    [s1.result.levers, s2.result.levers],
  );

  const totalCapex = capitalRows.reduce((sum, l) => sum + l.capex, 0);
  /* How many priced drivers sit behind those families — the CAPEX rates card
     lists one row per driver, not per family. */
  const totalCapexLineCount = s1.result.capexLines.length + s2.result.capexLines.length;
  /* Bars are relative to the largest line, not to the total: at a realistic
     spread the biggest line is a third of the total, so scaling by total would
     leave every bar short and the comparison hard to read. Floor of 1 keeps a
     zero-capital-only list from dividing by zero. */
  const maxCapex = Math.max(1, ...capitalRows.map((l) => l.capex));

  return (
    <div className="h-full min-h-0 overflow-y-auto p-6 space-y-4">
      {/* ── Business as usual ──────────────────────────────────────────── */}
      <SettingCard title="Business as usual" summary={bauSummary}>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="text-[11px] text-ink-soft flex items-center gap-1">
              From your data
              <InfoTip text="Compound annual growth between the earliest financial year you have an inventory for and your base year, restricted to the sources present in BOTH years — a source that joined or left mid-span is named below rather than counted as growth. Every year is plotted below, so an odd year is visible rather than hidden." />
            </div>
            <div className="text-2xl font-extrabold tabular-nums text-ink">
              {s1.derivedBau ? pctLabel(s1.derivedBau.pct) : "—"}
              <span className="text-[11px] font-semibold text-ink-faint ml-2">Scope 1</span>
            </div>
            <div className="text-[11px] text-ink-faint mt-1">{bauBasisLine(s1.derivedBau, "source", "sources")}</div>

            <div className="text-sm font-extrabold tabular-nums text-ink mt-3">
              {s2.derivedBau ? pctLabel(s2.derivedBau.pct) : "—"}
              <span className="text-[11px] font-semibold text-ink-faint ml-2">Scope 2</span>
            </div>
            <div className="text-[11px] text-ink-faint mt-1">{bauBasisLine(s2.derivedBau, "facility", "facilities")}</div>
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

            {/* Same premise, second control. Writes through the same setGrowth,
                so dragging invalidates suggested mixes exactly as typing does. */}
            <span className="mt-2.5 block">
              <input
                type="range"
                min={SLIDER_MIN_PCT} max={SLIDER_MAX_PCT} step={0.1}
                aria-label="BAU growth slider"
                value={sliderPct}
                onChange={(e) => setGrowth(Number(e.target.value))}
                className="w-52 cursor-pointer accent-brand-500"
              />
              <span className="mt-0.5 flex w-52 justify-between text-[9px] font-bold text-ink-faint">
                <span>{SLIDER_MIN_PCT}%</span>
                <span>0%</span>
                <span>+{SLIDER_MAX_PCT}%</span>
              </span>
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
      </SettingCard>

      {/* ── Mix inputs ─────────────────────────────────────────────────── */}
      <SettingCard title="Mix inputs" summary={mixSummary}>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
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
      </SettingCard>

      {/* ── Where the capital goes ─────────────────────────────────────── */}
      <SettingCard
        title="Where the capital goes"
        summary={totalCapex > 0 ? fmtMoney(totalCapex) : "no capital committed"}
        testId="capital-card"
      >
        {capitalRows.length === 0 ? (
          <p className="text-[11px] text-ink-faint">
            No lever is active yet, so the plan commits no capital. Turn one on in
            Fine-tune levers and its capital appears here.
          </p>
        ) : (
          <div className="divide-y divide-line/50">
            {/* The two figures carry opposite meanings and one is often
                negative, so an unlabelled "₹-5.82 Cr/yr" reads as ambiguous
                between a cost and a saving. Colour alone was carrying that. */}
            <div className="flex items-center gap-3 pb-1.5 text-[9px] uppercase tracking-wide font-bold text-ink-faint">
              <span className="w-36 shrink-0">Lever</span>
              <span className="w-6 shrink-0" />
              <span className="flex-1 min-w-8" />
              <span className="w-24 shrink-0 text-right">Capital</span>
              <span className="w-24 shrink-0 text-right">Yearly cost</span>
            </div>
            {capitalRows.map((row) => (
              <div key={`${row.scopeTag}:${row.id}`} className="flex items-center gap-3 py-2">
                <span className="w-36 shrink-0 text-[11px] font-medium text-ink truncate" title={row.label}>
                  {row.label}
                </span>
                <span className="w-6 shrink-0 text-[9px] font-bold text-ink-faint">{row.scopeTag}</span>
                <span className="flex-1 min-w-8 h-2 rounded-full bg-surface-muted overflow-hidden">
                  <span
                    className="block h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(row.capex > 0 ? 2 : 0, (row.capex / maxCapex) * 100)}%`,
                      background: FAMILY_COLORS[row.colorIdx],
                    }}
                  />
                </span>
                <span
                  data-capex={row.capex}
                  className="w-24 shrink-0 text-right text-[11px] font-extrabold tabular-nums text-ink"
                >
                  {row.capex > 0.5
                    ? fmtMoney(row.capex)
                    : <span className="font-semibold text-ink-faint">no capital</span>}
                </span>
                <span className={cn(
                  "w-24 shrink-0 text-right text-[10px] tabular-nums",
                  row.annualOpexDelta <= 0 ? "text-brand-600" : "text-amber-700",
                )}>
                  {Math.abs(row.annualOpexDelta) > 0.5 ? `${fmtMoney(row.annualOpexDelta)}/yr` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-ink-faint leading-relaxed max-w-2xl">
          Capital per lever family, from the same model the Cost &amp; capital tab
          reads — so the two cannot disagree. The prices underneath it are in the
          next card.
        </p>
      </SettingCard>

      {/* ── The prices that capital is built from ──────────────────────── */}
      <SettingCard
        title="CAPEX rates"
        summary={`${capitalRows.length > 0 ? `${totalCapexLineCount} drivers` : "nothing priced yet"}`}
        testId="capex-rates-card"
      >
        <CapexRateTable invalidate={invalidate} />
      </SettingCard>

      {/* ── Running costs & finance ────────────────────────────────────── */}
      <SettingCard title="Running costs & finance" summary={financeSummary}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
      </SettingCard>
    </div>
  );
}
