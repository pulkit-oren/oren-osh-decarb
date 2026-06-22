import { describe, it, expect } from "vitest";
import { allIds, uniqueId } from "../store-helpers";

describe("uniqueId", () => {
  it("starts at prefix-0 when nothing is taken", () => {
    expect(uniqueId("c", [])).toBe("c-0");
  });

  it("skips ids already in use (the post-reload collision case)", () => {
    expect(uniqueId("c", ["c-0", "c-1"])).toBe("c-2");
  });

  it("fills gaps and ignores other prefixes", () => {
    expect(uniqueId("c", ["c-0", "c-2", "r-1"])).toBe("c-1");
  });
});

describe("allIds", () => {
  it("flattens every year's rows to their ids", () => {
    const byYear = {
      2024: [{ id: "c-0" }, { id: "c-1" }],
      2025: [{ id: "c-0" }],
    };
    expect(allIds(byYear).sort()).toEqual(["c-0", "c-0", "c-1"]);
  });
});
