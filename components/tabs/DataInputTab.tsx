"use client";

import { useState } from "react";
import { Plus, Trash2, Flame, Snowflake, Factory, SlidersHorizontal, X, Star, ArrowRight, Copy, Upload } from "lucide-react";
import { useScenario } from "@/lib/store";
import { FUELS, FUELS_BY_CATEGORY, REFRIGERANTS, defraEF } from "@/lib/model/factors";
import { combustionBreakdown, refrigerantBreakdown } from "@/lib/model/baseline";
import { CURRENCY } from "@/lib/defaults";
import {
  FY_YEARS, fyLabel,
  type CombustionAsset, type FuelId, type RefrigerantId, type RefrigerationSystem,
} from "@/lib/model/types";
import { cn, fmt, fmtMoney, fmtNum } from "@/lib/utils";
import { combustionGrade, refrigerantGrade, confidenceOf } from "@/lib/data-quality";
import { siteList, filterBySite } from "@/lib/sites";
import { parseCombustionRows } from "@/lib/import-combustion";
import { Card, CardHeader } from "../ui/Card";
import { InfoTip } from "../ui/InfoTip";
import { KpiCard } from "../ui/KpiCard";
import { ReliabilityBadge } from "../ui/ReliabilityBadge";
import { ConfidenceGauge } from "../ui/ConfidenceGauge";

const REF_BY_ERA = {
  legacy: Object.values(REFRIGERANTS).filter((r) => r.era === "legacy"),
  current: Object.values(REFRIGERANTS).filter((r) => r.era === "current"),
  future: Object.values(REFRIGERANTS).filter((r) => r.era === "future"),
};
const SYSTEM_LABELS: Record<RefrigerationSystem["systemType"], string> = {
  commercialHVAC: "Commercial HVAC",
  industrialColdStorage: "Industrial cold storage",
  retailRefrigeration: "Retail refrigeration",
};

type Sel = { kind: "combustion"; id: string } | { kind: "refrigerant"; id: string } | null;

export function DataInputTab() {
  const {
    combustion, refrigeration, selectedYear, baseYear, setSelectedYear, setBaseYear,
    selectedAssets, selectedSystems, selectedBaseline,
    addCombustion, delCombustion, updateCombustion, copyCombustion, importCombustion,
    addRefrigeration, delRefrigeration, updateRefrigeration, copyRefrigeration,
  } = useScenario();

  const [sel, setSel] = useState<Sel>(null);
  const [siteFilter, setSiteFilter] = useState("");
  const [importing, setImporting] = useState(false);
  const b = selectedBaseline;
  const co2eOf = (id: string) => b.perCombustion.find((p) => p.id === id)?.co2eT ?? 0;
  const stationaryT = selectedAssets.filter((a) => a.category === "stationary").reduce((s, a) => s + co2eOf(a.id), 0);
  const mobileT = b.combustionT - stationaryT;
  const confidence = confidenceOf([
    ...selectedAssets.map((a) => ({ grade: combustionGrade(a), co2eT: co2eOf(a.id) })),
    ...selectedSystems.map((s) => ({ grade: refrigerantGrade(s), co2eT: b.perRefrigeration.find((p) => p.id === s.id)?.co2eT ?? 0 })),
  ]);
  const sites = siteList(selectedAssets);
  const shownAssets = filterBySite(selectedAssets, siteFilter);
  const assetById = (id: string) => selectedAssets.find((a) => a.id === id);
  const systemById = (id: string) => selectedSystems.find((s) => s.id === id);

  const combustionSourceYears = FY_YEARS.filter((y) => y !== selectedYear && (combustion[y]?.length ?? 0) > 0);
  const refrigSourceYears = FY_YEARS.filter((y) => y !== selectedYear && (refrigeration[y]?.length ?? 0) > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* FY + base year — compact */}
      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Financial year</span>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400" aria-label="Financial year to view / edit">
              {FY_YEARS.map((y) => {
                const count = combustion[y]?.length ?? 0;
                return <option key={y} value={y}>{fyLabel(y)} · {count} item{count === 1 ? "" : "s"}{y === baseYear ? " ★ base" : ""}</option>;
              })}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-bold">Base year</span>
            <select value={baseYear} onChange={(e) => setBaseYear(Number(e.target.value))} className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400" aria-label="Base year for modelling">
              {FY_YEARS.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
            </select>
            <Star size={14} className="text-brand-500 fill-current" />
            <InfoTip text="Anchors the scenario modeller, the SBTi target and the 2050 pathway." />
          </label>
          {selectedYear !== baseYear && (
            <span className="text-xs text-ink-soft">Viewing <strong>{fyLabel(selectedYear)}</strong> · model runs on <strong>{fyLabel(baseYear)}</strong></span>
          )}
        </div>
      </Card>

      {/* baseline KPIs for the selected FY */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard icon={Flame} label={`Combustion · ${fyLabel(selectedYear)}`} value={fmt(b.combustionT)} unit="tCO₂e" hint={`Stationary ${fmt(stationaryT)} · Mobile ${fmt(mobileT)} t`} />
        <KpiCard icon={Snowflake} label="Fugitive (refrigerant)" value={fmt(b.refrigerantT)} unit="tCO₂e" hint={`${selectedSystems.length} systems`} />
        <KpiCard emphasis icon={Factory} label={`Total Scope 1 · ${fyLabel(selectedYear)}`} value={fmt(b.totalT)} unit="tCO₂e" hint={selectedYear === baseYear ? "base year" : "view year"} />
      </div>

      {/* data-quality confidence for the selected FY */}
      <ConfidenceGauge confidence={confidence} />

      {/* combustion */}
      <Card>
        <CardHeader
          title={`Combustion fuels · ${fyLabel(selectedYear)}`}
          subtitle="The fuels burned this financial year. Open a row's details for units, spend and remaining life."
          right={
            <div className="flex items-center gap-2">
              <button onClick={() => setImporting((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg border border-line px-3 py-1.5 hover:border-brand-300">
                <Upload size={15} /> Import
              </button>
              {sites.length > 0 && (
                <select
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                  aria-label="Filter by site"
                  className="border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-brand-400"
                >
                  <option value="">All sites</option>
                  {sites.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <CopyFrom years={combustionSourceYears} onPick={(from) => copyCombustion(from, selectedYear)} />
              <button onClick={() => addCombustion(selectedYear)} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600 transition-colors">
                <Plus size={15} /> Add fuel
              </button>
            </div>
          }
        />
        {importing && <ImportPanel year={selectedYear} onImport={importCombustion} onClose={() => setImporting(false)} />}
        {selectedAssets.length === 0 ? (
          <EmptyState label={`No combustion fuels in ${fyLabel(selectedYear)}`} hint="Add a fuel, or copy another year's list above." action={{ label: "Add your first fuel", onClick: () => addCombustion(selectedYear) }} />
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm min-w-[620px] table-fixed border-separate border-spacing-0">
              <colgroup>
                <col style={{ width: "27%" }} /><col style={{ width: "14%" }} /><col style={{ width: "21%" }} />
                <col style={{ width: "9%" }} /><col style={{ width: "17%" }} /><col style={{ width: "12%" }} /><col style={{ width: "76px" }} />
              </colgroup>
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                  <Th label="Asset / fuel" hint="A short name for this fuel source — e.g. “Diesel gensets”, “PNG boiler”, “Biomass boiler”." />
                  <Th label="Category" hint="Stationary = boilers, gensets, ovens, process heat. Mobile = vehicles, forklifts and fleets." />
                  <Th label="Fuel" hint="The fuel burned. Fossil fuels plus biomass fuels (biogas, bio-CNG, bio-briquettes, biomass, bagasse, rice husk). For biomass only CH₄/N₂O is Scope 1 — biogenic CO₂ is reported separately." />
                  <Th label="Units" align="right" hint="How many physical units this line covers (e.g. 5 trucks, 2 gensets). Scales per-unit electrification in the modeller." />
                  <Th label="Volume / yr" align="right" hint="Total fuel burned per year, in the unit shown beside the field (litres, kg, m³ or tonnes)." />
                  <Th label="tCO₂e" align="right" hint="Calculated Scope 1 emissions = annual volume × the DEFRA factor for the selected year. Read-only." />
                  <th className="py-2 px-2" />
                </tr>
              </thead>
              <tbody>
                {shownAssets.map((a) => {
                  const co2e = co2eOf(a.id);
                  const active = sel?.kind === "combustion" && sel.id === a.id;
                  return (
                    <tr key={a.id} className={cn("align-middle border-t border-line/60", active && "bg-brand-50/40")}>
                      <td className="py-1.5 px-2">
                        <div className="flex items-center gap-2">
                          <TextCell value={a.name} onChange={(v) => updateCombustion(selectedYear, a.id, { name: v })} label={`${a.name} name`} />
                          <ReliabilityBadge grade={combustionGrade(a)} className="shrink-0" />
                          {a.site && <span className="shrink-0 text-[10px] text-ink-faint truncate max-w-[80px]">{a.site}</span>}
                        </div>
                      </td>
                      <td className="py-1.5 px-2"><SelectCell value={a.category} onChange={(v) => {
                        const cat = v as CombustionAsset["category"];
                        const allowed = FUELS_BY_CATEGORY[cat];
                        const patch: Partial<CombustionAsset> = { category: cat };
                        if (!allowed.includes(a.fuelType)) { patch.fuelType = allowed[0]; patch.unit = FUELS[allowed[0]].unit; }
                        updateCombustion(selectedYear, a.id, patch);
                      }} options={[["stationary", "Stationary"], ["mobile", "Mobile"]]} label={`${a.name} category`} /></td>
                      <td className="py-1.5 px-2"><FuelSelect category={a.category} value={a.fuelType} onChange={(v) => updateCombustion(selectedYear, a.id, { fuelType: v, unit: FUELS[v].unit })} label={`${a.name} fuel type`} /></td>
                      <td className="py-1.5 px-2"><NumCell value={a.unitCount} onChange={(v) => updateCombustion(selectedYear, a.id, { unitCount: Math.max(1, Math.round(v)) })} label={`${a.name} unit count`} /></td>
                      <td className="py-1.5 px-2">
                        <div className="flex items-center gap-1.5">
                          <NumCell value={a.annualVolume} onChange={(v) => updateCombustion(selectedYear, a.id, { annualVolume: v })} label={`${a.name} annual volume`} />
                          <span className="text-xs text-ink-faint w-7 shrink-0">{a.unit}</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-right font-semibold tabular-nums">{fmt(co2e)}</td>
                      <td className="py-1.5 px-2">
                        <div className="flex items-center gap-0.5 justify-end">
                          <button onClick={() => setSel({ kind: "combustion", id: a.id })} className={cn("p-1.5 rounded-lg", active ? "bg-brand-500 text-white" : "text-ink-faint hover:text-brand-600 hover:bg-brand-50")} aria-label="Edit details & show calculation" title="Details, spend & calculation"><SlidersHorizontal size={15} /></button>
                          <button onClick={() => delCombustion(selectedYear, a.id)} className="text-ink-faint hover:text-red-500 p-1.5" aria-label="Delete"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-ink-faint mt-2">Emissions use the <strong>DEFRA {defraEF("diesel", selectedYear).sourceYear}</strong> factor set{defraEF("diesel", selectedYear).exact ? "" : " (nearest available year)"}.</p>
      </Card>

      {/* refrigeration */}
      <Card>
        <CardHeader
          title={`Refrigeration & cooling · ${fyLabel(selectedYear)}`}
          subtitle="Cooling systems in service this year. Open a row's details for type, leak rate and gas cost."
          right={
            <div className="flex items-center gap-2">
              <CopyFrom years={refrigSourceYears} onPick={(from) => copyRefrigeration(from, selectedYear)} />
              <button onClick={() => addRefrigeration(selectedYear)} className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600 transition-colors">
                <Plus size={15} /> Add system
              </button>
            </div>
          }
        />
        {selectedSystems.length === 0 ? (
          <EmptyState label={`No cooling systems in ${fyLabel(selectedYear)}`} hint="Add a system, or copy another year's list above." action={{ label: "Add your first system", onClick: () => addRefrigeration(selectedYear) }} />
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm min-w-[520px] table-fixed border-separate border-spacing-0">
              <colgroup>
                <col style={{ width: "34%" }} /><col style={{ width: "30%" }} /><col style={{ width: "18%" }} />
                <col style={{ width: "12%" }} /><col style={{ width: "76px" }} />
              </colgroup>
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-faint">
                  <Th label="System" hint="A short name for the cooling system — e.g. “Cold storage plant”, “Office HVAC”." />
                  <Th label="Refrigerant" hint="The gas currently charged. High-GWP gases dominate fugitive emissions even at small leak rates — see the Refrigerant advisor." />
                  <Th label="Topped up (kg/yr)" align="right" hint="Refrigerant refilled over the year. When a system leaks, a technician refills it — so the amount topped up equals the amount that leaked to atmosphere (the fugitive emission). Take it from service / purchase records." />
                  <Th label="tCO₂e" align="right" hint="Calculated fugitive emissions = charge × leak rate × the gas’s GWP. Read-only." />
                  <th className="py-2 px-2" />
                </tr>
              </thead>
              <tbody>
                {selectedSystems.map((s) => {
                  const co2e = b.perRefrigeration.find((p) => p.id === s.id)?.co2eT ?? 0;
                  const active = sel?.kind === "refrigerant" && sel.id === s.id;
                  return (
                    <tr key={s.id} className={cn("align-middle border-t border-line/60", active && "bg-brand-50/40")}>
                      <td className="py-1.5 px-2"><TextCell value={s.name} onChange={(v) => updateRefrigeration(selectedYear, s.id, { name: v })} label={`${s.name} name`} /></td>
                      <td className="py-1.5 px-2"><RefrigerantSelect value={s.refrigerant} onChange={(v) => updateRefrigeration(selectedYear, s.id, { refrigerant: v })} label={`${s.name} refrigerant`} /></td>
                      <td className="py-1.5 px-2"><NumCell value={s.toppedUpKg} onChange={(v) => updateRefrigeration(selectedYear, s.id, { toppedUpKg: v })} label={`${s.name} topped up kg`} /></td>
                      <td className="py-1.5 px-2 text-right font-semibold tabular-nums">{fmt(co2e)}</td>
                      <td className="py-1.5 px-2">
                        <div className="flex items-center gap-0.5 justify-end">
                          <button onClick={() => setSel({ kind: "refrigerant", id: s.id })} className={cn("p-1.5 rounded-lg", active ? "bg-brand-500 text-white" : "text-ink-faint hover:text-brand-600 hover:bg-brand-50")} aria-label="Edit details & show calculation" title="Details, leak rate & calculation"><SlidersHorizontal size={15} /></button>
                          <button onClick={() => delRefrigeration(selectedYear, s.id)} className="text-ink-faint hover:text-red-500 p-1.5" aria-label="Delete"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* details + calculation side panel */}
      {sel && (
        <DetailPanel
          onClose={() => setSel(null)}
          combustion={sel.kind === "combustion" ? assetById(sel.id) : undefined}
          refrigerant={sel.kind === "refrigerant" ? systemById(sel.id) : undefined}
          year={selectedYear}
        />
      )}
    </div>
  );
}

function CopyFrom({ years, onPick }: { years: number[]; onPick: (from: number) => void }) {
  if (years.length === 0) return null;
  return (
    <label className="inline-flex items-center gap-1.5 text-sm rounded-lg border border-line px-2.5 py-1.5 hover:border-brand-300 cursor-pointer">
      <Copy size={14} className="text-ink-soft" />
      <select
        defaultValue=""
        onChange={(e) => { if (e.target.value) { onPick(Number(e.target.value)); e.target.value = ""; } }}
        className="bg-transparent text-ink-soft focus:outline-none cursor-pointer"
      >
        <option value="">Copy from…</option>
        {years.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
      </select>
    </label>
  );
}

function EmptyState({ label, hint, action }: {
  label: string;
  hint: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border border-dashed border-line py-10 text-center">
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="text-xs text-ink-faint mt-1">{hint}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium rounded-lg bg-brand-500 text-white px-4 py-2 hover:bg-brand-600 transition-colors"
        >
          <Plus size={15} /> {action.label}
        </button>
      )}
    </div>
  );
}

/** Paste-from-Excel bulk import for combustion fuels. */
function ImportPanel({ year, onImport, onClose }: {
  year: number;
  onImport: (year: number, rows: Omit<CombustionAsset, "id">[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const rows = parseCombustionRows(text);
  const matched = rows.filter((r) => r.matched).length;
  return (
    <div className="mb-4 rounded-xl border border-line/70 bg-surface-muted p-4">
      <p className="text-xs text-ink-soft mb-2">Paste rows from Excel — <strong>name, amount, fuel</strong> (tab or comma separated). One source per line.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={"Furnace oil boiler\t480000\tdiesel\nDiesel gensets\t320000\tdiesel"}
        className="w-full border border-line rounded-lg p-2 text-sm font-mono bg-white focus:outline-none focus:border-brand-400"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-ink-faint">{rows.length > 0 ? `${rows.length} row${rows.length === 1 ? "" : "s"} · ${matched} fuel${matched === 1 ? "" : "s"} matched` : "Nothing to import yet"}</span>
        <div className="flex gap-2">
          <button onClick={onClose} className="text-xs rounded-lg border border-line px-3 py-1.5 hover:border-brand-300">Cancel</button>
          <button
            disabled={rows.length === 0}
            onClick={() => { onImport(year, rows.map((r) => r.asset)); onClose(); }}
            className="text-xs font-semibold rounded-lg bg-brand-500 text-white px-3 py-1.5 hover:bg-brand-600 disabled:opacity-50"
          >
            Import {rows.length || ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Detail + calculation side panel — holds the "subjective" inputs
   (units, spend, life, leak rate, gas cost, system type) plus the
   live working. Inputs are pre-seeded with averages on the row.
   ============================================================ */

export function DetailPanel({ onClose, combustion, refrigerant, year }: {
  onClose: () => void;
  combustion?: CombustionAsset;
  refrigerant?: RefrigerationSystem;
  year: number;
}) {
  const title = combustion ? combustion.name : refrigerant?.name ?? "Details";
  return (
    <>
      <div className="fixed inset-0 bg-ink/20 z-40" onClick={onClose} aria-hidden />
      <aside className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-surface shadow-card-lg z-50 overflow-y-auto p-6 tab-fade">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-50 grid place-items-center text-brand-600 shrink-0"><SlidersHorizontal size={16} /></div>
            <div className="min-w-0">
              <h3 className="font-bold text-ink truncate">{title}</h3>
              <p className="text-[11px] text-ink-faint">Details &amp; calculation</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-muted grid place-items-center text-ink-soft hover:text-ink shrink-0" aria-label="Close"><X size={16} /></button>
        </div>
        {combustion && <CombustionDetails a={combustion} year={year} />}
        {refrigerant && <RefrigerantDetails s={refrigerant} year={year} />}
      </aside>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] uppercase tracking-wide text-ink-faint font-bold mb-3">{children}</div>;
}

function LabeledNum({ label, hint, value, suffix, onChange, footer }: {
  label: string; hint?: string; value: number; suffix?: string; onChange: (v: number) => void; footer?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-soft flex items-center gap-1.5">{label}{hint && <InfoTip text={hint} />}</span>
      <span className="mt-1 flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400 text-right tabular-nums"
          aria-label={label}
        />
        {suffix && <span className="text-xs text-ink-faint shrink-0 w-12">{suffix}</span>}
      </span>
      {footer && <span className="block mt-1 text-[11px] text-ink-faint">{footer}</span>}
    </label>
  );
}

export function CombustionDetails({ a, year, showCalc = true, showSource = true }: { a: CombustionAsset; year: number; showCalc?: boolean; showSource?: boolean }) {
  const { updateCombustion } = useScenario();
  const price = FUELS[a.fuelType].typicalPricePerUnit ?? 0;
  const avgOpex = Math.round(a.annualVolume * price);
  return (
    <div className="space-y-6">
      {showSource && (
      <div>
        <SectionLabel>Source</SectionLabel>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-ink-soft">Category</span>
            <select
              value={a.category}
              onChange={(e) => {
                const cat = e.target.value as CombustionAsset["category"];
                const allowed = FUELS_BY_CATEGORY[cat];
                const patch: Partial<CombustionAsset> = { category: cat };
                if (!allowed.includes(a.fuelType)) { patch.fuelType = allowed[0]; patch.unit = FUELS[allowed[0]].unit; }
                updateCombustion(year, a.id, patch);
              }}
              className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
              aria-label="Category"
            >
              <option value="stationary">Stationary</option>
              <option value="mobile">Mobile</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-soft">Fuel</span>
            <select
              value={a.fuelType}
              onChange={(e) => { const v = e.target.value as FuelId; updateCombustion(year, a.id, { fuelType: v, unit: FUELS[v].unit }); }}
              className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
              aria-label="Fuel"
            >
              {FUELS_BY_CATEGORY[a.category].map((id) => <option key={id} value={id}>{FUELS[id].label}</option>)}
            </select>
          </label>
        </div>
      </div>
      )}
      <div>
        <SectionLabel>Inputs (averaged — adjust if you have exact figures)</SectionLabel>
        <label className="block mb-4">
          <span className="text-xs font-medium text-ink-soft">Site / location</span>
          <input
            value={a.site ?? ""}
            onChange={(e) => updateCombustion(year, a.id, { site: e.target.value })}
            placeholder="e.g. Pune plant"
            className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
            aria-label="Site or location"
          />
        </label>
        <div className="mb-4 flex items-center gap-1.5 rounded-lg bg-surface-muted p-1">
          {(["metered", "spend"] as const).map((m) => {
            const on = (a.inputMode ?? "metered") === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => updateCombustion(year, a.id, { inputMode: m })}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors",
                  on ? "bg-white text-ink shadow-card" : "text-ink-soft hover:text-ink",
                )}
              >
                {m === "metered" ? "Metered volume" : "₹ Spend (estimate)"}
              </button>
            );
          })}
        </div>
        <div className="space-y-4">
          <LabeledNum
            label={`Annual spend (${CURRENCY}/yr)`} hint="Fuel cost plus related maintenance for the year. Drives payback and cost-per-tonne in the action plan."
            value={a.opex} onChange={(v) => updateCombustion(year, a.id, { opex: v })}
            footer={(a.inputMode === "spend" && price > 0) ? (
              <button type="button" onClick={() => updateCombustion(year, a.id, { annualVolume: Math.round(a.opex / price) })} className="text-brand-600 hover:underline">
                Estimate volume from spend → {fmt(Math.round(a.opex / price))} {a.unit}/yr
              </button>
            ) : price > 0 && a.opex !== avgOpex ? (
              <button type="button" onClick={() => updateCombustion(year, a.id, { opex: avgOpex })} className="text-brand-600 hover:underline">
                Use average ≈ {fmtMoney(avgOpex)} ({CURRENCY}{fmt(price)}/{a.unit})
              </button>
            ) : price > 0 ? `≈ average at ${CURRENCY}${fmt(price)}/${a.unit}` : null}
          />
          <LabeledNum
            label="Remaining life (yrs)" hint="Remaining useful life of the equipment. Guards against retrofits that would outlive the asset."
            value={a.remainingLife} suffix="years" onChange={(v) => updateCombustion(year, a.id, { remainingLife: Math.max(0, Math.round(v)) })}
          />
        </div>
      </div>
      {showCalc && (
        <div className="border-t border-line/60 pt-5">
          <SectionLabel>How this is calculated</SectionLabel>
          <CombustionCalc a={a} />
        </div>
      )}
    </div>
  );
}

function RefrigerantDetails({ s, year }: { s: RefrigerationSystem; year: number }) {
  const { updateRefrigeration } = useScenario();
  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Inputs (averaged — adjust if you have exact figures)</SectionLabel>
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-ink-soft flex items-center gap-1.5">System type <InfoTip text="Sets the recommended low-GWP swap in the Refrigerant advisor." /></span>
            <select
              value={s.systemType}
              onChange={(e) => updateRefrigeration(year, s.id, { systemType: e.target.value as RefrigerationSystem["systemType"] })}
              className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-400"
              aria-label="System type"
            >
              {(Object.keys(SYSTEM_LABELS) as RefrigerationSystem["systemType"][]).map((k) => <option key={k} value={k}>{SYSTEM_LABELS[k]}</option>)}
            </select>
          </label>
          <LabeledNum
            label="Gas cost (₹/kg)" hint="Purchase price of replacement refrigerant. Used to value the savings from cutting leaks."
            value={s.gasCostPerKg} suffix={`${CURRENCY}/kg`} onChange={(v) => updateRefrigeration(year, s.id, { gasCostPerKg: v })}
          />
        </div>
      </div>
      <div className="border-t border-line/60 pt-5">
        <SectionLabel>How this is calculated</SectionLabel>
        <RefrigerantCalc s={s} />
      </div>
    </div>
  );
}

export function CombustionCalc({ a }: { a: CombustionAsset }) {
  const bd = combustionBreakdown(a);
  return (
    <div className="space-y-5">
      <div>
        <div className="font-semibold text-ink">{bd.fuelLabel}</div>
        <div className="text-sm text-ink-soft">{fyLabel(bd.year)}</div>
      </div>
      <Inputs rows={[
        ["Volume", `${fmt(bd.volume)} ${bd.unit}/yr`],
        ["Density", `${bd.density} kg/${bd.unit}`],
        ["Calorific value (DEFRA)", `${fmt(bd.cv)} kJ/kg`],
        ["Emission factor", `${bd.ef.value} kgCO₂e/${bd.unit}`],
      ]} />
      <div><SourceNote ef={bd.ef} /></div>
      <Step n={1} title="Energy">
        <Eq>{fmt(bd.volume)} {bd.unit} × {bd.density} kg/{bd.unit} × {fmt(bd.cv)} kJ/kg</Eq>
        <Result>{fmtNum(bd.energyGJ, 1)} GJ <span className="text-ink-faint font-normal">({fmtNum(bd.energyMJ, 0)} MJ)</span></Result>
      </Step>
      <Step n={2} title={bd.renewable ? "Scope 1 emissions (CH₄ / N₂O)" : "Emissions"}>
        <Eq>{fmt(bd.volume)} {bd.unit} × {bd.ef.value} kgCO₂e/{bd.unit} ÷ 1,000</Eq>
        <Result>{fmtNum(bd.co2eT, 1)} tCO₂e</Result>
      </Step>
      {bd.renewable && bd.biogenicCO2eT > 0 && (
        <Step n={3} title="Biogenic CO₂ — reported separately">
          <Eq>{fmt(bd.volume)} {bd.unit} × biogenic factor ÷ 1,000</Eq>
          <Result>{fmtNum(bd.biogenicCO2eT, 1)} tCO₂e</Result>
        </Step>
      )}
      {bd.renewable ? (
        <p className="text-[11px] text-ink-faint leading-relaxed">
          This is a biomass fuel. Its combustion CO₂ is <strong>biogenic</strong> — under the GHG Protocol and BRSR it is
          reported separately (shown above) and excluded from gross Scope 1. Only the CH₄ and N₂O from combustion stay in Scope 1.
        </p>
      ) : (
        <p className="text-[11px] text-ink-faint leading-relaxed">Calorific value is the DEFRA reference for this fuel; the emission factor uses the DEFRA {bd.ef.sourceYear} value. Combustion CO₂e here is Scope 1.</p>
      )}
    </div>
  );
}

function RefrigerantCalc({ s }: { s: RefrigerationSystem }) {
  const bd = refrigerantBreakdown(s);
  return (
    <div className="space-y-5">
      <div>
        <div className="font-semibold text-ink">{bd.refrigerantLabel}</div>
      </div>
      <Inputs rows={[
        ["Refrigerant topped up (= leaked)", `${fmt(bd.toppedUpKg)} kg/yr`],
        ["GWP (AR5, 100-yr)", `${fmt(bd.gwp)} kgCO₂e/kg`],
      ]} />
      <Step n={1} title="Fugitive emissions (mass-balance)">
        <Eq>{fmt(bd.toppedUpKg)} kg × {fmt(bd.gwp)} GWP ÷ 1,000</Eq>
        <Result>{fmtNum(bd.co2eT, 1)} tCO₂e</Result>
      </Step>
      <p className="text-[11px] text-ink-faint leading-relaxed">When a system leaks, a technician refills it — so the refrigerant topped up over the year equals the amount that leaked to atmosphere. Emissions scale directly with the gas&apos;s GWP, so switching to a low-GWP gas is the biggest lever. See the Refrigerant advisor.</p>
    </div>
  );
}

function Inputs({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rounded-xl border border-line/70 divide-y divide-line/70">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between px-3 py-2 text-sm">
          <span className="text-ink-soft">{k}</span>
          <span className="font-semibold text-ink tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  );
}

function SourceNote({ ef }: { ef: { sourceYear: number; exact: boolean } }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1", ef.exact ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700")}>
      DEFRA {ef.sourceYear}{ef.exact ? "" : " · nearest available"}
    </span>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-md bg-ink text-white grid place-items-center text-xs font-bold shrink-0">{n}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-ink-faint font-bold">{title}</div>
        {children}
      </div>
    </div>
  );
}
function Eq({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 text-sm text-ink-soft font-mono leading-snug break-words">{children}</div>;
}
function Result({ children }: { children: React.ReactNode }) {
  return <div className="mt-1.5 flex items-center gap-1.5 text-lg font-extrabold text-ink"><ArrowRight size={14} className="text-brand-500" />{children}</div>;
}

/* ---- editable cells ---- */
const FIELD = "w-full bg-transparent rounded-md px-2 py-1.5 border border-transparent hover:border-line focus:border-brand-400 focus:bg-white focus:outline-none";

function TextCell({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} aria-label={label} />;
}
function NumCell({ value, onChange, label }: { value: number; onChange: (v: number) => void; label?: string }) {
  return <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className={`${FIELD} text-right tabular-nums`} aria-label={label} />;
}
function SelectCell({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: [string, string][]; label?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} aria-label={label}>
      {options.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
    </select>
  );
}

/** Fuel picker grouped into fossil and biomass families. */
function FuelSelect({ category, value, onChange, label }: { category: "stationary" | "mobile"; value: FuelId; onChange: (v: FuelId) => void; label?: string }) {
  const ids = FUELS_BY_CATEGORY[category];
  const fossil = ids.filter((id) => !FUELS[id].renewable);
  const biomass = ids.filter((id) => FUELS[id].renewable);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as FuelId)} className={FIELD} aria-label={label}>
      <optgroup label="Fossil fuels">
        {fossil.map((id) => <option key={id} value={id}>{FUELS[id].label}</option>)}
      </optgroup>
      <optgroup label="Biomass / renewable">
        {biomass.map((id) => <option key={id} value={id}>{FUELS[id].label}</option>)}
      </optgroup>
    </select>
  );
}

function RefrigerantSelect({ value, onChange, label }: { value: RefrigerantId; onChange: (v: RefrigerantId) => void; label?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as RefrigerantId)} className={FIELD} aria-label={label}>
      <optgroup label="Legacy (high GWP)">{REF_BY_ERA.legacy.map((r) => <option key={r.id} value={r.id}>{r.label} · GWP {r.gwp}</option>)}</optgroup>
      <optgroup label="Current (transitional)">{REF_BY_ERA.current.map((r) => <option key={r.id} value={r.id}>{r.label} · GWP {r.gwp}</option>)}</optgroup>
      <optgroup label="Future (natural / ultra-low)">{REF_BY_ERA.future.map((r) => <option key={r.id} value={r.id}>{r.label} · GWP {r.gwp}</option>)}</optgroup>
    </select>
  );
}

/** Column header with an optional (i) explainer — keeps the grid clean. */
function Th({ label, hint, align = "left" }: { label: string; hint?: string; align?: "left" | "right" }) {
  return (
    <th className={cn("font-semibold py-2 px-2", align === "right" ? "text-right" : "text-left")}>
      <span className="inline-flex items-center gap-1 align-middle">
        {label}
        {hint && <InfoTip text={hint} />}
      </span>
    </th>
  );
}
