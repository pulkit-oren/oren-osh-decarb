"use client";

import { useState } from "react";
import { Globe2, Landmark, Lightbulb, Sun, Wallet, FileWarning } from "lucide-react";
import { FAMILY_COLORS } from "@/lib/model/factors";
import { M2_PER_KW } from "@/lib/scope2/model/constants";
import { useScope2 } from "@/lib/scope2/store";
import { defaultFacilityActions } from "@/lib/scope2/defaults";
import { cn, fmt, fmtMoney, fmtNum, pct } from "@/lib/utils";
import { groupByBu } from "@/lib/group-by-bu";
import { Card, CardHeader } from "../ui/Card";
import { KpiCard } from "../ui/KpiCard";
import { Slider } from "../ui/Slider";
import { InfoTip } from "../ui/InfoTip";
import { LeverBars } from "../charts/LeverBars";
import { NumField, Toggle, YearRange } from "./cells";
import { Scope2TrajectoryChart } from "./TrajectoryChart";

const EFF_COLOR = FAMILY_COLORS[4];
const GEN_COLOR = FAMILY_COLORS[0];
const PROC_COLOR = FAMILY_COLORS[3];

export function Scope2BuilderTab() {
  const { baseFacilities, levers, result, updateFacilityAction, updateProcurement, baseYear } = useScope2();
  const [selId, setSelId] = useState<string | null>(null);
  // Only Purchased/grid facilities (gridEf > 0) are valid targets for the
  // efficiency and generation levers. VPPA/Solar/I-REC (gridEf 0) are
  // procurement instruments and must not be offered here.
  const gridFacilities = baseFacilities.filter((f) => f.gridEf > 0);
  // If selId points at a gridEf-0 record (or is unset), fall back to the first grid facility.
  const facility =
    gridFacilities.find((f) => f.id === selId) ??
    gridFacilities[0] ??
    baseFacilities[0];

  if (!facility) {
    return <Card>No facilities in the base year — add them on the Data input tab first.</Card>;
  }

  const facilityGroups = groupByBu(gridFacilities);
  const acts = levers.byFacility[facility.id] ?? defaultFacilityActions(facility);
  const eff = acts.efficiency;
  const gen = acts.generation;
  const p = levers.procurement;
  const pf = result.perFacility[facility.id];
  const roofCapKwp = Math.max(0, facility.roofSpaceM2 / M2_PER_KW - (facility.existingSolarKwp ?? 0));
  const procSum = p.ppaPct + p.greenTariffPct + p.recPct;
  const k = result.kpis;

  return (
    <div className="flex flex-col gap-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Globe2} label="Location-based" value={fmt(k.locationNowT)} unit="tCO₂e" hint={`baseline ${fmt(k.baseLocationT)} t — physical grid reality`} />
        <KpiCard emphasis icon={Landmark} label="Market-based" value={fmt(k.marketNowT)} unit="tCO₂e" hint={k.existingContractedKwh > 0 ? `from ${fmt(k.marketBaselineT)} t today (existing contracts) + new procurement` : `procurement covers ${pct(k.coveragePct / 100)} of addressable`} />
        <KpiCard icon={Wallet} label="Annual OPEX Δ" value={fmtMoney(k.annualOpexDelta)} hint={k.annualOpexDelta <= 0 ? "net saving / yr" : "net cost / yr"} />
        <KpiCard icon={Sun} label="Total CAPEX" value={fmtMoney(k.totalCapex)} hint={k.paybackYears != null ? `payback ≈ ${fmtNum(k.paybackYears, 1)} yrs` : "no payback (net cost)"} />
      </div>

      {result.warnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 space-y-1">
          {result.warnings.map((w) => <p key={w}>⚠ {w}</p>)}
        </div>
      )}

      {/* facility picker — grouped by BU */}
      <div>
        <div className="text-xs uppercase tracking-wider text-ink-faint font-bold mb-2">Facility — efficiency & generation levers apply per site</div>
        <div className="flex flex-col gap-3">
          {facilityGroups.map(([bu, groupFacilities]) => (
            <div key={bu || "__company_wide__"}>
              {/* BU group label — only shown when there is more than one group */}
              {facilityGroups.length > 1 && (
                <div className="text-[10px] uppercase tracking-wider text-ink-faint font-semibold mb-1.5">
                  {bu || "Company-wide"}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {groupFacilities.map((f) => {
                  const active = f.id === facility.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setSelId(f.id)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                        f.excluded && "opacity-60",
                        active ? "bg-brand-500 text-white border-brand-500" : "border-line hover:border-brand-300 hover:bg-brand-50/40",
                      )}
                    >
                      {f.name}
                      {f.isolated && <span className={cn("ml-1.5 text-[10px]", active ? "text-white/80" : "text-amber-600")}>· isolated</span>}
                      {f.excluded && (
                        <span className={cn("ml-1.5 text-[10px] font-semibold", active ? "text-white/80" : "text-amber-700")}>
                          · Excluded
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {gridFacilities.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-faint">No grid-supplied facilities — efficiency and on-site generation apply only to purchased-grid electricity.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Pillar 1 — efficiency */}
          <Card>
            <CardHeader
              title={<span className="flex items-center gap-2"><Lightbulb size={16} style={{ color: EFF_COLOR }} /> Energy efficiency · {facility.name}</span>}
              subtitle="Capital upgrades that shrink the raw electricity draw."
              right={<Toggle on={eff.enabled} onChange={(v) => updateFacilityAction(facility.id, "efficiency", { enabled: v })} label="Enable efficiency lever" />}
            />
            <div className={cn("space-y-4", !eff.enabled && "opacity-50 pointer-events-none")}>
              <Slider label="LED lighting deployment" value={eff.ledPct} onChange={(v) => updateFacilityAction(facility.id, "efficiency", { ledPct: v })} color={EFF_COLOR}
                hint="Share of legacy lighting replaced. LEDs cut the lighting load ~55%." />
              <Slider label="High-efficiency motors / VFDs" value={eff.motorPct} onChange={(v) => updateFacilityAction(facility.id, "efficiency", { motorPct: v })} color={EFF_COLOR}
                hint="IE1/IE2 motors moved to IE4/IE5 or fitted with variable-frequency drives. Cuts the motor load ~12.5%." />
              <Slider label="BMS / automation" value={eff.bmsPct} onChange={(v) => updateFacilityAction(facility.id, "efficiency", { bmsPct: v })} color={EFF_COLOR}
                hint="Smart sensors optimizing HVAC schedules and idling equipment. Cuts HVAC + other load ~17.5%." />
              <div className="grid grid-cols-3 gap-2">
                <NumField label="LED CAPEX (full)" value={eff.ledCapex} onChange={(v) => updateFacilityAction(facility.id, "efficiency", { ledCapex: v })} />
                <NumField label="Motor CAPEX (full)" value={eff.motorCapex} onChange={(v) => updateFacilityAction(facility.id, "efficiency", { motorCapex: v })} />
                <NumField label="BMS CAPEX (full)" value={eff.bmsCapex} onChange={(v) => updateFacilityAction(facility.id, "efficiency", { bmsCapex: v })} />
              </div>
              <YearRange start={eff.startYear} target={eff.targetYear}
                onStart={(y) => updateFacilityAction(facility.id, "efficiency", { startYear: y, targetYear: Math.max(y, eff.targetYear) })}
                onTarget={(y) => updateFacilityAction(facility.id, "efficiency", { targetYear: y })} />
              {pf && eff.enabled && (
                <div className="rounded-xl bg-surface-muted px-3 py-2.5 text-xs text-ink-soft space-y-0.5">
                  <p>Lighting −{fmt(pf.eff.ledKwh)} · Motors −{fmt(pf.eff.motorKwh)} · BMS −{fmt(pf.eff.bmsKwh)} kWh/yr</p>
                  <p className="font-semibold text-ink">Total −{fmt(pf.eff.savedKwh)} kWh/yr → residual load {fmt(pf.eff.residualLoadKwh)} kWh</p>
                </div>
              )}
            </div>
          </Card>

          {/* Pillar 2 — generation */}
          <Card>
            <CardHeader
              title={<span className="flex items-center gap-2"><Sun size={16} style={{ color: GEN_COLOR }} /> On-site generation · {facility.name}</span>}
              subtitle="Behind-the-meter solar + battery, offsetting the post-efficiency load."
              right={<Toggle on={gen.enabled} onChange={(v) => updateFacilityAction(facility.id, "generation", { enabled: v })} label="Enable generation lever" />}
            />
            <div className={cn("space-y-4", !gen.enabled && "opacity-50 pointer-events-none")}>
              <Slider label="Solar PV capacity" value={Math.round(gen.solarKwp)} min={0} max={Math.max(1, Math.round(roofCapKwp))} suffix=" kWp" color={GEN_COLOR}
                onChange={(v) => updateFacilityAction(facility.id, "generation", { solarKwp: v })}
                hint={`Roof space caps the array at ${Math.round(roofCapKwp)} kWp (${M2_PER_KW} m² per kW). Yield here: ${facility.irradiance} kWh/kWp/yr.`} />
              <Slider label="Battery storage" value={Math.round(gen.batteryKwh)} min={0} max={Math.max(1, Math.round(facility.peakLoadKw * 8))} suffix=" kWh" color={GEN_COLOR}
                onChange={(v) => updateFacilityAction(facility.id, "generation", { batteryKwh: v })}
                hint={`Stores excess daytime solar, lifting self-consumption toward 100%. Peak load ${fmt(facility.peakLoadKw)} kW sizes the inverter.`} />
              <label className="block">
                <span className="text-xs text-ink-soft flex items-center gap-1.5">Grid export
                  <InfoTip text="Net metering: the utility credits exported solar at the tariff. Zero export: generation beyond on-site demand is curtailed — no value, no emission credit." />
                </span>
                <select value={gen.exportMode} onChange={(e) => updateFacilityAction(facility.id, "generation", { exportMode: e.target.value as typeof gen.exportMode })}
                  className="mt-1 w-full border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400">
                  <option value="netMetering">Net metering allowed</option>
                  <option value="zeroExport">Zero export (curtail)</option>
                </select>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <NumField label="Solar CAPEX /kW" value={gen.solarCapexPerKw} onChange={(v) => updateFacilityAction(facility.id, "generation", { solarCapexPerKw: v })} />
                <NumField label="Battery CAPEX /kWh" value={gen.batteryCapexPerKwh} onChange={(v) => updateFacilityAction(facility.id, "generation", { batteryCapexPerKwh: v })} />
                <NumField label="Subsidy" value={gen.subsidyPct} onChange={(v) => updateFacilityAction(facility.id, "generation", { subsidyPct: Math.max(0, Math.min(100, v)) })} suffix="%" />
              </div>
              <YearRange start={gen.startYear} target={gen.targetYear}
                onStart={(y) => updateFacilityAction(facility.id, "generation", { startYear: y, targetYear: Math.max(y, gen.targetYear) })}
                onTarget={(y) => updateFacilityAction(facility.id, "generation", { targetYear: y })} />
              {pf && gen.enabled && gen.solarKwp > 0 && (
                <div className="rounded-xl bg-surface-muted px-3 py-2.5 text-xs text-ink-soft space-y-0.5">
                  <p>Generation {fmt(pf.gen.solarGenKwh)} kWh/yr · self-consumption {pct(pf.gen.selfConsumption)} · exported {fmt(pf.gen.exportedKwh)} kWh</p>
                  <p className="font-semibold text-ink">Grid draw after solar: {fmt(pf.gen.gridDrawKwh)} kWh/yr</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Pillar 3 — procurement (portfolio-wide, pinned) */}
      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><Landmark size={16} style={{ color: PROC_COLOR }} /> Renewable procurement · portfolio-wide</span>}
          subtitle="Market instruments covering the grid draw that efficiency and solar leave behind. Moves the market-based number only — the location-based footprint stays physical."
          right={<Toggle on={p.enabled} onChange={(v) => updateProcurement({ enabled: v })} label="Enable procurement lever" />}
        />
        <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4", !p.enabled && "opacity-50 pointer-events-none")}>
          <div className="space-y-4">
            <Slider label="PPA / VPPA coverage" value={p.ppaPct} onChange={(v) => updateProcurement({ ppaPct: v })} color={PROC_COLOR}
              hint="Long-term, high-volume power purchase agreements. A strike price below the grid tariff books a saving." />
            <Slider label="Green tariff / utility program" value={p.greenTariffPct} onChange={(v) => updateProcurement({ greenTariffPct: v })} color={PROC_COLOR}
              hint="Certified green power bought from the local utility at a premium on the base rate." />
            <Slider label="Unbundled RECs / I-RECs" value={p.recPct} onChange={(v) => updateProcurement({ recPct: v })} color={PROC_COLOR}
              hint="Certificates bridging the gap at year end — pure OPEX cost, no physical delivery." />
            {procSum > 100 && (
              <p className="text-xs font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                Instruments sum to {procSum}% — the model clamps total coverage at 100% of the addressable load, keeping the mix ratio.
              </p>
            )}
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <NumField label="PPA strike Δ /kWh" value={p.ppaStrikeDeltaPerKwh} onChange={(v) => updateProcurement({ ppaStrikeDeltaPerKwh: v })} />
              <NumField label="Green premium /kWh" value={p.greenTariffPremiumPerKwh} onChange={(v) => updateProcurement({ greenTariffPremiumPerKwh: v })} />
              <NumField label="REC price /kWh" value={p.recPricePerKwh} onChange={(v) => updateProcurement({ recPricePerKwh: v })} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-line/70 px-3 py-2.5">
              <span className="text-sm text-ink flex items-center gap-1.5">
                RE100 exclusion flag
                <InfoTip text="Removes isolated/captive-grid load (e.g. island properties) from the addressable denominator, so progress tracks the achievable target. Adds a footnote to the export." />
              </span>
              <Toggle on={p.re100Exclusion} onChange={(v) => updateProcurement({ re100Exclusion: v })} label="RE100 exclusion" />
            </div>
            <YearRange start={p.startYear} target={p.targetYear}
              onStart={(y) => updateProcurement({ startYear: y, targetYear: Math.max(y, p.targetYear) })}
              onTarget={(y) => updateProcurement({ targetYear: y })} />
            <div className="rounded-xl bg-surface-muted px-3 py-2.5 text-xs text-ink-soft space-y-0.5">
              <p>Addressable load {fmt(result.procurement.addressableKwh)} kWh · covered {fmt(result.procurement.coveredKwh)} kWh ({pct(k.coveragePct / 100)})</p>
              <p className="font-semibold text-ink">Procurement cost {fmtMoney(result.procurement.annualCost)} / yr {result.procurement.annualCost < 0 ? "(net saving — PPA hedge)" : ""}</p>
              {k.footnote && (
                <p className="flex items-center gap-1.5 text-amber-700"><FileWarning size={12} /> RE100 footnote active — isolated load excluded from the target denominator.</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* charts */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card className="xl:col-span-3">
          <CardHeader title="Pathway to 2050" subtitle={`Base year ${baseYear}. Location-based (solid) vs market-based (dashed) net emissions against BAU and the SBTi 1.5°C line.`} />
          <Scope2TrajectoryChart
            series={[
              { id: "loc", label: "Location-based net", color: "#0F7873", rows: result.trajectoryLocation },
              { id: "mkt", label: "Market-based net", color: PROC_COLOR, dashed: true, rows: result.trajectoryMarket },
            ]}
          />
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Abatement by lever" subtitle="Full-ramp tonnes per year. Procurement abates the market-based number only." />
          <LeverBars
            items={result.levers.filter((l) => l.abatementT > 0).map((l) => ({
              label: l.label, value: l.abatementT, color: FAMILY_COLORS[l.colorIdx],
            }))}
          />
          {result.levers.every((l) => l.abatementT <= 0) && (
            <p className="text-sm text-ink-faint">Enable a lever above to see its abatement here.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
