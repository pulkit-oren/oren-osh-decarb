import { describe, expect, it } from "vitest";
import { lensTabs, personaLanding, isPersona, PERSONAS, DEFAULT_PERSONA } from "../persona";

describe("persona lens map", () => {
  it("ESG sees every logical tab", () => {
    expect(lensTabs("esg")).toEqual(["data", "builder", "action", "refrigerant", "compare"]);
  });
  it("CEO lands on the boardroom overview", () => {
    expect(lensTabs("ceo")).toEqual(["overview", "compare"]);
    expect(personaLanding("ceo")).toBe("overview");
  });
  it("CFO lands on the finance screen", () => {
    expect(lensTabs("cfo")).toEqual(["finance", "action", "compare"]);
    expect(personaLanding("cfo")).toBe("finance");
  });
  it("Plant Head is data + feasible levers + pipeline", () => {
    expect(lensTabs("plant")).toEqual(["data", "builder", "action"]);
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
