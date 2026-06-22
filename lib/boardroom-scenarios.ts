import type { LeverSettings } from "@/lib/model/types";

export interface BoardroomVariant { id: string; name: string; settings: LeverSettings }

function clone(s: LeverSettings): LeverSettings {
  return JSON.parse(JSON.stringify(s)) as LeverSettings;
}

export function boardroomVariants(settings: LeverSettings): BoardroomVariant[] {
  const bau = clone(settings);
  for (const a of Object.values(bau.byAsset)) {
    a.electrify.enabled = false;
    a.fuelSwitch.enabled = false;
    if (a.flexFuel) a.flexFuel.enabled = false;
  }
  for (const sy of Object.values(bau.bySystem)) {
    sy.gasSwitch.enabled = false;
    sy.leakFix.enabled = false;
  }

  const acc = clone(settings);
  for (const a of Object.values(acc.byAsset)) {
    if (a.electrify.enabled) {
      a.electrify.capacityPct = 100;
      a.electrify.targetYear = Math.min(a.electrify.targetYear, 2030);
    }
    if (a.fuelSwitch.enabled) {
      a.fuelSwitch.blendPct = Math.min(100, Math.round(a.fuelSwitch.blendPct * 1.3));
      a.fuelSwitch.targetYear = Math.min(a.fuelSwitch.targetYear, 2030);
    }
    if (a.flexFuel?.enabled) {
      a.flexFuel.targetYear = Math.min(a.flexFuel.targetYear, 2030);
    }
  }
  for (const sy of Object.values(acc.bySystem)) {
    if (sy.gasSwitch.enabled) {
      sy.gasSwitch.transitionPct = 100;
      sy.gasSwitch.targetYear = Math.min(sy.gasSwitch.targetYear, 2030);
    }
    if (sy.leakFix.enabled) {
      sy.leakFix.leakImprovementPct = Math.max(sy.leakFix.leakImprovementPct, 60);
      sy.leakFix.targetYear = Math.min(sy.leakFix.targetYear, 2030);
    }
  }

  return [
    { id: "bau", name: "Business as usual", settings: bau },
    { id: "balanced", name: "Current plan", settings: clone(settings) },
    { id: "accelerated", name: "Accelerated", settings: acc },
  ];
}
