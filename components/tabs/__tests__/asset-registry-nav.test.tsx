// @vitest-environment jsdom
// Task 8, fix round 1 — navigation coverage.
//
// asset-registry-screen.test.tsx imports AssetRegistryScreen directly, so the
// routing added to ActivityDataTab (the new "assets" Nav level + the
// "🏭 Assets" button added to HomeScreen) was entirely unexercised — nothing
// proved the button actually reaches the screen. This test does.
//
// Unlike activity-data.test.tsx's frozen wrapper (which deliberately has NO
// AssetProvider — see the "DELIBERATE" comment at the top of
// AssetRegistryScreen.tsx explaining why that must stay true), THIS wrapper
// must include one, or clicking through to the "assets" route would throw
// the moment AssetRegistryScreen calls useAssets(). Same coupling as that
// comment, seen from the other side.
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { EsgProvider } from "@/lib/esg/store";
import { CompanyProvider } from "@/lib/company/store";
import { AssetProvider } from "@/lib/assets/store";
import { ActivityDataTab } from "../ActivityDataTab";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider>
      <AssetProvider>
        <ScenarioProvider>
          <Scope2Provider>
            <EsgProvider>
              {children}
            </EsgProvider>
          </Scope2Provider>
        </ScenarioProvider>
      </AssetProvider>
    </CompanyProvider>
  );
}

describe("ActivityDataTab — Assets nav button reaches the registry screen", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("clicking 'Assets' on the home screen navigates to AssetRegistryScreen", () => {
    render(
      <Wrapper>
        <ActivityDataTab initialNav={{ level: "home" }} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Assets/i }));

    expect(screen.getByRole("heading", { name: "Assets" })).toBeTruthy();
    expect(screen.getByText(/Manage the equipment your fuel entries can be split across/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add asset/i })).toBeTruthy();
  });
});
