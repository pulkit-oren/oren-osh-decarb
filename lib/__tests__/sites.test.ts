import { describe, expect, it } from "vitest";
import { siteList, filterBySite } from "../sites";

const assets = [
  { id: "a", site: "Pune plant" },
  { id: "b", site: "HQ" },
  { id: "c" },
  { id: "d", site: "Pune plant" },
];

describe("siteList", () => {
  it("returns sorted unique non-empty sites", () => {
    expect(siteList(assets)).toEqual(["HQ", "Pune plant"]);
    expect(siteList([{ id: "x" }])).toEqual([]);
  });
});

describe("filterBySite", () => {
  it("filters to one site; empty string returns all", () => {
    expect(filterBySite(assets, "Pune plant").map((a) => a.id)).toEqual(["a", "d"]);
    expect(filterBySite(assets, "").map((a) => a.id)).toEqual(["a", "b", "c", "d"]);
  });
});
