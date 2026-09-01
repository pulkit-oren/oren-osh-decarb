"use client";

/* Balance to target — the builder's landing screen, in the same two-pane shape
   as the data-entry screens: a work pane on the left, a result rail on the
   right that never scrolls away.

   The rail is the point. This screen used to stack three full-height steps down
   a 1,387px page, so dragging a lever in step 3 moved a Required / Allocated /
   Gap readout that had scrolled 500px out of view. The gap, the progress bar
   and the arithmetic behind them now sit permanently beside the controls that
   change them.

   Three things follow from that, all deliberate:

   - The TARGET BAND is pinned above the tabs rather than being a tab of its
     own. Year and percentage are the premise every other section depends on —
     "Suggest mixes for 50% by 2030" is a strange button to read when the 50%
     is behind a tab you are not on.
   - PROGRESS IS LINEAR AND CAPPED. A plan can exceed its target (mixes move in
     10% steps and the OPEX basis deliberately overshoots), and an uncapped
     radial read as a calculation bug. The bar stops at 100% and the overshoot
     is stated in words.
   - The dials are DERIVED from the per-source levers, so fine-tuning inside
     Scope 1 / Scope 2 moves them here — the two views can never drift. */

import { useEffect, useMemo, useState } from "react";
import { Zap, Fuel, Snowflake, Sun, Lightbulb, Landmark, Wind, ChevronRight, Info, Check, Sparkles } from "lucide-react";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import { useGoals } from "@/lib/goals/store";
import { applyDials, deriveDials, withLeakFixes, type BalanceDials } from "@/lib/model/energy-balance";
import { applyDials2, deriveDials2, type BalanceDials2 } from "@/lib/scope2/model/energy-balance";
import { combineTrajectories, targetPosition } from "@/lib/model/combined";
import { END_YEAR } from "@/lib/model";
import { suggestMixOptions, type CombinedInputs, type MixObjective, type MixOption } from "@/lib/combined-balance";
import { bauOverridesFrom, describeBauPremise, type DerivedGrowth } from "@/lib/bau";
import { baseValueFor, targetValueAt, type Inventories } from "@/lib/goals/select";
import { CURRENCY } from "@/lib/defaults";
import { InfoTip } from "@/components/ui/InfoTip";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { AssumptionsPanel } from "./balance/AssumptionsPanel";
import { BauRates } from "./balance/BauRates";
import { GapStack, type GapSegment } from "@/components/charts/GapStack";
import { MaccChart, type MaccLever } from "@/components/charts/MaccChart";
import { CapitalByYear, type CapitalSeriesLever } from "@/components/charts/CapitalByYear";
import { FAMILY_IDX } from "@/lib/model/palette";
import { bioBlendCap, electrifyCap, solarCapNote, type DialCap } from "@/lib/model/dial-caps";
import { M2_PER_KW } from "@/lib/scope2/model/constants";
import { cn, fmt, fmtMoney, fmtPerTonne, fmtPayback } from "@/lib/utils";

/* How each basis builds its mix — shown when the card's (i) is clicked. */
const MIX_LOGIC: Record<MixObjective, string[]> = {
  costPerTonne: [
    "Every lever family is priced standalone at 100% with the real model.",
    `Families are ranked on the same levelised ${CURRENCY}/t the card shows — every year's CAPEX and running-cost change discounted to today over the lever's own life, divided by discounted tonnes abated.`,
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
};
/* The cap is a constraint on all three bases, not a basis of its own — so it
   reads as an extra line under whichever card is open, not a fourth card. */
const BUDGET_LOGIC_LINE =
  "Every 10% step is then checked against your CAPEX budget. A step that would bust the cap is reverted, and cheaper families further down the list are tried instead — so the mix may stop below the target, and the badge says so.";
const LOGIC_FOOTER =
  "Every mix also switches leak fixes on (near-zero cost, pure savings), and when electrification rises, renewable sourcing for the new load follows the procurement level so the added electricity arrives green.";

/* Where each mix KPI comes from — hover tips on the option cards. */
const KPI_TIPS = {
  capex: "Upfront capital, summed across every lever active in this mix — equipment conversions, EV purchase premiums, solar install, refrigerant retrofits, LDAR programs. Priced per source by the same model as the CFO tab.",
  opex: "Change in yearly running cost vs business-as-usual once the mix is fully ramped: fuel and electricity spend, tariff / REC premiums, maintenance changes, refrigerant gas top-ups. Negative (green) = the mix saves money every year.",
  costPerT: "Levelised cost per tonne: every year's CAPEX and running-cost change discounted to today over each lever's own life, divided by the discounted tonnes it abates. Summed across the mix and divided once — not an average of the per-lever figures, which would weight a one-tonne measure like a thousand-tonne one.",
  payback: "Discounted payback: years until the mix's cumulative discounted cash turns in your favour. Reads \"< 1 yr\" when the first year already repays it, \"n/a\" when there is no capital at risk, and \"never\" when it is not recovered at your discount rate — the last two are opposite outcomes, so they are named rather than blanked.",
} as const;

/** Deep-link target for a lever family — the exact screen where it's edited. */
export type LeverFocus =
  | { scope: "s1"; seg: "mobile" | "stationary" | "refrigerant" }
  | { scope: "s2"; mode: "facilities" | "procurement"; facilityId?: string };

export function BalanceTab({ onOpenLever }: { onOpenLever?: (focus: LeverFocus) => void }) {
  const s1 = useScenario();
  const s2 = useScope2();
  const { goals } = useGoals();

  const assets = s1.resolvedBaseAssets.filter((a) => !a.excluded);
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
  /* All four rail numbers come from ONE tested function, on the LEVEL basis:
     "cut X%" means emissions END UP at (1 - X) x the base year — what the Goals
     tab (`targetValueAt`) and every external framework mean. The inline
     arithmetic this replaces measured tonnes AVOIDED instead; the two differ by
     `bau(year) - base`, which was enough to badge a mix "Met" five points short
     of the level it had committed to. */
  const { base, bauAtYear, netAtYear, committedLevel, requiredT, allocatedT, gapT, met: onTrack } =
    targetPosition(rows, year, target);
  const allocPct = requiredT > 0 ? allocatedT / requiredT : 1;

  /* ---- the BAU premise, as the two places that STATE it must state it ----
     `bauAtYear` above is a COMBINED figure: a Scope 1 curve and a Scope 2 curve
     growing at two independently derived rates, added year by year. Both the
     premise strip and the rail used to label it with Scope 1's chain alone.
     describeBauPremise runs the same resolveBauGrowthPct the engines run, so
     these are the rates the engines apply, and it reports whether one number
     covers both scopes (it does when both scopes are on the same typed rate, or
     when the two derived rates round to the same 1 dp) and WHICH scopes are
     running on a typed rate at all. */
  const bauPremise = describeBauPremise(
    bauOverridesFrom(s1.settings.assumptions), s1.derivedBau, s2.derivedBau,
  );
  const spanOf = (d: DerivedGrowth | null) => (d ? `FY${d.fromYear} to FY${d.toYear}` : null);
  const s1Span = spanOf(s1.derivedBau);
  const s2Span = spanOf(s2.derivedBau);
  /* The span belonging to the scope that is NOT overridden. `bauSpan` below is
     the combined phrasing, which is wrong to print when only one scope is
     derived — it would credit the typed scope's rate to the data too. */
  const otherScopeSpan = bauPremise.overriddenScopes === "s1" ? s2Span
    : bauPremise.overriddenScopes === "s2" ? s1Span
      : null;
  const bauSpan = !s1Span ? s2Span
    : !s2Span ? s1Span
      : s1Span === s2Span ? s1Span
        : `${s1Span} on Scope 1 and ${s2Span} on Scope 2`;
  /** One scope has years of data and the other does not, so one of the two
   *  rates above is the fallback rather than anything derived. Said out loud
   *  because it is otherwise indistinguishable from a derived 1.0 %/yr. */
  const bauPartlyDerived = (s1.derivedBau == null) !== (s2.derivedBau == null);

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
  const [tab, setTab] = useState<"assumptions" | "mixes" | "levers" | "curve">("levers");
  const invalidate = () => { setOptions(null); setAppliedObj(null); setLogicOpen(null); };
  const computeOptions = () => {
    const inp: CombinedInputs = {
      assets, systems, s1Base: s1.settings, facilities, s2Base: s2.levers,
      baseYear: s1.baseYear, targetYear: year,
      // The premise the rail states, handed to the suggester so its stop rule
      // and `achieved` are measured on it too. Percent, not fraction — the
      // engines divide by 100 themselves.
      s1BauFallbackPct: s1.derivedBau?.pct,
      s2BauFallbackPct: s2.derivedBau?.pct,
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

  /* Deep-link targets: fuel levers land on the bigger combustion segment;
     facility levers open the lone facility directly when there is only one. */
  const volOf = (cat: "mobile" | "stationary") => assets.filter((a) => a.category === cat).reduce((s, a) => s + a.annualVolume * (a.unitCount ?? 1), 0);
  const fuelSeg: "mobile" | "stationary" = volOf("mobile") > volOf("stationary") ? "mobile" : "stationary";
  const soloFacility = facilities.length === 1 ? facilities[0].id : undefined;
  const FACILITIES_FOCUS: LeverFocus = { scope: "s2", mode: "facilities", facilityId: soloFacility };

  /* Computed once per render from the same assets the engine sees, so a
     ceiling on screen is the ceiling the engine will enforce. */
  const bioCap = bioBlendCap(assets);
  const elecCap = electrifyCap(assets);
  const roofKwp = facilities.reduce((sum, f) => sum + f.roofSpaceM2 / M2_PER_KW, 0);
  const existingKwp = facilities.reduce((sum, f) => sum + (f.existingSolarKwp ?? 0), 0);
  const solarCap = solarCapNote(roofKwp, existingKwp);

  const LEVER_ROWS: {
    key: string; scope: "s1" | "s2"; label: string; icon: React.ElementType; hint: string;
    value: number; onChange: (v: number) => void; tonnes: number; costNote: string; focus: LeverFocus; place: string;
    /** What the engine will actually honour — drawn on the track. */
    cap?: DialCap;
    /** Levelised cost of this family, for ranking one dial against another. */
    perTonne?: number;
  }[] = [
    {
      key: "efficiency", scope: "s2", label: "Efficiency", icon: Lightbulb,
      hint: "LED, motors/VFD, BMS across grid facilities — usually the cheapest tonnes.",
      value: d2.efficiencyPct, onChange: (v) => setDial2({ efficiencyPct: v }),
      tonnes: w2["efficiency"] ?? 0, costNote: fmtMoney(lever2("efficiency")?.capex ?? 0),
      focus: FACILITIES_FOCUS, place: "Scope 2 → facilities",
      perTonne: lever2("efficiency")?.costPerTonne,
    },
    {
      key: "solar", scope: "s2", label: "Solar onsite", icon: Sun,
      hint: "Rooftop PV as a share of each facility's roof headroom.",
      value: d2.solarPct, onChange: (v) => setDial2({ solarPct: v }),
      tonnes: w2["generation"] ?? 0, costNote: fmtMoney(lever2("generation")?.capex ?? 0),
      focus: FACILITIES_FOCUS, place: "Scope 2 → facilities",
      cap: solarCap, perTonne: lever2("generation")?.costPerTonne,
    },
    {
      key: "procurement", scope: "s2", label: "Procurement (market)", icon: Landmark,
      hint: "PPAs / green tariff / RECs on the remaining grid draw — moves the market-based number only.",
      value: d2.procurementPct, onChange: (v) => setDial2({ procurementPct: v }),
      tonnes: w2["procurement"] ?? 0, costNote: `${fmtMoney(lever2("procurement")?.annualOpexDelta ?? 0)}/yr`,
      perTonne: lever2("procurement")?.costPerTonne,
      focus: { scope: "s2", mode: "procurement" }, place: "Scope 2 → Procurement",
    },
    {
      key: "bio", scope: "s1", label: "Bio-blend fuel", icon: Fuel,
      hint: "Drop-in bio blends on sources still burning fuel, capped per asset.",
      value: d1.bioBlendPct, onChange: (v) => setDial1({ bioBlendPct: v }),
      tonnes: w1["fuelSwitch"] ?? 0, costNote: fmtMoney(lever1("fuelSwitch")?.capex ?? 0),
      cap: bioCap, perTonne: lever1("fuelSwitch")?.costPerTonne,
      focus: { scope: "s1", seg: fuelSeg }, place: `Scope 1 → ${fuelSeg}`,
    },
    {
      key: "refrig", scope: "s1", label: "Low-GWP refrigerant", icon: Snowflake,
      hint: "Gas transition share across cooling systems (leak fixes are set per system).",
      value: d1.refrigPct, onChange: (v) => setDial1({ refrigPct: v }),
      tonnes: w1["refrigerant"] ?? 0, costNote: fmtMoney(lever1("refrigerant")?.capex ?? 0),
      perTonne: lever1("refrigerant")?.costPerTonne,
      focus: { scope: "s1", seg: "refrigerant" }, place: "Scope 1 → refrigerant",
    },
    {
      key: "electrify", scope: "s1", label: "Electrify fuel", icon: Zap,
      hint: "Move feasible fuel use to electricity — the biggest lever, with Scope 2 spill.",
      value: d1.electrifyPct, onChange: (v) => setDial1({ electrifyPct: v }),
      tonnes: w1["electrification"] ?? 0, costNote: fmtMoney(lever1("electrification")?.capex ?? 0),
      cap: elecCap, perTonne: lever1("electrification")?.costPerTonne,
      focus: { scope: "s1", seg: fuelSeg }, place: `Scope 1 → ${fuelSeg}`,
    },
    {
      key: "renewable", scope: "s1", label: "Renewable sourcing for new load", icon: Wind,
      hint: "Clean share of the electricity electrification adds — shrinks the Scope 2 spill.",
      value: d1.renewablePct, onChange: (v) => setDial1({ renewablePct: v }),
      tonnes: 0, costNote: spillYear > 0.05 ? `spill +${fmt(spillYear)} t` : "—",
      focus: { scope: "s1", seg: fuelSeg }, place: `Scope 1 → ${fuelSeg}`,
    },
  ];

  /* The stack reads the SAME tonnes the dial rows print, so the picture and the
     numbers under it can never disagree. Colour comes from the lever family, so
     a band here is the same colour as that family everywhere else. */
  const FAMILY_OF: Record<string, number> = {
    efficiency: FAMILY_IDX.efficiency,
    solar: FAMILY_IDX.generation,
    procurement: FAMILY_IDX.procurement,
    bio: FAMILY_IDX.fuelSwitch,
    refrig: FAMILY_IDX.refrigerant,
    electrify: FAMILY_IDX.electrify,
  };
  const gapSegments: GapSegment[] = LEVER_ROWS
    .filter((r) => FAMILY_OF[r.key] !== undefined)
    .map((r) => ({ key: r.key, label: r.label, tonnes: r.tonnes, colorIdx: FAMILY_OF[r.key] }));

  /* Both scopes on ONE curve. They compete for the same capital, so ranking
     them separately is the one comparison a board never wants.
     Ids are namespaced by scope because BOTH engines call their first lever
     "efficiency" — unprefixed, the two would collide as one bar. */
  const curveLevers: MaccLever[] = [
    ...s1.result.levers.map((l) => ({ ...l, id: `s1:${l.id}` })),
    ...s2.result.levers.map((l) => ({ ...l, id: `s2:${l.id}` })),
  ].map((l) => ({
    id: l.id, label: l.label, colorIdx: l.colorIdx,
    enabled: l.enabled, abatementT: l.abatementT, costPerTonne: l.costPerTonne,
  }));

  /* Where clicking a bar lands. Most map to a dial on this screen; Scope 1
     efficiency has no dial here (it is set per source) so it opens the fuels
     segment, which is where it lives. */
  const rowFocus = (key: string) => LEVER_ROWS.find((r) => r.key === key)?.focus;
  const CURVE_FOCUS: Record<string, LeverFocus | undefined> = {
    "s2:efficiency": rowFocus("efficiency"),
    "s2:generation": rowFocus("solar"),
    "s2:procurement": rowFocus("procurement"),
    "s1:fuelSwitch": rowFocus("bio"),
    "s1:refrigerant": rowFocus("refrig"),
    "s1:electrification": rowFocus("electrify"),
    "s1:efficiency": { scope: "s1", seg: fuelSeg },
  };
  const openLeverById = (id: string) => {
    const focus = CURVE_FOCUS[id];
    if (focus) onOpenLever?.(focus);
  };

  const capitalLevers: CapitalSeriesLever[] = [
    ...s1.result.levers.map((l) => ({ ...l, id: `s1:${l.id}` })),
    ...s2.result.levers.map((l) => ({ ...l, id: `s2:${l.id}` })),
  ]
    .filter((l) => l.enabled)
    .map((l) => ({
      id: l.id, label: l.label, colorIdx: l.colorIdx,
      series: l.series.map((r) => ({ year: r.year, capex: r.capex, net: r.net })),
    }));

  const activeLevers = LEVER_ROWS.filter((r) => r.value > 0).length;
  const pctOfRequired = Math.round(allocPct * 100);

  /* ── Target band: the premise, pinned above the tabs ─────────────────── */
  const targetBand = (
    <section
      className="rounded-xl3 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800 text-white shadow-card px-5 py-4 shrink-0"
      aria-label="Target setting"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-sm font-extrabold">Cut Scope 1+2 by</span>
          <span className="flex items-baseline gap-0.5">
            <input
              type="number" value={target} min={0} max={100}
              aria-label="Combined reduction target"
              onChange={(e) => { setTouched(true); invalidate(); setTarget(Math.max(0, Math.min(100, Number(e.target.value)))); }}
              className="w-14 bg-transparent text-right tabular-nums text-2xl font-extrabold text-white focus:outline-none focus:bg-white/10 rounded-md"
            />
            <span className="text-sm font-bold text-white/70">%</span>
          </span>
          <span className="text-sm font-extrabold text-white/85">by</span>
          <select
            value={year}
            aria-label="Target year"
            onChange={(e) => { setTouched(true); invalidate(); setYear(Number(e.target.value)); }}
            className="tabular-nums rounded-lg border border-white/30 bg-white/10 px-2.5 py-1.5 text-sm font-bold text-white cursor-pointer hover:bg-white/20 transition-colors [&>option]:text-ink"
          >
            {Array.from({ length: END_YEAR - minYear + 1 }, (_, i) => minYear + i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[14rem]">
          <input
            type="range" min={0} max={100} step={1} value={target}
            aria-label="Combined reduction target slider"
            onChange={(e) => { setTouched(true); invalidate(); setTarget(Number(e.target.value)); }}
            style={{ accentColor: "#fff" }}
            className="w-full cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-bold text-white/50 mt-0.5">
            <span>0%</span><span>50%</span><span>Net zero</span>
          </div>
        </div>

        <p className="text-xs text-white/80 shrink-0">
          {target >= 100
            ? <>That&rsquo;s <strong className="text-white">net zero by {year}</strong> &#10024;</>
            : <>{target}% of the {s1.baseYear} base{target >= 90 ? " — near net zero" : ""}</>}
        </p>

        {goal && goalTargetPct === target && !touched && (
          <span className="text-[11px] font-semibold text-white bg-white/15 rounded-full px-2.5 py-1 shrink-0" title={goal.name}>
            from your goal: {goal.name}
          </span>
        )}
      </div>
    </section>
  );

  /* ── Panel: compare suggested mixes ──────────────────────────────────── */
  const mixesPanel = (
    <div className="h-full min-h-0 overflow-y-auto p-6">
      <div className="flex items-start gap-3 flex-wrap mb-4">
        <p className="text-xs text-ink-soft max-w-md">
          Each basis builds a full mix with the real model — tap <Info size={11} className="inline -mt-0.5" /> on a card to see exactly how it&rsquo;s calculated.
        </p>
        <button onClick={computeOptions} className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-4 py-2 hover:bg-brand-600 transition-colors">
          <Sparkles size={15} /> Suggest mixes for {target}% by {year}
        </button>
      </div>

      {/* The premises this mix set was built on, stated rather than editable —
          there is one place each of these is typed, and it is not here. */}
      <div data-testid="premise-strip" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl2 border border-line/70 bg-surface-muted px-4 py-2.5 text-[11px] text-ink-soft">
        <span><strong className="text-ink tabular-nums">{target}%</strong> by <strong className="text-ink tabular-nums">{year}</strong></span>
        <span aria-hidden="true" className="text-ink-faint">·</span>
        <span>
          CAPEX cap{" "}
          <strong className="text-ink tabular-nums">
            {capexBudget > 0 ? fmtMoney(capexBudget) : "none"}
          </strong>
        </span>
        <span aria-hidden="true" className="text-ink-faint">·</span>
        <span>
          BAU <BauRates premise={bauPremise} />
          {bauPremise.overriddenScopes === "none" && " (from your data)"}
        </span>
        <button
          type="button"
          onClick={() => setTab("assumptions")}
          className="ml-auto font-semibold text-brand-700 hover:text-brand-800"
        >
          Change premises
        </button>
      </div>

      {!options ? (
        <p className="text-xs text-ink-faint rounded-xl2 border border-dashed border-line px-4 py-8 text-center">
          Prices each lever with the real model ({CURRENCY}/t, CAPEX/t, OPEX/t) and builds one mix per basis — three bases{capexBudget > 0 ? ", every one of them inside your budget cap" : ""} — so you see the trade-off before anything changes.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
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
                        {capexBudget > 0 && <li>{BUDGET_LOGIC_LINE}</li>}
                      </ul>
                      <p className="text-[10px] text-ink-faint mt-2 leading-relaxed">{LOGIC_FOOTER}</p>
                    </div>
                  ) : (
                    <div className="px-4 pb-3 flex-1">
                      <p className="text-[11px] text-ink-soft leading-snug min-h-8">{o.blurb}</p>
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                        <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold flex items-center gap-1">CAPEX <InfoTip text={KPI_TIPS.capex} /></div><div className="text-sm font-extrabold tabular-nums text-ink">{fmtMoney(o.kpis.totalCapex)}</div></div>
                        <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold flex items-center gap-1">OPEX &Delta; / yr <InfoTip text={KPI_TIPS.opex} /></div><div className={cn("text-sm font-extrabold tabular-nums", o.kpis.annualOpexDelta <= 0 ? "text-brand-600" : "text-amber-700")}>{fmtMoney(o.kpis.annualOpexDelta)}</div></div>
                        <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold flex items-center gap-1">Cost / t <InfoTip text={KPI_TIPS.costPerT} /></div><div className="text-sm font-extrabold tabular-nums text-ink">{CURRENCY}{fmtPerTonne(o.kpis.costPerTonne)}</div></div>
                        <div><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold flex items-center gap-1">Payback <InfoTip text={KPI_TIPS.payback} /></div><div className="text-sm font-extrabold tabular-nums text-ink">{fmtPayback(o.kpis.paybackYears, o.kpis.paybackKind)}</div></div>
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
          <p className="text-[11px] text-ink-faint mt-3">Leak fixes are included in every mix (near-zero cost, pure savings). Applying replaces the current dials — the rail and Fine-tune update instantly.</p>
        </>
      )}
    </div>
  );

  /* ── Panel: the cost curve, where the levers are ─────────────────────── */
  const curvePanel = (
    <div className="h-full min-h-0 overflow-y-auto p-6">
      <p className="text-xs text-ink-soft max-w-xl mb-4">
        Every active lever in both scopes, cheapest first. Width is the tonnes it abates; height is
        what each of those tonnes costs. Below the line the lever earns money. Click a bar to open it.
      </p>
      <MaccChart levers={curveLevers} onSelect={openLeverById} />

      <div className="mt-7 pt-5 border-t border-line/60">
        <p className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-1">When the money lands</p>
        <p className="text-xs text-ink-soft max-w-xl mb-3">
          A board approves a number in a year, not a total. Bars are capital out; the line is the
          cumulative cash position, so its lowest point is the funding that has to exist.
        </p>
        <CapitalByYear levers={capitalLevers} />
      </div>
    </div>
  );

  /* ── Panel: fine-tune the lever families ─────────────────────────────── */
  const leversPanel = (
    <div className="h-full min-h-0 flex flex-col">
      <div className="shrink-0 px-6 pt-5 pb-3 border-b border-line/60">
        <GapStack segments={gapSegments} requiredT={requiredT} targetPct={target} targetYear={year} />
      </div>
      <p className="shrink-0 px-6 pt-3 pb-3 text-xs text-ink-soft">
        Drag a dial to move every matching source, or click a lever to jump straight to where it&rsquo;s planned.
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-5">
        <div className="flex flex-col divide-y divide-line/60">
          {LEVER_ROWS.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.key} className="py-3 grid grid-cols-1 md:grid-cols-[minmax(210px,1.1fr)_2fr_auto] gap-x-6 gap-y-2 items-center">
                <button
                  onClick={() => onOpenLever?.(r.focus)}
                  className="group flex items-center gap-2.5 text-left"
                  title={`Open ${r.place}`}
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
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-3">
                    <span className="relative flex-1">
                      <input
                        type="range" min={0} max={100} step={1} value={r.value}
                        aria-label={`${r.label} dial`}
                        aria-describedby={r.cap?.reason ? `cap-${r.key}` : undefined}
                        onChange={(e) => r.onChange(Number(e.target.value))}
                        style={{ accentColor: "var(--color-brand-500)" }}
                        className="w-full cursor-pointer"
                      />
                      {/* The ceiling, drawn on the track it applies to. Without
                          it the dial travels past what the engine honours and
                          the tonnes simply stop moving, unexplained. */}
                      {r.cap && r.cap.constrained && r.cap.maxPct < 100 && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-amber-500 rounded"
                          style={{ left: `calc(${r.cap.maxPct}% - 1px)` }}
                          title={`Engine ceiling — ${r.cap.maxPct}%`}
                        />
                      )}
                    </span>
                    <span className="text-sm font-bold text-ink tabular-nums w-12 text-right shrink-0">{r.value}<span className="text-xs font-medium text-ink-faint">%</span></span>
                  </span>
                  {r.cap?.reason && (r.cap.constrained || r.value > 0) && (
                    <span
                      id={`cap-${r.key}`}
                      className={cn(
                        "text-[10.5px] leading-snug",
                        r.cap.maxPct < 100 && r.value > r.cap.maxPct ? "text-amber-700 font-medium" : "text-ink-faint",
                      )}
                    >
                      {r.cap.maxPct < 100 && r.value > r.cap.maxPct
                        ? `Held at ${r.cap.maxPct}% — ${r.cap.reason}`
                        : r.cap.reason}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-5 text-right justify-end">
                  <div className="w-24"><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">By {year}</div><div className="text-sm font-extrabold tabular-nums text-brand-600">{r.tonnes > 0.05 ? `−${fmt(r.tonnes)} t` : "—"}</div></div>
                  {/* Ranking six levers means ranking them by value, and this is
                      the only field that does it. */}
                  <div className="w-24"><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">Per tonne</div><div className={cn("text-sm font-extrabold tabular-nums", (r.perTonne ?? 0) < 0 ? "text-brand-600" : "text-ink")}>{r.perTonne != null && Number.isFinite(r.perTonne) && r.tonnes > 0.05 ? `${r.perTonne < 0 ? "−" : ""}${CURRENCY}${fmt(Math.abs(r.perTonne))}` : "—"}</div></div>
                  <div className="w-24"><div className="text-[9px] uppercase tracking-wide text-ink-faint font-bold">Capital</div><div className="text-sm font-extrabold tabular-nums text-ink">{r.costNote}</div></div>
                </div>
              </div>
            );
          })}
          {(w2["existing"] ?? 0) > 0.05 && (
            <div className="py-3 flex items-center gap-3 text-sm">
              <span className="text-ink-soft">Already contracted (VPPA / I-REC from Data input)</span>
              <span className="ml-auto font-extrabold tabular-nums text-brand-600">&minus;{fmt(w2["existing"] ?? 0)} t</span>
              <span className="w-24" />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    /* The floor is 30rem, not 36: a min-height on a viewport-height frame is a
       promise the viewport may not be able to keep, and a floor set too high
       simply pushes the page back into scrolling — the very thing this layout
       exists to stop. 30rem still leaves a usable panel, and only binds below
       roughly a 700px window. */
    <div className="screen-in grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:h-[calc(100dvh-14rem)] lg:min-h-[30rem]">
      {/* ── Work pane ── */}
      <div className="flex flex-col min-h-0 gap-3">
        {targetBand}
        <SectionTabs
          ariaLabel="Balance sections"
          active={tab}
          onSelect={(k) => setTab(k as "assumptions" | "mixes" | "levers" | "curve")}
          tabs={[
            { key: "assumptions", label: "Assumptions" },
            { key: "mixes", label: "Compare mixes", badge: options ? String(options.length) : undefined },
            { key: "levers", label: "Fine-tune levers", badge: String(activeLevers) },
            { key: "curve", label: "Cost & capital" },
          ]}
        />
        <div
          role="tabpanel"
          key={tab}
          className="panel-in flex-1 min-h-0 rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden"
        >
          {tab === "assumptions"
            ? <AssumptionsPanel
                rows={rows} year={year} target={target}
                capexBudget={capexBudget} setCapexBudget={setCapexBudget}
                invalidate={invalidate}
              />
            : tab === "mixes" ? mixesPanel : tab === "curve" ? curvePanel : leversPanel}
        </div>
      </div>

      {/* ── Result rail: the verdict, permanently beside the controls ── */}
      <aside className="flex flex-col min-h-0 rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden">
        <div className={cn("px-5 pt-5 pb-4 shrink-0 border-b border-line/70 border-l-[3px]", onTrack ? "border-l-brand-500" : "border-l-amber-500")}>
          <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Balance to target</div>
          <div className={cn("text-[2.5rem] leading-none font-extrabold tabular-nums mt-1.5", onTrack ? "text-brand-600" : "text-ink")}>
            {onTrack ? "Met" : <>{fmt(gapT)}<span className="text-sm font-semibold text-ink-soft ml-1">t</span></>}
          </div>
          <div className="mt-2 text-[11px] font-medium text-ink-faint">
            {onTrack ? `target reached by ${year}` : `still to close by ${year}`}
          </div>
        </div>

        {/* Capped linear progress. A plan CAN exceed its target — mixes move in
            10% steps and the OPEX basis deliberately overshoots — so the bar
            stops at 100% and the overshoot is stated in words. A fill running
            past the end of its own track reads as a bug, not a win. */}
        <div
          className="px-5 py-4 shrink-0 border-b border-line/70"
          role="progressbar" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.min(100, pctOfRequired)} aria-label="Progress to target"
        >
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-semibold text-ink-soft">Plan progress</span>
            <span className="text-sm font-extrabold tabular-nums text-ink">{Math.min(100, pctOfRequired)}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-surface-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700", onTrack ? "bg-brand-500" : "bg-amber-400")}
              style={{ width: `${Math.min(100, pctOfRequired)}%` }}
            />
          </div>
          {pctOfRequired > 100 && (
            <p className="mt-1.5 text-[11px] text-brand-700">
              Target met — the plan delivers {pctOfRequired}% of the required cut.
            </p>
          )}
        </div>

        <div className="px-5 py-4 shrink-0 border-b border-line/70 space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-ink-soft">Required cut</span>
            <span className="text-sm font-extrabold tabular-nums text-ink">{fmt(requiredT)} t</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-ink-soft flex items-center gap-1">
              Allocated
              <InfoTip text="What your current levers deliver by the target year (Scope 2 market-based, including your entered VPPA / I-REC coverage)." />
            </span>
            <span className="text-sm font-extrabold tabular-nums text-brand-600">{fmt(allocatedT)} t</span>
          </div>
        </div>

        <div className="relative flex-1 min-h-0">
          <div className="h-full overflow-y-auto px-5 py-4">
            <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold mb-3">How this is calculated</div>
            <div className="text-[11px] text-ink-soft space-y-2 leading-relaxed">
              <p>Get emissions down to <strong className="text-ink tabular-nums">{fmt(committedLevel)} t</strong> by {year} — {target}% below the {s1.baseYear} base of {fmt(base)} t.</p>
              <p>
                Business-as-usual reaches <strong className="text-ink tabular-nums">{fmt(bauAtYear)} t</strong> by {year},
                growing at <BauRates premise={bauPremise} />
                {" — "}
                {bauPremise.overriddenScopes === "both"
                  ? <>a rate you set on the <strong className="text-ink">Assumptions</strong> tab, which replaces both scopes&rsquo; own history</>
                  : bauPremise.overriddenScopes !== "none"
                    /* One scope typed, one still on its own history. Naming only
                       the typed one would leave the other reading as derived by
                       omission, which is true but silent; naming only the
                       derived one would claim the whole figure came from the
                       data. Both halves get said. */
                    ? <>
                        <strong className="text-ink">{bauPremise.overriddenScopes === "s1" ? "Scope 1" : "Scope 2"}</strong>{" "}
                        at a rate you set on the <strong className="text-ink">Assumptions</strong> tab, and{" "}
                        {bauPremise.overriddenScopes === "s1" ? "Scope 2" : "Scope 1"}{" "}
                        {otherScopeSpan
                          ? <>from its own year-on-year data, {otherScopeSpan}</>
                          : <>on the fallback, for want of enough year-on-year data</>}
                      </>
                    : bauSpan
                      ? <>
                          from your own year-on-year data, {bauSpan}
                          {bauPartlyDerived && <>; the other scope has too few years and falls back</>}
                        </>
                      : <>the fallback, because there is not yet enough year-on-year data to derive one</>}
                . So <strong className="text-ink tabular-nums">{fmt(requiredT)} t</strong> has to come out of that path.
                Your plan takes out <strong className="text-ink tabular-nums">{fmt(allocatedT)} t</strong>, landing at {fmt(netAtYear)} t.
              </p>
              <p>A target is a <strong className="text-ink">level</strong>, not a quantity avoided — the same meaning your Goals tab uses. So the tonnes to remove move with business-as-usual: if activity growth outpaces the grid getting cleaner, BAU rises above the base year and there is more to remove than {target}% of it; if the grid cleans faster, less. Progress is allocated &divide; required, capped at 100% — a plan can over-deliver, because suggested mixes move dials in 10% steps (they land just past the target, never exactly on it), the OPEX-saving basis deliberately maximizes every self-funding lever beyond the target, and already-contracted VPPA / I-REC abatement also counts. Each lever row shows its own wedge at {year}, from the same model that drives the Action plan and Compare tabs.</p>
              <p>Scope 2 is <strong className="text-ink">market-based</strong>: your entered VPPA / I-REC coverage counts (the &ldquo;Already contracted&rdquo; row), and procurement moves this number only. Electrification adds electricity — the Scope 2 spill — which the renewable-sourcing dial greens.</p>
              <p>Dials are <strong className="text-ink">derived from the per-source levers</strong>: dragging one rewrites the levers of every matching source; editing a source in Scope 1 / Scope 2 moves the dial here. Flex-fuel and per-facility detail stay per-source — set them in the scope tabs.</p>
              <p><strong className="text-ink">Suggested mixes</strong>: each basis card carries its own <Info size={11} className="inline -mt-0.5" /> with the exact ranking and stopping rule it uses.</p>
            </div>
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface to-transparent" />
        </div>
      </aside>
    </div>
  );
}
