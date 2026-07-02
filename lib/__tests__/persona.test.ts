import { describe, expect, it } from "vitest";
import { lensTabs, personaLanding, isPersona, PERSONAS, DEFAULT_PERSONA } from "../persona";

describe("persona lens map", () => {
  it("ESG sees every logical tab, including goals", () => {
    expect(lensTabs("esg")).toEqual(["data", "goals", "builder", "action", "refrigerant", "compare"]);
    expect(personaLanding("esg")).toBe("data");
  });
  it("CEO lands on the boardroom overview and sees goals", () => {
    expect(lensTabs("ceo")).toEqual(["overview", "goals", "compare"]);
    expect(personaLanding("ceo")).toBe("overview");
  });
  it("CFO lands on the finance screen and sees goals", () => {
    expect(lensTabs("cfo")).toEqual(["finance", "goals", "action", "compare"]);
    expect(personaLanding("cfo")).toBe("finance");
  });
  it("Plant Head sees goals (to manage assigned initiatives) but still lands on data", () => {
    expect(lensTabs("plant")).toContain("goals");
    expect(personaLanding("plant")).toBe("data");
  });
  it("Plant Head is data + goals + feasible levers + pipeline", () => {
    expect(lensTabs("plant")).toEqual(["data", "goals", "builder", "action"]);
    expect(personaLanding("plant")).toBe("data");
  });
  it("default persona is ESG and lands on data", () => {
    expect(DEFAULT_PERSONA).toBe("esg");
    expect(PERSONAS.map((p) => p.key)).toContain("esg");
    expect(PERSONAS).toHaveLength(4);
    expect(personaLanding(DEFAULT_PERSONA)).toBe("data");
  });
  it("isPersona guards unknown values", () => {
    expect(isPersona("ceo")).toBe(true);
    expect(isPersona("nope")).toBe(false);
  });
});
