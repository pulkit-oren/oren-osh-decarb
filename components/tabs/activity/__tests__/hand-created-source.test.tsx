// @vitest-environment jsdom
/* The hand-created source — the one starting state neither the seeded demo
   company nor any other test reaches, and the reason C1 and C2 shipped.
   Everything else in the suite begins from data that already carries a sane
   allocation (defaults.ts writes none, so resolveEquipment's undefined-fallback
   hands the whole volume to equipment[0]; every fixture types one by hand).
   A source the USER creates starts at annualVolume 0 with allocations
   { [id]: 0 } — present and zero, so that fallback never fires. */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider, useScenario } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { EsgProvider } from "@/lib/esg/store";
import { CompanyProvider } from "@/lib/company/store";
import { ActivityDataTab } from "@/components/tabs/ActivityDataTab";
import { isUnallocatedId } from "@/lib/equipment/resolve";
import type { CombustionAsset } from "@/lib/model/types";

function Probe() {
  const { combustion, baseYear, resolvedBaseAssets } = useScenario();
  return (
    <>
      <span data-testid="raw">{JSON.stringify(combustion[baseYear] ?? [])}</span>
      <span data-testid="resolved">{JSON.stringify(resolvedBaseAssets)}</span>
    </>
  );
}

function mount() {
  render(
    <CompanyProvider>
      <ScenarioProvider>
        <Scope2Provider>
          <EsgProvider>
            <ActivityDataTab />
            <Probe />
          </EsgProvider>
        </Scope2Provider>
      </ScenarioProvider>
    </CompanyProvider>,
  );
}

const raw = (): CombustionAsset[] => JSON.parse(screen.getByTestId("raw").textContent!);
const resolved = (): CombustionAsset[] => JSON.parse(screen.getByTestId("resolved").textContent!);

/** Create a source through the real UI, then type its annual volume on the
 *  source list exactly as a user does — the two steps are separate, and it is
 *  the gap between them that C1 lives in. */
function createSourceThenTypeVolume(name: string, volume: number) {
  mount();
  fireEvent.click(screen.getByRole("button", { name: /^Environment$/i }));
  fireEvent.click(screen.getByRole("button", { name: /Energy & Emissions/i }));
  fireEvent.click(screen.getByText("Fuels – Liquid").closest("button")!);
  fireEvent.click(screen.getByRole("button", { name: /Add a source/i }));
  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
  fireEvent.change(screen.getByLabelText(`${name} annual consumption`), {
    target: { value: String(volume) },
  });
}

beforeEach(() => window.localStorage.clear());

describe("a source created by hand (C1)", () => {
  it("allocates the volume onto its equipment as soon as the volume is typed", () => {
    createSourceThenTypeVolume("Hand made", 250000);
    const created = raw().find((e) => e.name === "Hand made")!;
    expect(created.annualVolume).toBe(250000);
    // Before the fix this was { [id]: 0 } — written at creation when the volume
    // WAS 0, and never re-synced.
    expect(created.allocations![created.id]).toBe(250000);
  });

  it("leaves nothing on the lever-inert remainder row", () => {
    createSourceThenTypeVolume("Hand made", 250000);
    const created = raw().find((e) => e.name === "Hand made")!;
    const rows = resolved().filter((r) => r.sourceEntryId === created.id);
    const remainder = rows.find((r) => isUnallocatedId(r.id));
    // The remainder row carries emissions but no lever can act on it, so a
    // source whose whole volume lands there is unplannable.
    expect(remainder).toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(rows[0].annualVolume).toBe(250000);
  });

  it("puts the volume on the row the seeded lever is keyed to", () => {
    createSourceThenTypeVolume("Hand made", 250000);
    const created = raw().find((e) => e.name === "Hand made")!;
    // addCombustionAsset seeds byAsset[id] at creation, and the minted
    // equipment reuses the source id — so THIS row is the one every lever on
    // this source acts through. At zero volume the lever abates nothing,
    // permanently and with no error anywhere.
    const levered = resolved().find((r) => r.id === created.id)!;
    expect(levered).toBeTruthy();
    expect(levered.annualVolume).toBe(250000);
  });
});
