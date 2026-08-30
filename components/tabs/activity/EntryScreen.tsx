"use client";

/* One source, one screen. All three kinds — fuel, refrigerant, electricity —
   render into the same EntryShell: a work pane on the left whose sections are
   tabbed, and a result rail on the right that never moves.

   The rail is the point. Emissions, the derivation behind them, the data-quality
   grade and every warning stay on screen while you type the numbers that change
   them. Two consequences follow, and both are deliberate:

   - Emissions are NOT repeated in the hero band. The same figure twice, two
     inches apart, is one fact arguing with itself.
   - Warnings do not live in the tab that produced them. A tab you are not on
     cannot show you a problem, so every warning is passed to the rail and the
     owning tab grows an amber dot instead. */

import { useState } from "react";
import { Snowflake } from "lucide-react";
import { GRAD, CAT_ICON, ICON_COLOR, showNum, unitLabel, type Nav } from "./shared";
import { FUELS, FUELS_BY_CATEGORY, REFRIGERANTS } from "@/lib/model/factors";
import { combustionCO2e, refrigerantCO2e } from "@/lib/model/baseline";
import { fuelFamily } from "@/lib/activity-groups";
import { displayUnits, fromRef, toRef } from "@/lib/unit-convert";
import { fyLabel, type FuelUnit, type FuelId, type RefrigerantId } from "@/lib/model/types";
import { refrigClassesFor, refrigClassProfile, type RefrigClassId } from "@/lib/model/refrigerant-class";
import { combustionGrade, facilityGrade, refrigerantGrade } from "@/lib/data-quality";
import { defaultBasis, explainAllocation, unallocated } from "@/lib/equipment/allocate";
import { fmt, fmtMoney } from "@/lib/utils";
import { CURRENCY } from "@/lib/defaults";
import { endUsesFor } from "@/lib/model/end-use";
import { CombustionCalc, RefrigerantCalcBlock } from "../DataInputTab";
import { FacilityDetailContent } from "../../scope2/DataInputTab";
import { CAT_DEFS } from "./shared";
import { EntryShell, TabPanel, type EntryTab } from "./EntryShell";
import { TextField, NumField, SelectField, Segmented } from "./fields";
import { EquipmentSection } from "./EquipmentSection";
import type { CombustionAsset, RefrigerationSystem } from "@/lib/model/types";
import type { Facility } from "@/lib/scope2/model/types";

type Props = {
  nav: Nav & { level: "entry" };
  setNav: (n: Nav) => void;
  year: number;
  combById: (id: string) => CombustionAsset | undefined;
  facById: (id: string) => Facility | undefined;
  refrigSysById: (id: string) => RefrigerationSystem | undefined;
  updateCombustion: (year: number, id: string, patch: Partial<CombustionAsset>) => void;
  updateFacility: (year: number, id: string, patch: Partial<Facility>) => void;
  updateRefrigeration: (year: number, id: string, patch: Partial<RefrigerationSystem>) => void;
  co2Fac: (id: string) => number;
  /** Prior-year per-equipment volumes for THIS entry (by equipment id), for
   *  the "carryForward" allocation basis. Looked up by ActivityDataTab
   *  (whichever component holds the scenario store) — this screen never
   *  reaches into that store itself. Undefined when there's no matching entry
   *  in year-1, or it was never split. Threaded straight through to
   *  EquipmentSection, which is the only reader. */
  previousAllocation?: Record<string, number>;
  /** True when a scenario lever is keyed to this equipment id. Looked up by
   *  ActivityDataTab (which holds the scenario store) so that removing a split
   *  that a plan depends on is confirmed rather than silent. */
  hasLever?: (equipmentId: string) => boolean;
};

/** The consumption figure is the one number the whole screen exists to collect,
 *  so it is set at display size — every other field on the entry is a detail
 *  about it. */
const HERO_INPUT =
  "w-full text-4xl font-extrabold tabular-nums rounded-xl border-2 border-brand-200 bg-brand-50/40 px-4 py-3 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors";

const SYSTEM_OPTIONS: { value: RefrigerationSystem["systemType"]; label: string }[] = [
  { value: "commercialHVAC", label: "Commercial HVAC" },
  { value: "industrialColdStorage", label: "Industrial Cold Storage" },
  { value: "retailRefrigeration", label: "Retail Refrigeration" },
];

export function EntryScreen(props: Props) {
  /* Keyed on the entry so opening a different source always lands on
     Consumption — the tab you were last on belongs to the source you left. */
  return <EntryScreenInner key={`${props.nav.kind}-${props.nav.id}`} {...props} />;
}

function EntryScreenInner({ nav, setNav, year, combById, facById, refrigSysById, updateCombustion, updateFacility, updateRefrigeration, co2Fac, previousAllocation, hasLever }: Props) {
  const [tab, setTab] = useState("consumption");

  /* ---- Refrigerant entry ---- */
  if (nav.kind === "refrigerant") {
    const s = refrigSysById(nav.id);
    if (!s) { setNav({ level: "home" }); return null; }
    const refClass = refrigClassProfile(s);
    const gas = REFRIGERANTS[s.refrigerant];
    const gasOptions = (Object.values(REFRIGERANTS) as (typeof REFRIGERANTS)[keyof typeof REFRIGERANTS][])
      .filter((r) => r.inExcel)
      .map((r) => ({ value: r.id as RefrigerantId, label: r.label }));

    const warnings: React.ReactNode[] = [];
    if (s.toppedUpKg === 0) warnings.push("No top-up recorded, so this system reports zero. Enter the refrigerant added over the year.");
    if (s.gasCostPerKg === 0) warnings.push("Add a gas cost to value the savings from cutting leaks.");

    const tabs: EntryTab[] = [
      {
        key: "consumption",
        label: "Consumption",
        alert: s.toppedUpKg === 0,
        content: (
          <TabPanel>
            <div className="max-w-lg">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-4">Refrigerant topped up</div>
              <div className="flex items-end gap-3">
                <input type="number" value={s.toppedUpKg} onChange={(e) => updateRefrigeration(year, s.id, { toppedUpKg: Number(e.target.value) })} className={HERO_INPUT} aria-label="Refrigerant topped up" />
                <span className="rounded-xl border border-line bg-surface-muted px-4 py-4 text-base text-ink-soft">kg/yr</span>
              </div>
              <p className="text-xs text-ink-faint mt-3">Refrigerant topped up over the year (= the amount that leaked).</p>
              {s.gasCostPerKg > 0 && s.toppedUpKg > 0 && (
                <div className="mt-5 pt-4 border-t border-line/70">
                  <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Cross-check</div>
                  <p className="mt-1.5 text-[13px] text-ink-soft">
                    That leak costs about <strong className="text-ink font-semibold">{fmtMoney(Math.round(s.toppedUpKg * s.gasCostPerKg))}</strong> a year to replace, at {CURRENCY}{fmt(s.gasCostPerKg)}/kg.
                  </p>
                </div>
              )}
            </div>
          </TabPanel>
        ),
      },
      {
        key: "system",
        label: "System details",
        alert: s.gasCostPerKg === 0,
        content: (
          <TabPanel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
              <SelectField label="System type" value={s.systemType} options={SYSTEM_OPTIONS} onChange={(v) => {
                const patch: Partial<RefrigerationSystem> = { systemType: v };
                if (s.equipmentClass && !refrigClassesFor(v).some((p) => p.id === s.equipmentClass)) patch.equipmentClass = undefined;
                updateRefrigeration(year, s.id, patch);
              }} hint="Sets the recommended low-GWP swap in the Refrigerant advisor." />
              <SelectField
                label="Equipment class"
                value={(s.equipmentClass ?? "") as RefrigClassId | ""}
                options={[{ value: "" as RefrigClassId | "", label: "Unspecified" }, ...refrigClassesFor(s.systemType).map((p) => ({ value: p.id as RefrigClassId | "", label: p.label }))]}
                onChange={(v) => updateRefrigeration(year, s.id, { equipmentClass: (v || undefined) as RefrigClassId | undefined })}
                hint="A finer class sharpens the recommended low-GWP swap used by the modeller."
              />
              <SelectField label="Refrigerant gas" value={s.refrigerant} options={gasOptions} onChange={(v) => updateRefrigeration(year, s.id, { refrigerant: v })} />
              <NumField label="Gas cost" suffix={`${CURRENCY}/kg`} value={s.gasCostPerKg} min={0} onChange={(v) => updateRefrigeration(year, s.id, { gasCostPerKg: v })} hint="Purchase price of replacement refrigerant. Used to value the savings from cutting leaks." />
            </div>
            {refClass && (
              <p className="text-[11px] text-ink-faint mt-4">Recommended low-GWP swap: <strong className="text-ink">{REFRIGERANTS[refClass.recommendedAlt]?.label ?? refClass.recommendedAlt}</strong></p>
            )}
          </TabPanel>
        ),
      },
    ];

    return (
      <EntryShell
        backLabel="Refrigerants & cooling"
        onBack={() => setNav({ level: "cat", key: "refrigerants" })}
        gradient={GRAD.refrigerant}
        icon={Snowflake}
        iconColor={ICON_COLOR.refrigerant}
        name={s.name}
        onNameChange={(v) => updateRefrigeration(year, s.id, { name: v })}
        subtitle={`${gas.label} · Refrigerant${s.bu ? ` · ${s.bu}` : ""} · ${fyLabel(year)}`}
        emissionsT={refrigerantCO2e(s)}
        emissionsNote="Scope 1 · fugitive"
        grade={refrigerantGrade(s)}
        warnings={warnings}
        calc={<RefrigerantCalcBlock s={s} />}
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
      />
    );
  }

  /* ---- Electricity (legacy single-facility nav) ---- */
  if (nav.kind === "facility") {
    const f = facById(nav.id);
    if (!f) { setNav({ level: "home" }); return null; }
    const ElecIcon = CAT_ICON.electricity;
    const locationT = co2Fac(f.id);

    const warnings: React.ReactNode[] = [];
    if (f.annualLoadKwh === 0) warnings.push("No load recorded, so this facility reports zero. Enter the annual metered kWh.");

    const tabs: EntryTab[] = [
      {
        key: "consumption",
        label: "Consumption",
        alert: f.annualLoadKwh === 0,
        content: (
          <TabPanel>
            <div className="max-w-lg">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-4">Annual electricity</div>
              <div className="flex items-end gap-3">
                <input type="number" value={f.annualLoadKwh} onChange={(e) => updateFacility(year, f.id, { annualLoadKwh: Number(e.target.value) })} className={HERO_INPUT} aria-label="Annual electricity" />
                <span className="rounded-xl border border-line bg-surface-muted px-4 py-4 text-base text-ink-soft">kWh</span>
              </div>
              <p className="text-xs text-ink-faint mt-3">Metered supply for the year, across the whole facility.</p>
              {f.tariffPerKwh > 0 && f.annualLoadKwh > 0 && (
                <div className="mt-5 pt-4 border-t border-line/70">
                  <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Cross-check</div>
                  <p className="mt-1.5 text-[13px] text-ink-soft">
                    Worth about <strong className="text-ink font-semibold">{fmtMoney(Math.round(f.annualLoadKwh * f.tariffPerKwh))}</strong> of electricity a year, at {CURRENCY}{fmt(f.tariffPerKwh)}/kWh.
                  </p>
                </div>
              )}
            </div>
          </TabPanel>
        ),
      },
      {
        key: "modeller",
        label: "Modeller details",
        content: (
          <TabPanel>
            <FacilityDetailContent f={f} year={year} locationT={locationT} />
          </TabPanel>
        ),
      },
    ];

    return (
      <EntryShell
        backLabel="Electricity"
        onBack={() => setNav({ level: "cat", key: "electricity" })}
        gradient={GRAD.electricity}
        icon={ElecIcon}
        iconColor={ICON_COLOR.electricity}
        name={f.name}
        onNameChange={(v) => updateFacility(year, f.id, { name: v })}
        subtitle={`Electricity · Scope 2${f.bu ? ` · ${f.bu}` : ""} · ${fyLabel(year)}`}
        emissionsT={locationT}
        emissionsNote="Scope 2 · location-based"
        grade={facilityGrade(f)}
        warnings={warnings}
        calc={
          <div className="space-y-2">
            <p className="text-sm text-ink-soft">Location-based Scope 2 = load × grid emission factor.</p>
            <p className="text-sm font-mono text-ink-soft break-words">{fmt(f.annualLoadKwh)} kWh × {f.gridEf} kgCO₂e/kWh ÷ 1,000</p>
            <p className="text-lg font-extrabold text-ink">→ {fmt(locationT)} tCO₂e</p>
          </div>
        }
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
      />
    );
  }

  /* ---- Fuel (combustion) entry ---- */
  const a = combById(nav.id);
  if (!a) { setNav({ level: "home" }); return null; }
  const disp = a.displayUnit ?? a.unit;
  const fam = fuelFamily(a.fuelType) ?? "liquid";
  const Icon = CAT_ICON[fam] ?? CAT_ICON.liquid;
  const catLabel = CAT_DEFS.find((c) => c.key === fam)?.label ?? "fuels";
  const mode = a.inputMode ?? "metered";
  const price = FUELS[a.fuelType].typicalPricePerUnit ?? 0;
  const avgOpex = Math.round(a.annualVolume * price);
  const estVol = price > 0 ? Math.round(a.opex / price) : 0;
  const volDisp = showNum(fromRef(a.annualVolume, a.fuelType, disp));
  /* Every unit this fuel can be shown in EXCEPT the one already on screen. */
  const altUnits = displayUnits(a.fuelType).filter((u) => u !== disp);
  const setVolDisp = (v: number) => updateCombustion(year, a.id, { annualVolume: toRef(v, a.fuelType, disp) });

  const fuelOptions = FUELS_BY_CATEGORY[a.category].map((id) => ({ value: id as FuelId, label: FUELS[id].label }));
  const onCategory = (cat: CombustionAsset["category"]) => {
    const allowed = FUELS_BY_CATEGORY[cat];
    const patch: Partial<CombustionAsset> = { category: cat };
    if (!allowed.includes(a.fuelType)) { patch.fuelType = allowed[0]; patch.unit = FUELS[allowed[0]].unit; }
    // End-use lives on the equipment under D4/5.2 — clearing it flat here would
    // be discarded by resolveEquipment, which stamps it from the equipment and
    // ignores anything on the entry. Ruling K: `equipment` may be absent.
    const offered = endUsesFor(cat);
    const eq = a.equipment ?? [];
    if (eq.some((e) => e.endUse && !offered.some((p) => p.id === e.endUse))) {
      patch.equipment = eq.map((e) =>
        e.endUse && !offered.some((p) => p.id === e.endUse) ? { ...e, endUse: undefined } : e,
      );
    }
    updateCombustion(year, a.id, patch);
  };
  const onFuel = (v: FuelId) => updateCombustion(year, a.id, { fuelType: v, unit: FUELS[v].unit });

  const equipment = a.equipment ?? [];
  const equipmentCount = equipment.length;
  const volume = Number.isFinite(a.annualVolume) ? a.annualVolume : 0;
  const alloc = a.allocations ?? {};
  const leftover = unallocated(volume, alloc);

  /* The split derivation belongs beside the emissions figure, not in the pane
     that collects the numbers — so the rail renders it and EquipmentSection no
     longer does. Ruling W's basis resolution is repeated verbatim from that
     component because the string must describe the basis actually in force,
     never the nominal one. */
  const basis = a.allocationBasis ?? defaultBasis(equipment, previousAllocation);
  const explain = explainAllocation({
    entryVolume: volume, basis, equipment, previous: previousAllocation, unit: unitLabel(a.unit),
  });

  /* D5 / invariant 6: spend follows the volume share, by the same
     `volume / annualVolume` ratio resolveEquipment() uses — never a second,
     independently computed share, which is how the shipped build came to
     inflate total spend on every split (spec 2.2). */
  const spendShares = volume > 0 && a.opex > 0
    ? equipment.map((e) => `${CURRENCY}${fmt(((alloc[e.id] ?? 0) / volume) * a.opex)}`)
    : [];
  const spendLine = spendShares.length === 0
    ? null
    : spendShares.length === 1
      ? spendShares[0]
      : `${spendShares.slice(0, -1).join(", ")} and ${spendShares[spendShares.length - 1]}`;

  /* Every warning the entry can raise, gathered here and handed to the rail.
     None of them is rendered by the tab that owns it — see the module note. */
  const warnings: React.ReactNode[] = [];
  if (a.opex === 0) warnings.push("Add annual spend to see cost savings in the modeller.");
  if (leftover > 0) {
    warnings.push(
      `Unallocated: ${fmt(leftover)} ${unitLabel(a.unit)}. It still reaches the model as an unassigned remainder, but no lever can act on it.`,
    );
  }

  const tabs: EntryTab[] = [
    {
      key: "consumption",
      label: "Consumption",
      content: (
        <TabPanel>
          <div className="max-w-lg">
            <div className="max-w-xs mb-4">
              <Segmented
                value={mode}
                options={[{ value: "metered", label: "Metered volume" }, { value: "spend", label: `${CURRENCY} Spend` }]}
                onChange={(m) => updateCombustion(year, a.id, { inputMode: m as CombustionAsset["inputMode"] })}
              />
            </div>
            {mode === "metered" ? (
              <>
                <div className="flex items-end gap-3">
                  <input type="number" value={volDisp} onChange={(e) => setVolDisp(Number(e.target.value))} className={HERO_INPUT} aria-label="Annual consumption" />
                  <select value={disp} onChange={(e) => updateCombustion(year, a.id, { displayUnit: e.target.value as FuelUnit })} className="rounded-xl border border-line bg-white px-3 py-4 text-base cursor-pointer focus:outline-none focus:border-brand-400" aria-label="Unit">
                    {displayUnits(a.fuelType).map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
                  </select>
                </div>
                <p className="text-xs text-ink-faint mt-3">Annual {FUELS[a.fuelType].label.toLowerCase()} consumed.</p>
                {/* A figure this large is easy to mistype by an order of
                    magnitude, and the rail's tCO₂e is too abstract to catch it.
                    The same quantity in a second unit and in rupees is what a
                    reader actually checks it against. Informational only — the
                    spend FIELD lives in Asset details, and one control in two
                    places is one too many. */}
                <div className="mt-5 pt-4 border-t border-line/70 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold">Cross-check</div>
                  {altUnits.length > 0 && (
                    <p className="text-[13px] text-ink-soft tabular-nums">
                      Same as {altUnits.map((u, i) => (
                        <span key={u}>
                          {i > 0 && " · "}
                          <strong className="text-ink font-semibold">{fmt(showNum(fromRef(a.annualVolume, a.fuelType, u)))}</strong> {unitLabel(u)}
                        </span>
                      ))}
                    </p>
                  )}
                  {price > 0 && (
                    <p className="text-[13px] text-ink-soft">
                      Worth about <strong className="text-ink font-semibold">{fmtMoney(avgOpex)}</strong> of fuel a year, at {CURRENCY}{fmt(price)}/{a.unit}.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-end gap-3">
                  <input type="number" value={a.opex} onChange={(e) => updateCombustion(year, a.id, { opex: Number(e.target.value) })} className={HERO_INPUT} aria-label="Annual spend" />
                  <span className="rounded-xl border border-line bg-surface-muted px-4 py-4 text-base text-ink-soft">{CURRENCY}/yr</span>
                </div>
                <p className="text-xs text-ink-faint mt-3 flex flex-wrap items-center gap-2">
                  {price > 0 ? (
                    <button type="button" onClick={() => setVolDisp(fromRef(estVol, a.fuelType, disp))} className="text-brand-600 font-medium hover:underline">
                      Estimate volume from spend → {fmt(estVol)} {a.unit}/yr
                    </button>
                  ) : <span>Enter spend; add a fuel price to estimate volume.</span>}
                  <span className="text-ink-faint">Current: {fmt(volDisp)} {unitLabel(disp)}/yr</span>
                </p>
              </>
            )}
          </div>
        </TabPanel>
      ),
    },
    {
      key: "asset",
      label: "Asset details",
      alert: a.opex === 0,
      content: (
        <TabPanel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
            <div className="sm:col-span-2">
              <TextField label="Site / location" value={a.site ?? ""} onChange={(v) => updateCombustion(year, a.id, { site: v })} placeholder="e.g. Pune plant" />
            </div>
            <SelectField label="Category" value={a.category} options={[{ value: "stationary", label: "Stationary" }, { value: "mobile", label: "Mobile" }]} onChange={onCategory} />
            <SelectField label="Fuel" value={a.fuelType} options={fuelOptions} onChange={onFuel} />
            {mode === "metered" ? (
              <NumField
                label="Annual spend" suffix={`${CURRENCY}/yr`} value={a.opex} min={0}
                onChange={(v) => updateCombustion(year, a.id, { opex: v })}
                hint="Fuel cost plus related maintenance for the year. Drives payback and cost-per-tonne in the action plan."
                footer={price > 0 && a.opex !== avgOpex ? (
                  <button type="button" onClick={() => updateCombustion(year, a.id, { opex: avgOpex })} className="text-brand-600 hover:underline">
                    Use average ≈ {fmtMoney(avgOpex)} ({CURRENCY}{fmt(price)}/{a.unit})
                  </button>
                ) : price > 0 ? `≈ average at ${CURRENCY}${fmt(price)}/${a.unit}` : null}
              />
            ) : (
              <NumField
                label="Annual volume" suffix={`${unitLabel(disp)}/yr`} value={volDisp} min={0}
                onChange={setVolDisp}
                hint="Metered fuel volume for the year. Edit directly or estimate it from spend above."
              />
            )}
          </div>
        </TabPanel>
      ),
    },
    {
      /* Units, remaining life and end-use are per EQUIPMENT (D4/5.2), so they
         live in here rather than on the source: resolveEquipment stamps all
         three onto the resolved rows FROM the equipment and ignores anything
         written flat on the entry. */
      key: "equipment",
      label: "Equipment",
      badge: equipmentCount > 0 ? String(equipmentCount) : undefined,
      alert: leftover > 0,
      content: (
        <TabPanel flush>
          <EquipmentSection
            entry={a}
            onChange={(patch) => updateCombustion(year, a.id, patch)}
            previousAllocation={previousAllocation}
            hasLever={hasLever}
          />
        </TabPanel>
      ),
    },
  ];

  return (
    <EntryShell
      backLabel={catLabel}
      onBack={() => setNav({ level: "cat", key: fam })}
      gradient={GRAD[fam]}
      icon={Icon}
      iconColor={ICON_COLOR[fam]}
      name={a.name}
      onNameChange={(v) => updateCombustion(year, a.id, { name: v })}
      subtitle={`${FUELS[a.fuelType].label} · ${catLabel}${a.bu ? ` · ${a.bu}` : ""} · ${fyLabel(year)}`}
      emissionsT={combustionCO2e(a)}
      emissionsNote="Scope 1 · combustion"
      grade={combustionGrade(a)}
      warnings={warnings}
      calc={
        <>
          <CombustionCalc a={a} />
          {(explain || spendLine) && (
            <div className="mt-5 pt-5 border-t border-line/70">
              <div className="text-[10px] uppercase tracking-wide text-ink-faint font-bold mb-2.5">
                How this is split
              </div>
              {/* Verbatim from explainAllocation — reformatting the numbers here
                  would be a second implementation that could disagree with the
                  table beside it, exactly the drift spec 4.3 forbids. */}
              {explain && (
                <>
                  <p className="text-[12px] text-ink-soft">{explain.formula}</p>
                  <p className="mt-1 text-[12px] font-mono text-ink break-words">{explain.row}</p>
                </>
              )}
              {spendLine && (
                <p className="mt-2 text-[12px] text-ink-soft">
                  Spend follows the volume share (D5): {spendLine}.
                </p>
              )}
            </div>
          )}
        </>
      }
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
    />
  );
}
