import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ReliabilityBadge } from "../ReliabilityBadge";
import { ConfidenceGauge } from "../ConfidenceGauge";
import { confidenceOf } from "@/lib/data-quality";

describe("ReliabilityBadge", () => {
  it("labels each grade", () => {
    expect(renderToString(<ReliabilityBadge grade="measured" />)).toContain("Measured");
    expect(renderToString(<ReliabilityBadge grade="estimated" />)).toContain("Estimated");
    expect(renderToString(<ReliabilityBadge grade="missing" />)).toContain("Needs data");
  });
});

describe("ConfidenceGauge", () => {
  it("shows the measured percentage", () => {
    const c = confidenceOf([{ grade: "measured", co2eT: 81 }, { grade: "estimated", co2eT: 19 }]);
    const html = renderToString(<ConfidenceGauge confidence={c} />);
    expect(html).toContain("81%");
  });
});
