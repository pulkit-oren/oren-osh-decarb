"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, ArrowLeft, ChevronRight, ChevronDown, Check, Flame, Droplets, Mountain, Leaf, Snowflake, Zap, Wind, Award, Plug } from "lucide-react";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import { useCompany } from "@/lib/company/store";
import { FUELS, FUELS_BY_CATEGORY } from "@/lib/model/factors";
import { combustionBreakdown, combustionCO2e } from "@/lib/model/baseline";
import { fuelFamily, type FuelFamily } from "@/lib/activity-groups";
import { displayUnits, fromRef, toRef } from "@/lib/unit-convert";
import { combustionGrade, refrigerantGrade, facilityGrade, confidenceOf } from "@/lib/data-quality";
import { FY_YEARS, fyLabel, type CombustionAsset, type FuelId, type FuelUnit } from "@/lib/model/types";
import type { Facility } from "@/lib/scope2/model/types";
import { cn, fmt } from "@/lib/utils";
import { ReliabilityBadge } from "../ui/ReliabilityBadge";
import { DetailPanel, CombustionDetails, CombustionCalc } from "./DataInputTab";
import { FacilityDetailContent } from "../scope2/DataInputTab";

const META: Record<string, { emoji: string; bg: string }> = {
  gaseous: { emoji: "🔥", bg: "#FEF3C7" },
  liquid: { emoji: "🛢️", bg: "#E0F2FE" },
  solid: { emoji: "🪨", bg: "#E5E7EB" },
  biomass: { emoji: "🌿", bg: "#DCFCE7" },
  refrigerant: { emoji: "❄️", bg: "#CFFAFE" },
  electricity: { emoji: "⚡", bg: "#E6F1F0" },
  outside: { emoji: "🌱", bg: "#ECFDF5" },
};
const GRAD: Record<string, string> = {
  gaseous: "linear-gradient(135deg,#FFF7E0,#FCE3A0)",
  liquid: "linear-gradient(135deg,#EAF6FE,#BFE4FB)",
  solid: "linear-gradient(135deg,#F2F4F6,#D3DAE0)",
  biomass: "linear-gradient(135deg,#E9FCF0,#BBF3CD)",
  refrigerant: "linear-gradient(135deg,#E4FBFE,#A9EEF7)",
  electricity: "linear-gradient(135deg,#EAF4F2,#C3E2DC)",
};
const CAT_ICON: Record<string, React.ElementType> = {
  gaseous: Flame, liquid: Droplets, solid: Mountain, biomass: Leaf, refrigerant: Snowflake, electricity: Zap,
};
const ICON_COLOR: Record<string, string> = {
  gaseous: "#B45309", liquid: "#0369A1", solid: "#475569", biomass: "#15803D", refrigerant: "#0E7490", electricity: "#0F7873",
};

type CatKey = FuelFamily | "refrigerants" | "electricity";
const CAT_DEFS: { key: CatKey; label: string; scope: 1 | 2; meta: string; kind: "fuel" | "refrigerant" | "electricity" }[] = [
  { key: "liquid", label: "Fuels – Liquid", scope: 1, meta: "liquid", kind: "fuel" },
  { key: "gas", label: "Fuels – Gas", scope: 1, meta: "gaseous", kind: "fuel" },
  { key: "solid", label: "Fuels – Solid", scope: 1, meta: "solid", kind: "fuel" },
  { key: "refrigerants", label: "Refrigerants & cooling", scope: 1, meta: "refrigerant", kind: "refrigerant" },
  { key: "electricity", label: "Electricity", scope: 2, meta: "electricity", kind: "electricity" },
];
type CatDef = (typeof CAT_DEFS)[number];

const ELEC_TYPES: { key: string; label: string; gridEf: number; sub: string; icon: React.ElementType }[] = [
  { key: "grid", label: "Grid electricity purchased", gridEf: 0.71, sub: "Metered grid supply (location-based)", icon: Zap },
  { key: "vppa", label: "Virtual PPA (VPPA)", gridEf: 0, sub: "Contractual renewable — market-based", icon: Wind },
  { key: "irec", label: "I-REC / REC", gridEf: 0, sub: "Renewable energy certificates", icon: Award },
  { key: "any", label: "Other / Any", gridEf: 0.71, sub: "Any other electricity source", icon: Plug },
];

type Nav =
  | { level: "home" }
  | { level: "bus" }
  | { level: "cat"; key: CatKey }
  | { level: "type"; key: CatKey; typeKey: string; cat?: "stationary" | "mobile" }
  | { level: "entry"; kind: "combustion" | "facility"; id: string };
type Sel = { kind: "refrigerant"; id: string } | null;

const facCO2e = (f: { annualLoadKwh: number; gridEf: number }) => (f.annualLoadKwh * f.gridEf) / 1000;
let _idc = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${_idc++}`;
const showNum = (v: number) => Number(v.toFixed(4));
const unitLabel = (u: string) => (u === "m3" ? "m³" : u);

function IconTile({ emoji, bg, size = "md", hover }: { emoji: string; bg: string; size?: "md" | "lg"; hover?: boolean }) {
  const s = size === "lg" ? "w-16 h-16 rounded-2xl text-3xl" : "w-9 h-9 rounded-xl text-lg";
  return <span style={{ background: bg }} className={cn("grid place-items-center shrink-0 transition-transform", s, hover && "group-hover:scale-110")}>{emoji}</span>;
}

function ScopeBadge({ scope }: { scope: 1 | 2 | "outside" }) {
  if (scope === "outside") return <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-surface-muted text-ink-soft border border-line/70">Outside</span>;
  return <span className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5", scope === 1 ? "bg-brand-50 text-brand-700" : "bg-oren-100 text-oren-700")}>Scope {scope}</span>;
}

/** Editable consumption row (used in the refrigerant list). */
function Row({ emoji, bg, name, sub, badge, value, unit, onChange, co2e, onOpen, onDelete }: {
  emoji: string; bg: string; name: string; sub: string; badge: React.ReactNode;
  value: number; unit: string; onChange: (v: number) => void; co2e: number; onOpen: () => void; onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 py-2.5 px-3 border-t border-line/40 transition-colors hover:bg-brand-50/40">
      <IconTile emoji={emoji} bg={bg} hover />
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2"><span className="text-sm font-medium text-ink truncate group-hover:text-brand-700 transition-colors">{name}</span>{badge}</div>
        <div className="text-xs text-ink-faint truncate">{sub}</div>
      </button>
      <div className="flex items-center gap-1.5 shrink-0">
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-28 text-right tabular-nums rounded-lg border border-brand-200 bg-brand-50/50 px-2.5 py-1.5 text-sm transition-colors focus:outline-none focus:border-brand-400 focus:bg-white" aria-label={`${name} consumption`} />
        <span className="text-xs text-ink-faint w-14">{unitLabel(unit)}</span>
      </div>
      <div className="w-20 text-right text-sm font-semibold tabular-nums shrink-0">{fmt(co2e)}<span className="text-ink-faint font-normal text-xs"> t</span></div>
      <button onClick={onDelete} className="p-1.5 rounded-lg text-ink-faint hover:text-red-500 transition-colors shrink-0" aria-label="Delete"><Trash2 size={15} /></button>
    </div>
  );
}

export function ActivityDataTab() {
  const s1 = useScenario();
  const s2 = useScope2();
  const [nav, setNav] = useState<Nav>({ level: "home" });
  const [sel, setSel] = useState<Sel>(null);
  // add-BU form (on the Business units screen)
  const [addingBu, setAddingBu] = useState(false);
  const [buName, setBuName] = useState("");
  const [buAgg, setBuAgg] = useState(true);
  const [catMode, setCatMode] = useState<"stationary" | "mobile">("stationary");
  const [fuelFilter, setFuelFilter] = useState<Set<string>>(new Set());
  const [fuelMenuOpen, setFuelMenuOpen] = useState(false);
  const openCat = (key: CatKey) => { setCatMode("stationary"); setFuelFilter(new Set()); setNav({ level: "cat", key }); };

  // Company-wide Business Unit config — mode (central vs BU-wise) + the shared BU list.
  const { activeId } = useCompany();
  const buKey = `osh-bus-v3::${activeId}`;
  type BuConfig = { mode: "central" | "bu"; units: { name: string; aggregate: boolean }[] };
  const [buReg, setBuReg] = useState<BuConfig>(() => {
    if (typeof window === "undefined") return { mode: "central", units: [] };
    try { const v = JSON.parse(window.localStorage.getItem(buKey) || ""); return v && v.mode ? v : { mode: "central", units: [] }; } catch { return { mode: "central", units: [] }; }
  });
  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem(buKey, JSON.stringify(buReg)); }, [buReg, buKey]);
  const addBu = (name: string, aggregate: boolean) => setBuReg((prev) => prev.units.some((b) => b.name === name) ? prev : { ...prev, units: [...prev.units, { name, aggregate }] });
  const removeBu = (name: string) => setBuReg((prev) => ({ ...prev, units: prev.units.filter((b) => b.name !== name) }));
  const setMode = (mode: "central" | "bu") => setBuReg((prev) => ({ ...prev, mode }));

  const year = s1.selectedYear;
  const setYear = (y: number) => { s1.setSelectedYear(y); s2.setSelectedYear(y); };

  const b1 = s1.selectedBaseline;
  const b2 = s2.selectedBaseline;
  const co2Ref = (id: string) => b1.perRefrigeration.find((p) => p.id === id)?.co2eT ?? 0;
  const co2Fac = (id: string) => b2.perFacility.find((p) => p.id === id)?.locationT ?? 0;

  const scope1T = b1.totalT, scope2T = b2.totalLocationT, total = scope1T + scope2T;
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  const biogenicRows = s1.selectedAssets.map((a) => ({ a, t: combustionBreakdown(a).biogenicCO2eT })).filter((x) => x.t > 0);
  const biogenicT = biogenicRows.reduce((s, x) => s + x.t, 0);

  const confidence = confidenceOf([
    ...s1.selectedAssets.map((a) => ({ grade: combustionGrade(a), co2eT: combustionCO2e(a) })),
    ...s1.selectedSystems.map((sy) => ({ grade: refrigerantGrade(sy), co2eT: co2Ref(sy.id) })),
    ...s2.selectedFacilities.map((f) => ({ grade: facilityGrade(f), co2eT: facCO2e(f) })),
  ]);
  const totalSources = s1.selectedAssets.length + s1.selectedSystems.length + s2.selectedFacilities.length;

  const assetsByFamily = (fam: FuelFamily) => s1.selectedAssets.filter((a) => fuelFamily(a.fuelType) === fam);
  const fuelsInFamily = (fam: FuelFamily) => (Object.keys(FUELS) as FuelId[]).filter((id) => fuelFamily(id) === fam).map((id) => ({ id, label: FUELS[id].label }));
  const countOf = (key: CatKey) => key === "refrigerants" ? s1.selectedSystems.length : key === "electricity" ? s2.selectedFacilities.length : (key === "liquid" || key === "gas" || key === "solid") ? assetsByFamily(key).length : 0;

  const typesFor = (d: CatDef): { key: string; label: string; gridEf?: number }[] =>
    d.kind === "electricity"
      ? ELEC_TYPES.map((t) => ({ key: t.key, label: t.label, gridEf: t.gridEf }))
      : fuelsInFamily(d.key as FuelFamily).map((f) => ({ key: f.id, label: f.label }));

  const blankFac = (bu: string, t: { label: string; gridEf?: number }, kwh: number, aggregate: boolean): Facility => ({
    id: newId("f"), name: t.label, annualLoadKwh: kwh, tariffPerKwh: 9, loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
    roofSpaceM2: 0, peakLoadKw: 0, gridEf: t.gridEf ?? 0.71, irradiance: 1400, isolated: false, existingSolarKwp: 0, existingRenewablePct: 0,
    bu: bu || undefined, excluded: bu ? !aggregate : false,
  });

  /** Aggregated total emissions for a type (only included entries); fuels optionally filtered by category. */
  const typeAggTotal = (d: CatDef, t: { key: string; label: string }, cat?: "stationary" | "mobile") =>
    d.kind === "electricity"
      ? s2.selectedFacilities.filter((f) => !f.excluded && f.name === t.label).reduce((s, f) => s + facCO2e(f), 0)
      : s1.selectedAssets.filter((a) => !a.excluded && a.fuelType === (t.key as FuelId) && (!cat || a.category === cat)).reduce((s, a) => s + combustionCO2e(a), 0);
  const catTotal = (d: CatDef) => d.kind === "refrigerant" ? b1.refrigerantT : typesFor(d).reduce((s, t) => s + typeAggTotal(d, t), 0);

  /** The entry for (BU, type[, category]); bu="" is Central. */
  const entryFor = (d: CatDef, t: { key: string; label: string }, cat: "stationary" | "mobile" | undefined, bu: string): CombustionAsset | Facility | undefined =>
    d.kind === "electricity"
      ? s2.selectedFacilities.find((f) => (f.bu ?? "") === bu && f.name === t.label)
      : s1.selectedAssets.find((a) => (a.bu ?? "") === bu && a.fuelType === (t.key as FuelId) && (!cat || a.category === cat));
  const emOfEntry = (d: CatDef, ex: CombustionAsset | Facility | undefined) =>
    !ex ? 0 : d.kind === "electricity" ? facCO2e(ex as Facility) : combustionCO2e(ex as CombustionAsset);
  const nWithData = (d: CatDef, t: { key: string; label: string }, cat?: "stationary" | "mobile") =>
    buReg.units.filter((u) => entryFor(d, t, cat, u.name)).length;

  /** Open (creating if missing) the entry for a BU (bu="" = Central) and a type. */
  const openEntry = (d: CatDef, t: { key: string; label: string; gridEf?: number }, cat: "stationary" | "mobile" | undefined, bu: string, agg: boolean) => {
    if (d.kind === "electricity") {
      let ex = s2.selectedFacilities.find((f) => (f.bu ?? "") === bu && f.name === t.label);
      if (!ex) { const rec = blankFac(bu, t, 0, agg); s2.addFacilityRecord(year, rec); ex = rec; }
      setNav({ level: "entry", kind: "facility", id: ex.id });
    } else {
      const fuelId = t.key as FuelId;
      const ex = s1.selectedAssets.find((a) => (a.bu ?? "") === bu && a.fuelType === fuelId && (!cat || a.category === cat));
      if (ex) { setNav({ level: "entry", kind: "combustion", id: ex.id }); return; }
      const id = newId("c");
      s1.addCombustionAsset(year, { id, name: bu ? `${FUELS[fuelId].label} — ${bu}` : FUELS[fuelId].label, category: cat ?? "stationary", fuelType: fuelId, unit: FUELS[fuelId].unit, annualVolume: 0, opex: 0, remainingLife: 10, unitCount: 1, bu: bu || undefined, excluded: bu ? !agg : false });
      setNav({ level: "entry", kind: "combustion", id });
    }
  };

  const combById = (id: string) => s1.selectedAssets.find((a) => a.id === id);
  const facById = (id: string) => s2.selectedFacilities.find((f) => f.id === id);
  const sysById = (id: string) => s1.selectedSystems.find((s) => s.id === id);

  /* ---------------- ENTRY SCREEN — electricity (facility) ---------------- */
  if (nav.level === "entry" && nav.kind === "facility") {
    const f = facById(nav.id);
    if (!f) { setNav({ level: "home" }); return null; }
    const ElecIcon = CAT_ICON.electricity;
    return (
      <div key={`fac-${f.id}`} className="screen-in flex flex-col gap-5">
        <button onClick={() => setNav({ level: "type", key: "electricity", typeKey: ELEC_TYPES.find((e) => e.label === f.name)?.key ?? "grid" })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to {f.name}</button>
        <div style={{ background: GRAD.electricity }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4">
          <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><ElecIcon size={28} strokeWidth={1.9} style={{ color: ICON_COLOR.electricity }} /></span>
          <div className="min-w-0 flex-1">
            <input value={f.name} onChange={(e) => s2.updateFacility(year, f.id, { name: e.target.value })} className="w-full text-2xl font-extrabold text-ink bg-transparent border-b-2 border-transparent hover:border-ink/20 focus:border-ink/40 focus:outline-none" aria-label="Source name" />
            <p className="text-sm font-medium text-ink-soft mt-0.5">Electricity · Scope 2{f.bu ? ` · ${f.bu}` : ""} · {fyLabel(year)}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div>
            <div className="text-3xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(co2Fac(f.id))}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div className="flex flex-col gap-5">
            <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-4">Consumption</div>
              <div className="flex items-end gap-3">
                <input type="number" value={f.annualLoadKwh} onChange={(e) => s2.updateFacility(year, f.id, { annualLoadKwh: Number(e.target.value) })} className="w-full text-4xl font-extrabold tabular-nums rounded-xl border-2 border-brand-200 bg-brand-50/40 px-4 py-3 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors" aria-label="Annual electricity" />
                <span className="rounded-xl border border-line bg-surface-muted px-4 py-4 text-base text-ink-soft">kWh</span>
              </div>
              <p className="text-xs text-ink-faint mt-3">Annual electricity drawn under this instrument.</p>
              <div className="mt-5 rounded-xl bg-surface-muted px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-ink-soft">This source emits</span>
                <span className="text-xl font-extrabold tabular-nums text-brand-600">{fmt(co2Fac(f.id))} tCO₂e</span>
              </div>
            </div>
            <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-3">How this is calculated</div>
              <p className="text-sm text-ink-soft">Location-based Scope 2 = load × grid emission factor.</p>
              <p className="mt-2 text-sm font-mono text-ink-soft break-words">{fmt(f.annualLoadKwh)} kWh × {f.gridEf} kgCO₂e/kWh ÷ 1,000</p>
              <p className="mt-1.5 text-lg font-extrabold text-ink">→ {fmt(co2Fac(f.id))} tCO₂e</p>
            </div>
          </div>
          <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
            <FacilityDetailContent f={f} year={year} locationT={co2Fac(f.id)} />
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- ENTRY SCREEN — fuel (combustion) ---------------- */
  if (nav.level === "entry") {
    const a = combById(nav.id);
    if (!a) { setNav({ level: "home" }); return null; }
    const disp = a.displayUnit ?? a.unit;
    const fam = fuelFamily(a.fuelType) ?? "liquid";
    const Icon = CAT_ICON[fam] ?? CAT_ICON.liquid;
    const catLabel = CAT_DEFS.find((c) => c.key === fam)?.label ?? "fuels";
    return (
      <div key={`entry-${a.id}`} className="screen-in flex flex-col gap-5">
        <button onClick={() => setNav({ level: "type", key: fam, typeKey: a.fuelType, cat: a.category })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to {FUELS[a.fuelType].label}</button>
        <div style={{ background: GRAD[fam] }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4">
          <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><Icon size={28} strokeWidth={1.9} style={{ color: ICON_COLOR[fam] }} /></span>
          <div className="min-w-0 flex-1">
            <input value={a.name} onChange={(e) => s1.updateCombustion(year, a.id, { name: e.target.value })} className="w-full text-2xl font-extrabold text-ink bg-transparent border-b-2 border-transparent hover:border-ink/20 focus:border-ink/40 focus:outline-none" aria-label="Source name" />
            <p className="text-sm font-medium text-ink-soft mt-0.5">{FUELS[a.fuelType].label} · {catLabel}{a.bu ? ` · ${a.bu}` : ""} · {fyLabel(year)}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div>
            <div className="text-3xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(combustionCO2e(a))}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div className="flex flex-col gap-5">
            <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-4">Consumption</div>
              <div className="flex items-end gap-3">
                <input type="number" value={showNum(fromRef(a.annualVolume, a.fuelType, disp))} onChange={(e) => s1.updateCombustion(year, a.id, { annualVolume: toRef(Number(e.target.value), a.fuelType, disp) })} className="w-full text-4xl font-extrabold tabular-nums rounded-xl border-2 border-brand-200 bg-brand-50/40 px-4 py-3 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors" aria-label="Annual consumption" />
                <select value={disp} onChange={(e) => s1.updateCombustion(year, a.id, { displayUnit: e.target.value as FuelUnit })} className="rounded-xl border border-line bg-white px-3 py-4 text-base cursor-pointer focus:outline-none focus:border-brand-400" aria-label="Unit">
                  {displayUnits(a.fuelType).map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
                </select>
              </div>
              <p className="text-xs text-ink-faint mt-3">Annual {FUELS[a.fuelType].label.toLowerCase()} consumed.</p>
              <div className="mt-5 rounded-xl bg-surface-muted px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-ink-soft">This source emits</span>
                <span className="text-xl font-extrabold tabular-nums text-brand-600">{fmt(combustionCO2e(a))} tCO₂e</span>
              </div>
            </div>
            <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-3">How this is calculated</div>
              <CombustionCalc a={a} />
            </div>
          </div>
          <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-6">
            <CombustionDetails a={a} year={year} showCalc={false} showSource={false} />
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- BUSINESS UNITS SETUP ---------------- */
  if (nav.level === "bus") {
    return (
      <div key="bus" className="screen-in flex flex-col gap-5 max-w-3xl">
        <button onClick={() => setNav({ level: "home" })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to activity data</button>
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Business units</h1>
          <p className="text-sm text-ink-soft mt-0.5">Choose how you collect data. Business units apply to every fuel, refrigerant and electricity source.</p>
        </div>

        <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-5">
          <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-3">How is the data collected?</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([["central", "Centrally", "One company-wide figure per source. No business units."], ["bu", "By business unit", "Enter each source per business unit; the totals roll up."]] as const).map(([val, title, desc]) => (
              <button key={val} onClick={() => setMode(val)} className={cn("rounded-xl border-2 p-4 text-left transition-all", buReg.mode === val ? "border-brand-400 bg-brand-50/50" : "border-line hover:border-brand-300")}>
                <div className="flex items-center gap-2">
                  <span className={cn("w-4 h-4 rounded-full border-2 grid place-items-center", buReg.mode === val ? "border-brand-500" : "border-line")}>{buReg.mode === val && <span className="w-2 h-2 rounded-full bg-brand-500" />}</span>
                  <span className="font-bold text-ink">{title}</span>
                </div>
                <p className="text-xs text-ink-soft mt-1.5 ml-6">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {buReg.mode === "bu" && (
          <div className="rounded-xl3 border border-line/60 bg-surface shadow-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Your business units</div>
              {!addingBu && <button onClick={() => { setAddingBu(true); setBuName(""); setBuAgg(true); }} className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600 transition-colors"><Plus size={14} /> Add BU</button>}
            </div>
            {addingBu && (
              <div className="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b border-line/60">
                <label className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Name</span>
                  <input value={buName} onChange={(e) => setBuName(e.target.value)} placeholder="e.g. Pune plant" className="border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400" /></label>
                <div className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Aggregate into total?</span>
                  <div className="inline-flex gap-1 rounded-lg bg-surface-muted p-1">
                    {([["Yes", true], ["No", false]] as const).map(([lbl, val]) => (
                      <button key={lbl} onClick={() => setBuAgg(val)} className={cn("px-4 py-1.5 rounded-md text-xs font-semibold transition-colors", buAgg === val ? "bg-white text-brand-700 shadow-card" : "text-ink-soft")}>{lbl}</button>
                    ))}
                  </div></div>
                <button onClick={() => { const nm = buName.trim(); if (nm) { addBu(nm, buAgg); setAddingBu(false); setBuName(""); setBuAgg(true); } }} className="rounded-lg bg-brand-500 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-600 transition-colors">Add</button>
                <button onClick={() => { setAddingBu(false); setBuName(""); }} className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-brand-300 transition-colors">Cancel</button>
              </div>
            )}
            {buReg.units.length === 0 ? (
              <p className="text-sm text-ink-faint">No business units yet — add your first.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {buReg.units.map((u) => (
                  <div key={u.name} className="flex items-center gap-3 rounded-xl border border-line/60 px-4 py-2.5">
                    <span className="w-8 h-8 rounded-lg bg-surface-muted grid place-items-center text-ink-soft font-bold text-xs shrink-0">{u.name.charAt(0).toUpperCase()}</span>
                    <span className="font-medium text-ink flex-1 truncate">{u.name}</span>
                    <span className={cn("text-[11px] font-semibold", u.aggregate ? "text-brand-700" : "text-amber-700")}>{u.aggregate ? "Aggregated" : "Excluded from total"}</span>
                    <button onClick={() => removeBu(u.name)} className="p-1.5 rounded-lg text-ink-faint hover:text-red-500 transition-colors" aria-label={`Remove ${u.name}`}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-ink-faint mt-3">These business units appear under every fuel, refrigerant and electricity source.</p>
          </div>
        )}
      </div>
    );
  }

  /* ---------------- PER-TYPE SCREEN — BU breakdown ---------------- */
  if (nav.level === "type") {
    const def = CAT_DEFS.find((c) => c.key === nav.key)!;
    const t = typesFor(def).find((x) => x.key === nav.typeKey);
    if (!t) { setNav({ level: "cat", key: nav.key }); return null; }
    const TIcon = def.kind === "electricity" ? (ELEC_TYPES.find((e) => e.key === t.key)?.icon ?? Zap) : CAT_ICON[def.meta];
    const cat = nav.cat;
    const totalEm = typeAggTotal(def, t, cat);
    const central = buReg.mode === "central";
    const unitRows = [...buReg.units]
      .map((u) => { const ex = entryFor(def, t, cat, u.name); return { u, has: !!ex, co2: emOfEntry(def, ex) }; })
      .sort((a, b) => Number(b.has) - Number(a.has) || a.u.name.localeCompare(b.u.name));
    const withData = unitRows.filter((r) => r.has).length;
    const centralEx = entryFor(def, t, cat, "");
    return (
      <div key={`type-${nav.key}-${nav.typeKey}`} className="screen-in flex flex-col gap-5">
        <button onClick={() => setNav({ level: "cat", key: def.key })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> Back to {def.label}</button>
        <div style={{ background: GRAD[def.meta] }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-4 flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><TIcon size={26} strokeWidth={1.9} style={{ color: ICON_COLOR[def.meta] }} /></span>
          <div className="min-w-0 flex-1"><h1 className="text-2xl font-extrabold text-ink leading-tight">{t.label}</h1><p className="text-sm font-medium text-ink-soft">{def.label}{cat ? ` · ${cat}` : ""} · {central ? "central" : "by business unit"}</p></div>
          <div className="text-right shrink-0"><div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Total emissions</div><div className="text-2xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(totalEm)}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div></div>
        </div>

        {central ? (
          <button onClick={() => openEntry(def, t, cat, "", true)} className="rounded-xl3 border border-line/60 bg-surface shadow-card p-5 flex items-center gap-3 text-left hover:border-brand-300 hover:shadow-card-lg transition-all w-full">
            <span className="w-10 h-10 rounded-xl bg-surface-muted grid place-items-center text-ink-soft font-bold shrink-0">C</span>
            <div className="min-w-0 flex-1"><span className="block font-semibold text-ink">Central (company-wide)</span><span className="text-xs text-ink-faint">{centralEx ? "Click to edit the figure" : "Click to enter the figure"}</span></div>
            <span className="text-sm font-semibold tabular-nums shrink-0">{fmt(emOfEntry(def, centralEx))} tCO₂e</span>
            <ChevronRight size={18} className="text-ink-faint shrink-0" />
          </button>
        ) : buReg.units.length === 0 ? (
          <div className="rounded-xl3 border border-dashed border-line/70 bg-surface-muted/40 p-6 text-center">
            <p className="text-sm text-ink-soft">No business units set up yet.</p>
            <button onClick={() => setNav({ level: "bus" })} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-brand-500 text-white px-3.5 py-2 hover:bg-brand-600 transition-colors">Set up business units</button>
          </div>
        ) : (
          <div className="rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-brand-50 to-transparent">
              <span className="text-sm font-semibold text-ink">{buReg.units.length} business unit{buReg.units.length === 1 ? "" : "s"}</span>
              <span className="text-xs text-ink-faint">{withData} with {t.label} data</span>
            </div>
            {unitRows.map(({ u, has, co2 }) => (
              <button
                key={u.name}
                onClick={() => openEntry(def, t, cat, u.name, u.aggregate)}
                title={has ? `${u.name} has ${t.label} data — click to edit.` : `${u.name} has no ${t.label} data yet — click to add.`}
                className="w-full flex items-center gap-3 px-4 py-3 border-t border-line/40 hover:bg-brand-50/30 transition-colors text-left"
              >
                <span className="w-8 h-8 rounded-lg bg-surface-muted grid place-items-center text-ink-soft font-bold text-xs shrink-0">{u.name.charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink truncate">{u.name}</span>
                    {has
                      ? <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-brand-50 text-brand-700">has {t.label}</span>
                      : <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-surface-muted text-ink-faint">no data</span>}
                  </div>
                  <span className={cn("text-[11px] font-semibold", u.aggregate ? "text-brand-700" : "text-amber-700")}>{u.aggregate ? "Aggregated" : "Excluded from total"}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">{has ? `${fmt(co2)} t` : "—"}</span>
                <ChevronRight size={16} className="text-ink-faint shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ---------------- CATEGORY SCREEN ---------------- */
  if (nav.level === "cat") {
    const def = CAT_DEFS.find((c) => c.key === nav.key)!;
    const m = META[def.meta];
    const CatIcon = CAT_ICON[def.meta];
    return (
      <div key={`cat-${def.key}`} className="screen-in flex flex-col gap-5">
        <button onClick={() => setNav({ level: "home" })} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit"><ArrowLeft size={16} /> All activity data</button>
        <div style={{ background: GRAD[def.meta] }} className="rounded-xl3 border border-white/60 shadow-card px-6 py-4 flex items-center gap-4">
          <span className="w-12 h-12 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><CatIcon size={26} strokeWidth={1.9} style={{ color: ICON_COLOR[def.meta] }} /></span>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-ink leading-tight">{def.label}</h1>
            <div className="mt-1"><ScopeBadge scope={def.scope} /></div>
          </div>
          <div className="text-right shrink-0"><div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Total emissions</div><div className="text-2xl font-extrabold tabular-nums text-ink leading-none mt-1">{fmt(catTotal(def))}<span className="text-sm font-semibold text-ink-soft"> tCO₂e</span></div></div>
        </div>

        {def.kind === "refrigerant" ? (
          <div className="rounded-xl3 border border-line/60 bg-surface shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-brand-50 to-transparent">
              <span className="text-sm font-semibold text-ink">{s1.selectedSystems.length} system{s1.selectedSystems.length === 1 ? "" : "s"}</span>
              <button onClick={() => s1.addRefrigeration(year)} className="inline-flex items-center gap-1 text-xs font-medium rounded-lg border border-line bg-surface px-2.5 py-1.5 hover:border-brand-300"><Plus size={13} /> Add system</button>
            </div>
            {s1.selectedSystems.length === 0 ? <p className="px-4 py-6 text-sm text-ink-faint text-center">No cooling systems yet.</p> : s1.selectedSystems.map((sy) => (
              <Row key={sy.id} emoji={m.emoji} bg={m.bg} name={sy.name} sub={`${sy.refrigerant} · topped up`} badge={<ReliabilityBadge grade={refrigerantGrade(sy)} />} value={sy.toppedUpKg} unit="kg" onChange={(v) => s1.updateRefrigeration(year, sy.id, { toppedUpKg: v })} co2e={co2Ref(sy.id)} onOpen={() => setSel({ kind: "refrigerant", id: sy.id })} onDelete={() => s1.delRefrigeration(year, sy.id)} />
            ))}
          </div>
        ) : def.kind === "electricity" ? (
          <>
            <p className="text-xs text-ink-soft -mt-1">Each source shows its total emissions, aggregated from the business units. Click one to add units &amp; enter values.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {typesFor(def).map((t) => {
                const TIcon = ELEC_TYPES.find((e) => e.key === t.key)?.icon ?? Zap;
                const totalEm = typeAggTotal(def, t);
                const nbu = nWithData(def, t);
                return (
                  <button key={t.key} onClick={() => setNav({ level: "type", key: def.key, typeKey: t.key })} style={{ background: GRAD[def.meta] }} className="group rounded-xl3 border border-white/60 shadow-card p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-card-lg hover:ring-2 hover:ring-white/80">
                    <div className="flex items-start justify-between gap-2">
                      <span className="w-12 h-12 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center transition-all group-hover:bg-white/85 group-hover:scale-105"><TIcon size={24} strokeWidth={1.9} style={{ color: ICON_COLOR[def.meta] }} /></span>
                      <div className="text-right"><div className="text-[9px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div><div className="text-lg font-extrabold tabular-nums text-ink leading-none mt-0.5">{fmt(totalEm)}<span className="text-[10px] text-ink-soft"> t</span></div></div>
                    </div>
                    <div className="mt-3 text-sm font-bold text-ink leading-tight">{t.label}</div>
                    <div className="text-[11px] text-ink-soft mt-0.5 inline-flex items-center gap-0.5">{buReg.mode === "central" ? "Central" : `${nbu}/${buReg.units.length} BUs`} <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" /></div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (() => {
          const famFuels = fuelsInFamily(def.key as FuelFamily).filter((f) => FUELS_BY_CATEGORY[catMode].includes(f.id));
          const shown = fuelFilter.size === 0 ? famFuels : famFuels.filter((f) => fuelFilter.has(f.id));
          return (
            <>
              {/* stationary / mobile (left) + fuel filter dropdown (right) */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="inline-flex gap-1 rounded-full bg-surface-muted p-1 w-fit">
                  {(["stationary", "mobile"] as const).map((mode) => (
                    <button key={mode} onClick={() => { setCatMode(mode); setFuelFilter(new Set()); }} title={mode === "stationary" ? "Stationary — fuel burned by fixed equipment that stays in one place: boilers, generators, ovens, furnaces, process heaters." : "Mobile — fuel burned by things that move: cars, trucks, forklifts, buses, ships."} className={cn("px-5 py-2 rounded-full text-sm font-semibold capitalize transition-colors", catMode === mode ? "bg-surface text-brand-700 shadow-card" : "text-ink-soft hover:text-ink")}>{mode}</button>
                  ))}
                </div>
                {famFuels.length > 0 && (
                  <div className="relative">
                    <button onClick={() => setFuelMenuOpen((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg border border-line bg-surface px-3 py-2 hover:border-brand-300 transition-colors">
                      {fuelFilter.size === 0 ? "All fuels" : `${fuelFilter.size} fuel${fuelFilter.size === 1 ? "" : "s"}`} <ChevronDown size={14} className={cn("transition-transform", fuelMenuOpen && "rotate-180")} />
                    </button>
                    {fuelMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setFuelMenuOpen(false)} aria-hidden />
                        <div className="pop-in absolute right-0 mt-2 w-56 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface shadow-card-lg z-50 p-1.5">
                          <button onClick={() => setFuelFilter(new Set())} className={cn("w-full text-left rounded-lg px-2.5 py-2 text-sm font-medium flex items-center gap-2", fuelFilter.size === 0 ? "bg-brand-50 text-brand-700" : "hover:bg-surface-muted")}>{fuelFilter.size === 0 ? <Check size={14} /> : <span className="w-3.5" />}All fuels</button>
                          {famFuels.map((f) => { const on = fuelFilter.has(f.id); return (
                            <button key={f.id} onClick={() => setFuelFilter((prev) => { const n = new Set(prev); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })} className={cn("w-full text-left rounded-lg px-2.5 py-2 text-sm flex items-center gap-2", on ? "bg-brand-50 text-brand-700 font-semibold" : "hover:bg-surface-muted")}>{on ? <Check size={14} /> : <span className="w-3.5" />}{f.label}</button>
                          ); })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-ink-soft -mt-1">{catMode === "stationary" ? "Fixed equipment (boilers, gensets, ovens…)." : "Vehicles & movable machines (fleet, forklifts…)."} Click a fuel to add business units &amp; enter values.</p>
              {shown.length === 0 ? (
                <p className="text-sm text-ink-faint">No {catMode} fuels available in this group.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {shown.map((f) => {
                    const totalEm = typeAggTotal(def, { key: f.id, label: f.label }, catMode);
                    const nbu = nWithData(def, { key: f.id, label: f.label }, catMode);
                    return (
                      <button key={f.id} onClick={() => setNav({ level: "type", key: def.key, typeKey: f.id, cat: catMode })} style={{ background: GRAD[def.meta] }} className="group rounded-xl3 border border-white/60 shadow-card p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-card-lg hover:ring-2 hover:ring-white/80">
                        <div className="flex items-start justify-between gap-2">
                          <span className="w-12 h-12 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center transition-all group-hover:bg-white/85 group-hover:scale-105"><CatIcon size={24} strokeWidth={1.9} style={{ color: ICON_COLOR[def.meta] }} /></span>
                          <div className="text-right"><div className="text-[9px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div><div className="text-lg font-extrabold tabular-nums text-ink leading-none mt-0.5">{fmt(totalEm)}<span className="text-[10px] text-ink-soft"> t</span></div></div>
                        </div>
                        <div className="mt-3 text-sm font-bold text-ink leading-tight">{f.label}</div>
                        <div className="text-[11px] text-ink-soft mt-0.5 inline-flex items-center gap-0.5">{buReg.mode === "central" ? "Central" : `${nbu}/${buReg.units.length} BUs`} <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" /></div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}

        {sel?.kind === "refrigerant" && sysById(sel.id) && <DetailPanel onClose={() => setSel(null)} refrigerant={sysById(sel.id)} year={year} />}
      </div>
    );
  }

  /* ---------------- HOME ---------------- */
  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-10rem)]">
      <div className="rounded-xl3 border border-line/50 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60 px-5 py-4 flex flex-wrap items-end justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-extrabold text-ink">Activity data</h1>
          <p className="text-sm text-ink-soft">Pick a category to enter your sources — Scope 1 &amp; 2 in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setNav({ level: "bus" })} className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg border border-line bg-surface px-3 py-1.5 hover:border-brand-300 transition-colors">
            🏢 Business units{buReg.mode === "bu" && buReg.units.length > 0 ? ` · ${buReg.units.length}` : ""}
          </button>
          <label className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Financial year</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400">
              {FY_YEARS.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-5 items-stretch lg:flex-1 lg:min-h-0">
        <div className="flex flex-col gap-3 min-h-0">
          {CAT_DEFS.map((def) => {
            const n = countOf(def.key);
            const Icon = CAT_ICON[def.meta];
            return (
              <button key={def.key} onClick={() => openCat(def.key)} style={{ background: GRAD[def.meta] }} className="group flex items-center gap-4 rounded-xl3 border border-white/60 shadow-card px-5 text-left flex-1 min-h-[72px] transition-all duration-200 hover:-translate-y-1 hover:shadow-card-lg hover:ring-2 hover:ring-white/80">
                <span className="w-12 h-12 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0 transition-all group-hover:bg-white/85 group-hover:scale-105">
                  <Icon size={24} strokeWidth={1.9} style={{ color: ICON_COLOR[def.meta] }} />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-xl font-extrabold text-ink truncate">{def.label}</span>
                  <div className="mt-1.5 flex items-center gap-2">
                    <ScopeBadge scope={def.scope} />
                    <span className="text-xs text-ink-soft">{n} source{n === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <div className="text-right shrink-0 mr-1">
                  <div className="text-[9px] uppercase tracking-wide text-ink-soft font-bold">Emissions</div>
                  <div className="text-base font-extrabold tabular-nums text-ink">{fmt(catTotal(def))}<span className="text-[10px] text-ink-soft"> t</span></div>
                </div>
                <ChevronRight size={20} className="text-ink-soft/70 group-hover:text-ink group-hover:translate-x-1 transition-all shrink-0" />
              </button>
            );
          })}
          {biogenicRows.length > 0 && (
            <div className="rounded-xl3 border border-dashed border-line/70 bg-surface-muted/40 px-5 py-3 shrink-0">
              <div className="flex items-center gap-2">
                <Leaf size={16} className="text-brand-600 shrink-0" />
                <span className="font-semibold text-ink text-sm">Outside of Scopes — Biogenic CO₂</span>
                <span className="ml-auto text-base font-extrabold tabular-nums">{fmt(biogenicT)} <span className="text-xs font-normal text-ink-faint">t</span></span>
              </div>
            </div>
          )}
        </div>

        <aside className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 text-white shadow-card-lg p-6 flex flex-col">
          <span aria-hidden className="absolute -right-12 -top-12 w-52 h-52 rounded-full bg-white/10" />
          <span aria-hidden className="absolute -left-12 bottom-8 w-40 h-40 rounded-full bg-white/5" />
          <p className="relative text-[11px] uppercase tracking-wide font-bold text-white/80">Total footprint · {fyLabel(year)}</p>
          <p className="relative mt-3 text-[44px] leading-none font-extrabold tabular-nums">{fmt(total)} <span className="text-lg font-semibold text-white/80">tCO₂e</span></p>
          <p className="relative mt-1 text-xs text-white/70">Scope 1 + Scope 2, this financial year</p>
          <div className="relative mt-6 flex flex-col gap-3">
            <div className="rounded-2xl bg-white/12 backdrop-blur-sm px-4 py-3">
              <div className="flex items-center justify-between"><span className="text-sm font-bold">Scope 1</span><span className="text-xs text-white/75">{share(scope1T)}%</span></div>
              <div className="text-2xl font-extrabold tabular-nums mt-0.5">{fmt(scope1T)} <span className="text-xs font-medium text-white/75">tCO₂e</span></div>
              <div className="mt-2 h-1.5 rounded-full bg-white/25 overflow-hidden"><div className="h-full bg-white transition-all duration-500" style={{ width: `${share(scope1T)}%` }} /></div>
            </div>
            <div className="rounded-2xl bg-white/12 backdrop-blur-sm px-4 py-3">
              <div className="flex items-center justify-between"><span className="text-sm font-bold">Scope 2</span><span className="text-xs text-white/75">{share(scope2T)}%</span></div>
              <div className="text-2xl font-extrabold tabular-nums mt-0.5">{fmt(scope2T)} <span className="text-xs font-medium text-white/75">tCO₂e</span></div>
              <div className="mt-2 h-1.5 rounded-full bg-white/25 overflow-hidden"><div className="h-full bg-white transition-all duration-500" style={{ width: `${share(scope2T)}%` }} /></div>
            </div>
          </div>
          <div className="relative mt-auto pt-5 border-t border-white/20 grid grid-cols-3 gap-2 text-center">
            <div><p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Measured</p><p className="text-2xl font-extrabold tabular-nums leading-tight">{Math.round(confidence.measuredPct * 100)}%</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Sources</p><p className="text-2xl font-extrabold tabular-nums leading-tight">{totalSources}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Categories</p><p className="text-2xl font-extrabold tabular-nums leading-tight">{CAT_DEFS.filter((d) => countOf(d.key) > 0).length}<span className="text-sm font-medium text-white/70">/5</span></p></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
