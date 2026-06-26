import { ALT_FUELS, ALT_FUELS_BY_FUEL, maxBlendPctFor, REFRIGERANTS, RECOMMENDED_ALT_BY_SYSTEM } from "./factors";
import { endUseProfile } from "./end-use";
import { refrigClassProfile } from "./refrigerant-class";
import type { AltFuelId, AssetActions, CombustionAsset, RefrigerationSystem, SystemActions } from "./types";

export type LeverKind = "electrify" | "fuelSwitch" | "flexFuel" | "gasSwitch" | "leakFix";
export interface SuggestedAction { lever: LeverKind; patch: Record<string, number | string | boolean>; }
export interface Suggestion {
  headline: string;
  why: string;
  actions: SuggestedAction[];
  altHeadline?: string;
  altActions?: SuggestedAction[];
}

const TARGET_YEAR = 2030;

export function suggestForAsset(asset: CombustionAsset): Suggestion {
  const eu = endUseProfile(asset);
  const isMobile = asset.category === "mobile";
  const compatible = ALT_FUELS_BY_FUEL[asset.fuelType] ?? [];
  const altFuel: AltFuelId | null =
    eu?.fuelSwitch.preferred && compatible.includes(eu.fuelSwitch.preferred) ? eu.fuelSwitch.preferred : (compatible[0] ?? null);
  const maxBlend = altFuel ? maxBlendPctFor(asset.category, altFuel) : 0;
  const halfUnits = Math.max(1, Math.round(asset.unitCount * 0.5));

  const electrifyAction = (): SuggestedAction =>
    isMobile
      ? { lever: "electrify", patch: { enabled: true, unitsToConvert: halfUnits, cop: eu?.electrify.cop ?? 3, assetCapex: eu?.electrify.capexPerUnit ?? 0, targetYear: TARGET_YEAR } }
      : { lever: "electrify", patch: { enabled: true, capacityPct: eu?.electrify.capacityHint ?? 60, cop: eu?.electrify.cop ?? 3, targetYear: TARGET_YEAR } };
  const fuelSwitchAction = (): SuggestedAction | null =>
    altFuel ? { lever: "fuelSwitch", patch: { enabled: true, altFuel, blendPct: maxBlend, targetYear: TARGET_YEAR } } : null;

  const electrifyFeasible = eu ? eu.electrify.feasible === "easy" || eu.electrify.feasible === "yes" : true;
  const electrifyHard = eu ? eu.electrify.feasible === "hard" || eu.electrify.feasible === "no" : false;

  if (electrifyFeasible) {
    const fs = fuelSwitchAction();
    return {
      headline: isMobile
        ? `Electrify ${halfUnits} of ${asset.unitCount} vehicles by ${TARGET_YEAR}`
        : `Electrify ${eu?.electrify.capacityHint ?? 60}% of this asset by ${TARGET_YEAR}`,
      why: eu?.electrify.note ?? "Electrification is the primary lever for this equipment.",
      actions: [electrifyAction()],
      altHeadline: fs ? `Or run ${ALT_FUELS[altFuel!].label} at ${maxBlend}% now (drop-in)` : undefined,
      altActions: fs ? [fs] : undefined,
    };
  }

  const fs = fuelSwitchAction();
  if (fs) {
    return {
      headline: `Run ${ALT_FUELS[altFuel!].label} at ${maxBlend}% (drop-in) by ${TARGET_YEAR}`,
      why: eu?.fuelSwitch.note ?? "A bio-blend is the near-term lever; electrification is limited for this equipment.",
      actions: [fs],
      altHeadline: electrifyHard ? undefined : "Or electrify over the longer term",
      altActions: electrifyHard ? undefined : [electrifyAction()],
    };
  }
  return {
    headline: `Electrify where feasible by ${TARGET_YEAR}`,
    why: "No drop-in bio fuel for this fuel — consider electrification (or CNG / biomass).",
    actions: [electrifyAction()],
  };
}

export function suggestForSystem(system: RefrigerationSystem): Suggestion {
  const cls = refrigClassProfile(system);
  const alt = cls?.recommendedAlt ?? RECOMMENDED_ALT_BY_SYSTEM[system.systemType];
  const leak: SuggestedAction = { lever: "leakFix", patch: { enabled: true, leakImprovementPct: 50 } };
  return {
    headline: `Switch to ${REFRIGERANTS[alt].label} (60% by ${TARGET_YEAR}) + cut leaks 50%`,
    why: cls?.note ?? "A low-GWP swap plus leak reduction is the standard refrigerant pathway.",
    actions: [{ lever: "gasSwitch", patch: { enabled: true, altRefrigerant: alt, transitionPct: 60, targetYear: TARGET_YEAR } }, leak],
    altHeadline: "Or start with leak reduction (50%) — the cheapest win",
    altActions: [leak],
  };
}

export function capexForAsset(asset: CombustionAsset, acts: AssetActions): number {
  let c = 0;
  if (acts.electrify.enabled) c += acts.electrify.assetCapex * (asset.category === "mobile" ? acts.electrify.unitsToConvert : 1);
  if (acts.fuelSwitch.enabled) c += acts.fuelSwitch.retrofitCapex;
  if (asset.category === "mobile" && acts.flexFuel?.enabled) c += acts.flexFuel.vehicleCapex * acts.flexFuel.unitsToConvert;
  return c;
}
export function capexForSystem(acts: SystemActions): number {
  return acts.gasSwitch.enabled && acts.gasSwitch.transitionPct > 0 ? acts.gasSwitch.retrofitCapex : 0;
}

export const electrifyTip = (isMobile: boolean) =>
  isMobile
    ? "EVs suit depot / return-to-base routes; an EV uses about a third of the energy (COP ~3)."
    : "Heat pump COP ≈3; an electric boiler is 1. High-temp processes are hard to electrify.";
export const fuelSwitchTip = (altLabel: string, maxBlend: number, category: string) =>
  `${altLabel} drop-in limit is ${maxBlend}% on existing ${category} equipment.`;
export const flexFuelTip = () =>
  "Flex-fuel vehicles run high blends (E85/B100) beyond the drop-in limit — counted per vehicle.";
export const gasSwitchTip = (altLabel: string, gwp: number) =>
  `${altLabel} · GWP ${gwp}. Naturals (R-290 / R-717 / R-744) need less charge but have charge & safety limits.`;
export const leakFixTip = () => "Maintenance & monitoring — usually the cheapest first win.";
