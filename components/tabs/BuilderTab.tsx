"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Sparkles, Factory, Truck, Snowflake, RotateCcw, ChevronDown, Save, Trash2, Upload,
  Zap, Fuel, Plus, Minus, SlidersHorizontal, AlertTriangle, Wrench, Info,
} from "lucide-react";
import { outlivesAsset, retirementYear } from "@/lib/model/validate";
import { useScenario } from "@/lib/store";
import { FUELS, ALT_FUELS, ALT_FUELS_BY_FUEL, maxBlendPctFor, FAMILY_COLORS, REFRIGERANTS, ALT_REFRIGERANT_IDS, RECOMMENDED_ALT_BY_SYSTEM } from "@/lib/model/factors";
import { applyAssetActions, defaultActions, defaultFlexFuel, defaultSystemActions, flexFuelCapable } from "@/lib/model/segments";
import { combustionCO2e, refrigerantCO2e } from "@/lib/model/baseline";
import { applyRefrigerant } from "@/lib/model/levers";
import { CURRENCY } from "@/lib/defaults";
import type { CombustionAsset, FlexFuelAction, FuelSwitchAction, RefrigerantEra, RefrigerantId, RefrigerationSystem } from "@/lib/model/types";
import { cn, fmt, fmtK, fmtMoney, fmtNum, pct } from "@/lib/utils";
import { Card, CardHeader } from "../ui/Card";
import { Slider } from "../ui/Slider";
import { InfoTip } from "../ui/InfoTip";
import { DeltaPill } from "../ui/DeltaPill";
import { Collapsible } from "@/components/tabs/activity/Collapsible";
import { groupByBu } from "@/lib/group-by-bu";

type Seg = "mobile" | "stationary" | "refrigerant";

const SEG_META: Record<Seg, { label: string; sub: string; icon: React.ElementType; colorIdx: number }> = {
  mobile: { label: "Mobile", sub: "Vehicles & fleets", icon: Truck, colorIdx: 5 },
  stationary: { label: "Stationary", sub: "Boilers, gensets, process", icon: Factory, colorIdx: 6 },
  refrigerant: { label: "Refrigerant", sub: "Cooling — per-system plans", icon: Snowflake, colorIdx: 1 },
};

const SYSTEM_TYPE_LABELS: Record<RefrigerationSystem["systemType"], string> = {
  commercialHVAC: "Commercial HVAC",
  industrialColdStorage: "Industrial cold storage",
  retailRefrigeration: "Retail refrigeration",
};

const ERA_BADGE: Record<RefrigerantEra, { label: string; cls: string }> = {
  legacy: { label: "legacy", cls: "bg-amber-50 text-amber-700" },
  current: { label: "current", cls: "bg-surface-muted text-ink-soft" },
  future: { label: "future", cls: "bg-brand-50 text-brand-700" },
};

export function BuilderTab() {
  const { settings, resetSettings, baseAssets, baseSystems, baseYear, scenarios, saveScenario, deleteScenario, setSettings } = useScenario();
  const [seg, setSeg] = useState<Seg>("mobile");
  const [name, setName] = useState("");

  const segAssets = baseAssets.filter((a) => a.category === seg);

  // active-lever count per segment for the navigator chips
  const activeCount = (s: Seg): number => {
    if (s === "refrigerant")
      return baseSystems.filter((x) => {
        const a = settings.bySystem[x.id];
        return a && (a.gasSwitch.enabled || a.leakFix.enabled);
      }).length;
    return baseAssets.filter((a) => a.category === s).filter((a) => {
      const acts = settings.byAsset[a.id];
      return acts && (acts.electrify.enabled || acts.fuelSwitch.enabled);
    }).length;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* hero + segment navigator */}
      <div className="rounded-xl2 bg-gradient-to-br from-brand-600 via-brand-500 to-brand-400 text-white p-6 md:p-7 shadow-card-lg relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-64 h-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur rounded-full px-3 py-1 text-xs font-medium">
            <Sparkles size={12} /> Model a scenario
          </div>
          <h2 className="mt-3 text-2xl md:text-3xl font-extrabold tracking-tight leading-tight">
            Plan each asset. Save the scenario.
          </h2>
          <p className="mt-2 text-white/80 text-sm md:text-base">
            Stationary and mobile decarbonize differently — plan them per asset (convert N of M
            vehicles, or electrify a boiler by %). Hover the ⓘ on any field for what it does. Save,
            then open the <strong>Action plan</strong> to see the pathway.
          </p>
        </div>
        <div className="relative z-10 mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(Object.keys(SEG_META) as Seg[]).map((key) => {
            const m = SEG_META[key];
            const active = key === seg;
            const Icon = m.icon;
            return (
              <button
                key={key}
                onClick={() => setSeg(key)}
                className={cn(
                  "text-left rounded-xl p-3 transition-all border",
                  active ? "bg-white text-ink shadow-card-lg border-white" : "bg-white/10 backdrop-blur text-white border-white/20 hover:bg-white/20",
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className={cn("w-7 h-7 rounded-lg grid place-items-center", active ? "bg-brand-50 text-brand-700" : "bg-white/15")}>
                    <Icon size={14} />
                  </div>
                  {activeCount(key) > 0 && (
                    <span className={cn("text-[10px] font-bold rounded-full px-1.5 py-0.5", active ? "bg-brand-100 text-brand-700" : "bg-white/20 text-white")}>
                      {activeCount(key)} active
                    </span>
                  )}
                </div>
                <div className="font-bold text-sm leading-tight">{m.label}</div>
                <div className={cn("text-[11px]", active ? "text-ink-faint" : "text-white/70")}>{m.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      <LiveResult />

      {/* segment body */}
      {seg === "refrigerant" ? (
        <RefrigerantControls />
      ) : (
        <>
          {segAssets.length === 0 ? (
            <Card><p className="text-sm text-ink-faint">No {SEG_META[seg].label.toLowerCase()} assets yet — add them in Data input.</p></Card>
          ) : (
            groupByBu(segAssets).map(([bu, assets]) => (
              <Collapsible key={bu} title={bu || "Company-wide"} defaultOpen>
                <div className="flex flex-col gap-4">
                  {assets.map((a) => <AssetActionCard key={a.id} asset={a} />)}
                </div>
              </Collapsible>
            ))
          )}
        </>
      )}

      <AssumptionsCard seg={seg} />

      <div className="flex justify-end">
        <button onClick={resetSettings} className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink rounded-lg border border-line px-3 py-1.5 hover:bg-surface-muted transition-colors">
          <RotateCcw size={14} /> Reset all to default
        </button>
      </div>

      {/* save & manage */}
      <Card>
        <CardHeader title="Save this scenario" subtitle="Snapshot the whole plan (all assets + refrigerant + assumptions). Saved scenarios appear in the Action plan and Compare tabs." />
        <div className="flex items-center gap-2 flex-wrap">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name it — e.g. Board case, fleet-first…" className="flex-1 min-w-[220px] text-sm border border-line rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400" />
          <button onClick={() => { if (name.trim()) { saveScenario(name.trim()); setName(""); } }} disabled={!name.trim()} className="inline-flex items-center gap-2 text-sm font-medium rounded-lg bg-brand-500 text-white px-4 py-2 hover:bg-brand-600 transition-colors disabled:opacity-40">
            <Save size={15} /> Save scenario
          </button>
        </div>
        {scenarios.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-ink-faint font-bold">Saved scenarios</div>
            {scenarios.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border border-line/70 px-3 py-2">
                <span className="font-medium text-ink flex-1 truncate">{s.name}</span>
                {s.savedAt > 0 && (
                  <span className="text-[11px] text-ink-faint tabular-nums shrink-0">
                    {new Date(s.savedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                )}
                <button onClick={() => setSettings(() => s.settings)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 rounded-md px-2 py-1 hover:bg-brand-50" title="Load these settings into the live model">
                  <Upload size={13} /> Load
                </button>
                <button onClick={() => deleteScenario(s.id)} className="text-ink-faint hover:text-red-500 p-1" aria-label="Delete scenario">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <p className="text-[11px] text-ink-faint">Base year for this scenario: FY {baseYear}-{String((baseYear + 1) % 100).padStart(2, "0")} (change it in Data input).</p>
    </div>
  );
}

/* ============================================================
   Per-asset action card
   ============================================================ */

function AssetActionCard({ asset }: { asset: CombustionAsset }) {
  const { settings, setSettings, updateAction, baseYear } = useScenario();
  const acts = settings.byAsset[asset.id];

  if (!acts) {
    return (
      <Card className={cn(asset.excluded && "opacity-60")}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-ink">{asset.name}</h3>
            {asset.excluded && (
              <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 mt-1">
                Excluded from totals
              </span>
            )}
            <p className="text-sm text-ink-soft">No plan yet for this asset.</p>
          </div>
          <button
            onClick={() => setSettings((p) => ({ ...p, byAsset: { ...p.byAsset, [asset.id]: defaultActions(asset) } }))}
            className="text-sm font-medium rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600"
          >
            Add plan
          </button>
        </div>
      </Card>
    );
  }

  const res = applyAssetActions(asset, acts, settings.assumptions);
  const totalAbate = res.scope1AbatementT + res.fuelAbatementT;
  const baseT = combustionCO2e(asset);
  const afterT = Math.max(0, baseT - totalAbate);
  const isMobile = asset.category === "mobile";
  const e = acts.electrify;
  const eColor = FAMILY_COLORS[isMobile ? 5 : 6];

  return (
    <Card className={cn(asset.excluded && "opacity-60")}>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0" style={{ background: `${eColor}1A` }}>
            {isMobile ? <Truck size={22} style={{ color: eColor }} /> : <Factory size={22} style={{ color: eColor }} />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-extrabold leading-tight text-ink">{asset.name}</h2>
              {asset.excluded && (
                <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                  Excluded from totals
                </span>
              )}
            </div>
            <p className="text-sm text-ink-soft mt-0.5">
              {isMobile ? `${asset.unitCount} vehicles` : "1 unit"} · {fmt(asset.annualVolume)} {asset.unit}/yr
            </p>
            {asset.annualVolume === 0 && (
              <p className="text-[11px] text-ink-faint mt-0.5">No consumption entered yet</p>
            )}
          </div>
        </div>
        <ImpactBar base={baseT} after={afterT} />
      </div>

      {/* electrify + fuel switch, side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 border-t border-line/70 mt-1 pt-4">
      <ActionRow
        title="Electrify"
        sub={isMobile ? "Swap to EVs" : "Heat pump / electric"}
        icon={Zap}
        color={eColor}
        enabled={e.enabled}
        onToggle={() => updateAction(asset.id, "electrify", { enabled: !e.enabled })}
        className="lg:pr-7"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 items-end">
          {isMobile ? (
            <CountField
              label="Vehicles to convert"
              tip="How many of this fleet's vehicles become EVs. Higher = bigger Scope 1 cut, more electricity to source."
              value={e.unitsToConvert}
              max={asset.unitCount}
              onChange={(v) => updateAction(asset.id, "electrify", { unitsToConvert: v })}
              suffix={`of ${asset.unitCount}`}
            />
          ) : (
            <Slider label="Electrify capacity" value={e.capacityPct} color={eColor} onChange={(v) => updateAction(asset.id, "electrify", { capacityPct: v })} hint="Share of this asset's thermal/process demand moved to electric (heat pump or electric boiler)." />
          )}
          <YearField label="Target year" tip="The year this conversion is fully in place. It ramps from the start year to here." value={e.targetYear} min={2021} max={2050} onChange={(v) => updateAction(asset.id, "electrify", { targetYear: v })} />
        </div>
        <AdvancedDrawer>
          <NumberField
            label={isMobile ? "EV efficiency (× ICE)" : "Heat-pump COP"}
            tip={isMobile ? "How many times more efficient an EV is than the engine it replaces. ~3 means it needs a third of the energy." : "Coefficient of performance: 1 = electric boiler, 3–4 = heat pump. Higher = far less electricity needed."}
            value={e.cop} step={0.1} onChange={(v) => updateAction(asset.id, "electrify", { cop: v })}
          />
          <NumberField label="Electricity tariff" tip="What you pay for power. Sets the new running cost." value={e.tariffPerKwh} step={0.5} suffix={`${CURRENCY}/kWh`} onChange={(v) => updateAction(asset.id, "electrify", { tariffPerKwh: v })} />
          <NumberField label={isMobile ? "CAPEX per vehicle" : "Asset CAPEX"} tip="Up-front cost of the electric kit (per vehicle for fleets)." value={e.assetCapex} step={500_000} suffix={CURRENCY} onChange={(v) => updateAction(asset.id, "electrify", { assetCapex: v })} />
          <NumberField label="Start year" tip="The year the conversion begins." value={e.startYear} step={1} onChange={(v) => updateAction(asset.id, "electrify", { startYear: v })} />
        </AdvancedDrawer>
        {e.enabled && outlivesAsset(asset, baseYear, e.targetYear) && (
          <LifespanWarning asset={asset} baseYear={baseYear} />
        )}
      </ActionRow>

      <FuelSwitchControls asset={asset} />
      </div>
      {flexFuelCapable(asset) && <FlexFuelControls asset={asset} />}
    </Card>
  );
}

/* Fuel switch — only offers drop-in bio fuels that match the asset's
   engine/burner, and caps the blend at what existing equipment can take
   (E20 / B20). Beyond that needs flex-fuel / new vehicles. */
function FuelSwitchControls({ asset }: { asset: CombustionAsset }) {
  const { settings, updateAction, baseYear } = useScenario();
  const f = settings.byAsset[asset.id].fuelSwitch;
  const compatible = ALT_FUELS_BY_FUEL[asset.fuelType] ?? [];
  const hasBio = compatible.length > 0;
  const effectiveAlt = hasBio ? (compatible.includes(f.altFuel) ? f.altFuel : compatible[0]) : null;
  const maxBlend = effectiveAlt ? maxBlendPctFor(asset.category, effectiveAlt) : 100;
  const blendNote = effectiveAlt
    ? (effectiveAlt === "biodiesel" && asset.category === "stationary"
        ? "Boilers & burners can run high biodiesel blends with a burner retrofit (set Retrofit CAPEX in Advanced). Diesel gensets are engine-limited to ~B20."
        : ALT_FUELS[effectiveAlt].blendNote)
    : undefined;

  // Keep stored values valid if the asset's fuel changes after the plan was set.
  useEffect(() => {
    if (!hasBio) return;
    const patch: Partial<FuelSwitchAction> = {};
    if (!compatible.includes(f.altFuel)) patch.altFuel = compatible[0];
    const cap = maxBlendPctFor(asset.category, patch.altFuel ?? f.altFuel);
    if (f.blendPct > cap) patch.blendPct = cap;
    if (Object.keys(patch).length) updateAction(asset.id, "fuelSwitch", patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, asset.fuelType, f.altFuel, f.blendPct, hasBio]);

  const rowClass = "max-lg:border-t max-lg:border-line/70 max-lg:mt-4 max-lg:pt-4 lg:border-l lg:border-line/70 lg:pl-7";

  if (!hasBio || !effectiveAlt) {
    return (
      <ActionRow title="Fuel switch" sub="Bio / green blend" icon={Fuel} color={FAMILY_COLORS[2]} enabled={false} onToggle={() => {}} disabled className={rowClass}>
        <p className="text-sm text-ink-soft">
          No drop-in bio fuel for <strong>{FUELS[asset.fuelType].label}</strong>. Consider <strong>Electrification</strong>
          {asset.category === "mobile" ? " — or moving these vehicles to CNG / bio-CNG" : " — or biomass co-firing"}.
        </p>
      </ActionRow>
    );
  }

  return (
    <ActionRow
      title="Fuel switch"
      sub="Bio / green blend"
      icon={Fuel}
      color={FAMILY_COLORS[2]}
      enabled={f.enabled}
      onToggle={() => updateAction(asset.id, "fuelSwitch", { enabled: !f.enabled })}
      className={rowClass}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 items-end">
        <Slider label="Blend percentage" value={Math.min(f.blendPct, maxBlend)} max={maxBlend} color={FAMILY_COLORS[2]} onChange={(v) => updateAction(asset.id, "fuelSwitch", { blendPct: Math.min(maxBlend, v) })} hint={`Share of this asset's fuel energy replaced with ${ALT_FUELS[effectiveAlt].label}. Capped at ${maxBlend}% for existing equipment.`} />
        <YearField label="Target year" tip="The year the blend is fully in place. It ramps from the start year to here." value={f.targetYear} min={2021} max={2050} onChange={(v) => updateAction(asset.id, "fuelSwitch", { targetYear: v })} />
        <div className="md:col-span-2">
          <span className="text-sm font-medium text-ink flex items-center gap-1.5">Alternative fuel <InfoTip text="Matched to this asset's engine/burner — only compatible drop-in fuels are shown (ethanol for petrol, biodiesel for diesel, bio-CNG for CNG, biomethane for PNG)." /></span>
          <div className="flex gap-2 mt-2">
            {compatible.map((id) => {
              const active = effectiveAlt === id;
              return (
                <button key={id} onClick={() => updateAction(asset.id, "fuelSwitch", { altFuel: id, blendPct: Math.min(maxBlendPctFor(asset.category, id), f.blendPct) })} className={cn("flex-1 rounded-lg border px-2 py-2 text-sm font-medium transition-colors", active ? "bg-brand-500 text-white border-brand-500" : "border-line hover:border-brand-300")}>
                  {ALT_FUELS[id].label}
                </button>
              );
            })}
          </div>
          {blendNote && (
            <p className="text-[11px] text-ink-soft mt-2 flex items-start gap-1.5 bg-surface-muted rounded-lg px-2.5 py-1.5">
              <Info size={12} className="text-ink-faint shrink-0 mt-0.5" /> {blendNote}
            </p>
          )}
        </div>
      </div>
      <AdvancedDrawer>
        <NumberField label="Efficiency penalty" tip="Bio-fuels carry less energy, so a bit more is burned. Adds the extra volume." value={f.efficiencyPenaltyPct} step={0.5} suffix="%" onChange={(v) => updateAction(asset.id, "fuelSwitch", { efficiencyPenaltyPct: v })} />
        <NumberField label="Alt-fuel price" tip="Cost per unit of the bio-fuel. Sets the new fuel bill." value={f.altFuelPricePerUnit} step={1} suffix={`${CURRENCY}/unit`} onChange={(v) => updateAction(asset.id, "fuelSwitch", { altFuelPricePerUnit: v })} />
        <NumberField label="Retrofit CAPEX" tip="One-off cost to make this asset run the new fuel." value={f.retrofitCapex} step={500_000} suffix={CURRENCY} onChange={(v) => updateAction(asset.id, "fuelSwitch", { retrofitCapex: v })} />
        <NumberField label="Start year" tip="The year the blend begins." value={f.startYear} step={1} onChange={(v) => updateAction(asset.id, "fuelSwitch", { startYear: v })} />
      </AdvancedDrawer>
      {f.enabled && outlivesAsset(asset, baseYear, f.targetYear) && (
        <LifespanWarning asset={asset} baseYear={baseYear} />
      )}
    </ActionRow>
  );
}

/* Flex-fuel vehicle conversion — for mobile petrol/diesel fleets only.
   Converts specific vehicles to run a high blend (E85/E100) beyond the
   E20/B20 drop-in limit. Counted per vehicle, with its own purchase cost. */
function FlexFuelControls({ asset }: { asset: CombustionAsset }) {
  const { settings, updateAction } = useScenario();
  const acts = settings.byAsset[asset.id];
  const flex = acts.flexFuel ?? defaultFlexFuel(asset);
  const set = (patch: Partial<FlexFuelAction>) => updateAction(asset.id, "flexFuel", { ...flex, ...patch });
  const res = applyAssetActions(asset, { ...acts, flexFuel: flex }, settings.assumptions);
  const altLabel = ALT_FUELS[flex.altFuel].label;

  return (
    <div className="border-t border-line/70 mt-4 pt-4">
      <ActionRow
        title="Flex-fuel vehicles"
        sub={`Beyond E20/B20 · high ${altLabel} blend`}
        icon={Fuel}
        color={FAMILY_COLORS[3]}
        enabled={flex.enabled}
        onToggle={() => set({ enabled: !flex.enabled })}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4 items-end">
          <CountField
            label="Vehicles to convert"
            tip="Vehicles physically replaced with flex-fuel models that run high ethanol/biodiesel blends. Beyond E20/B20 you can't just blend — these are new vehicles, so they're counted one by one."
            value={flex.unitsToConvert}
            max={asset.unitCount}
            onChange={(v) => set({ unitsToConvert: v })}
            suffix={`of ${asset.unitCount}`}
          />
          <Slider label="High blend" value={flex.highBlendPct} min={25} max={100} suffix="%" color={FAMILY_COLORS[3]} onChange={(v) => set({ highBlendPct: v })} hint={`The blend the flex vehicles run — e.g. 85 = E85. Only flex-fuel vehicles can run blends this high.`} />
          <YearField label="Target year" tip="The year all the conversions are in place. It ramps from the start year to here." value={flex.targetYear} min={2021} max={2050} onChange={(v) => set({ targetYear: v })} />
        </div>
        <AdvancedDrawer>
          <NumberField label="CAPEX per vehicle" tip="Extra cost of a flex-fuel vehicle over a standard one (or the full replacement cost)." value={flex.vehicleCapex} step={50_000} suffix={CURRENCY} onChange={(v) => set({ vehicleCapex: v })} />
          <NumberField label="Start year" tip="The year conversions begin." value={flex.startYear} step={1} onChange={(v) => set({ startYear: v })} />
        </AdvancedDrawer>
        <p className="text-[11px] text-ink-soft mt-3 flex items-start gap-1.5 bg-surface-muted rounded-lg px-2.5 py-1.5">
          <Info size={12} className="text-ink-faint shrink-0 mt-0.5" />
          {flex.enabled && flex.unitsToConvert > 0
            ? <>Removes <span className="font-semibold text-brand-600">{fmt(res.flexAbatementT)} tCO₂e/yr</span> with {flex.unitsToConvert} of {asset.unitCount} vehicles on {altLabel} at {flex.highBlendPct}%.</>
            : <>Use this only for blends above E20/B20 — it buys flex-fuel vehicles. For low blends, use Fuel switch instead.</>}
        </p>
      </ActionRow>
    </div>
  );
}

function ActionRow({
  title, sub, icon: Icon, color, enabled, onToggle, children, className, disabled,
}: {
  title: string; sub: string; icon: React.ElementType; color: string;
  enabled: boolean; onToggle: () => void; children: ReactNode; className?: string; disabled?: boolean;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: `${color}1A` }}><Icon size={16} style={{ color }} /></div>
          <div>
            <div className="font-semibold text-ink text-sm">{title}</div>
            <div className="text-[11px] text-ink-faint">{sub}</div>
          </div>
        </div>
        <button onClick={disabled ? undefined : onToggle} disabled={disabled} className={cn("relative w-11 h-6 rounded-full transition-colors shrink-0", disabled ? "bg-line opacity-50 cursor-not-allowed" : enabled ? "bg-brand-500" : "bg-line")} aria-pressed={enabled} aria-label={`Toggle ${title}`}>
          <span className={cn("absolute top-1 w-4 h-4 rounded-full bg-white shadow-card transition-all", enabled ? "left-6" : "left-1")} />
        </button>
      </div>
      <div className={cn(!disabled && !enabled && "opacity-40 pointer-events-none")}>{children}</div>
    </div>
  );
}

/* ============================================================
   Refrigerant — per-system cards (Switch gas | Fix leaks)
   ============================================================ */

function RefrigerantControls() {
  const { baseSystems, setSettings } = useScenario();
  const applyPreset = (gasOn: boolean, transitionPct: number, leakImprovementPct: number) =>
    setSettings((p) => {
      const bySystem = { ...p.bySystem };
      for (const id of Object.keys(bySystem)) {
        bySystem[id] = {
          gasSwitch: { ...bySystem[id].gasSwitch, enabled: gasOn, transitionPct },
          leakFix: { ...bySystem[id].leakFix, enabled: true, leakImprovementPct },
        };
      }
      return { ...p, bySystem };
    });

  return (
    <>
      <Card tone="muted">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-ink-faint font-bold mr-1">Presets · all systems</span>
          {[
            { label: "Leak fix only", sub: "0% · 40% leak", apply: () => applyPreset(false, 0, 40) },
            { label: "Balanced", sub: "60% · 50% leak", apply: () => applyPreset(true, 60, 50) },
            { label: "Full retrofit", sub: "100% · 70% leak", apply: () => applyPreset(true, 100, 70) },
          ].map((pr) => (
            <button key={pr.label} type="button" onClick={pr.apply} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:border-brand-300 hover:bg-brand-50/40 transition-colors">
              <span className="font-medium">{pr.label}</span><span className="text-ink-faint ml-1.5 text-xs">{pr.sub}</span>
            </button>
          ))}
        </div>
      </Card>
      {baseSystems.length === 0 ? (
        <Card><p className="text-sm text-ink-faint">No cooling systems yet — add them in Data input.</p></Card>
      ) : (
        groupByBu(baseSystems).map(([bu, systems]) => (
          <Collapsible key={bu} title={bu || "Company-wide"} defaultOpen>
            <div className="flex flex-col gap-4">
              {systems.map((sys) => <SystemActionCard key={sys.id} system={sys} />)}
            </div>
          </Collapsible>
        ))
      )}
    </>
  );
}

function SystemActionCard({ system }: { system: RefrigerationSystem }) {
  const { settings, setSettings, updateSystemAction } = useScenario();
  const acts = settings.bySystem[system.id];
  const color = FAMILY_COLORS[1];

  if (!acts) {
    return (
      <Card className={cn(system.excluded && "opacity-60")}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-ink">{system.name}</h3>
            {system.excluded && (
              <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 mt-1">
                Excluded from totals
              </span>
            )}
            <p className="text-sm text-ink-soft">No plan yet for this system.</p>
          </div>
          <button
            type="button"
            onClick={() => setSettings((p) => ({ ...p, bySystem: { ...p.bySystem, [system.id]: defaultSystemActions(system) } }))}
            className="text-sm font-medium rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600"
          >
            Add plan
          </button>
        </div>
      </Card>
    );
  }

  const gs = acts.gasSwitch;
  const lf = acts.leakFix;
  const current = REFRIGERANTS[system.refrigerant];
  const alt = REFRIGERANTS[gs.altRefrigerant];
  const era = ERA_BADGE[current.era];
  const suggested = RECOMMENDED_ALT_BY_SYSTEM[system.systemType];

  const baseT = refrigerantCO2e(system);
  const after = applyRefrigerant(system, {
    transitionPct: gs.enabled ? gs.transitionPct : 0,
    altRefrigerant: gs.altRefrigerant,
    leakImprovementPct: lf.enabled ? lf.leakImprovementPct : 0,
  });
  const afterT = Math.max(0, after.newFugitiveT);
  const gwpDelta = current.gwp > 0 ? (alt.gwp - current.gwp) / current.gwp : 0;
  const newTopUpKg = system.toppedUpKg * (1 - (lf.enabled ? lf.leakImprovementPct : 0) / 100);
  const gasSaving = system.toppedUpKg * ((lf.enabled ? lf.leakImprovementPct : 0) / 100) * system.gasCostPerKg;

  return (
    <Card className={cn(system.excluded && "opacity-60")}>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0" style={{ background: `${color}1A` }}>
            <Snowflake size={22} style={{ color }} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-extrabold leading-tight text-ink">{system.name}</h2>
              {system.excluded && (
                <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                  Excluded from totals
                </span>
              )}
            </div>
            <p className="text-sm text-ink-soft mt-0.5 flex items-center gap-2 flex-wrap">
              {SYSTEM_TYPE_LABELS[system.systemType]} · {fmt(system.toppedUpKg)} kg topped up/yr
              <span className="font-medium text-ink">{current.label} · GWP {fmt(current.gwp)}</span>
              <span className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5", era.cls)}>{era.label}</span>
            </p>
          </div>
        </div>
        <ImpactBar base={baseT} after={afterT} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 border-t border-line/70 mt-1 pt-4">
        <ActionRow
          title="Switch gas"
          sub="Move to a low-GWP refrigerant"
          icon={Snowflake}
          color={color}
          enabled={gs.enabled}
          onToggle={() => updateSystemAction(system.id, "gasSwitch", { enabled: !gs.enabled })}
          className="lg:pr-7"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 items-end">
            <div className="md:col-span-2">
              <span className="text-sm font-medium text-ink flex items-center gap-1.5 flex-wrap">
                Alternative refrigerant
                <InfoTip text="Which low-GWP gas to switch to. Lower GWP = bigger cut; naturals also need less charge." />
                {gwpDelta < 0 && (
                  <span className="text-[11px] font-bold text-brand-600 bg-brand-50 rounded-full px-2 py-0.5">
                    {pct(gwpDelta, 1)} GWP vs {current.label}
                  </span>
                )}
              </span>
              <select
                value={gs.altRefrigerant}
                onChange={(e) => updateSystemAction(system.id, "gasSwitch", { altRefrigerant: e.target.value as RefrigerantId })}
                aria-label={`${system.name} alternative refrigerant`}
                className="mt-2 w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
              >
                {ALT_REFRIGERANT_IDS.map((rid) => { const r = REFRIGERANTS[rid]; return <option key={rid} value={rid}>{r.label} · GWP {r.gwp}</option>; })}
              </select>
              <p className="text-[11px] text-ink-faint mt-1.5">{alt.note}</p>
              {gs.altRefrigerant !== suggested && (
                <button
                  type="button"
                  onClick={() => updateSystemAction(system.id, "gasSwitch", { altRefrigerant: suggested })}
                  className="mt-1.5 text-[11px] font-semibold text-brand-600 hover:text-brand-700 rounded-md px-2 py-1 bg-brand-50 hover:bg-brand-100 transition-colors"
                >
                  Suggested for {SYSTEM_TYPE_LABELS[system.systemType].toLowerCase()}: {REFRIGERANTS[suggested].label}
                </button>
              )}
            </div>
            <Slider label="Gas transition" value={gs.transitionPct} color={color} onChange={(v) => updateSystemAction(system.id, "gasSwitch", { transitionPct: v })} hint="Share of this system's cooling moved off the current gas." />
            <YearField label="Target year" tip="The year the transition is fully in place. It ramps from the start year to here." value={gs.targetYear} min={2021} max={2050} onChange={(v) => updateSystemAction(system.id, "gasSwitch", { targetYear: v })} />
          </div>
          <AdvancedDrawer>
            <NumberField label="Retrofit CAPEX" tip="One-off cost for new compressors / safety upgrades for this system." value={gs.retrofitCapex} step={1_000_000} suffix={CURRENCY} onChange={(v) => updateSystemAction(system.id, "gasSwitch", { retrofitCapex: v })} />
            <NumberField label="Start year" tip="The year the transition begins." value={gs.startYear} step={1} onChange={(v) => updateSystemAction(system.id, "gasSwitch", { startYear: v })} />
          </AdvancedDrawer>
        </ActionRow>

        <ActionRow
          title="Fix leaks"
          sub="Maintenance & monitoring"
          icon={Wrench}
          color="#D9774B"
          enabled={lf.enabled}
          onToggle={() => updateSystemAction(system.id, "leakFix", { enabled: !lf.enabled })}
          className="max-lg:border-t max-lg:border-line/70 max-lg:mt-4 max-lg:pt-4 lg:border-l lg:border-line/70 lg:pl-7"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 items-end">
            <Slider label="Leak-rate improvement" value={lf.leakImprovementPct} max={80} color="#D9774B" onChange={(v) => updateSystemAction(system.id, "leakFix", { leakImprovementPct: v })} hint="How much you cut leaks via maintenance & monitoring — often the biggest quick win." />
            <YearField label="Target year" tip="The year the leak programme reaches full effect." value={lf.targetYear} min={2021} max={2050} onChange={(v) => updateSystemAction(system.id, "leakFix", { targetYear: v })} />
          </div>
          <p className="text-xs text-ink-soft mt-3 tabular-nums">
            Top-up {fmtNum(system.toppedUpKg, 1)} kg/yr → <span className="font-semibold text-ink">{fmtNum(newTopUpKg, 1)} kg/yr</span>
            {gasSaving > 0 && <> · saves <span className="font-semibold text-brand-600">{fmtMoney(gasSaving)}/yr</span> in gas top-ups</>}
          </p>
          <AdvancedDrawer>
            <NumberField label="Start year" tip="The year the leak programme begins." value={lf.startYear} step={1} onChange={(v) => updateSystemAction(system.id, "leakFix", { startYear: v })} />
          </AdvancedDrawer>
          {lf.enabled && lf.leakImprovementPct > 70 && (
            <p className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0" />
              Very ambitious — sustained leak reduction above 70% needs continuous monitoring and rapid repair.
            </p>
          )}
        </ActionRow>
      </div>
      <p className="text-[11px] text-ink-faint mt-3">Carbon price is set once in <strong>Global assumptions</strong> below and applied across the scenario.</p>
    </Card>
  );
}

/* ============================================================
   Global assumptions
   ============================================================ */

/** Sticky live projection — instant feedback while you build. */
function LiveResult() {
  const { result } = useScenario();
  const k = result.kpis;
  return (
    <div className="sticky top-2 z-20 rounded-xl2 bg-surface shadow-card border border-line/60 px-4 py-3 flex items-center gap-x-5 gap-y-2 flex-wrap">
      <div className="flex items-center gap-2">
        <span className={cn("w-2.5 h-2.5 rounded-full", k.onTrack2030 ? "bg-brand-500" : "bg-amber-500")} />
        <span className="text-sm font-semibold text-ink">Live projection</span>
      </div>
      <Metric label="Reduction 2030" value={pct(k.reduction2030)} />
      <Metric label="Net 2030" value={`${fmtK(k.net2030)} t`} />
      <Metric label="Cost / t" value={`${CURRENCY}${fmt(k.costPerTonne)}`} />
      <Metric label="Years to target" value={k.yearsToTarget ? String(k.yearsToTarget) : "—"} />
      <DeltaPill tone={k.onTrack2030 ? "good" : "warn"}>{k.onTrack2030 ? "On track" : "Behind"}</DeltaPill>
      <span className="text-[11px] text-ink-faint ml-auto hidden md:inline">Full pathway & charts → Action plan</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold leading-none">{label}</div>
      <div className="text-sm font-extrabold text-ink tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

/** Live before → after emissions bar for one asset. */
function ImpactBar({ base, after }: { base: number; after: number }) {
  const abated = Math.max(0, base - after);
  const cut = base > 0 ? abated / base : 0;
  return (
    <div className="w-44 sm:w-56">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">Impact</span>
        <span className="text-xs font-bold text-brand-600 tabular-nums">−{fmt(abated)} t · {pct(cut)}</span>
      </div>
      <div className="h-2.5 rounded-full bg-surface-muted overflow-hidden flex">
        <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${cut * 100}%` }} title="abated" />
        <div className="h-full bg-ink/10" style={{ width: `${(1 - cut) * 100}%` }} title="remaining" />
      </div>
      <div className="flex justify-between text-[10px] text-ink-faint mt-1 tabular-nums">
        <span>{fmt(base)} t now</span><span>{fmt(after)} t after</span>
      </div>
    </div>
  );
}

function AssumptionsCard({ seg }: { seg: Seg }) {
  const { settings, updateAssumptions } = useScenario();
  const a = settings.assumptions;
  const isRefrigerant = seg === "refrigerant";
  return (
    <Card tone="muted">
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal size={16} className="text-ink-soft" />
        <h3 className="font-semibold text-ink">Global assumptions</h3>
        <InfoTip text="Corporate-level settings shared across the whole scenario — shown here are the ones this lever uses." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isRefrigerant ? (
          <NumberField label="Carbon price" tip="Internal carbon price. Because refrigerant GWPs are huge, even a small price makes retrofits look worthwhile." value={a.carbonPricePerTonne} step={250} suffix={`${CURRENCY}/t`} onChange={(v) => updateAssumptions({ carbonPricePerTonne: v })} />
        ) : (
          <>
            <NumberField label="Renewable sourcing" tip="Share of new electricity that is clean (solar/PPA) — cuts the Scope 2 electrification adds." value={a.renewableSourcingPct} step={5} suffix="%" onChange={(v) => updateAssumptions({ renewableSourcingPct: v })} />
            <NumberField label="Grid emission factor" tip="How dirty the local grid is per unit of electricity." value={a.gridEf} step={0.01} suffix="kgCO₂e/kWh" onChange={(v) => updateAssumptions({ gridEf: v })} />
            <NumberField label="REC cost" tip="Price of a renewable certificate per tonne, if offsetting leftover grid power." value={a.recCostPerTonne} step={100} suffix={`${CURRENCY}/t`} onChange={(v) => updateAssumptions({ recCostPerTonne: v })} />
            <NumberField label="Infrastructure CAPEX" tip="One-off charging / grid-upgrade cost for electrification." value={a.infraCapex} step={1_000_000} suffix={CURRENCY} onChange={(v) => updateAssumptions({ infraCapex: v })} />
          </>
        )}
      </div>
    </Card>
  );
}

/* ============================================================
   Small shared controls
   ============================================================ */

function AdvancedDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-ink">
        <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} />
        Advanced
      </button>
      {open && <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>}
    </div>
  );
}

function CountField({
  label, tip, value, max, onChange, suffix,
}: {
  label: string; tip: string; value: number; max: number; onChange: (v: number) => void; suffix?: string;
}) {
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  return (
    <div>
      <span className="text-sm font-medium text-ink flex items-center gap-1.5">{label} <InfoTip text={tip} /></span>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={() => onChange(clamp(value - 1))} className="w-8 h-8 rounded-lg border border-line grid place-items-center hover:bg-surface-muted" aria-label="Decrease"><Minus size={14} /></button>
        <input type="number" value={value} min={0} max={max} onChange={(e) => onChange(clamp(Number(e.target.value)))} className="w-16 text-center text-sm border border-line rounded-lg px-2 py-1.5 bg-white tabular-nums font-semibold focus:outline-none focus:border-brand-400" />
        <button onClick={() => onChange(clamp(value + 1))} className="w-8 h-8 rounded-lg border border-line grid place-items-center hover:bg-surface-muted" aria-label="Increase"><Plus size={14} /></button>
        {suffix && <span className="text-sm text-ink-faint">{suffix}</span>}
      </div>
    </div>
  );
}

function YearField({
  label, tip, value, min, max, onChange,
}: {
  label: string; tip: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <span className="text-sm font-medium text-ink flex items-center gap-1.5">{label} <InfoTip text={tip} /></span>
      <input type="number" value={value} min={min} max={max} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))} className="mt-2 w-28 text-sm border border-line rounded-lg px-3 py-1.5 bg-white tabular-nums focus:outline-none focus:border-brand-400" />
    </div>
  );
}

function NumberField({
  label, value, onChange, step = 1, suffix, tip,
}: {
  label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string; tip?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-ink-soft font-medium flex items-center gap-1.5">{label} {tip && <InfoTip text={tip} />}</span>
      <div className="mt-1 flex items-center gap-1.5">
        <input type="number" value={value} step={step} onChange={(e) => onChange(Number(e.target.value))} className="w-full text-sm border border-line rounded-lg px-2.5 py-1.5 bg-white tabular-nums focus:outline-none focus:border-brand-400" />
        {suffix && <span className="text-xs text-ink-faint whitespace-nowrap">{suffix}</span>}
      </div>
    </label>
  );
}

/** Amber advisory when an action's target year is past the asset's retirement. */
function LifespanWarning({ asset, baseYear }: { asset: CombustionAsset; baseYear: number }) {
  const retire = retirementYear(asset, baseYear);
  return (
    <p className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
      <AlertTriangle size={14} className="shrink-0" />
      {asset.name} retires in FY{retire} — before this action completes. Bring the target year forward, or plan a like-for-like low-carbon replacement at retirement instead.
    </p>
  );
}
