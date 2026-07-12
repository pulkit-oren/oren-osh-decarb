"use client";

/* Balance to target — the builder's landing screen, as a guided 3-step flow.
   Step 1: set the target year + percentage (defaulting from your active
   emissions goal) and watch the gauge track how much of the required cut the
   current levers deliver. Step 2: compare suggested mixes on three bases
   (four with a CAPEX budget) — each card's (i) flips it over to the exact
   calculation logic. Step 3: fine-tune the seven lever families with live
   tonnes from the real model. The dials are DERIVED from the per-source
   levers, so fine-tuning inside Scope 1 / Scope 2 moves them here — the two
   views can never drift. */

import { useEffect, useMemo, useState } from "react";
import { Target, Zap, Fuel, Snowflake, Sun, Lightbulb, Landmark, Wind, ChevronRight, Info, Check, Sparkles } from "lucide-react";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import { useGoals } from "@/lib/goals/store";
import { applyDials, deriveDials, withLeakFixes, type BalanceDials } from "@/lib/model/energy-balance";
import { applyDials2, deriveDials2, type BalanceDials2 } from "@/lib/scope2/model/energy-balance";
import { combineTrajectories } from "@/lib/model/combined";
import { END_YEAR } from "@/lib/model";
import { suggestMixOptions, type CombinedInputs, type MixObjective, type MixOption } from "@/lib/combined-balance";
import { baseValueFor, targetValueAt, type Inventories } from "@/lib/goals/select";
import { CURRENCY } from "@/lib/defaults";
import { Collapsible } from "@/components/tabs/activity/Collapsible";
import { InfoTip } from "@/components/ui/InfoTip";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { cn, fmt, fmtMoney } from "@/lib/utils";

/* How each basis builds its mix — shown when the card's (i) is clicked. */
const MIX_LOGIC: Record<MixObjective, string[]> = {
  costPerTonne: [
    "Every lever family is priced standalone at 100% with the real model.",
    `Families are ranked by annualized total cost per tonne — CAPEX spread over each lever's lifetime at your discount rate, plus the yearly OPEX change, divided by tonnes abated (${CURRENCY}/t).`,
    "Dials rise in 10% steps, cheapest family first, until the target is met.",
  ],
  capex: [
    "Every lever family is priced standalone at 100% with the real model.",
    `Families are ranked by upfront capital per tonne abated (ties broken by ${CURRENCY}/t) — procurement and fuel blends come before buying new kit.`,
    "Dials rise in 10% steps, least-capital family first, until the target is met.",
  ],
  opexSaving: [
    "Every lever family is priced standalone at 100% with the real model.",
    "Families are ranked by yearly OPEX change per tonne — biggest running-cost saving first.",
    "After the target is met, every self-funding lever (one that saves money each year) is raised to 100%: more reduction AND more savings. The payback figure shows the capital price of that choice.",
  ],
  budget: [
    "Same ranking as Cheapest overall, but every 10% step is checked against your CAPEX budget.",
    "A step that would bust the cap is reverted, and cheaper families further down the list are tried instead.",
    "The mix may stop below the target — the badge shows the best reduction reachable inside the envelope.",
  ],
};
const LOGIC_FOOTER =
  "Every mix also switches leak fixes on (near-zero cost, pure savings), and when electrification rises, renewable sourcing for the new load follows the procurement level so the added electricity arrives green.";

function StepBadge({ n }: { n: number }) {
  return (
    <span className="w-7 h-7 rounded-full bg-brand-600 text-white grid place-items-center text-sm font-extrabold shrink-0">
      {n}
    </span>
  );
}

export function BalanceTab({ onOpenScope }: { onOpenScope?: (scope: "s1" | "s2") => void }) {
  const s1 = useScenario();
  const s2 = useScope2();
  const { goals } = useGoals();

  const assets = s1.baseAssets.filter((a) => !a.excluded);
  const systems = s1.baseSystems.filter((x) => !x.excluded);
  const facilities = s2.baseFacilities.filter((f) => !f.excluded);

  /* ---- Step 1: target year + percentage, defaulting from the active goal ---- */
  const minYear = s1.baseYear + 1;
  const [year, setYear] = useState(2030);
  const [target, setTarget] = useState(50);
  const [touched, setTouched] = useState(false);

  const inv: Inventories = { combustion: s1.combustion, refrigeration: s1.refrigeration, facilities: s2.facilities };
  const goal = goals.find((g) => g.metric === "emissions_t" && g.direction === "reduce" && g.scope === "s1s2");
  const goalTargetPct = useMemo(() => {
    if (!goal) return null;
    const bv = baseValueFor(goal, inv);
    if (bv <= 0) return goal.targetPct ?? null;
    return Math.round((1 - targetValueAt(goal, bv, year) / bv) * 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inv is rebuilt every render; goal identity is enough
  }, [goal?.id, goal?.targetPct, goal?.targetYear, goal?.baseYear, year]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- adopt the goal defaults once hydrated, until the user edits */
    if (!touched && goal?.targetYear && goal.targetYear > minYear && goal.targetYear <= END_YEAR) setYear(goal.targetYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.targetYear]);
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- adopt the goal default once hydrated, until the user edits */
    if (!touched && goalTargetPct != null && goalTargetPct > 0) setTarget(goalTargetPct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalTargetPct]);

  /* ---- combined position vs target ---- */
  const rows = combineTrajectories(s1.result.trajectory, s2.result.trajectoryMarket);
  const base = rows[0]?.bau ?? 0;
  const atYear = rows.find((r) => r.year === year) ?? rows[rows.length - 1];
  const allocatedT = atYear ? atYear.bau - atYear.net : 0;
  const requiredT = base * (target / 100);
  const gapT = requiredT - allocatedT;
  const onTrack = gapT <= 0.5;
  const allocPct = requiredT > 0 ? allocatedT / requiredT : 1;

  /* ---- derived dials + write-through ---- */
  const d1 = deriveDials(assets, systems, s1.settings);
  const d2 = deriveDials2(facilities, s2.levers);
  const setDial1 = (patch: Partial<BalanceDials>) =>
    s1.setSettings((p) => applyDials(assets, systems, p, { ...deriveDials(assets, systems, p), ...patch }));
  const setDial2 = (patch: Partial<BalanceDials2>) =>
    s2.setLevers((p) => applyDials2(facilities, p, { ...deriveDials2(facilities, p), ...patch }));

  /* ---- per-family tonnes at the target year (real model wedges) + costs ---- */
  const w1 = (s1.result.trajectory.find((r) => r.year === year) ?? s1.result.trajectory[s1.result.trajectory.length - 1])?.wedges ?? {};
  const w2 = (s2.result.trajectoryMarket.find((r) => r.year === year) ?? s2.result.trajectoryMarket[s2.result.trajectoryMarket.length - 1])?.wedges ?? {};
  const spillYear = s1.result.trajectory.find((r) => r.year === year)?.scope2Spill ?? 0;
  const lever1 = (id: string) => s1.result.levers.find((l) => l.id === id);
  const lever2 = (id: string) => s2.result.levers.find((l) => l.id === id);

  /* ---- Step 2: suggested mixes — preview first, apply per card ---- */
  const [options, setOptions] = useState<MixOption[] | null>(null);
  const [appliedObj, setAppliedObj] = useState<MixObjective | null>(null);
  const [logicOpen, setLogicOpen] = useState<MixObjective | null>(null);
  const [capexBudget, setCapexBudget] = useState(0); // 0 = no cap
  const invalidate = () => { setOptions(null); setAppliedObj(null); setLogicOpen(null); };
  const computeOptions = () => {
    const inp: CombinedInputs = {
      assets, systems, s1Base: s1.settings, facilities, s2Base: s2.levers,
      baseYear: s1.baseYear, targetYear: year,
    };
    setOptions(suggestMixOptions(inp, target / 100, capexBudget > 0 ? { capexBudget } : undefined));
    setAppliedObj(null);
    setLogicOpen(null);
  };
  const applyOption = (o: MixOption) => {
    s1.setSettings((p) => withLeakFixes(applyDials(assets, systems, p, o.dials.s1), systems));
    s2.setLevers((p) => applyDials2(facilities, p, o.dials.s2));
    setAppliedObj(o.objective);
  };

  const LEVER_ROWS: {
    key: string; scope: "s1" | "s2"; label: string; icon: React.ElementType; hint: string;
    value: number; onChange: (v: number) => void; tonnes: number; costNote: string;
  }[] = [
    {
      key: "efficiency", scope: "s2", label: "Efficiency", icon: Lightbulb,
      hint: "LED, motors/VFD, BMS across grid facilities — usually the cheapest tonnes.",
      value: d2.efficiencyPct, onChange: (v) => setDial2({ efficiencyPct: v }),
      tonnes: w2["efficiency"] ?? 0, costNote: fmtMoney(lever2("efficiency")?.capex ?? 0),
    },
    {
      key: "solar", scope: "s2", label: "Solar onsite", icon: Sun,
      hint: "Rooftop PV as a share of each facility's roof headroom.",
      value: d2.solarPct, onChange: (v) => setDial2({ solarPct: v }),
      tonnes: w2["generation"] ?? 0, costNote: fmtMoney(lever2("generation")?.capex ?? 0),
    },
    {
      key: "procurement", scope: "s2", label: "Procurement (market)", icon: Landmark,
      hint: "PPAs / green tariff / RECs on the remaining grid draw — moves the market-based number only.",
      value: d2.procurementPct, onChange: (v) => setDial2({ procurementPct: v }),
      tonnes: w2["procurement"] ?? 0, costNote: `${fmtMoney(lever2("procurement")?.annualOpexDelta ?? 0)}/yr`,
    },
    {
      key: "bio", scope: "s1", label: "Bio-blend fuel", icon: Fuel,
      hint: "Drop-in bio blends on sources still burning fuel, capped per asset.",
      value: d1.bioBlendPct, onChange: (v) => setDial1({ bioBlendPct: v }),
      tonnes: w1["fuelSwitch"] ?? 0, costNote: fmtMoney(lever1("fuelSwitch")?.capex ?? 0),
    },
    {
      key: "refrig", scope: "s1", label: "Low-GWP refrigerant", icon: Snowflake,
      hint: "Gas transition share across cooling systems (leak fixes are set per system).",
      value: d1.refrigPct, onChange: (v) => setDial1({ refrigPct: v }),
      tonnes: w1["refrigerant"] ?? 0, costNote: fmtMoney(lever1("refrigerant")?.capex ?? 0),
    },
    {
      key: "electrify", scope: "s1", label: "Electrify fuel", icon: Zap,
      hint: "Move feasible fuel use to electricity — the biggest lever, with Scope 2 spill.",
      value: d1.electrifyPct, onChange: (v) => setDial1({ electrifyPct: v }),
      tonnes: w1["electrification"] ?? 0, costNote: fmtMoney(lever1("electrification")?.capex ?? 0),
    },
    {
      key: "renewable", scope: "s1", label: "Renewable sourcing for new load", icon: Wind,
      hint: "Clean share of the electricity electrification adds — shrinks the Scope 2 spill.",
      value: d1.renewablePct, onChange: (v) => setDial1({ renewablePct: v }),
      tonnes: 0, costNote: spillYear > 0.05 ? `spill +${fmt(spillYear)} t` : "—",
    },
  ];

  return (
    <div className="screen-in flex flex-col gap-5">
      {/* header */}
      <div className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60">
        <h1 className="text-2xl font-extrabold text-ink leading-tight flex items-center gap-2"><Target size={22} className="text-brand-600" /> Balance to target</h1>
        <p className="text-sm text-ink-soft mt-0.5">Three steps: set your target, compare ways to get there, then fine-tune the levers. Edits inside Scope 1 / Scope 2 move the dials here too.</p>
      </div>

      {/* ---- Step 1: set your target ---- */}
      <section className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6" aria-label="Step 1 — set your target">
        <div className="flex items-center gap-3 mb-5">
          <StepBadge n={1} />
          <div>
            <h2 className="text-base font-extrabold text-ink leading-tight">Set your target</h2>
            <p className="text-xs text-ink-soft">Pick the year and the Scope 1+2 cut — 100% is net zero.</p>
          </div>
          {goal && goalTargetPct === target && !touched && (
            <span className="ml-auto text-[11px] font-semibold text-brand-700 bg-brand-50 rounded-full px-2.5 py-1" title={goal.name}>from your goal: {goal.name}</span>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(220px,1fr)_auto_minmax(300px,1.2fr)] items-center">
          {/* inputs */}
          <div className="flex flex-col gap-4">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink-soft font-medium">Target year</span>
              <select
                value={year}
                aria-label="Target year"
                onChange={(e) => { setTouched(true); invalidate(); setYear(Number(e.target.value)); }}
                className="w-28 tabular-nums rounded-lg border border-line bg-surface px-3 py-1.5 font-bold text-ink cursor-pointer"
              >
                {Array.from({ length: END_YEAR - minYear + 1 }, (_, i) => minYear + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink-soft font-medium">Cut Scope 1+2 by</span>
              <span className="flex items-center gap-1.5">
                <input
                  type="number" value={target} min={0} max={100}
                  aria-label="Combined reduction target"
                  onChange={(e) => { setTouched(true); invalidate(); setTarget(Math.max(0, Math.min(100, Number(e.target.value)))); }}
                  className="w-20 text-right tabular-nums rounded-lg border border-line px-2 py-1.5 font-bold"
                />
                <span className="text-ink-faint">%</span>
              </span>
            </label>
            <p className="text-[11px] text-ink-faint leading-relaxed">
              {target >= 100 ? <>That&rsquo;s <strong className="text-brand-700">net zero by {year}</strong>.</> : <>Cut {target}% of the {s1.baseYear} base by {year}{target >= 90 ? " — near net zero" : ""}.</>}
            </p>
          </div>

          {/* progress ring */}
          <ProgressRing pct={allocPct} caption="of the required cut is allocated" tone={onTrack ? "good" : "warn"} />

          {/* stat tiles */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl2 bg-brand-700 text-white p-3.5">
              <div className="text-[10px] uppercase tracking-wide font-bold text-white/70">Required cut</div>
              <div className="text-xl font-extrabold tabular-nums mt-1">{fmt(requiredT)} t</div>
              <div className="text-[10px] text-white/70 mt-0.5">by {year}</div>
            </div>
            <div className="rounded-xl2 border border-line/70 bg-surface p-3.5">
              <div className="text-[10px] uppercase tracking-wide font-bold text-ink-faint">Allocated</div>
              <div className={cn("text-xl font-extrabold tabular-nums mt-1", onTrack ? "text-brand-600" : "text-ink")}>{fmt(allocatedT)} t</div>
              <div className="text-[10px] text-ink-faint mt-0.5">from the levers</div>
            </div>
            <div className={cn("rounded-xl2 border p-3.5", onTrack ? "border-brand-200 bg-brand-50" : "border-amber-200 bg-amber-50")}>
              <div className={cn("text-[10px] uppercase tracking-wide font-bold flex items-center gap-1", onTrack ? "text-brand-700/70" : "text-amber-700/70")}>
                Gap <InfoTip text="Required cut minus what your current levers deliver by the target year (Scope 2 market-based, including your entered VPPA/I-REC coverage)." />
              </div>
              <div className={cn("text-xl font-extrabold tabular-nums mt-1", onTrack ? "text-brand-700" : "text-amber-700")}>{onTrack ? "Met" : `${fmt(gapT)} t`}</div>
              <div className={cn("text-[10px] mt-0.5", onTrack ? "text-brand-700/70" : "text-amber-700/70")}>{onTrack ? "target reached" : "still to close"}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Step 2: compare ways to get there ---- */}
      <section className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6" aria-label="Step 2 — compare ways to get there">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <StepBadge n={2} />
          <div>
            <h2 className="text-base font-extrabold text-ink leading-tight">Compare ways to get there</h2>
            <p className="text-xs text-ink-soft">Each basis builds a full mix with the real model — tap <Info size={11} className="inline -mt-0.5" /> on a card to see exactly how it&rsquo;s calculated.</p>
          </div>
          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink-soft font-medium">CAPEX budget</span>
              <input
                type="number" min={0} step={1_000_000}
                value={capexBudget === 0 ? "" : capexBudget}
                placeholder="no cap"
                aria-label="CAPEX budget"
                onChange={(e) => { invalidate(); setCapexBudget(Math.max(0, Number(e.target.value) || 0)); }}
                className="w-32 text-right tabular-nums rounded-lg border border-line px-2 py-1.5"
              />
              <span className="text-ink-faint text-xs">{CURRENCY}</span>
            </label>
            <button onClick={computeOptions} className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-4 py-2 hover:bg-brand-600 transition-colors">
              <Sparkles size={15} /> Suggest mixes for {target}% by {year}
            </button>
          </div>
        </div>

        {!options ? (
          <p className="text-xs text-ink-faint rounded-xl2 border border-dashed border-line px-4 py-6 text-center">
            Prices each lever with the real model ({CURRENCY}/t, CAPEX/t, OPEX/t) and builds one mix per basis — {capexBudget > 0 ? "four bases with your budget cap" : "three bases"} — so you see the trade-off before anything changes.
          </p>
        ) : (
          <>
            <div className={cn("grid gap-4 sm:grid-cols-2", options.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
              {options.map((o) => {
                const showLogic = logicOpen === o.objective;
                const applied = appliedObj === o.objective;
                return (
                  <div key={o.objective} className={cn("rounded-xl2 border flex flex-col transition-shadow", applied ? "border-brand-400 bg-brand-50/50 shadow-card" : "border-line/70 bg-surface hover:shadow-card")}>
                    <div className="px-4 pt-4 pb-3 flex items-start gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-ink">{o.label}</div>
                        {o.met ? (
                          <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-brand-100 text-brand-700">meets target</span>
                        ) : (
                          <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">
                            {o.budgetLimited ? `budget-capped at ${Math.round(o.achieved * 100)}%` : `best reachable ${Math.round(o.achieved * 100)}%`}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setLogicOpen(showLogic ? null : o.objective)}
                        aria-expanded={showLogic}
                        aria-label={`How ${o.label} is calculated`}
                        title="How this is calculated"
                        className={cn("ml-auto w-7 h-7 rounded-full grid place-items-center shrink-0 transition-colors", showLogic ? "bg-brand-600 text-white" : "bg-surface-muted text-ink-soft hover:bg-brand-100 hover:text-brand-700")}
                      >
                        <Info size={14} />
                      </button>
                    </div>

                    {showLogic ? (
                      <div className="px-4 pb-3 flex-1">
                        <ul className="text-[11px] text-ink-soft leading-relaxed list-disc pl-4 space-y-1.5">
                          {MIX_LOGIC[o.objective].map((line, i) => <li key={i}>{line}</li>)}
                        </ul>
                        <p className="text-[10px] text-ink-faint mt-2 leading-relaxed">{LOGIC_FOOTER}</p>
                      </div>
                    ) : (
                      <div className="px-4 pb-3 flex-1">
                        <p className="text-[11px] text-ink-soft leading-snug min-h-8">{o.blurb}</p>
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                          <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">CAPEX</div><div className="text-sm font-extrabold tabular-nums text-ink">{fmtMoney(o.kpis.totalCapex)}</div></div>
                          <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">OPEX Δ / yr</div><div className={cn("text-sm font-extrabold tabular-nums", o.kpis.annualOpexDelta <= 0 ? "text-brand-600" : "text-amber-700")}>{fmtMoney(o.kpis.annualOpexDelta)}</div></div>
                          <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">Cost / t</div><div className="text-sm font-extrabold tabular-nums text-ink">{CURRENCY}{fmt(o.kpis.costPerTonne)}</div></div>
                          <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">Payback</div><div className="text-sm font-extrabold tabular-nums text-ink">{o.kpis.paybackYears != null ? `${o.kpis.paybackYears.toFixed(1)} yr` : "—"}</div></div>
                        </div>
                      </div>
                    )}

                    <div className="px-4 pb-4 mt-auto">
                      {applied ? (
                        <span className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-100 text-brand-700 px-3 py-2"><Check size={15} /> Applied</span>
                      ) : (
                        <button
                          onClick={() => applyOption(o)}
                          className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold rounded-lg border border-brand-300 bg-white text-brand-700 px-3 py-2 hover:bg-brand-50 transition-colors"
                        >
                          Apply this mix
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-ink-faint mt-3">Leak fixes are included in every mix (near-zero cost, pure savings). Applying replaces the current dials — step 3 updates instantly.</p>
          </>
        )}
      </section>

      {/* ---- Step 3: fine-tune the levers ---- */}
      <section className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6" aria-label="Step 3 — fine-tune the levers">
        <div className="flex items-center gap-3 mb-2">
          <StepBadge n={3} />
          <div>
            <h2 className="text-base font-extrabold text-ink leading-tight">Fine-tune the levers</h2>
            <p className="text-xs text-ink-soft">Drag a dial to move every matching source, or click a lever to fine-tune it inside its scope.</p>
          </div>
        </div>
        <div className="flex flex-col divide-y divide-line/60">
          {LEVER_ROWS.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.key} className="py-3 grid grid-cols-1 md:grid-cols-[minmax(230px,1.2fr)_2fr_auto] gap-x-6 gap-y-2 items-center">
                <button
                  onClick={() => onOpenScope?.(r.scope)}
                  className="group flex items-center gap-2.5 text-left"
                  title={`Fine-tune in ${r.scope === "s1" ? "Scope 1" : "Scope 2"}`}
                >
                  <span className="w-8 h-8 rounded-lg bg-brand-50 grid place-items-center shrink-0"><Icon size={15} className="text-brand-700" /></span>
                  <span className="min-w-0">
                    <span className="text-sm font-bold text-ink flex items-center gap-1.5">
                      {r.label}
                      <span className={cn("text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5", r.scope === "s1" ? "bg-brand-50 text-brand-700" : "bg-oren-100 text-oren-700")}>{r.scope === "s1" ? "S1" : "S2"}</span>
                      <ChevronRight size={13} className="text-ink-faint group-hover:text-ink group-hover:translate-x-0.5 transition-all" />
                    </span>
                    <span className="block text-[11px] text-ink-soft">{r.hint}</span>
                  </span>
                </button>
                <span className="flex items-center gap-3">
                  <input
                    type="range" min={0} max={100} step={1} value={r.value}
                    aria-label={`${r.label} dial`}
                    onChange={(e) => r.onChange(Number(e.target.value))}
                    style={{ accentColor: "var(--color-brand-500)" }}
                    className="w-full cursor-pointer"
                  />
                  <span className="text-sm font-bold text-ink tabular-nums w-12 text-right shrink-0">{r.value}<span className="text-xs font-medium text-ink-faint">%</span></span>
                </span>
                <div className="flex items-center gap-5 text-right justify-end">
                  <div className="w-24"><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">By {year}</div><div className="text-sm font-extrabold tabular-nums text-brand-600">{r.tonnes > 0.05 ? `−${fmt(r.tonnes)} t` : "—"}</div></div>
                  <div className="w-24"><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">Cost</div><div className="text-sm font-extrabold tabular-nums text-ink">{r.costNote}</div></div>
                </div>
              </div>
            );
          })}
          {(w2["existing"] ?? 0) > 0.05 && (
            <div className="py-3 flex items-center gap-3 text-sm">
              <span className="text-ink-soft">Already contracted (VPPA / I-REC from Data input)</span>
              <span className="ml-auto font-extrabold tabular-nums text-brand-600">−{fmt(w2["existing"] ?? 0)} t</span>
              <span className="w-24" />
            </div>
          )}
        </div>
      </section>

      <Collapsible title="How this is calculated">
        <div className="text-xs text-ink-soft space-y-2 leading-relaxed">
          <p><strong className="text-ink">Required cut</strong> = combined base-year total × target = {fmt(base)} t × {target}% = <strong className="text-ink tabular-nums">{fmt(requiredT)} t</strong> by {year}.</p>
          <p><strong className="text-ink">Allocated</strong> = combined BAU {year} − net {year} = {fmt(atYear?.bau ?? 0)} − {fmt(atYear?.net ?? 0)} = <strong className="text-ink tabular-nums">{fmt(allocatedT)} t</strong>. The ring shows allocated ÷ required. Each lever row shows its own share — its wedge at {year}, from the same model that drives the Action plan and Compare tabs.</p>
          <p>Scope 2 is <strong className="text-ink">market-based</strong>: your entered VPPA / I-REC coverage counts (the &ldquo;Already contracted&rdquo; row), and procurement moves this number only. Electrification adds electricity — the Scope 2 spill — which the renewable-sourcing dial greens.</p>
          <p>Dials are <strong className="text-ink">derived from the per-source levers</strong>: dragging one rewrites the levers of every matching source; editing a source in Scope 1 / Scope 2 moves the dial here. Flex-fuel and per-facility detail stay per-source — set them in the scope tabs.</p>
          <p><strong className="text-ink">Suggested mixes</strong>: each basis card in step 2 carries its own <Info size={11} className="inline -mt-0.5" /> with the exact ranking and stopping rule it uses.</p>
        </div>
      </Collapsible>
    </div>
  );
}
