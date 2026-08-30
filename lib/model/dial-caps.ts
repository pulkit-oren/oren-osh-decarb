/* ============================================================
   What a dial can actually reach.

   The balance dials run 0–100%. The engine does not honour that:

     - bio-blend writes `Math.min(dial, maxBlendPctFor(category, fuel))`, so
       dragging a vehicle fleet to 80% silently produces B20;
     - electrification skips any source whose end use is not electrifiable,
       so a dial at 100% may move a fraction of the fuel and nothing says
       which fraction;
     - solar is already expressed as a share of roof headroom, which is
       correct and completely unstated — 100% there means the roof is full,
       not that the site runs on sunshine.

   The consequence is the same in all three cases and it is the worst kind:
   drag further, nothing happens, no explanation. The user concludes the
   model is unresponsive rather than that reality is constrained.

   Every number needed to say so is already in the engine. This computes it
   so a control can draw its own ceiling.
   ============================================================ */

import { combustionCO2e } from "./baseline";
import { ALT_FUELS_BY_FUEL, maxBlendPctFor } from "./factors";
import { END_USES } from "./end-use";
import type { AltFuelId, CombustionAsset } from "./types";

export interface DialCap {
  /** The furthest the dial can travel and still change the answer, 0..100. */
  maxPct: number;
  /** Why, in the user's words. Empty when the dial is genuinely unconstrained. */
  reason: string;
  /** True when the ceiling is below 100 — the control should draw it. */
  constrained: boolean;
}

const UNCAPPED: DialCap = { maxPct: 100, reason: "", constrained: false };

function endUseOf(a: CombustionAsset) {
  return a.endUse ? END_USES[a.endUse] : undefined;
}

/** Mirrors lib/model/energy-balance.ts — a source is electrifiable when its end
 *  use says so, and an unspecified end use is optimistically assumed to be. */
function electrifiable(a: CombustionAsset): boolean {
  const eu = endUseOf(a);
  return eu ? eu.electrify.feasible === "easy" || eu.electrify.feasible === "yes" : true;
}

function bioAltFor(a: CombustionAsset): AltFuelId | null {
  const eu = endUseOf(a);
  const compatible = ALT_FUELS_BY_FUEL[a.fuelType] ?? [];
  if (eu?.fuelSwitch.preferred && compatible.includes(eu.fuelSwitch.preferred)) return eu.fuelSwitch.preferred;
  return compatible[0] ?? null;
}

/**
 * The bio-blend ceiling across the sources the dial actually moves.
 *
 * Weighted by EMISSIONS, not by source count: a dial that reads "capped at 20%"
 * because one tiny petrol van cannot take more, while the boiler carrying most
 * of the footprint could take 100%, would be telling the truth about the wrong
 * thing. The weighted figure is the blend the plan as a whole can reach.
 */
export function bioBlendCap(assets: CombustionAsset[]): DialCap {
  const eligible = assets.filter((a) => bioAltFor(a) !== null);
  if (eligible.length === 0) {
    return { maxPct: 0, reason: "No source here can take a bio blend.", constrained: true };
  }

  let weight = 0, weighted = 0, lowest = 100;
  for (const a of eligible) {
    const alt = bioAltFor(a)!;
    const cap = maxBlendPctFor(a.category, alt);
    const w = Math.max(combustionCO2e(a), 0);
    weight += w;
    weighted += cap * w;
    lowest = Math.min(lowest, cap);
  }
  const maxPct = weight > 0 ? Math.round(weighted / weight) : Math.round(lowest);
  if (maxPct >= 100) return UNCAPPED;

  const mobileCapped = eligible.some((a) => a.category === "mobile" && maxBlendPctFor(a.category, bioAltFor(a)!) < 100);
  return {
    maxPct,
    constrained: true,
    reason: mobileCapped
      ? `Drop-in blends cap out here — beyond this needs flex-fuel vehicles, which is a purchase rather than a blend.`
      : `The burners on these sources cap out at this blend without a retrofit.`,
  };
}

/** The share of fuel emissions sitting on sources that can be electrified at
 *  all. A dial at 100% cannot move the rest, whatever it says. */
export function electrifyCap(assets: CombustionAsset[]): DialCap {
  const total = assets.reduce((s, a) => s + Math.max(combustionCO2e(a), 0), 0);
  if (total <= 0) return UNCAPPED;
  const reachable = assets.filter(electrifiable).reduce((s, a) => s + Math.max(combustionCO2e(a), 0), 0);
  const sharePct = Math.round((reachable / total) * 100);
  if (sharePct >= 100) return UNCAPPED;

  const blocked = assets.filter((a) => !electrifiable(a));
  const names = blocked.slice(0, 2).map((a) => a.name).join(", ");
  return {
    // The dial itself still travels to 100 — it is a share of what CAN be
    // electrified. What is capped is the abatement, so that is what is named.
    maxPct: 100,
    constrained: true,
    reason:
      `${sharePct}% of this fuel sits on sources that can be electrified. ` +
      `The rest (${names}${blocked.length > 2 ? `, +${blocked.length - 2} more` : ""}) has no commercial electric route, ` +
      `so the dial cannot reach it.`,
  };
}

/** Solar is already a share of roof headroom. True, useful, and never said. */
export function solarCapNote(totalRoofKwp: number, existingKwp: number): DialCap {
  const headroom = Math.max(0, totalRoofKwp - existingKwp);
  if (headroom <= 0) {
    return { maxPct: 0, constrained: true, reason: "The roof is already full — no headroom for new panels." };
  }
  return {
    maxPct: 100,
    constrained: false,
    reason: `100% here means the roof is full — ${Math.round(headroom).toLocaleString("en-IN")} kWp of headroom, not the whole site's demand.`,
  };
}
