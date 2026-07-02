/* Pathway options — three auto-built Scope 1 strategies with real numbers, so
   "Suggest a mix" isn't a single take-it-or-leave-it heuristic:
   - Quick wins: the suggestions minus the heavy-capex levers (no
     electrification, no refrigerant retrofits) — leak fixes and drop-in
     blends that start paying back fast.
   - Balanced: the full per-source suggestion engine.
   - Max reduction: the suggestions pushed to full tilt by 2030.
   Each option is scored with the real model. Pure. */

import { boardroomVariants } from "@/lib/boardroom-scenarios";
import { compute } from "./index";
import { suggestAllSettings } from "./suggest-all";
import type { CombustionAsset, LeverSettings, RefrigerationSystem } from "./types";

export interface PathwayKpis {
  reduction2030: number;
  totalCapex: number;
  costPerTonne: number;
  paybackYears: number | null;
}

export interface Pathway {
  id: "quick-wins" | "balanced" | "max";
  name: string;
  blurb: string;
  settings: LeverSettings;
  kpis: PathwayKpis;
}

const clone = (s: LeverSettings): LeverSettings => JSON.parse(JSON.stringify(s)) as LeverSettings;

export function buildPathways(
  assets: CombustionAsset[],
  systems: RefrigerationSystem[],
  current: LeverSettings,
  baseYear: number,
): Pathway[] {
  const act = assets.filter((a) => !a.excluded);
  const sys = systems.filter((s) => !s.excluded);

  const balanced = suggestAllSettings(act, sys, current);

  const quick = clone(balanced);
  for (const a of Object.values(quick.byAsset)) a.electrify.enabled = false;
  for (const s of Object.values(quick.bySystem)) s.gasSwitch.enabled = false;

  const max = boardroomVariants(balanced).find((v) => v.id === "accelerated")!.settings;

  const mk = (id: Pathway["id"], name: string, blurb: string, settings: LeverSettings): Pathway => {
    const r = compute(act, sys, settings, baseYear);
    return {
      id, name, blurb, settings,
      kpis: {
        reduction2030: r.kpis.reduction2030,
        totalCapex: r.kpis.totalCapex,
        costPerTonne: r.kpis.costPerTonne,
        paybackYears: r.kpis.paybackYears,
      },
    };
  };

  return [
    mk("quick-wins", "Quick wins", "Leak fixes and drop-in bio-blends only — lowest capex, fastest payback.", quick),
    mk("balanced", "Balanced", "The full per-source suggestions — electrify what fits, blend the rest, fix leaks.", balanced),
    mk("max", "Max reduction", "Everything at full tilt by 2030 — the deepest cut, at the biggest bill.", max),
  ];
}
