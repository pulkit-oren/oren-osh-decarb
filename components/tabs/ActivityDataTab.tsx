"use client";

import { useState } from "react";
import { useScenario } from "@/lib/store";
import { useScope2 } from "@/lib/scope2/store";
import { useEsg } from "@/lib/esg/store";
import { useCompany } from "@/lib/company/store";
import type { GoalCategory } from "@/lib/goals/types";
import { FUELS, REFRIGERANTS } from "@/lib/model/factors";
import { combustionBreakdown, combustionCO2e, refrigerantCO2e } from "@/lib/model/baseline";
import { fuelFamily, type FuelFamily } from "@/lib/activity-groups";
import { combustionGrade, refrigerantGrade, facilityGrade, confidenceOf } from "@/lib/data-quality";
import { FY_YEARS, type CombustionAsset, type FuelId, type RefrigerantId, type RefrigerantFactor } from "@/lib/model/types";
import type { Facility } from "@/lib/scope2/model/types";

import { CAT_DEFS, ELEC_TYPES, facCO2e, newId, type Nav, type CatKey, type CatDef } from "./activity/shared";
import { useBuConfig } from "./activity/useBuConfig";
import { EsgScreen } from "./activity/EsgScreen";
import { EnvironmentScreen } from "./activity/EnvironmentScreen";
import { WaterScreen } from "./activity/WaterScreen";
import { WasteScreen } from "./activity/WasteScreen";
import { HomeScreen } from "./activity/HomeScreen";
import { BusinessUnitsScreen } from "./activity/BusinessUnitsScreen";
import { CategoryScreen } from "./activity/CategoryScreen";
import { ElectricityBuScreen } from "./activity/ElectricityBuScreen";
import { SourceListScreen } from "./activity/SourceListScreen";
import { EntryScreen } from "./activity/EntryScreen";
import { ScopeScreen } from "./activity/ScopeScreen";
import { BiogenicScreen } from "./activity/BiogenicScreen";

export function ActivityDataTab({
  onOpenGoalSetup,
  initialNav = { level: "esg" },
}: {
  /** Deep link into Goals → Set up with a category preselected (wired by the Shell). */
  onOpenGoalSetup?: (category: GoalCategory) => void;
  /** Start on a specific screen — tests use this to skip the E/S/G pre-screen. */
  initialNav?: Nav;
}) {
  const s1 = useScenario();
  const s2 = useScope2();
  const esg = useEsg();
  const { activeId } = useCompany();
  const [nav, setNav] = useState<Nav>(initialNav);
  const { buReg, addBu, removeBu } = useBuConfig(activeId);

  // The Data-input picker chooses WHICH financial year you're entering data for
  // (the selected/working year), independent of the base year (set in the top
  // bar). Kept in sync across both scopes.
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

  const countOf = (key: CatKey) => key === "refrigerants" ? s1.selectedSystems.length : key === "electricity" ? s2.selectedFacilities.length : (key === "liquid" || key === "gas" || key === "solid" || key === "biofuels") ? s1.selectedAssets.filter((a) => fuelFamily(a.fuelType) === key).length : 0;

  const catTotal = (d: CatDef) => {
    if (d.kind === "electricity") {
      return s2.selectedFacilities.filter((f) => !f.excluded).reduce((s, f) => s + facCO2e(f), 0);
    }
    if (d.kind === "refrigerant") {
      return s1.selectedSystems.filter((sy) => !sy.excluded).reduce((s, sy) => s + refrigerantCO2e(sy), 0);
    }
    return s1.selectedAssets.filter((a) => !a.excluded && fuelFamily(a.fuelType) === d.key).reduce((s, a) => s + combustionCO2e(a), 0);
  };

  const refrigSysById = (id: string) => s1.selectedSystems.find((sy) => sy.id === id);

  const blankFac = (bu: string, t: { label: string; gridEf?: number }, kwh: number, aggregate: boolean): Facility => ({
    id: newId("f"), name: t.label, annualLoadKwh: kwh, tariffPerKwh: 9, loadSplit: { lightingPct: 15, motorPct: 40, hvacPct: 25 },
    roofSpaceM2: 0, peakLoadKw: 0, gridEf: t.gridEf ?? 0.71, irradiance: 1400, isolated: false, existingSolarKwp: 0, existingRenewablePct: 0,
    bu: bu || undefined, excluded: bu ? !aggregate : false,
  });

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

  const combById = (id: string) => s1.selectedAssets.find((a) => a.id === id);
  const facById = (id: string) => s2.selectedFacilities.find((f) => f.id === id);

  // ── Route ─────────────────────────────────────────────────────────────────

  if (nav.level === "esg") {
    return <EsgScreen setNav={setNav} />;
  }

  if (nav.level === "env") {
    return (
      <EnvironmentScreen
        year={year}
        setNav={setNav}
        totalCo2T={scope1T + scope2T}
        totalSources={totalSources}
        water={esg.water[year]}
        waste={esg.waste[year]}
      />
    );
  }

  if (nav.level === "water") {
    return (
      <WaterScreen
        year={year}
        setYear={setYear}
        fyYears={FY_YEARS}
        water={esg.water[year]}
        setWithdrawal={esg.setWaterWithdrawal}
        setDischarge={esg.setWaterDischarge}
        setConsumption={esg.setWaterConsumption}
        onBack={() => setNav({ level: "env" })}
        onSetGoal={() => onOpenGoalSetup?.("water")}
      />
    );
  }

  if (nav.level === "waste") {
    return (
      <WasteScreen
        year={year}
        setYear={setYear}
        fyYears={FY_YEARS}
        waste={esg.waste[year]}
        setCategory={esg.setWasteCategory}
        onBack={() => setNav({ level: "env" })}
        onSetGoal={() => onOpenGoalSetup?.("waste")}
      />
    );
  }

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
        facFor={(k) => s2.selectedFacilities.find((f) => (f.bu ?? "") === bu && f.name === ELEC_TYPES.find((e) => e.key === k)!.label)}
        updateFacility={s2.updateFacility}
        co2Fac={co2Fac}
        setNav={setNav}
      />
    );
  }

  if (nav.level === "cat") {
    const def = CAT_DEFS.find((c) => c.key === nav.key)!;
    if (def.kind === "electricity") {
      return (
        <CategoryScreen
          nav={nav}
          setNav={setNav}
          year={year}
          buReg={buReg}
          catTotal={catTotal}
          buElecEmissions={buElecEmissions}
          elecBuExcluded={elecBuExcluded}
          toggleElecCentral={toggleElecCentral}
        />
      );
    }
    // fuel or refrigerant → SourceListScreen
    return (
      <SourceListScreen
        def={def}
        buUnits={buReg.units}
        combustionAssets={s1.selectedAssets}
        refrigerationSystems={s1.selectedSystems}
        year={year}
        addCombustionAsset={s1.addCombustionAsset}
        addRefrigerationSystem={s1.addRefrigerationSystem}
        updateCombustion={s1.updateCombustion}
        updateRefrigeration={s1.updateRefrigeration}
        deleteCombustion={s1.delCombustion}
        deleteRefrigeration={s1.delRefrigeration}
        setNav={setNav}
      />
    );
  }

  if (nav.level === "scope") {
    return <ScopeScreen scope={nav.scope} s1={s1} s2={s2} year={year} onBack={() => setNav({ level: "home" })} />;
  }

  if (nav.level === "biogenic") {
    return <BiogenicScreen rows={biogenicRows} total={biogenicT} year={year} onBack={() => setNav({ level: "home" })} />;
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
