import { FAMILY_COLORS } from "@/lib/model/factors";

export interface MaccBar {
  id: string; label: string; color: string;
  x: number; width: number; costPerTonne: number; abatementT: number;
}

interface LeverLike { id: string; label: string; colorIdx: number; costPerTonne: number; abatementT: number }

export function maccLayout(levers: LeverLike[]): { bars: MaccBar[]; totalT: number; maxCost: number; minCost: number } {
  const sorted = [...levers].filter((l) => l.abatementT > 0).sort((a, b) => a.costPerTonne - b.costPerTonne);
  let x = 0;
  const bars: MaccBar[] = sorted.map((l) => {
    const bar: MaccBar = {
      id: l.id, label: l.label, color: FAMILY_COLORS[l.colorIdx] ?? "#1F9E5A",
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
  };
}
