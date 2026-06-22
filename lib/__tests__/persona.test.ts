import { describe, expect, it } from "vitest";
import { lensTabs, personaLanding, isPersona, PERSONAS, DEFAULT_PERSONA } from "../persona";

describe("persona lens map", () => {
  it("ESG sees every tab in each scope", () => {
    expect(lensTabs("s1", "esg")).toEqual(["data", "builder", "action", "refrigerant", "compare"]);
    expect(lensTabs("s2", "esg")).toEqual(["data2", "builder2", "action2", "compare2"]);
  });
  it("CEO lands on the boardroom overview (Scope 1)", () => {
    expect(lensTabs("s1", "ceo")).toEqual(["overview", "compare"]);
    expect(lensTabs("s2", "ceo")).toEqual(["overview2", "compare2"]);
  });
  it("CFO lands on the finance screen (Scope 1)", () => {
    expect(lensTabs("s1", "cfo")).toEqual(["finance", "action", "compare"]);
    expect(personaLanding("s1", "cfo")).toBe("finance");
  });
  it("Plant Head is data + feasible levers + pipeline", () => {
    expect(lensTabs("s1", "plant")).toEqual(["data", "builder", "action"]);
  });
  it("landing is the first tab of the lens", () => {
    expect(personaLanding("s1", "ceo")).toBe("overview");
    expect(personaLanding("s2", "plant")).toBe("data2");
  });
  it("default persona is ESG and is listed", () => {
    expect(DEFAULT_PERSONA).toBe("esg");
    expect(PERSONAS.map((p) => p.key)).toContain("esg");
    expect(PERSONAS).toHaveLength(4);
  });
  it("isPersona guards unknown values", () => {
    expect(isPersona("ceo")).toBe(true);
    expect(isPersona("nope")).toBe(false);
  });
});
