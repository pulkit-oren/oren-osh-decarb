"use client";

/* The premises Compare mixes runs on, in one place.

   Extracted rather than added to BalanceTab.tsx, which is already ~700 lines.

   Three rules this file must keep:
   - It computes NO business-as-usual. The chart's line is the `rows` prop,
     which is the same `combineTrajectories` output the result rail reads.
   - Reset CLEARS all three growth fields. Writing a derived number into one
     would freeze today's history into the saved scenario.
   - The two growth fields write `bauGrowthS1Pct` / `bauGrowthS2Pct` and never
     `bauGrowthPct`. That third field is what scenarios saved before the split
     carry; it still drives a scope that has no rate of its own, so it is READ
     here (through `bauOverridesFrom`) and never written. */

import { useMemo } from "react";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import {
  BAU_GROWTH_MAX_PCT, BAU_GROWTH_MIN_PCT,
  BAU_GROWTH_SPINNER_MAX_PCT, BAU_GROWTH_SPINNER_MIN_PCT, BAU_GROWTH_STEP_PCT,
  bauOverridesFrom, describeBauPremise,
  overrideForScope, resolveBauGrowthPct,
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

/** One scope's growth override.
 *
 *  A component rather than two copies of the same twenty lines: the spinner
 *  bounds, the empty-string-to-undefined normalisation and the placeholder
 *  contract are exactly the rules that must not differ between the two scopes,
 *  and two inline copies are how they would come to.
 *
 *  It carries no visible label. The row it sits in names the scope once, for
 *  both the derived rate and this field; a second "Scope 1" beside the box
 *  labelled the same thing twice on one line. The aria-label stays, because a
 *  screen reader has no row to read it from. */
function GrowthField({ scope, value, placeholder, onChange }: {
  scope: "Scope 1" | "Scope 2";
  value: number | undefined;
  placeholder: string;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <input
        /* The bounds here are the SPINNER pair, deliberately wider than the
           accepted range: `min` doubles as the HTML step base, so it must be a
           multiple of the step or the arrows land on 2.81 rather than 2.90. The
           real clamp is in resolveBauGrowthPct, where the value is read — which
           is also what stops a typed 1000000 from compounding into nonsense. */
        type="number" step={BAU_GROWTH_STEP_PCT}
        min={BAU_GROWTH_SPINNER_MIN_PCT} max={BAU_GROWTH_SPINNER_MAX_PCT}
        aria-label={`${scope} BAU growth override`}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="w-28 border border-line rounded-lg px-3 py-2.5 text-base bg-white text-right tabular-nums focus:outline-none focus:border-brand-400"
      />
      <span className="text-xs font-medium text-ink-faint">%/yr</span>
    </span>
  );
}

/** One scope's line in the growth table: what its own history says, and what
 *  you are using instead.
 *
 *  A ROW per scope, not a column per source. The two scopes are peers — the
 *  previous layout set Scope 1 at `text-2xl` and Scope 2 at `text-sm`, which
 *  claimed a hierarchy that does not exist and buried the larger of the two
 *  rates on the client inventories that prompted the split. Putting the
 *  override on the same line as the rate it replaces also makes the
 *  substitution visible, which two stacked blocks never did. */
function ScopeGrowthRow({ scope, derived, basis, value, placeholder, onChange }: {
  scope: "Scope 1" | "Scope 2";
  derived: DerivedGrowth | null;
  basis: string;
  value: number | undefined;
  placeholder: string;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className={GROWTH_GRID + " items-center py-3.5 border-t border-line/60"}>
      <span className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-faint">
        {scope}
      </span>
      <span className="min-w-0">
        {/* No unit beside the dash. At 2xl extrabold an em dash is a heavy
            horizontal bar, and "— %/yr" reads as a rate whose digits failed to
            load rather than as a scope with too little history to measure. The
            line underneath says which it is. */}
        {derived ? (
          <span className="block text-2xl font-extrabold tabular-nums leading-none text-ink">
            {growthPct(derived.pct)}
            <span className="text-sm font-bold text-ink-faint ml-1.5">%/yr</span>
          </span>
        ) : (
          <span className="block text-xl font-semibold leading-none text-ink-faint">&mdash;</span>
        )}
        <span className="block text-[11px] text-ink-faint mt-1.5 leading-snug">{basis}</span>
      </span>
      <GrowthField scope={scope} value={value} placeholder={placeholder} onChange={onChange} />
    </div>
  );
}

/** Shared by the header and both rows, so the three columns cannot drift. */
const GROWTH_GRID = "grid grid-cols-[4.5rem_1fr_auto] gap-x-5";

/** A rate to one decimal with a true minus sign, not a hyphen. One decimal
 *  because that is the precision every other statement of the premise uses —
 *  `describeBauPremise.single` collapses two rates at exactly this precision,
 *  so printing more here would show two numbers the model calls one. */
const growthPct = (n: number) => `${n >= 0 ? "" : "−"}${Math.abs(n).toFixed(1)}`;

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

  /* What each field SHOWS. `bauGrowthPct` is the pre-split rate: a scenario
     saved before the split has it and neither scope field, and the honest thing
     to show in both boxes is the rate that scenario is actually running on.
     Editing one box then writes only that scope's field, which leaves the other
     scope on the inherited rate — unchanged, which is the point. */
  const s1Override = a.bauGrowthS1Pct ?? a.bauGrowthPct;
  const s2Override = a.bauGrowthS2Pct ?? a.bauGrowthPct;

  const setS1 = (v: number | undefined) => { invalidate(); s1.updateAssumptions({ bauGrowthS1Pct: v }); };
  const setS2 = (v: number | undefined) => { invalidate(); s1.updateAssumptions({ bauGrowthS2Pct: v }); };
  /* Reset clears all three, INCLUDING the pre-split field. Clearing only the
     two scope fields would leave a pre-split scenario silently forced on a rate
     the panel had just told the reader was reset to derived. */
  const resetGrowth = () => {
    invalidate();
    s1.updateAssumptions({ bauGrowthS1Pct: undefined, bauGrowthS2Pct: undefined, bauGrowthPct: undefined });
  };
  const anyOverride = overrideForScope(bauOverridesFrom(a), "s1") != null
    || overrideForScope(bauOverridesFrom(a), "s2") != null;

  /* What each field falls back to if left blank — that scope's OWN rate, not
     the pair. One shared placeholder reading "2.8 / 7.5" was correct beside a
     single field and is unreadable beside two: neither box could say which half
     of it belonged to that box.

     Resolved through the same `resolveBauGrowthPct` the engines call (no
     override, deliberately — this describes the state the field is being
     compared AGAINST), so a scope with too few years shows the 1.0 %/yr floor
     it will really use rather than showing nothing. */
  const s1Placeholder = resolveBauGrowthPct(undefined, s1.derivedBau?.pct).toFixed(1);
  const s2Placeholder = resolveBauGrowthPct(undefined, s2.derivedBau?.pct).toFixed(1);

  /* ---- card header summaries: each card's current state, legible folded ---- */

  /* The premise actually in force, through the same resolver the engines use. */
  const inForce = describeBauPremise(bauOverridesFrom(a), s1.derivedBau, s2.derivedBau);
  /* "derived", not "from your data": the card body already labels the per-scope
     block "From your data", and two elements carrying the same phrase makes the
     header ambiguous to read and to query.

     The two single-scope cases need their own words. "your override" would
     claim both scopes are typed and "derived" would claim neither is; a folded
     card that misstates which half is yours is worse than one that says
     nothing. */
  const bauProvenance = inForce.overriddenScopes === "both"
    ? "your override"
    : inForce.overriddenScopes === "s1"
      ? "Scope 1 override"
      : inForce.overriddenScopes === "s2"
        ? "Scope 2 override"
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
        {/* Two columns, named once at the top, over one row per scope — rather
            than the two labels repeated beside each of four stacked blocks. */}
        <div className="max-w-3xl">
          <div className={GROWTH_GRID + " items-center pb-1"}>
            <span />
            <span className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft flex items-center gap-1.5">
              From your data
              <InfoTip text="Compound annual growth between the earliest financial year you have an inventory for and your base year, restricted to the sources present in BOTH years — a source that joined or left mid-span is named below rather than counted as growth. Every year is plotted below, so an odd year is visible rather than hidden." />
            </span>
            <span className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft flex items-center gap-1.5">
              Use instead
              <InfoTip text={`A rate per scope, each replacing that scope's own history on the left. Fill one and the other keeps following its own data — the two scopes rarely grow at the same speed, which is why there are two boxes rather than one. Leave a box blank and the greyed-out figure is what that scope will use. Zero is a valid premise: a flat business-as-usual. Accepted range ${BAU_GROWTH_MIN_PCT} to ${BAU_GROWTH_MAX_PCT} %/yr.`} />
            </span>
          </div>

          <ScopeGrowthRow
            scope="Scope 1"
            derived={s1.derivedBau}
            basis={bauBasisLine(s1.derivedBau, "source", "sources")}
            value={s1Override}
            placeholder={s1Placeholder}
            onChange={setS1}
          />
          <ScopeGrowthRow
            scope="Scope 2"
            derived={s2.derivedBau}
            basis={bauBasisLine(s2.derivedBau, "facility", "facilities")}
            value={s2Override}
            placeholder={s2Placeholder}
            onChange={setS2}
          />

          <div className={GROWTH_GRID + " border-t border-line/60 pt-2.5"}>
            <span />
            <span />
            <button
              type="button"
              onClick={resetGrowth}
              disabled={!anyOverride}
              className="justify-self-start text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:text-ink-faint disabled:cursor-default"
            >
              Reset to derived
            </button>
          </div>
        </div>

        <p className="mt-5 text-[13px] text-ink-soft leading-relaxed max-w-2xl">
          Business-as-usual reaches <strong className="text-ink tabular-nums">{fmt(bauAtYear)} t</strong> by {year},
          against a {s1.baseYear} base of <strong className="text-ink tabular-nums">{fmt(base)} t</strong> — so{" "}
          <strong className="text-ink tabular-nums">{fmt(requiredT)} t</strong> has to come out of that path to hit {target}%.
        </p>

        <div className="mt-4">
          <BauChart actuals={actuals} bau={rows} baseYear={s1.baseYear} />
        </div>
      </SettingCard>

      {/* ── Mix inputs ─────────────────────────────────────────────────── */}
      <SettingCard title="Mix inputs" summary={mixSummary}>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <span className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft">Target</span>
            <div className="text-2xl font-extrabold tabular-nums leading-none text-ink mt-1.5">
              {target}%<span className="text-sm font-bold text-ink-faint ml-1.5">by {year}</span>
            </div>
            <div className="text-[11px] text-ink-faint mt-1.5">set in the band above</div>
          </div>
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.08em] font-bold text-ink-soft flex items-center gap-1.5">
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
                className="w-44 border border-line rounded-lg px-3 py-2.5 text-base bg-white text-right tabular-nums focus:outline-none focus:border-brand-400"
              />
              <span className="text-xs font-medium text-ink-faint">{CURRENCY}</span>
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
          <p className="text-[13px] text-ink-faint leading-relaxed">
            No lever is active yet, so the plan commits no capital. Turn one on in
            Fine-tune levers and its capital appears here.
          </p>
        ) : (
          <div className="divide-y divide-line/50">
            {/* The two figures carry opposite meanings and one is often
                negative, so an unlabelled "₹-5.82 Cr/yr" reads as ambiguous
                between a cost and a saving. Colour alone was carrying that. */}
            <div className="flex items-center gap-3 pb-2 text-[10px] uppercase tracking-[0.08em] font-bold text-ink-faint">
              <span className="w-40 shrink-0">Lever</span>
              <span className="w-6 shrink-0" />
              <span className="flex-1 min-w-8" />
              <span className="w-24 shrink-0 text-right">Capital</span>
              <span className="w-24 shrink-0 text-right">Yearly cost</span>
            </div>
            {capitalRows.map((row) => (
              <div key={`${row.scopeTag}:${row.id}`} className="flex items-center gap-3 py-2.5">
                <span className="w-40 shrink-0 text-[13px] font-medium text-ink truncate" title={row.label}>
                  {row.label}
                </span>
                <span className="w-6 shrink-0 text-[10px] font-bold text-ink-faint">{row.scopeTag}</span>
                <span className="flex-1 min-w-8 h-2.5 rounded-full bg-surface-muted overflow-hidden">
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
                  className="w-24 shrink-0 text-right text-[13px] font-extrabold tabular-nums text-ink"
                >
                  {row.capex > 0.5
                    ? fmtMoney(row.capex)
                    : <span className="font-semibold text-ink-faint">no capital</span>}
                </span>
                <span className={cn(
                  "w-24 shrink-0 text-right text-xs tabular-nums",
                  row.annualOpexDelta <= 0 ? "text-brand-600" : "text-amber-700",
                )}>
                  {Math.abs(row.annualOpexDelta) > 0.5 ? `${fmtMoney(row.annualOpexDelta)}/yr` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
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
          <NumField size="md" label="Discount rate (WACC)" suffix="%" step={0.5} min={0}
            hint="Discounts every year's cash and tonnes back to the base year — drives ₹/t, NPV and payback."
            value={a.discountRatePct ?? 10}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ discountRatePct: v }); }} />
          <NumField size="md" label="Fuel escalation" suffix="%/yr" step={0.5}
            hint="How fast fuel prices rise each year."
            value={a.fuelEscalationPct ?? 5}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ fuelEscalationPct: v }); }} />
          <NumField size="md" label="Electricity escalation" suffix="%/yr" step={0.5}
            hint="How fast the grid tariff rises each year."
            value={a.elecEscalationPct ?? 3}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ elecEscalationPct: v }); }} />
          <NumField size="md" label="Other escalation" suffix="%/yr" step={0.5}
            hint="Growth for everything else — certificates, maintenance."
            value={a.otherEscalationPct ?? 0}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ otherEscalationPct: v }); }} />
          <NumField size="md" label="Maintenance share of spend" suffix="%" step={5}
            hint="Share of an asset's annual bill that is maintenance; fuel is the rest."
            value={a.maintenanceShareOfSpendPct ?? 20}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ maintenanceShareOfSpendPct: v }); }} />
          <NumField size="md" label="EV maintenance vs ICE" suffix="%" step={5}
            hint="EVs still need maintenance — this share of the displaced maintenance is added back."
            value={a.evMaintenanceRatioPct ?? 65}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ evMaintenanceRatioPct: v }); }} />
          <NumField size="md" label="Heat-pump maintenance" suffix="%" step={5}
            hint="Heat-pump / electric-boiler maintenance as a share of the plant it replaces."
            value={a.heatPumpMaintenanceRatioPct ?? 70}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ heatPumpMaintenanceRatioPct: v }); }} />
          <NumField size="md" label="Certificate price" suffix={`${CURRENCY}/kWh`} step={0.05}
            hint="REC / green-tariff premium per kWh — the one place either scope reads it from."
            value={a.recPricePerKwh ?? 0.45}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ recPricePerKwh: v }); }} />
          <NumField size="md" label="Carbon price" suffix={`${CURRENCY}/t`} step={250}
            hint="Internal carbon price — shown as a uniform sensitivity, never mixed into the cash view."
            value={a.carbonPricePerTonne}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ carbonPricePerTonne: v }); }} />
          <NumField size="md" label="Grid emission factor" suffix="kgCO₂e/kWh" step={0.01}
            hint="How dirty the local grid is per unit of electricity, in the base year."
            value={a.gridEf}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ gridEf: v }); }} />
          <NumField size="md" label="Grid decline" suffix="%/yr" step={0.5}
            hint="How fast the grid cleans each year — every Scope 2 tonne falls with it."
            value={a.gridEfDeclinePctPerYear ?? 0}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ gridEfDeclinePctPerYear: v }); }} />
          <NumField size="md" label="Infrastructure CAPEX" suffix={CURRENCY} step={1_000_000}
            hint="One-off charging / grid-upgrade cost, charged once when any electrification is on."
            value={a.infraCapex}
            onChange={(v) => { invalidate(); s1.updateAssumptions({ infraCapex: v }); }} />
        </div>
      </SettingCard>
    </div>
  );
}
