import { familyColor } from "@/lib/model/palette";

export interface MaccBar {
  id: string; label: string; color: string;
  x: number; width: number; costPerTonne: number; abatementT: number;
}

interface LeverLike { id: string; label: string; colorIdx: number; costPerTonne: number; abatementT: number }

export function maccLayout(levers: LeverLike[]): { bars: MaccBar[]; totalT: number; maxCost: number; minCost: number; unpriced: string[] } {
  // `abatementT > 0` is NOT enough to guarantee a finite cost any more. It used
  // to be: Infinity meant zero discounted tonnes, which meant the same field
  // this filters on. Netting electrification's Scope 2 spill out of the finance
  // denominator split the two apart, so a lever can abate gross tonnes and
  // still divide its money by zero.
  //
  // This has to be excluded, and one exclusion is enough to matter: `maxCost`
  // below takes Math.max over the costs, so a single Infinity makes the span
  // infinite and every OTHER bar's geometry NaN. The whole chart, for one lever.
  const priced = [...levers].filter((l) => l.abatementT > 0 && Number.isFinite(l.costPerTonne));
  const unpriced = levers
    .filter((l) => l.abatementT > 0 && !Number.isFinite(l.costPerTonne))
    .map((l) => l.label);
  const sorted = priced.sort((a, b) => a.costPerTonne - b.costPerTonne);
  let x = 0;
  const bars: MaccBar[] = sorted.map((l) => {
    const bar: MaccBar = {
      id: l.id, label: l.label, color: familyColor(l.colorIdx),
      x, width: l.abatementT, costPerTonne: l.costPerTonne, abatementT: l.abatementT,
    };
    x += l.abatementT;
    return bar;
  });
  const costs = sorted.map((l) => l.costPerTonne);
  return {
    bars,
    totalT: x,
    maxCost: costs.length ? Math.max(...costs, 0) : 0,
    minCost: costs.length ? Math.min(...costs, 0) : 0,
    // Returned, not swallowed. A lever the user switched on that vanishes from
    // the chart with no explanation is the same class of defect as an em dash
    // standing for two opposite outcomes.
    unpriced,
  };
}
