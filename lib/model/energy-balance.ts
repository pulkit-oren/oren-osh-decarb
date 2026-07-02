import { compute } from "./index";
import { combustionBreakdown, refrigerantCO2e } from "./baseline";
import { applyAssetActions, defaultActions, defaultSystemActions } from "./segments";
import { endUseProfile } from "./end-use";
import { refrigClassProfile } from "./refrigerant-class";
import { ALT_FUELS_BY_FUEL, maxBlendPctFor, RECOMMENDED_ALT_BY_SYSTEM } from "./factors";
import type { AltFuelId, CombustionAsset, LeverSettings, RefrigerationSystem } from "./types";

export interface BalanceDials { electrifyPct: number; renewablePct: number; bioBlendPct: number; refrigPct: number; }

const TARGET_YEAR = 2030;

function electrifyFeasible(a: CombustionAsset): boolean {
  const eu = endUseProfile(a);
  return eu ? eu.electrify.feasible === "easy" || eu.electrify.feasible === "yes" : true;
}
function bioAltFor(a: CombustionAsset): AltFuelId | null {
  const eu = endUseProfile(a);
  const compatible = ALT_FUELS_BY_FUEL[a.fuelType] ?? [];
  if (eu?.fuelSwitch.preferred && compatible.includes(eu.fuelSwitch.preferred)) return eu.fuelSwitch.preferred;
  return compatible[0] ?? null;
}

/** Pure: return a NEW LeverSettings with the dials cascaded onto the per-source levers. */
export function applyDials(assets: CombustionAsset[], systems: RefrigerationSystem[], base: LeverSettings, d: BalanceDials): LeverSettings {
  const byAsset = { ...base.byAsset };
  for (const a of assets) {
    const cur = byAsset[a.id] ?? defaultActions(a);
    const eu = endUseProfile(a);
    const electrify = { ...cur.electrify };
    if (d.electrifyPct > 0 && electrifyFeasible(a)) {
      electrify.enabled = true;
      electrify.targetYear = TARGET_YEAR;
      electrify.cop = eu?.electrify.cop ?? electrify.cop;
      if (a.category === "mobile") {
        electrify.unitsToConvert = Math.round(a.unitCount * (d.electrifyPct / 100));
        electrify.assetCapex = eu?.electrify.capexPerUnit ?? electrify.assetCapex;
      } else {
        electrify.capacityPct = d.electrifyPct;
      }
    } else if (d.electrifyPct === 0) {
      electrify.enabled = false;
    }
    const fuelSwitch = { ...cur.fuelSwitch };
    const alt = bioAltFor(a);
    if (d.bioBlendPct > 0 && alt) {
      fuelSwitch.enabled = true;
      fuelSwitch.altFuel = alt;
      fuelSwitch.blendPct = Math.min(d.bioBlendPct, maxBlendPctFor(a.category, alt));
      fuelSwitch.targetYear = TARGET_YEAR;
    } else if (d.bioBlendPct === 0) {
      fuelSwitch.enabled = false;
    }
    byAsset[a.id] = { ...cur, electrify, fuelSwitch };
  }
  const bySystem = { ...base.bySystem };
  for (const s of systems) {
    const cur = bySystem[s.id] ?? defaultSystemActions(s);
    const alt = refrigClassProfile(s)?.recommendedAlt ?? RECOMMENDED_ALT_BY_SYSTEM[s.systemType];
    const gasSwitch = d.refrigPct > 0
      ? { ...cur.gasSwitch, enabled: true, altRefrigerant: alt, transitionPct: d.refrigPct, targetYear: TARGET_YEAR }
      : { ...cur.gasSwitch, enabled: false };
    bySystem[s.id] = { ...cur, gasSwitch };
  }
  return { ...base, byAsset, bySystem, assumptions: { ...base.assumptions, renewableSourcingPct: d.renewablePct } };
}

/* ---------- Derived dials ----------
   The per-source levers are the single source of truth; the balance dials are
   COMPUTED from them, so fine-tuning a source in the Scope 1 planner moves the
   dial when you come back — the two views can never drift. Weighted so that
   applyDials(base, d) → deriveDials ≈ d. */

function wavg(pairs: { v: number; w: number }[]): number {
  const W = pairs.reduce((s, p) => s + p.w, 0);
  if (W <= 0) return pairs.length ? pairs.reduce((s, p) => s + p.v, 0) / pairs.length : 0;
  return pairs.reduce((s, p) => s + p.v * p.w, 0) / W;
}

export function deriveDials(assets: CombustionAsset[], systems: RefrigerationSystem[], settings: LeverSettings): BalanceDials {
  const act = assets.filter((a) => !a.excluded);
  const sys = systems.filter((s) => !s.excluded);

  const elecPairs = act.filter(electrifyFeasible).map((a) => {
    const e = settings.byAsset[a.id]?.electrify;
    const on = !!e?.enabled;
    const v = !on ? 0 : a.category === "mobile"
      ? (a.unitCount > 0 ? (e!.unitsToConvert / a.unitCount) * 100 : 0)
      : e!.capacityPct;
    return { v: Math.max(0, Math.min(100, v)), w: combustionBreakdown(a).energyGJ };
  });

  const bioPairs = act.filter((a) => bioAltFor(a)).map((a) => {
    const f = settings.byAsset[a.id]?.fuelSwitch;
    return { v: f?.enabled ? Math.max(0, Math.min(100, f.blendPct)) : 0, w: combustionBreakdown(a).energyGJ };
  });

  const refrigPairs = sys.map((s) => {
    const g = settings.bySystem[s.id]?.gasSwitch;
    return { v: g?.enabled ? Math.max(0, Math.min(100, g.transitionPct)) : 0, w: Math.max(refrigerantCO2e(s), 1e-9) };
  });

  return {
    electrifyPct: Math.round(wavg(elecPairs)),
    renewablePct: Math.round(settings.assumptions.renewableSourcingPct ?? 0),
    bioBlendPct: Math.round(wavg(bioPairs)),
    refrigPct: Math.round(wavg(refrigPairs)),
  };
}

/** Pure: approximate energy mix (GJ) for the given settings. Indicative visualization. */
export function energyMix(assets: CombustionAsset[], settings: LeverSettings): { fossilFuelGJ: number; gridElecGJ: number; renewableGJ: number } {
  let fossil = 0, elec = 0, bio = 0;
  for (const a of assets) {
    if (a.excluded) continue;
    const E = combustionBreakdown(a).energyGJ;
    const acts = settings.byAsset[a.id];
    const res = acts ? applyAssetActions(a, acts, settings.assumptions) : null;
    const eF = res?.elecFraction ?? 0;
    const fF = res?.fuelFraction ?? 0;
    elec += E * eF;
    bio += E * fF;
    fossil += E * Math.max(0, 1 - eF - fF);
  }
  const re = (settings.assumptions.renewableSourcingPct ?? 0) / 100;
  return { fossilFuelGJ: fossil, gridElecGJ: elec * (1 - re), renewableGJ: bio + elec * re };
}

/** Pure stepwise heuristic: raise dials (electrify → renewable → bio → refrigerant) until the
 *  projected 2030 reduction reaches `target` (0..1), else return the best reachable mix. */
export function suggestMix(assets: CombustionAsset[], systems: RefrigerationSystem[], base: LeverSettings, target: number, baseYear: number): BalanceDials {
  const dials: BalanceDials = { electrifyPct: 0, renewablePct: base.assumptions.renewableSourcingPct ?? 0, bioBlendPct: 0, refrigPct: 0 };
  const reductionFor = (d: BalanceDials) => compute(assets, systems, applyDials(assets, systems, base, d), baseYear).kpis.reduction2030;
  if (reductionFor(dials) >= target) return dials;
  const order: (keyof BalanceDials)[] = ["electrifyPct", "renewablePct", "bioBlendPct", "refrigPct"];
  for (const key of order) {
    for (let v = 10; v <= 100; v += 10) {
      dials[key] = v;
      if (reductionFor(dials) >= target) return dials;
    }
  }
  return dials;
}
