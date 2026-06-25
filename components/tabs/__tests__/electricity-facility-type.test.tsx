// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompanyProvider } from "@/lib/company/store";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { ActivityDataTab } from "../ActivityDataTab";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider><ScenarioProvider><Scope2Provider>{children}</Scope2Provider></ScenarioProvider></CompanyProvider>
  );
}

async function openCompanyElectricity() {
  render(<Wrapper><ActivityDataTab /></Wrapper>);
  fireEvent.click(screen.getByText("Electricity").closest("button")!);
  fireEvent.click(screen.getByText(/Company-wide/i).closest("button")!);
}

describe("ElectricityBuScreen — facility type", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("selecting a facility type presets the load split and shows a solar hint", async () => {
    await openCompanyElectricity();
    const sel = screen.getByLabelText(/Facility type/i) as HTMLSelectElement;
    expect(sel).toBeTruthy();
    const warehouse = Array.from(sel.querySelectorAll("option")).find((o) => /Warehouse/.test(o.textContent || ""));
    fireEvent.change(sel, { target: { value: warehouse!.value } });
    const lighting = screen.getByLabelText("Lighting") as HTMLInputElement;
    expect(lighting.value).toBe("55");
    expect(screen.getByText(/strong on-site solar potential/i)).toBeTruthy();
  });
});
