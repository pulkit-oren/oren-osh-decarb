export type Grade = "measured" | "estimated" | "missing";

export function combustionGrade(a: { annualVolume: number; inputMode?: "metered" | "spend" }): Grade {
  if (!(a.annualVolume > 0)) return "missing";
  return a.inputMode === "spend" ? "estimated" : "measured";
}

export function refrigerantGrade(s: { toppedUpKg: number }): Grade {
  return s.toppedUpKg > 0 ? "measured" : "missing";
}

export function facilityGrade(f: { annualLoadKwh: number }): Grade {
  return f.annualLoadKwh > 0 ? "measured" : "missing";
}

export interface Confidence {
  measuredT: number;
  estimatedT: number;
  missingCount: number;
  totalT: number;
  measuredPct: number;
  estimatedPct: number;
  missingPct: number;
  label: "good" | "fair" | "low";
}

export function confidenceOf(sources: { grade: Grade; co2eT: number }[]): Confidence {
  let measuredT = 0, estimatedT = 0, missingCount = 0;
  for (const s of sources) {
    if (s.grade === "measured") measuredT += s.co2eT;
    else if (s.grade === "estimated") estimatedT += s.co2eT;
    else missingCount += 1;
  }
  const totalT = measuredT + estimatedT;
  const measuredPct = totalT > 0 ? measuredT / totalT : 0;
  const estimatedPct = totalT > 0 ? estimatedT / totalT : 0;
  const label: Confidence["label"] = measuredPct >= 0.8 ? "good" : measuredPct >= 0.5 ? "fair" : "low";
  return { measuredT, estimatedT, missingCount, totalT, measuredPct, estimatedPct, missingPct: 0, label };
}
