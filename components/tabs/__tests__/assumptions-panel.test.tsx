// @vitest-environment jsdom
/* The Assumptions tab: the premise is visible, adjustable, and resettable, and
   changing it invalidates any mixes suggested under the old one. */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScenarioProvider } from "@/lib/store";
import { Scope2Provider } from "@/lib/scope2/store";
import { GoalsProvider } from "@/lib/goals/store";
import { CompanyProvider } from "@/lib/company/store";
import { BuilderHub } from "../BuilderHub";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <CompanyProvider><ScenarioProvider><Scope2Provider><GoalsProvider>
      {children}
    </GoalsProvider></Scope2Provider></ScenarioProvider></CompanyProvider>
  );
}

describe("Assumptions sub-tab", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("is a fourth section tab and does not steal the landing screen", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    expect(screen.getByRole("tab", { name: /Assumptions/ })).toBeTruthy();
    // Landing stays Fine-tune levers.
    expect(screen.getByLabelText("Efficiency dial")).toBeTruthy();
  });

  it("shows the derived rate and its span", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    expect(screen.getByText(/from your data/i)).toBeTruthy();
    expect(screen.getByLabelText("Scope 1 BAU growth override")).toBeTruthy();
  });

  it("an override moves the required cut", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    const requiredBefore = screen.getAllByText("Required cut")[0]
      .parentElement!.textContent!;
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    fireEvent.change(screen.getByLabelText("Scope 1 BAU growth override"), { target: { value: "9" } });
    const requiredAfter = screen.getAllByText("Required cut")[0]
      .parentElement!.textContent!;
    expect(requiredAfter).not.toBe(requiredBefore);
  });

  it("reset clears BOTH overrides rather than freezing the derived numbers", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    const s1 = screen.getByLabelText("Scope 1 BAU growth override") as HTMLInputElement;
    const s2 = screen.getByLabelText("Scope 2 BAU growth override") as HTMLInputElement;
    fireEvent.change(s1, { target: { value: "9" } });
    fireEvent.change(s2, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /reset to derived/i }));
    // One reset, both scopes: a reset that cleared only the scope it sat beside
    // would leave the other frozen on a rate the reader believes is derived.
    expect(s1.value).toBe("");
    expect(s2.value).toBe("");
  });

  it("holds a flat BAU at zero instead of treating it as cleared", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    const input = screen.getByLabelText("Scope 2 BAU growth override") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });
    expect(input.value).toBe("0");
  });

  it("carries the finance assumptions that were buried in Scope 1", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    expect(screen.getByLabelText(/Discount rate/i)).toBeTruthy();
    expect(screen.getByLabelText(/Fuel escalation/i)).toBeTruthy();
    // Adapted: getByLabelText(/Carbon price/i) matches two elements in the
    // real DOM — the NumField input (aria-label="Carbon price") AND its (i)
    // hint icon (aria-label="Internal carbon price — ..."), because the hint
    // copy happens to contain the same phrase. Scoping to the spinbutton role
    // (the actual <input type="number">) keeps the same assertion — a Carbon
    // price field exists — without the ambiguous match.
    expect(screen.getByRole("spinbutton", { name: /Carbon price/i })).toBeTruthy();
  });
});

describe("Compare mixes states its premise", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("holds no budget input of its own — that lives on Assumptions", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Compare mixes/ }));
    // Exactly one CAPEX budget field exists in the app, and it is not here.
    expect(screen.queryByLabelText("CAPEX budget")).toBeNull();
  });

  it("shows the premise strip and links back to Assumptions", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Compare mixes/ }));
    // The premise strip shows "CAPEX cap" and "BAU" metrics. We verify the strip
    // exists by checking for both the CAPEX cap label and the change premises button.
    expect(screen.getByText(/CAPEX cap/)).toBeTruthy();
    // The Change premises button is part of the premise strip.
    const changeButton = screen.getByRole("button", { name: /change premises/i });
    expect(changeButton).toBeTruthy();
    // Scope the BAU check to the premise strip to avoid ambiguity with explanatory text.
    // The strip must display the BAU rate in the format "BAU X.X %/yr".
    const stripElement = screen.getByTestId("premise-strip");
    expect(stripElement.textContent).toMatch(/BAU\s+[\d.]+\s+%\/yr/);
    fireEvent.click(changeButton);
    // We land on Assumptions.
    expect(screen.getByLabelText("Scope 1 BAU growth override")).toBeTruthy();
  });

  it("keeps the Suggest button beside the results", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Compare mixes/ }));
    expect(screen.getByRole("button", { name: /Suggest mixes/ })).toBeTruthy();
  });

  it("reflects the ?? precedence chain: override > derived > 1", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Compare mixes/ }));
    const stripElement = screen.getByTestId("premise-strip");
    // No override set: should show derived rate and include "(from your data)" qualifier.
    expect(stripElement.textContent).toContain("(from your data)");
    // Set a distinctive override value that no derived rate would coincidentally equal.
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    // Both scopes, so one rate honestly annotates the combined figure.
    fireEvent.change(screen.getByLabelText("Scope 1 BAU growth override"), { target: { value: "7.3" } });
    fireEvent.change(screen.getByLabelText("Scope 2 BAU growth override"), { target: { value: "7.3" } });
    // Return to Compare mixes and verify the override is now displayed.
    fireEvent.click(screen.getByRole("tab", { name: /Compare mixes/ }));
    const stripAfterOverride = screen.getByTestId("premise-strip");
    // The strip must show the override value and must NOT show "(from your data)".
    expect(stripAfterOverride.textContent).toContain("7.3");
    expect(stripAfterOverride.textContent).not.toContain("(from your data)");
  });
});

describe("the rail names its premise", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("states the growth rate and that it came from the data", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    expect(screen.getByText(/growing at/i)).toBeTruthy();
    expect(screen.getByText(/from your own year-on-year data/i)).toBeTruthy();
  });

  it("says so when the rate is an override instead", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    fireEvent.change(screen.getByLabelText("Scope 1 BAU growth override"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Scope 2 BAU growth override"), { target: { value: "7" } });
    expect(screen.getByText(/a rate you set/i)).toBeTruthy();
  });
});

/* The card treatment: four collapsible cards with live header summaries, a
   slider beside the growth override, and a capital breakdown where the empty
   CAPEX-rates placeholder used to be. */
describe("Assumptions cards", () => {
  beforeEach(() => { window.localStorage.clear(); });

  const open = () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
  };

  it("titles each card and drops the wizard-style step numbers", () => {
    open();
    for (const name of [/Business as usual/i, /Mix inputs/i, /Where the capital goes/i, /Running costs/i]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    // "1 · Business as usual" read like a wizard you progress through; this is
    // a settings screen you dip into.
    expect(screen.queryByText(/^1\s*·/)).toBeNull();
    expect(screen.queryByText(/^4\s*·/)).toBeNull();
  });

  it("opens every card by default, so nothing surfaced last week is re-hidden", () => {
    open();
    expect(screen.getByLabelText("Scope 1 BAU growth override")).toBeTruthy();
    expect(screen.getByLabelText("Scope 2 BAU growth override")).toBeTruthy();
    expect(screen.getByLabelText("CAPEX budget")).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: /Discount rate/i })).toBeTruthy();
  });

  it("collapsing a card hides its body but keeps its summary readable", () => {
    open();
    const header = screen.getByRole("button", { name: /Running costs/i });
    expect(header.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("spinbutton", { name: /Discount rate/i })).toBeNull();
    // The summary is the point of folding: state stays legible when closed.
    expect(header.textContent).toMatch(/WACC/i);
  });

  it("summarises the growth premise in the card header, naming its provenance", () => {
    open();
    const header = screen.getByRole("button", { name: /Business as usual/i });
    /* NOTE on the environment: these tests clear localStorage, so the stores
       fall back to DEFAULT_COMBUSTION_BY_YEAR / DEFAULT_FACILITIES_BY_YEAR
       (FY2021-2027) and a rate IS derived — unlike the shipped seed, which
       carries one year and lands on the 1% fallback. Both branches are covered:
       derived here, fallback in the unit tests for the summary's inputs. */
    expect(header.textContent).toMatch(/%\/yr/);
    expect(header.textContent).toMatch(/derived/i);
    expect(header.textContent).not.toMatch(/fallback/i);

    fireEvent.change(screen.getByLabelText("Scope 1 BAU growth override"), { target: { value: "7.3" } });
    fireEvent.change(screen.getByLabelText("Scope 2 BAU growth override"), { target: { value: "7.3" } });
    expect(header.textContent).toMatch(/7\.3\s*%\/yr/);
    expect(header.textContent).toMatch(/your override/i);
    // Both scopes typed to the same rate: one number, and no derived pair.
    expect(header.textContent).not.toMatch(/derived/i);
  });

  it("summarises the mix inputs, and says when there is no cap", () => {
    open();
    const header = screen.getByRole("button", { name: /Mix inputs/i });
    expect(header.textContent).toMatch(/50%\s*by\s*2030/);
    expect(header.textContent).toMatch(/no cap/i);
  });

  /* The slider is gone with the split. It drove ONE value, and there are now
     two — a single slider would have had to pick a scope to control, silently,
     which is worse than typing. */
  it("carries no growth slider", () => {
    open();
    expect(screen.queryByLabelText("BAU growth slider")).toBeNull();
    expect(screen.queryByLabelText(/BAU growth.*slider/i)).toBeNull();
  });

  it("lists where the capital goes, largest first, instead of an empty placeholder", () => {
    open();
    const card = screen.getByTestId("capital-card");
    // Real lever families with real capital, not a reserved-for-later notice.
    expect(card.textContent).toMatch(/Efficiency|Solar|Electrif|refrigerant/i);
    const amounts = [...card.querySelectorAll("[data-capex]")].map((e) => Number(e.getAttribute("data-capex")));
    expect(amounts.length).toBeGreaterThan(0);
    expect([...amounts]).toEqual([...amounts].sort((x, z) => z - x));
  });

  it("shows each row's own yearly cost change beside its capital", () => {
    open();
    // Capital alone does not rank a lever; the running-cost column is why an
    // expensive lever can still be the cheap one to own.
    expect(screen.getByTestId("capital-card").textContent).toMatch(/\/yr/);
  });

  it("still says where per-source rates are edited", () => {
    open();
    // The sentence moved to the CAPEX rates card, which is where the prices
    // now live — the claim is unchanged, only its home.
    expect(screen.getByTestId("capex-rate-table").textContent).toMatch(/Scope 1/);
  });

  it("prices the plan by driver, not only by lever family", () => {
    open();
    const table = screen.getByTestId("capex-rate-table");
    // The capital card groups by lever; this table is the level below it,
    // one row per priced driver, which is what makes a rate editable.
    expect(table.textContent).toMatch(/Driver/i);
    expect(table.querySelectorAll("[data-amount]").length).toBeGreaterThan(0);
  });

  it("writes a typed rate through to the model, and the lever total moves with it", () => {
    open();
    const table = screen.getByTestId("capex-rate-table");
    const input = [...table.querySelectorAll("input[type=number]")]
      .find((i) => /rate$/.test(i.getAttribute("aria-label") ?? "")) as HTMLInputElement;
    expect(input, "expected at least one decomposing driver with an editable rate").toBeTruthy();

    const row = input.closest("div")!.parentElement!;
    const amountEl = () => row.querySelector("[data-amount]")!;
    const before = Number(amountEl().getAttribute("data-amount"));
    const rateBefore = Number(input.value);
    expect(before).toBeGreaterThan(0);

    // Double the rate. Capital is quantity x rate, and quantity does not move,
    // so the line's capital must double — that is the whole contract of typing
    // here rather than editing each source by hand.
    fireEvent.change(input, { target: { value: String(rateBefore * 2) } });
    fireEvent.blur(input);

    const after = Number(amountEl().getAttribute("data-amount"));
    expect(after).toBeCloseTo(before * 2, 4);
  });

  it("keeps the lever card and the driver table on one set of additions", () => {
    open();
    const table = screen.getByTestId("capex-rate-table");
    const input = [...table.querySelectorAll("input[type=number]")]
      .find((i) => /rate$/.test(i.getAttribute("aria-label") ?? "")) as HTMLInputElement;
    const leverText = () => screen.getByTestId("capital-card").textContent ?? "";
    const before = leverText();

    fireEvent.change(input, { target: { value: String(Number(input.value) * 2) } });
    fireEvent.blur(input);

    // The lever card reads the same engine output, so a rate edit must move it
    // too. If it did not, the breakdown and the total would be two quantities.
    expect(leverText()).not.toBe(before);
  });

  it("lets a decomposing driver's rate be typed over", () => {
    open();
    const table = screen.getByTestId("capex-rate-table");
    // At least one line must offer an editable figure, or the table is a
    // read-only breakdown wearing the name of an editor.
    expect(table.querySelectorAll("input[type=number]").length).toBeGreaterThan(0);
  });
});

/* The premise split: Scope 1 and Scope 2 grow at different rates, so each gets
   its own field and either can be left on its own history. */
describe("Business as usual \u00b7 a rate per scope", () => {
  beforeEach(() => { window.localStorage.clear(); });

  const open = () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
  };
  const s1Field = () => screen.getByLabelText("Scope 1 BAU growth override") as HTMLInputElement;
  const s2Field = () => screen.getByLabelText("Scope 2 BAU growth override") as HTMLInputElement;
  const bauHeader = () => screen.getByRole("button", { name: /Business as usual/i });

  /* The spinner quirk: `min` is the HTML step BASE. With the accepted minimum
     (-99.99) on the input, the arrows walked in .x9/.x1 offsets — 2.81, not
     2.90 — on every growth field. */
  it("steps in round tenths from an aligned step base", () => {
    open();
    for (const field of [s1Field(), s2Field()]) {
      const min = Number(field.getAttribute("min"));
      const step = Number(field.getAttribute("step"));
      expect(step).toBeGreaterThan(0);
      expect(Math.abs(min / step - Math.round(min / step))).toBeLessThan(1e-9);
    }
  });

  it("offers one override per scope", () => {
    open();
    expect(s1Field()).toBeTruthy();
    expect(s2Field()).toBeTruthy();
  });

  it("each field placeholder names that scope's own derived rate", () => {
    open();
    // The placeholder is what tells you what happens if you leave it blank. A
    // shared placeholder listing "s1 / s2" beside two fields cannot say which
    // half belongs to which.
    const s1Placeholder = Number(s1Field().placeholder);
    const s2Placeholder = Number(s2Field().placeholder);
    expect(Number.isFinite(s1Placeholder)).toBe(true);
    expect(Number.isFinite(s2Placeholder)).toBe(true);
    // The shipped fixture derives two genuinely different rates; if they were
    // equal this assertion would pass vacuously and prove nothing.
    expect(s1Placeholder).not.toBeCloseTo(s2Placeholder, 1);
    expect(bauHeader().textContent).toContain(s1Placeholder.toFixed(1));
    expect(bauHeader().textContent).toContain(s2Placeholder.toFixed(1));
  });

  it("a Scope 1 rate leaves Scope 2 on its own derived rate", () => {
    open();
    const s2Derived = Number(s2Field().placeholder);
    fireEvent.change(s1Field(), { target: { value: "9" } });
    // This is the whole point of the split: the header must now read two
    // premises, 9 on Scope 1 and Scope 2's unchanged derived rate.
    expect(bauHeader().textContent).toContain("9.0");
    expect(bauHeader().textContent).toContain(s2Derived.toFixed(1));
    expect(s2Field().value).toBe("");
  });

  it("a Scope 2 rate leaves Scope 1 on its own derived rate", () => {
    open();
    const s1Derived = Number(s1Field().placeholder);
    fireEvent.change(s2Field(), { target: { value: "9" } });
    expect(bauHeader().textContent).toContain(s1Derived.toFixed(1));
    expect(s1Field().value).toBe("");
  });

  it("names which scope is overridden in the folded header", () => {
    open();
    fireEvent.change(s1Field(), { target: { value: "9" } });
    // "your override" alone would claim both scopes are typed; "derived" alone
    // would claim neither is.
    expect(bauHeader().textContent).toMatch(/Scope 1 override/i);
    fireEvent.click(screen.getByRole("button", { name: /reset to derived/i }));
    fireEvent.change(s2Field(), { target: { value: "9" } });
    expect(bauHeader().textContent).toMatch(/Scope 2 override/i);
  });

  it("moves the required cut from the Scope 2 field alone", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    const required = () => screen.getAllByText("Required cut")[0].parentElement!.textContent!;
    const before = required();
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    fireEvent.change(s2Field(), { target: { value: "12" } });
    // A Scope 2 rate that reached only the Scope 1 engine, or neither, would
    // leave this untouched.
    expect(required()).not.toBe(before);
  });

  it("drives the two scopes independently", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    const required = () => screen.getAllByText("Required cut")[0].parentElement!.textContent!;
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    fireEvent.change(s1Field(), { target: { value: "3" } });
    const afterS1 = required();
    fireEvent.change(s2Field(), { target: { value: "3" } });
    // If one field wrote a value both engines read, the second edit would be a
    // no-op - the combined figure would already be at 3 %/yr on both curves.
    expect(required()).not.toBe(afterS1);
  });

  it("the rail says which scope was set and which is still from the data", () => {
    render(<Wrapper><BuilderHub /></Wrapper>);
    fireEvent.click(screen.getByRole("tab", { name: /Assumptions/ }));
    fireEvent.change(s1Field(), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("tab", { name: /Fine-tune levers/ }));
    const rail = screen.getByText(/Business-as-usual reaches/i).parentElement!.textContent!;
    expect(rail).toMatch(/Scope 1/);
    expect(rail).toMatch(/you set/i);
    expect(rail).toMatch(/year-on-year data/i);
  });
});
