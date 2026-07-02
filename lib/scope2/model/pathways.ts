/* Scope 2 pathway options — three auto-built strategies, scored with the real
   model:
   - Efficiency first: suggestions minus solar — the lowest-capex start.
   - Balanced: full suggestions (efficiency + roof-fitting solar).
   - RE100 sprint: suggestions plus procurement to 100% of the remaining
     grid draw by 2030 — the deepest market-based cut, mostly OPEX.
   Pure. */

import { computeScope2 } from "./index";
import { suggestAllScope2 } from "./suggest-all";
import type { Facility, Scope2Levers } from "./types";

export interface Scope2PathwayKpis {
  reduction2030: number;
  totalCapex: number;
  annualOpexDelta: number;
  marketNowT: number;
}

export interface Scope2Pathway {
  id: "efficiency-first" | "balanced" | "re100";
  name: string;
  blurb: string;
  levers: Scope2Levers;
  kpis: Scope2PathwayKpis;
}

const clone = (l: Scope2Levers): Scope2Levers => JSON.parse(JSON.stringify(l)) as Scope2Levers;

export function buildScope2Pathways(
  facilities: Facility[],
  current: Scope2Levers,
  baseYear: number,
): Scope2Pathway[] {
  const fac = facilities.filter((f) => !f.excluded);
  const balanced = suggestAllScope2(fac, current);

  const effFirst = clone(balanced);
  for (const a of Object.values(effFirst.byFacility)) {
    if (a) a.generation.enabled = false;
  }

  const re100 = clone(balanced);
  re100.procurement = {
    ...re100.procurement,
    enabled: true,
    ppaPct: 100,
    startYear: Math.min(baseYear + 1, 2030),
    targetYear: 2030,
  };

  const mk = (id: Scope2Pathway["id"], name: string, blurb: string, levers: Scope2Levers): Scope2Pathway => {
    const r = computeScope2(fac, levers, baseYear);
    return {
      id, name, blurb, levers,
      kpis: {
        reduction2030: r.kpis.reduction2030,
        totalCapex: r.kpis.totalCapex,
        annualOpexDelta: r.kpis.annualOpexDelta,
        marketNowT: r.marketNowT,
      },
    };
  };

  return [
    mk("efficiency-first", "Efficiency first", "LED, motors and BMS only — the lowest-capex start, savings from day one.", effFirst),
    mk("balanced", "Balanced", "The full suggestions — efficiency plus solar wherever the roof allows.", balanced),
    mk("re100", "RE100 sprint", "Suggestions plus PPAs covering the rest of the grid draw by 2030 — deepest market-based cut, mostly OPEX.", re100),
  ];
}
