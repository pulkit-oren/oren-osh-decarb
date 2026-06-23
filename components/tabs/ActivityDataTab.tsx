"use client";

import { useState } from "react";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import { useCompany } from "@/lib/company/store";
import { FUELS, REFRIGERANTS } from "@/lib/model/factors";
import { combustionBreakdown, combustionCO2e, refrigerantCO2e } from "@/lib/model/baseline";
import { fuelFamily, type FuelFamily } from "@/lib/activity-groups";
import { combustionGrade, refrigerantGrade, facilityGrade, confidenceOf } from "@/lib/data-quality";
import { FY_YEARS, type CombustionAsset, type FuelId, type RefrigerantId, type RefrigerantFactor } from "@/lib/model/types";
import type { Facility } from "@/lib/scope2/model/types";

import { CAT_DEFS, ELEC_TYPES, facCO2e, newId, type Nav, type CatKey, type CatDef } from "./activity/shared";
import { useBuConfig } from "./activity/useBuConfig";
import { HomeScreen } from "./activity/HomeScreen";
import { BusinessUnitsScreen } from "./activity/BusinessUnitsScreen";
import { CategoryScreen } from "./activity/CategoryScreen";
import { ElectricityBuScreen } from "./activity/ElectricityBuScreen";
import { TypeScreen } from "./activity/TypeScreen";
import { EntryScreen } from "./activity/EntryScreen";
import { ScopeScreen } from "./activity/ScopeScreen";

export function ActivityDataTab() {
  const s1 = useScenario();
  const s2 = useScope2();
  const { activeId } = useCompany();
  const [nav, setNav] = useState<Nav>({ level: "home" });
  const { buReg, addBu, removeBu, setMode } = useBuConfig(activeId);

  const year = s1.selectedYear;
  const setYear = (y: number) => { s1.setSelectedYear(y); s2.setSelectedYear(y); };

  const b1 = s1.selectedBaseline;
  const b2 = s2.selectedBaseline;
  const co2Ref = (id: string) => b1.perRefrigeration.find((p) => p.id === id)?.co2eT ?? 0;
  const co2Fac = (id: string) => b2.perFacility.find((p) => p.id === id)?.locationT ?? 0;

  const scope1T = b1.totalT, scope2T = b2.totalLocationT;

  const biogenicRows = s1.selectedAssets.map((a) => ({ a, t: combustionBreakdown(a).biogenicCO2eT })).filter((x) => x.t > 0);
  const biogenicT = biogenicRows.reduce((s, x) => s + x.t, 0);

  const confidence = confidenceOf([
    ...s1.selectedAssets.map((a) => ({ grade: combustionGrade(a), co2eT: combustionCO2e(a) })),
    ...s1.selectedSystems.map((sy) => ({ grade: refrigerantGrade(sy), co2eT: co2Ref(sy.id) })),
    ...s2.selectedFacilities.map((f) => ({ grade: facilityGrade(f), co2eT: facCO2e(f) })),
  ]);
  const totalSources = s1.selectedAssets.length + s1.selectedSystems.length + s2.selectedFacilities.length;

  const openCat = (key: CatKey) => { setNav({ level: "cat", key }); };

  const assetsByFamily = (fam: FuelFamily) => s1.selectedAssets.filter((a) => fuelFamily(a.fuelType) === fam);
  const fuelsInFamily = (fam: FuelFamily) => (Object.keys(FUELS) as FuelId[]).filter((id) => fuelFamily(id) === fam).map((id) => ({ id, label: FUELS[id].label }));
  const countOf = (key: CatKey) => key === "refrigerants" ? s1.selectedSystems.length : key === "electricity" ? s2.selectedFacilities.length : (key === "liquid" || key === "gas" || key === "solid" || key === "biofuels") ? assetsByFamily(key).length : 0;

  // Gases from the Excel workbook (inExcel: true)
  const refrigGases = (Object.values(REFRIGERANTS) as RefrigerantFactor[])
    .filter((r) => r.inExcel)
    .map((r) => ({ key: r.id, label: r.label, gwp: r.gwp }));

  const typesFor = (d: CatDef): { key: string; label: string; gridEf?: number; gwp?: number }[] =>
    d.kind === "refrigerant"
      ? refrigGases
      : d.kind === "electricity"
      ? ELEC_TYPES.map((t) => ({ key: t.key, label: t.label, gridEf: t.gridEf }))
      : fuelsInFamily(d.key as FuelFamily).map((f) => ({ key: f.id, label: f.label }));

  const blankFac = (bu: string, t: { label: string; gridEf?: number }, kwh: number, aggregate: boolean): Facility => ({
    id: newId("f"), name: t.label, annualLoadKwh: kwh, tariffPerKwh: 9, loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
    roofSpaceM2: 0, peakLoadKw: 0, gridEf: t.gridEf ?? 0.71, irradiance: 1400, isolated: false, existingSolarKwp: 0, existingRenewablePct: 0,
    bu: bu || undefined, excluded: bu ? !aggregate : false,
  });

  const typeAggTotal = (d: CatDef, t: { key: string; label: string }, cat?: "stationary" | "mobile") =>
    d.kind === "refrigerant"
      ? s1.selectedSystems.filter((sy) => !sy.excluded && sy.refrigerant === (t.key as RefrigerantId)).reduce((s, sy) => s + refrigerantCO2e(sy), 0)
      : d.kind === "electricity"
      ? s2.selectedFacilities.filter((f) => !f.excluded && f.name === t.label).reduce((s, f) => s + facCO2e(f), 0)
      : s1.selectedAssets.filter((a) => !a.excluded && a.fuelType === (t.key as FuelId) && (!cat || a.category === cat)).reduce((s, a) => s + combustionCO2e(a), 0);

  const catTotal = (d: CatDef) => typesFor(d).reduce((s, t) => s + typeAggTotal(d, t), 0);

  const refrigSysById = (id: string) => s1.selectedSystems.find((sy) => sy.id === id);

  const entryFor = (d: CatDef, t: { key: string; label: string }, cat: "stationary" | "mobile" | undefined, bu: string): CombustionAsset | Facility | undefined =>
    d.kind === "electricity"
      ? s2.selectedFacilities.find((f) => (f.bu ?? "") === bu && f.name === t.label)
      : d.kind === "refrigerant"
      ? undefined  // refrigerant entries are looked up via refrigSysById path
      : s1.selectedAssets.find((a) => (a.bu ?? "") === bu && a.fuelType === (t.key as FuelId) && (!cat || a.category === cat));

  const emOfEntry = (d: CatDef, ex: CombustionAsset | Facility | undefined) =>
    !ex ? 0 : d.kind === "electricity" ? facCO2e(ex as Facility) : combustionCO2e(ex as CombustionAsset);

  const nWithData = (d: CatDef, t: { key: string; label: string }, cat?: "stationary" | "mobile") =>
    d.kind === "refrigerant"
      ? buReg.units.filter((u) => s1.selectedSystems.some((sy) => (sy.bu ?? "") === u.name && sy.refrigerant === (t.key as RefrigerantId))).length
      : buReg.units.filter((u) => entryFor(d, t, cat, u.name)).length;

  // Returns the refrigeration system id for (gasId, bu), creating it if missing.
  const ensureRefrigEntry = (gasId: RefrigerantId, bu: string, agg: boolean): string => {
    const ex = s1.selectedSystems.find((sy) => (sy.bu ?? "") === bu && sy.refrigerant === gasId);
    if (ex) return ex.id;
    const id = newId("r");
    s1.addRefrigerationSystem(year, {
      id,
      name: bu ? `${REFRIGERANTS[gasId].label} — ${bu}` : REFRIGERANTS[gasId].label,
      systemType: "commercialHVAC",
      refrigerant: gasId,
      toppedUpKg: 0,
      gasCostPerKg: 900,
      bu: bu || undefined,
      excluded: bu ? !agg : false,
    });
    return id;
  };

  // Returns the entry id for (type, category, bu), creating it if missing WITHOUT navigating.
  const ensureEntry = (d: CatDef, t: { key: string; label: string; gridEf?: number }, cat: "stationary" | "mobile" | undefined, bu: string, agg: boolean): string => {
    const fuelId = t.key as FuelId;
    const ex = s1.selectedAssets.find((a) => (a.bu ?? "") === bu && a.fuelType === fuelId && (!cat || a.category === cat));
    if (ex) return ex.id;
    const id = newId("c");
    s1.addCombustionAsset(year, { id, name: bu ? `${FUELS[fuelId].label} — ${bu}` : FUELS[fuelId].label, category: cat ?? "stationary", fuelType: fuelId, unit: FUELS[fuelId].unit, annualVolume: 0, opex: 0, remainingLife: 10, unitCount: 1, bu: bu || undefined, excluded: bu ? !agg : false });
    return id;
  };

  // Find/create the (BU, instrument) facility; returns its id. Does not navigate.
  const ensureFacility = (bu: string, instrumentKey: string, agg: boolean): string => {
    const t = ELEC_TYPES.find((e) => e.key === instrumentKey)!;
    let ex = s2.selectedFacilities.find((f) => (f.bu ?? "") === bu && f.name === t.label);
    if (!ex) { const rec = blankFac(bu, { label: t.label, gridEf: t.gridEf }, 0, agg); s2.addFacilityRecord(year, rec); ex = rec; }
    return ex.id;
  };
  const buElecFacilities = (bu: string) => s2.selectedFacilities.filter((f) => (f.bu ?? "") === bu && ELEC_TYPES.some((e) => e.label === f.name));
  const buElecEmissions = (bu: string) => buElecFacilities(bu).filter((f) => !f.excluded).reduce((s, f) => s + facCO2e(f), 0);
  const elecBuExcluded = (bu: string) => { const fs = buElecFacilities(bu); return fs.length > 0 && fs.every((f) => f.excluded); };
  // Toggle central for all 4 of a BU's electricity records together.
  const toggleElecCentral = (bu: string, agg: boolean) => {
    ELEC_TYPES.forEach((t) => {
      const id = ensureFacility(bu, t.key, agg);
      const cur = facById(id) ?? { excluded: !agg };
      s2.updateFacility(year, id, { excluded: !cur.excluded });
    });
  };

  const openEntry = (d: CatDef, t: { key: string; label: string; gridEf?: number }, cat: "stationary" | "mobile" | undefined, bu: string, agg: boolean) => {
    const id = ensureEntry(d, t, cat, bu, agg);
    setNav({ level: "entry", kind: d.kind === "electricity" ? "facility" : "combustion", id });
  };

  const combById = (id: string) => s1.selectedAssets.find((a) => a.id === id);
  const facById = (id: string) => s2.selectedFacilities.find((f) => f.id === id);

  // ── Route ─────────────────────────────────────────────────────────────────

  if (nav.level === "entry") {
    return (
      <EntryScreen
        nav={nav}
        setNav={setNav}
        year={year}
        combById={combById}
        facById={facById}
        refrigSysById={refrigSysById}
        updateCombustion={s1.updateCombustion}
        updateFacility={s2.updateFacility}
        updateRefrigeration={s1.updateRefrigeration}
        co2Fac={co2Fac}
      />
    );
  }

  if (nav.level === "bus") {
    return (
      <BusinessUnitsScreen
        setNav={setNav}
        buReg={buReg}
        addBu={addBu}
        removeBu={removeBu}
        setMode={setMode}
      />
    );
  }

  if (nav.level === "type") {
    return (
      <TypeScreen
        nav={nav}
        setNav={setNav}
        buReg={buReg}
        year={year}
        typesFor={typesFor}
        typeAggTotal={typeAggTotal}
        entryFor={entryFor}
        emOfEntry={emOfEntry}
        openEntry={openEntry}
        ensureEntry={ensureEntry}
        ensureRefrigEntry={ensureRefrigEntry}
        combById={combById}
        refrigSysById={refrigSysById}
        selectedSystems={s1.selectedSystems}
        updateCombustion={s1.updateCombustion}
        updateRefrigeration={s1.updateRefrigeration}
      />
    );
  }

  if (nav.level === "elecbu") {
    const bu = nav.bu;
    const agg = bu ? (buReg.units.find((u) => u.name === bu)?.aggregate ?? true) : true;
    return (
      <ElectricityBuScreen
        bu={bu}
        year={year}
        ensureFacility={(k) => ensureFacility(bu, k, agg)}
        facById={facById}
        updateFacility={s2.updateFacility}
        co2Fac={co2Fac}
        setNav={setNav}
      />
    );
  }

  if (nav.level === "cat") {
    return (
      <CategoryScreen
        nav={nav}
        setNav={setNav}
        year={year}
        buReg={buReg}
        typesFor={typesFor}
        typeAggTotal={typeAggTotal}
        catTotal={catTotal}
        nWithData={nWithData}
        refrigGases={refrigGases}
        buElecEmissions={buElecEmissions}
        elecBuExcluded={elecBuExcluded}
        toggleElecCentral={toggleElecCentral}
      />
    );
  }

  if (nav.level === "scope") {
    return <ScopeScreen scope={nav.scope} s1={s1} s2={s2} year={year} onBack={() => setNav({ level: "home" })} />;
  }

  // home
  return (
    <HomeScreen
      year={year}
      setYear={setYear}
      fyYears={FY_YEARS}
      nav={nav}
      setNav={setNav}
      openCat={openCat}
      countOf={countOf}
      catTotal={catTotal}
      scope1T={scope1T}
      scope2T={scope2T}
      biogenicRows={biogenicRows}
      biogenicT={biogenicT}
      confidence={confidence}
      totalSources={totalSources}
      buReg={buReg}
    />
  );
}
