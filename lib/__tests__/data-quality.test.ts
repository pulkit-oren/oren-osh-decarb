import { describe, expect, it } from "vitest";
import { combustionGrade, refrigerantGrade, facilityGrade, confidenceOf } from "../data-quality";

describe("grades", () => {
  it("metered volume is measured; spend is estimated; zero is missing", () => {
    expect(combustionGrade({ annualVolume: 100 })).toBe("measured");
    expect(combustionGrade({ annualVolume: 100, inputMode: "metered" })).toBe("measured");
    expect(combustionGrade({ annualVolume: 100, inputMode: "spend" })).toBe("estimated");
    expect(combustionGrade({ annualVolume: 0, inputMode: "spend" })).toBe("missing");
  });
  it("refrigerant is measured when topped-up, else missing", () => {
    expect(refrigerantGrade({ toppedUpKg: 5 })).toBe("measured");
    expect(refrigerantGrade({ toppedUpKg: 0 })).toBe("missing");
  });
  it("facility is measured when load is entered, else missing", () => {
    expect(facilityGrade({ annualLoadKwh: 1000 })).toBe("measured");
    expect(facilityGrade({ annualLoadKwh: 0 })).toBe("missing");
  });
});

describe("confidenceOf", () => {
  it("weights measured vs estimated by tonnes and counts gaps", () => {
    const c = confidenceOf([
      { grade: "measured", co2eT: 800 },
      { grade: "measured", co2eT: 100 },
      { grade: "estimated", co2eT: 100 },
      { grade: "missing", co2eT: 0 },
    ]);
    expect(c.measuredT).toBe(900);
    expect(c.estimatedT).toBe(100);
    expect(c.totalT).toBe(1000);
    expect(c.measuredPct).toBeCloseTo(0.9);
    expect(c.missingCount).toBe(1);
    expect(c.label).toBe("good");
  });
  it("is 'low' when mostly estimated and safe on an empty list", () => {
    expect(confidenceOf([{ grade: "estimated", co2eT: 100 }]).label).toBe("low");
    const empty = confidenceOf([]);
    expect(empty.measuredPct).toBe(0);
    expect(empty.totalT).toBe(0);
  });
});
