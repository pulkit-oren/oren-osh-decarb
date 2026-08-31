// @vitest-environment jsdom
/* Each store derives its OWN scope's rate (Amendment 2) and injects it, so an
   un-overridden BAU follows that scope's own history. */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompanyProvider } from "@/lib/company/store";
import { ScenarioProvider, useScenario } from "@/lib/store";
import { Scope2Provider, useScope2 } from "@/lib/scope2/store";

function Probe() {
  const s1 = useScenario();
  const s2 = useScope2();
  return (
    <>
      <span data-testid="s1-derived">{s1.derivedBau ? s1.derivedBau.pct.toFixed(4) : "null"}</span>
      <span data-testid="s2-derived">{s2.derivedBau ? s2.derivedBau.pct.toFixed(4) : "null"}</span>
      <span data-testid="s1-span">{s1.derivedBau ? `${s1.derivedBau.fromYear}-${s1.derivedBau.toYear}` : "null"}</span>
      <span data-testid="s1-bau-base">
        {s1.result.trajectory.find((r) => r.year === s1.baseYear)!.bau.toFixed(6)}
      </span>
      <span data-testid="s1-bau-2035">
        {s1.result.trajectory.find((r) => r.year === 2035)!.bau.toFixed(6)}
      </span>
    </>
  );
}

const mount = () =>
  render(
    <CompanyProvider><ScenarioProvider><Scope2Provider><Probe /></Scope2Provider></ScenarioProvider></CompanyProvider>,
  );

describe("stores derive the BAU premise", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("exposes a derived rate for each scope, ending at the base year", () => {
    mount();
    expect(screen.getByTestId("s1-derived").textContent).not.toBe("null");
    expect(screen.getByTestId("s1-span").textContent).toMatch(/-2025$/);
  });

  it("derives each scope from its own series, and neither comes back null", () => {
    mount();
    // `toBeTypeOf("number")` would be satisfied by NaN — i.e. by the exact
    // failure this test exists to catch — so assert the text is not "null" and
    // the parsed value is finite.
    for (const id of ["s1-derived", "s2-derived"]) {
      const text = screen.getByTestId(id).textContent!;
      expect(text, id).not.toBe("null");
      expect(Number.isFinite(Number(text)), id).toBe(true);
    }
  });

  it("drives the trajectory with the derived rate, not with 1%", () => {
    mount();
    const derivedPct = Number(screen.getByTestId("s1-derived").textContent);
    const baseT = Number(screen.getByTestId("s1-bau-base").textContent);
    const bau2035 = Number(screen.getByTestId("s1-bau-2035").textContent);
    const n = 2035 - 2025;

    // Auto-adoption, stated exactly: the curve must compound at the DERIVED
    // rate, not at the old 1% constant. Scope 1 is not gridLinked, so this is
    // an exact identity rather than a ratio.
    expect(bau2035).toBeCloseTo(baseT * Math.pow(1 + derivedPct / 100, n), 4);

    // And the fixture trends up (lib/defaults.ts: 1 + 0.025 x (year - 2025)),
    // so the derived rate must exceed the constant it replaced — otherwise
    // "auto-adoption" would be an invisible no-op.
    expect(derivedPct).toBeGreaterThan(1);
    expect(bau2035).toBeGreaterThan(baseT * Math.pow(1.01, n));
  });
});
