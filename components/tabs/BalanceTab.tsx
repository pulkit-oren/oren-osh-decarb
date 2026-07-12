"use client";

/* Balance to target — the builder's landing screen. Set one Scope 1+2 target
   (defaulting from your active emissions goal), see how it divides across the
   seven lever families with live tonnes from the real model, and drag dials
   that write straight through to the per-source levers. The dials are DERIVED
   from those levers, so fine-tuning inside Scope 1 / Scope 2 moves them here
   — the two views can never drift. */

import { useEffect, useMemo, useState } from "react";
import { Target, Zap, Fuel, Snowflake, Sun, Lightbulb, Landmark, Wind, ChevronRight } from "lucide-react";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import { useGoals } from "@/lib/goals/store";
import { applyDials, deriveDials, withLeakFixes, type BalanceDials } from "@/lib/model/energy-balance";
import { applyDials2, deriveDials2, type BalanceDials2 } from "@/lib/scope2/model/energy-balance";
import { combineTrajectories } from "@/lib/model/combined";
import { suggestMixOptions, type CombinedInputs, type MixObjective, type MixOption } from "@/lib/combined-balance";
import { baseValueFor, targetValueAt, type Inventories } from "@/lib/goals/select";
import { CURRENCY } from "@/lib/defaults";
import { Collapsible } from "@/components/tabs/activity/Collapsible";
import { DetailCard } from "@/components/tabs/activity/fields";
import { InfoTip } from "@/components/ui/InfoTip";
import { cn, fmt, fmtMoney } from "@/lib/utils";

export function BalanceTab({ onOpenScope }: { onOpenScope?: (scope: "s1" | "s2") => void }) {
  const s1 = useScenario();
  const s2 = useScope2();
  const { goals } = useGoals();

  const assets = s1.baseAssets.filter((a) => !a.excluded);
  const systems = s1.baseSystems.filter((x) => !x.excluded);
  const facilities = s2.baseFacilities.filter((f) => !f.excluded);

  /* ---- target, defaulting from the active S1+S2 emissions goal ---- */
  const inv: Inventories = { combustion: s1.combustion, refrigeration: s1.refrigeration, facilities: s2.facilities };
  const goal = goals.find((g) => g.metric === "emissions_t" && g.direction === "reduce" && g.scope === "s1s2");
  const goalTargetPct = useMemo(() => {
    if (!goal) return null;
    const bv = baseValueFor(goal, inv);
    if (bv <= 0) return goal.targetPct ?? null;
    return Math.round((1 - targetValueAt(goal, bv, 2030) / bv) * 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inv is rebuilt every render; goal identity is enough
  }, [goal?.id, goal?.targetPct, goal?.targetYear, goal?.baseYear]);

  const [target, setTarget] = useState(50);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- adopt the goal default once hydrated, until the user edits */
    if (!touched && goalTargetPct != null && goalTargetPct > 0) setTarget(goalTargetPct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalTargetPct]);

  /* ---- combined position vs target ---- */
  const rows = combineTrajectories(s1.result.trajectory, s2.result.trajectoryMarket);
  const base = rows[0]?.bau ?? 0;
  const at2030 = rows.find((r) => r.year === 2030) ?? rows[rows.length - 1];
  const allocatedT = at2030 ? at2030.bau - at2030.net : 0;
  const requiredT = base * (target / 100);
  const gapT = requiredT - allocatedT;
  const onTrack = gapT <= 0.5;
  const allocPct = requiredT > 0 ? Math.min(1, allocatedT / requiredT) : 1;

  /* ---- derived dials + write-through ---- */
  const d1 = deriveDials(assets, systems, s1.settings);
  const d2 = deriveDials2(facilities, s2.levers);
  const setDial1 = (patch: Partial<BalanceDials>) =>
    s1.setSettings((p) => applyDials(assets, systems, p, { ...deriveDials(assets, systems, p), ...patch }));
  const setDial2 = (patch: Partial<BalanceDials2>) =>
    s2.setLevers((p) => applyDials2(facilities, p, { ...deriveDials2(facilities, p), ...patch }));

  /* ---- per-family tonnes at 2030 (real model wedges) + costs ---- */
  const w1 = s1.result.trajectory.find((r) => r.year === 2030)?.wedges ?? {};
  const w2 = s2.result.trajectoryMarket.find((r) => r.year === 2030)?.wedges ?? {};
  const spill2030 = s1.result.trajectory.find((r) => r.year === 2030)?.scope2Spill ?? 0;
  const lever1 = (id: string) => s1.result.levers.find((l) => l.id === id);
  const lever2 = (id: string) => s2.result.levers.find((l) => l.id === id);

  /* ---- suggested mixes: preview first, apply per row ---- */
  const [options, setOptions] = useState<MixOption[] | null>(null);
  const [appliedObj, setAppliedObj] = useState<MixObjective | null>(null);
  const [capexBudget, setCapexBudget] = useState(0); // 0 = no cap
  const computeOptions = () => {
    const inp: CombinedInputs = { assets, systems, s1Base: s1.settings, facilities, s2Base: s2.levers, baseYear: s1.baseYear };
    setOptions(suggestMixOptions(inp, target / 100, capexBudget > 0 ? { capexBudget } : undefined));
    setAppliedObj(null);
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
      tonnes: 0, costNote: spill2030 > 0.05 ? `spill +${fmt(spill2030)} t` : "—",
    },
  ];

  return (
    <div className="screen-in flex flex-col gap-5">
      {/* target header */}
      <div className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60">
        <h1 className="text-2xl font-extrabold text-ink leading-tight flex items-center gap-2"><Target size={22} className="text-brand-600" /> Balance to target</h1>
        <p className="text-sm text-ink-soft mt-0.5">Set one Scope 1+2 target, divide it across the levers, then fine-tune inside each scope — the dials follow whatever you do there.</p>
      </div>

      <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-soft font-medium">Cut Scope 1+2 by</span>
            <input
              type="number" value={target} min={0} max={100}
              aria-label="Combined reduction target"
              onChange={(e) => { setTouched(true); setOptions(null); setTarget(Math.max(0, Math.min(100, Number(e.target.value)))); }}
              className="w-20 text-right tabular-nums rounded-lg border border-line px-2 py-1.5"
            />
            <span className="text-ink-faint text-sm">% by 2030</span>
            {goal && goalTargetPct === target && !touched && (
              <span className="text-[11px] font-semibold text-brand-700 bg-brand-50 rounded-full px-2 py-0.5" title={goal.name}>from your goal: {goal.name}</span>
            )}
          </label>
          <div><div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Required cut</div><div className="text-2xl font-extrabold tabular-nums text-ink">{fmt(requiredT)} t</div></div>
          <div><div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Allocated</div><div className={cn("text-2xl font-extrabold tabular-nums", onTrack ? "text-brand-600" : "text-ink")}>{fmt(allocatedT)} t</div></div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold flex items-center gap-1">Gap <InfoTip text="Required cut minus what your current levers deliver by 2030 (Scope 2 market-based, including your entered VPPA/I-REC coverage)." /></div>
            <div className={cn("text-2xl font-extrabold tabular-nums", onTrack ? "text-brand-600" : "text-amber-600")}>{onTrack ? "Met" : `${fmt(gapT)} t`}</div>
          </div>
          <span className={cn("ml-auto text-xs font-bold rounded-full px-3 py-1", onTrack ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700")}>
            {onTrack ? "Target met" : "Below target"}
          </span>
        </div>
        <div className="mt-3 h-2.5 rounded-full bg-surface-muted overflow-hidden">
          <div className={cn("h-full transition-all duration-500", onTrack ? "bg-brand-500" : "bg-amber-500")} style={{ width: `${Math.round(allocPct * 100)}%` }} />
        </div>
      </div>

      {/* lever division */}
      <DetailCard title="How it divides across levers">
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
                  <div className="w-24"><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">By 2030</div><div className="text-sm font-extrabold tabular-nums text-brand-600">{r.tonnes > 0.05 ? `−${fmt(r.tonnes)} t` : "—"}</div></div>
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
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button onClick={computeOptions} className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-3.5 py-2 hover:bg-brand-600 transition-colors">
            Suggest a mix for {target}% — compare {capexBudget > 0 ? 4 : 3} bases
          </button>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-soft font-medium">CAPEX budget</span>
            <input
              type="number" min={0} step={1_000_000}
              value={capexBudget === 0 ? "" : capexBudget}
              placeholder="no cap"
              aria-label="CAPEX budget"
              onChange={(e) => { setOptions(null); setCapexBudget(Math.max(0, Number(e.target.value) || 0)); }}
              className="w-36 text-right tabular-nums rounded-lg border border-line px-2 py-1.5"
            />
            <span className="text-ink-faint text-xs">{CURRENCY} (optional — adds a budget-capped option)</span>
          </label>
          <span className="text-[11px] text-ink-faint">Prices each lever with the real model ({CURRENCY}/t, CAPEX/t, OPEX/t), builds a mix per basis, and shows the trade-off before anything changes.</span>
        </div>

        {options && (
          <div className="mt-4 rounded-xl2 border border-brand-200 bg-brand-50/40 p-4">
            <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
              <p className="text-sm font-bold text-ink">Three ways to hit {target}% — pick one to apply</p>
              <span className="text-[11px] text-ink-faint">Leak fixes included in every mix (near-zero cost, pure savings). Applying replaces the current dials.</span>
            </div>
            <div className="flex flex-col divide-y divide-brand-200/60">
              {options.map((o) => (
                <div key={o.objective} className="py-3 flex items-center gap-4 flex-wrap">
                  <div className="min-w-[180px] flex-1">
                    <div className="text-sm font-bold text-ink flex items-center gap-2">
                      {o.label}
                      {o.met ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-brand-100 text-brand-700">meets target</span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">
                          {o.budgetLimited ? `budget-capped at ${Math.round(o.achieved * 100)}%` : `best reachable ${Math.round(o.achieved * 100)}%`}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-ink-soft mt-0.5">{o.blurb}</p>
                  </div>
                  <div className="flex items-center gap-5 text-right">
                    <div className="w-24"><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">CAPEX</div><div className="text-sm font-extrabold tabular-nums text-ink">{fmtMoney(o.kpis.totalCapex)}</div></div>
                    <div className="w-28"><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">OPEX Δ / yr</div><div className={cn("text-sm font-extrabold tabular-nums", o.kpis.annualOpexDelta <= 0 ? "text-brand-600" : "text-amber-700")}>{fmtMoney(o.kpis.annualOpexDelta)}</div></div>
                    <div className="w-20"><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">Cost / t</div><div className="text-sm font-extrabold tabular-nums text-ink">{CURRENCY}{fmt(o.kpis.costPerTonne)}</div></div>
                    <div className="w-16"><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">Payback</div><div className="text-sm font-extrabold tabular-nums text-ink">{o.kpis.paybackYears != null ? `${o.kpis.paybackYears.toFixed(1)} yr` : "—"}</div></div>
                  </div>
                  {appliedObj === o.objective ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-100 text-brand-700 px-3 py-1.5 shrink-0">Applied ✓</span>
                  ) : (
                    <button
                      onClick={() => applyOption(o)}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg border border-brand-300 bg-white text-brand-700 px-3 py-1.5 hover:bg-brand-50 transition-colors shrink-0"
                    >
                      Apply {o.label}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DetailCard>

      <Collapsible title="How this is calculated">
        <div className="text-xs text-ink-soft space-y-2 leading-relaxed">
          <p><strong className="text-ink">Required cut</strong> = combined base-year total × target = {fmt(base)} t × {target}% = <strong className="text-ink tabular-nums">{fmt(requiredT)} t</strong> by 2030.</p>
          <p><strong className="text-ink">Allocated</strong> = combined BAU 2030 − net 2030 = {fmt(at2030?.bau ?? 0)} − {fmt(at2030?.net ?? 0)} = <strong className="text-ink tabular-nums">{fmt(allocatedT)} t</strong>. Each lever row shows its own share of that number — its wedge at 2030, from the same model that drives the Action plan and Compare tabs.</p>
          <p>Scope 2 is <strong className="text-ink">market-based</strong>: your entered VPPA / I-REC coverage counts (the &ldquo;Already contracted&rdquo; row), and procurement moves this number only. Electrification adds electricity — the Scope 2 spill — which the renewable-sourcing dial greens.</p>
          <p>Dials are <strong className="text-ink">derived from the per-source levers</strong>: dragging one rewrites the levers of every matching source; editing a source in Scope 1 / Scope 2 moves the dial here. Flex-fuel and per-facility detail stay per-source — set them in the scope tabs.</p>
          <p><strong className="text-ink">Suggested mixes</strong> price each lever family alone with the real model, rank them by the chosen basis, then raise dials in that order until the target is met: <strong className="text-ink">Cheapest overall</strong> ranks by ₹ per tonne (annualized CAPEX + OPEX), <strong className="text-ink">Lowest CAPEX</strong> by upfront ₹ per tonne, <strong className="text-ink">Best OPEX saving</strong> by running-cost saving per tonne. Every mix also enables leak fixes — they cost almost nothing and save gas money every year.</p>
        </div>
      </Collapsible>
    </div>
  );
}
