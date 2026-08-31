# BAU Growth Premise — Decision Log

The execution record for `docs/superpowers/plans/2026-08-31-bau-growth-premise.md`, preserved here because it was written to a git-ignored working directory that did not survive the branch.

Every entry beginning **Ruling:** is a decision taken on the user's behalf during execution, with its stated cost if wrong. Merged to master as 8e846e2.

---

# SDD ledger — plan: docs/superpowers/plans/2026-08-31-bau-growth-premise.md

Spec: `docs/superpowers/specs/2026-08-31-mix-capex-and-baseline-design.md` (reachable, read — Amendments 1 and 2 are binding).
Worktree: `.claude/worktrees/bau-growth-premise`, branch `feat/bau-growth-premise`, based on local `master` (76b0eb9).

Setup note: local `master` was 3 commits ahead of `origin/master`, and Deliverable 1 (76b0eb9, the level basis this work depends on) was NOT pushed. The native worktree tool defaults to branching from `origin/<default-branch>`, which would have produced a base without it. Branched from local `master` manually instead and cherry-picked the spec/plan commits (ad9e801, 1228c76, 2020fd9, 4a2a989, 4bdb158).

---

## Pre-flight conflict scan

### Cross-task rows (every pair sharing a file or an interface)

| Tasks | Produced → consumed | Finding |
|---|---|---|
| 1 → 2 | `resolveBauGrowthPct(override, fallback)` from `@/lib/bau` | Clean — argument order identical in both |
| 1 → 3 | `resolveBauGrowthPct` | Clean |
| 1 → 4 | `scope1ActualSeries`, `scope2ActualSeries`, `deriveBauGrowth`, `DerivedGrowth` | Clean — names and shapes match Task 1's Produces block |
| 1 → 5 | `YearPoint` type | Clean |
| 1 → 6 | `scope1ActualSeries`, `scope2ActualSeries`, `YearPoint` | Clean |
| 2 → 4 | `compute(..., baseYear, bauGrowthFallbackPct?)` 5th arg | Clean |
| 3 → 4 | `computeScope2(..., assumptions?, bauGrowthFallbackPct?)` 5th arg | Clean — 5th in both, after the existing optional 4th |
| 4 → 6 | `s1.derivedBau`, `s2.derivedBau` | Clean — same field name both stores |
| 4 → 7 | `s1.derivedBau` | Clean |
| 4 → 8 | `s1.derivedBau` | Clean |
| 5 → 6 | `BauChart({ actuals, bau, baseYear, height? })` | Clean — Task 6 passes exactly these |
| 6 → 7 | `assumptions-panel.test.tsx` — Task 7 appends a `describe` using `Wrapper`, `render`, `screen`, `fireEvent` | Clean — all defined/imported by Task 6 in that file |
| 6 → 8 | same file, appended again | Clean |
| **6 → 7, 6 → 8** | **`components/tabs/BalanceTab.tsx` — all three modify it, and Tasks 7/8 name edit targets by absolute line number** | **P3: CONFLICT.** Task 6 inserts lines (import, widened union in 3 places, new switch arm), so Task 7's `:371-390` and Task 8's `:667` are stale by the time they run |

### Per-task self-agreement rows

| Task | Its tests vs its code, its files vs later touches | Finding |
|---|---|---|
| 1 | 12 tests counted against 12 claimed; fixture names `DEFAULT_COMBUSTION_BY_YEAR` / `DEFAULT_REFRIGERATION_BY_YEAR` / `DEFAULT_BASE_YEAR` all verified present in `lib/defaults.ts` | Clean |
| 2 | 6 tests; Scope 1 is not `gridLinked`, so `bau = baseTotalT × (1+g)^n` and the absolute assertions are valid | Clean |
| 3 | 5 tests. **Test 1 compares `run(1)` against `run(1)`** | **P1: asserts nothing.** Tautological. Scope 2 IS `gridLinked`, so the grid factor is why an absolute assertion was avoided — but the fix is a ratio, not a self-comparison |
| 4 | 3 tests. **Test 2 uses `toBeTypeOf("number")`, which `NaN` satisfies — it passes even when `derivedBau` is null.** **Test 3 contains `const base = 0; // read below instead` and then only asserts `> 0`** | **P2: two tests assert nothing meaningful.** Leftover scaffolding |
| 5 | 3 tests, all structural renders incl. two empty-input cases | Clean |
| 6 | 6 tests; `NumField` sets `aria-label={label}`, so the `getByLabelText(/Discount rate/i)` queries resolve; `value={override ?? ""}` makes the `""` and `"0"` assertions correct and they are the `??` guard | Clean, but see P4 |
| 7 | 3 tests. `getByText(/BAU/)` is a bare substring query against a DOM where several elements' `textContent` contains it | **P4** |
| 8 | 2 tests querying text split across nested `<strong>` elements inside one `<p>` | **P4** |

---

## Pre-flight rulings

**Ruling: P1 — Task 3's first test is rewritten before dispatch.** — Its stated purpose is the regression guard that makes deleting `BAU_GROWTH` safe, and as written (`run(1)` vs `run(1)`) it proves nothing; the review rubric treats a test that asserts nothing as a defect, so the plan cannot mandate it. Replaced with a ratio assertion: `at(run(1), base+10) / at(run(0), base+10)` must equal `1.01^10`, because the `gridFactor` multiplies both numerator and denominator and cancels. That is the real "1% behaves as 1%" guard on a gridLinked curve. — **Cost if wrong:** the guard tests growth-ratio behaviour rather than byte-identity with the old constant; a change that altered `baseTotalT` itself would slip past it. Task 2's absolute assertions cover the non-gridLinked half, so the exposure is Scope 2's baseline only.

**Ruling: P2 — Task 4's tests 2 and 3 are rewritten before dispatch.** — Same reason: `toBeTypeOf("number")` is satisfied by `NaN`, so test 2 passes on the exact failure it names, and test 3's `const base = 0` is scaffolding I left in. Replaced with assertions that both `derivedBau` values parse as finite numbers and are not the string `"null"`, and that Scope 1's BAU at 2035 strictly exceeds what a flat 1% would give from the same base — which is what auto-adoption means on this upward-trending fixture. — **Cost if wrong:** if the shipped fixture ever trends flat or down, the auto-adoption assertion inverts and the test fails for a fixture reason rather than a code reason. Accepted: the fixture's trend is a fixed `1 + 0.025 × (year − 2025)` in `lib/defaults.ts`, so it cannot drift silently.

**Ruling: P3 — Tasks 7 and 8 locate their edit targets by content, not line number.** — Task 6 provably shifts BalanceTab.tsx's line numbers, so the cited `:371-390` and `:667` are stale by the time those tasks run, and an implementer trusting them edits the wrong region. Their dispatch briefs will carry the anchoring text to search for (`flex items-start gap-3 flex-wrap mb-4` for Task 7; `Business-as-usual reaches` for Task 8) and an instruction that line numbers in the plan are advisory after Task 6. — **Cost if wrong:** nil; content anchors are strictly more robust here. The only risk is an anchor matching twice, and both were confirmed unique by grep before this ruling.

**Ruling: P4 — implementers may adapt a test's QUERY to the real DOM; they may not weaken its ASSERTION.** — Several tests query text that is split across nested `<strong>` elements, where `getByText` can match multiple ancestors or none. Deciding each case from the plan is guesswork; the implementer has the rendered DOM. So: switching to `within(...)`, a function matcher, `{ selector }`, or asserting on a container's `textContent` is permitted and expected. Deleting the test, loosening it to `queryBy...` + truthy, or dropping the behaviour it checks is not. — **Cost if wrong:** an implementer could satisfy the letter by choosing a query that matches something incidental. The task review sees the diff and the brief, so a query that no longer tests the stated behaviour is visible there.

---

## Progress

**Ruling: P2 addendum — `expect(derivedPct).toBeGreaterThan(1)` is a claim about the shipped fixture, not about the code.** — Analytically it should hold (FY2021 carries 3 combustion sources at trend 0.9, FY2025 carries 4 at trend 1.0, so the CAGR is well above 2%/yr even after flat refrigerant tonnes dilute it), but year-aware DEFRA factors make it not provable from the plan alone. If it fails on the real fixture, the implementer must REPORT it as a finding, not delete the assertion — a derived rate at or below 1%/yr would mean auto-adoption changes almost nothing, which the user should hear. — **Cost if wrong:** one fix round spent on a fixture fact.

Plan edited before Task 1 dispatch to carry rulings P1 and P2: Task 3 test 1 is now a growth-ratio guard, Task 4 tests 2-3 assert finiteness and the exact compounding identity, and Task 4's Probe emits `s1-bau-base` for the identity. Committed with the plan so the extracted briefs carry the fixes.


### Baseline

npm ci: 584 packages, exit 0. Full suite: **941 passed, 1 failed, 1 skipped (943)**.

**Ruling: the one baseline failure is a pre-existing load flake — proceed.** — `components/tabs/__tests__/compare-split-asset-regression.test.tsx` times out at 5000ms in the full run (transform alone took 38s on this machine) and **passes in isolation**. The worktree carries zero source changes from `master` — only spec, plan and gitignore commits — so it cannot be caused by this work. Implementers run the scoped test files the plan names; when a full-suite run is called for (Tasks 3, 4, 7, 8), a timeout in that one file is re-run in isolation and treated as the known flake if it then passes. — **Cost if wrong:** if that test is actually broken by something in this branch, we would attribute a real regression to the flake. Mitigated by requiring the isolation re-run rather than a blanket ignore.

BASE for Task 1: f743cda0b97e4300dc73124768d335640e6c36ad

Task 1: complete (commits f743cda..0c55d1e, review clean — spec ✅, quality Approved)
Task 1: minor (deferred): `deriveBauGrowth` drops EVERY point with `totalT <= 0`, not only a leading one, so `{2023:0, 2024:50, 2025:100}` silently derives from 2024→2025 instead of returning null. Defensible reading, tested only for the two-point case. lib/bau.ts:73-74.
Task 2: complete (commits 0c55d1e..ddbf88f, review clean — spec ✅, quality Approved)
Task 2: minor (deferred): the extended-suite evidence in task-2-report.md is a summary block rather than raw command output. Reviewer independently confirmed by grep that no `BAU_GROWTH` importer survives, so the underlying risk is closed by other means.
Task 3: complete (commits ddbf88f..53ffa9b, review clean — spec ✅, quality Approved). `BAU_GROWTH` now exists nowhere in source; verified by grep.
Task 3: minor (deferred): doc comment on `bauGrowthFallbackPct` in lib/scope2/model/index.ts:117-118 explains why the param is 5th but omits why the engine cannot derive the value itself — the sibling Scope 1 comment (lib/model/index.ts:123-125) states both.

**Ruling: Task 4's third test is fixed by widening the Probe's precision, not by loosening the assertion.** — The implementer reported (correctly, and without touching the test) that `expect(bau2035).toBeCloseTo(baseT * (1 + derivedPct/100)^10, 4)` fails deterministically even for a correct implementation: the Probe emits `pct` through `.toFixed(4)`, so the test recomputes from a value already truncated at 1e-4, and compounding that over ten years on a ~2,566 t magnitude exceeds the ±0.00005 tolerance by orders of magnitude. They verified the identity holds exactly (difference 0) at full float precision. This is a defect in my plan's test construction. The claim is right and the tolerance is right; the lossy part is the DOM channel carrying `pct`. Fix: the Probe emits `pct.toFixed(10)` instead of `.toFixed(4)`. Error budget then: 5e-11 in pct → ~1.3e-8 on the compounded figure, comfortably inside 5e-5, while `baseT`'s own `.toFixed(6)` contributes ~6.4e-7. The assertion text is untouched. — **Cost if wrong:** if the identity were in fact only approximately true, a tight tolerance on a wide channel would now expose that as a failure rather than hiding it — which is the direction I want to be wrong in.

**Ruling: the implementer's "no churn elsewhere" finding is accepted and recorded rather than chased.** — They report the full suite produced no auto-adoption churn because existing tests seed single-year fixtures, so `deriveBauGrowth` returns null and they fall back to the unchanged 1%. That is correct behaviour, not a gap: a one-year inventory cannot yield a CAGR. It does mean auto-adoption's blast radius is exercised mainly by Task 4's own store test rather than broadly. Accepted — the shipped default fixture (FY2021–FY2027) does derive, and the store test proves the engine consumes it. — **Cost if wrong:** a screen that reads the trajectory in a way the store test does not cover could show a derived-rate number nobody asserted. Tasks 6–8 add UI tests over the same trajectory, and the final whole-branch review sees the whole surface.
Task 4: fix round 0 (pre-review, controller ruling on the plan's own test defect): 1 addressed, 0 open (commit 518a204 — Probe emits pct.toFixed(10); assertion, tolerance and toBeGreaterThan checks untouched, confirmed by reviewer)
Task 4: complete (commits 53ffa9b..518a204, review clean — spec ✅, quality Approved). Full suite 968 passed / 1 skipped / 0 failed (969); the known flake passed this run.
Task 4: minor (deferred): the `derivedBau` JSDoc block is copy-pasted near-identically into both store shape interfaces; a shared doc on `DerivedGrowth` in lib/bau.ts would stop the two copies drifting.

**Ruling: Task 5's plan-mandated weak tests are a real finding and get fixed, by extracting the merge into a pure function rather than by asserting on rendered marks.** — The reviewer is right: all three tests assert only that `.recharts-responsive-container` exists, so a component that ignored the `bau` prop entirely would pass, leaving this task's whole guarantee ("plots what it is handed, computes no BAU") unverified. Spec §6.5 as amended explicitly asks for it: "The chart's BAU series is identical to `combineTrajectories(...).map(r => r.bau)` — asserted." My plan's self-review waived that as "enforced structurally instead", which the reviewer correctly calls insufficient — prop-passing is not an assertion.

The obvious fix — count rendered `.recharts-line-curve` / `.recharts-scatter-symbol` marks — is NOT available: recharts under jsdom has no layout, reports width/height −1, and renders no marks. That is precisely why the brief settled for a container check, and it is why the repo's only other chart test (`gap-stack.test.tsx`) can assert real content: `GapStack` is hand-rolled SVG with text nodes, not recharts.

So: extract the year-merging logic from `BauChart` into an exported pure function and assert on its output — that each handed-in `bau` and `actual` value appears unchanged for its year, that years are the sorted union, and that a year present in one series yields null for the other. That asserts the identity the spec asks for, at the only layer where it is assertable, and it makes "computes no BAU" checkable by inspection of one small function. The three render smoke tests stay as a rendering guard. — **Cost if wrong:** the assertion lands one layer below the DOM, so a defect between the merge function and the recharts props (e.g. wiring `actual` into the `Line`) would still not be caught. Accepted: that surface is three JSX lines visible in any diff, whereas the arithmetic surface this closes is the one the spec named.
Task 5: fix round 1/5 (1 addressed, 0 open — merge lifted to exported `bauChartRows`, 7 unit tests assert carry-through of non-round values; commits 47e9718..02e3a34)
Task 5: complete (commits 518a204..02e3a34, review clean — spec ✅, fix round verdict: all addressed, no new breakage). Suite 978 passed / 1 skipped.
Task 5: minor (deferred): `BauTooltip` hardcodes background/text colours rather than using the `--color-surface`/`--color-ink*` vars. Consistent with the existing `GoalTrajectoryChart.tsx` precedent, which does the same; only matters if theming is extended to tooltips.

**Ruling: Task 6's first implementer died mid-task on an API auth failure (OAuth 401); its uncommitted work is STASHED, not adopted, and the task re-runs clean.** — The dead agent had written a complete-looking 220-line panel, a 77-line test file and all five BalanceTab edits, but committed nothing, ran nothing, and wrote no report. Two options: have a fresh agent verify and adopt it, or re-run from the brief. Chose re-run. Adopting it would mean an implementer vouching for code it did not write and being unable to answer honestly whether TDD was followed — and the plan contains the complete code, so re-running is cheap. The partial work is preserved in `git stash` (message: "task-6 partial from agent killed by OAuth 401"), so nothing is destroyed and it can be diffed against the real implementation later if useful. — **Cost if wrong:** one task's re-run of work that was probably fine. Cheap against the alternative, which is unverifiable provenance on the largest UI change in the plan.
Task 6: complete (commits 02e3a34..552bd00, review clean — spec ✅, quality Approved). Suite 984 passed / 1 skipped (985). Both implementer deviations verified genuine by the reviewer: the `getByLabelText(/Carbon price/i)` → `getByRole("spinbutton")` query adaptation (the hint icon's aria-label duplicate-matched) is permitted under ruling P4 and no weaker; and the `rows` prop widening to `CombinedRow[]` fixed a real defect in my brief's inline type, which lacked fields `targetPosition` requires.
Task 6: minor (deferred): section 4's 12 `NumField` calls are repetitive, but each has a distinct label/hint/default/setter, so a config-driven loop would trade readability for a mixed-type accessor table. Reviewer judged it not a clear win.
Task 6: minor (deferred): the override input's placeholder shows Scope 1's derived rate only, while its label says "One rate, applied to both scopes" and Scope 2 may differ. Cosmetic — a placeholder is not a written value.

**Note: ruling P4's predicted failure mode occurred at Task 7 and the compensating control caught it.** P4 permitted implementers to adapt a test's query but not weaken its assertion, and recorded the cost as "an implementer could satisfy the letter by choosing a query that matches something incidental — the task review sees the diff and the brief, so a query that no longer tests the stated behaviour is visible there." That is precisely what happened: `getByText(/BAU/)` was replaced with `getByText(/CAPEX cap/)`, dropping the subject of the assertion, and the reviewer flagged it as Important. The implementer's ambiguity claim was itself legitimate (the always-mounted result rail contains the word "BAU" at BalanceTab.tsx:690, so the global query really did match twice) — the error was substituting a different subject instead of scoping to the strip. No change to P4; the control worked as designed.
Task 7: fix round 1/5 (1 addressed, 0 open — scoped to `data-testid="premise-strip"`, asserts /BAU\s+[\d.]+\s+%\/yr/, plus a both-directions precedence test using a distinctive 7.3 override; commits 4f39826..0674a9b)
Task 7: complete (commits 552bd00..0674a9b, review clean — fix round verdict: all addressed, no new breakage). Suite 988 passed / 1 skipped (989). Re-reviewer independently confirmed a reversed `??` chain would fail the new test, since the default fixture seeds FY2021-2027 so `derivedBau` is non-null.
Task 7: minor (deferred): test 3 asserts the Suggest button's presence without clicking it — the brief's own test verbatim.
Task 7: minor (deferred): no test asserts the `{target}% by {year}` clause renders in the strip.

**Ruling: Task 8's Important finding (unsubstantiated tsc/eslint/next-build claims) is closed by controller verification rather than a fix round.** — The reviewer was right that the report asserted three commands passed without pasting output, and right that the gap matters because `next build` is unique to this task. But the remedy is a check, not a code change, and the reviewer itself suggested the controller run it. Ran directly: `npx tsc --noEmit` exits 0 with no output; `npx next build` compiles in 4.3s, finishes TypeScript, prerenders 4/4 static pages, succeeds; `npx eslint lib components` reports 3 errors and 29 warnings, and cross-checking every complaining file against `git diff --name-only 76b0eb9..HEAD` shows **none** of them is a file this branch touched (they are pre-existing debt in `components/Shell.tsx`, `lib/model/__tests__/suggestions.test.ts` and older files). So the claims were true; only their evidence was missing. — **Cost if wrong:** none for the build and typecheck, which I ran myself. The eslint conclusion depends on my file cross-check being right; the file lists are in this ledger entry's command output and can be re-derived in one command.

Task 8: complete (commits 0674a9b..dbd6354, review clean — spec ✅, quality Approved, sole Important finding closed by controller verification). Suite 990 passed / 1 skipped (991). `next build` succeeds.

## Final whole-branch review — findings

**Verdict: not ready to merge; one Critical, three Important.** The Critical is the reason this review seat exists: it is invisible from any single task's diff.

- **Critical 1 — the mix suggester never got the fallback.** `lib/combined-balance.ts:89` calls `compute(...)` with 4 args and `:94-97` calls `computeScope2(...)` with 4 args, so with no override both resolve to the literal `1` inside `resolveBauGrowthPct` while the stores use the derived 2.84 / 7.46. `reductionOf` is both the greedy walk's stop rule and `MixOption.achieved`, so all three cards badge "meets target" on the fixture for plans that deliver 25.5 / 30.8 / 56.9 % on the app's own premises. The premise strip this branch added sits directly above those cards asserting a rate that is false about them. Before this branch both sides were 1% and agreed — the divergence is introduced here.
- **Important 2** — rail and premise strip annotate a COMBINED BAU with Scope 1's rate (`BalanceTab.tsx:396-398`, `:691-697`). Fixture: "reaches 6,866 t by 2030, growing at 2.8 %/yr", where the combined implied rate is 5.80 %/yr.
- **Important 3 — needs a human decision, not a patch.** Auto-adoption is far larger than the spec sized it, and Scope 2's half is a boundary change rather than growth: `DEFAULT_FACILITIES_BY_YEAR` gains a third facility in FY2023, and the endpoint CAGR reads that coverage expansion as 7.46 %/yr forever. Required cut +56 %, gap +85 %, BAU 2050 +199 %. Spec §6.3 predicted "roughly 2.5 %/yr". No task report ever surfaced the Scope 2 rate.
- **Important 4** — `CompareTab.tsx:32` vs `:40` mixes premises within one table (live column derived, saved scenarios at 1%). Reviewer cleared the other un-injected call sites (`CeoOverviewTab`, `CombinedCompare`, `sensitivity`, both `pathways`) as non-findings because every figure they surface is the avoided-basis `reduction2030`, where BAU cancels — verified allocated tonnes identical at 847.1 t under both premises.

**Ruling: fix Critical 1, Important 2, Important 4 and the upgraded placeholder minor in ONE fix wave; escalate Important 3 to the user unfixed.** — 1, 2 and 4 are contained code defects with a fix shape the reviewer specified. 3 is a product judgement about whether a coverage expansion should be read as perpetual growth, and the reviewer is right that it needs an explicit accept; inventing an answer would be deciding the user's own question for them. Also folding in Minor 8 (no `min`/`max` on the override, so 1e6 %/yr is accepted) because it is one line and prevents nonsense reaching every downstream figure. — **Cost if wrong:** the fix wave touches the mix suggester's stop rule, the most delicate code in the branch; a scoped re-review follows it, and the branch is not merged either way.

**Ruling: Minor 5 (spec §6.4.1 asks for a slider; none was built) is recorded as a real silent scope drop and left unfixed.** — My plan never mentioned the slider and its deviations section recorded only the module path, so the reviewer is correct that it went missing silently. Not fixing it now: a slider needs a sensible range, which is a design decision the spec does not give, and inventing one mid-fix-wave is how unrequested surface lands. Surfaced to the user instead. — **Cost if wrong:** the override is keyboard-only, which is a usability gap, not a correctness one.

## Fix wave — outcome

Fix wave: complete (commit dbd6354..3b873fe, re-review verdict: all findings addressed, no new Critical/Important breakage). Suite 990 → **1001 passed, 1 skipped**; no existing test moved (+11 all new). `tsc` clean, `next build` succeeds, eslint unchanged.

Re-reviewer independently verified both load-bearing claims: the greedy walk's ranking/stepping/stopping logic sits entirely outside the two changed hunks (only the premise flowing in differs), and the missing test churn really was a coverage gap — `CombinedInputs` carries no year-wise inventory, so the engine fixture could never produce a derived rate, and a grep shows no test at any level ever clicked "Suggest mixes". The Critical could have survived unlimited per-task testing.

It also settled the arithmetic dispute in the fixer's favour: the combined implied rate is **3.42 %/yr**, not the final review's 5.80 %/yr, because `combineTrajectories` sums a non-grid-linked Scope 1 curve with a grid-linked Scope 2 curve, so the combined row's implied CAGR conflates activity growth with grid decarbonisation and equals neither derived rate. That is an argument FOR "name both rates" over "state the implied rate", which is what was built.

**Ruling: the one Minor new breakage is PARKED, not fixed.** — `AssumptionsPanel.tsx:117` sets `min={-99.99}` with `step={0.1}`, and HTML makes `min` the step base, so spinner-valid values become `-99.99 + 0.1k` (0.01, 0.11, …) and typing `2.8` marks the input `:invalid`. Nothing functional breaks — `onChange` stores the value regardless, there is no form submission, no `:invalid` styling exists, and the bound that matters is enforced at the read in `lib/bau.ts:124-126` where the finding asked for it. The fix is one character (`min={-100}`). Parked rather than applied because the process gives no second fix wave and a controller fix would ship unreviewed; it is surfaced to the user instead. — **Cost if wrong:** a user nudging the override with arrow keys gets 2.81 instead of 2.9, and typed values render as invalid without visible consequence. Annoying, not wrong.

**Ruling: two nits are PARKED.** — (a) `lib/bau.ts:169` collapses two rates to one printed figure when they differ by <0.05 pp, so 2.84 vs 2.88 prints one "2.8" while the panel would show 2.8 and 2.9 — cosmetic, errs toward less noise. (b) The premise strip appends "(from your data)" even when neither scope has enough years and both run the 1.0 floor; this is the pre-existing condition, the rail's fallback branch states it correctly, and a pinning test depends on the current wording. Neither is load-bearing. — **Cost if wrong:** two small copy inaccuracies in edge states.

**ESCALATED, UNFIXED — Important 3 goes to the user as a decision.** Auto-adoption's magnitude and the nature of Scope 2's rate are a product judgement, not a defect. Recorded in full above; surfaced in the final hand-off.

## Boundary fix (user-directed, after the whole-branch review)

Important 3 was escalated to the user, who chose to fix it. Answer to the original question: the artefact was in **both scopes**, not only Scope 2 — Scope 1's Petrol LCVs join FY2023 exactly as the Island resort does, so its 2.84 %/yr carried the same defect, smaller and easy to miss had I fixed only what the review named.

| | total basis | like-for-like | excluded |
|---|---|---|---|
| Scope 1 | 2.84 %/yr | **2.01 %/yr** | Petrol LCVs |
| Scope 2 | **7.46 %/yr** | **2.11 %/yr** | Island resort |

Commits `a9892f0` (derivation) + `2ef6f90` (copy fixes and coverage). Suite 1001 → **1027 passed, 1 skipped**. `tsc` clean, `next build` succeeds. Review: Approved, no Critical/Important; fix round re-review: all 7 addressed, no new breakage. Spec Amendment 3 records the change of basis.

**Ruling: fixed all seven Minors in one round rather than deferring them.** — Two were user-visible bugs ("measured on the **1 facilities**" for any single-site company; an InfoTip still describing the abandoned total basis, sitting directly above a sentence contradicting it), and all seven lived in the same untested copy helper — which is precisely why the plural bug shipped. Fixing the bugs without adding the coverage would have repeated the pattern, so the round included tests for all five copy branches plus the two residual `lib` holes. Declined the reviewer's suggested discriminated-union refactor (`ScopedGrowth extends DerivedGrowth`) in favour of an explicit guard: the union is the better shape but ripples into both stores and the UI. — **Cost if wrong:** the bad state is unreachable rather than unrepresentable, so a future caller passing a bare `deriveBauGrowth` result is a latent risk the type system will not catch. A test pins the guard.

**Ruling: the `!Number.isFinite(pct)` guard stays untested.** — Both reviewers independently judged it unreachable given `fromT > 0` and a finite `toT`. Contorting a fixture to reach defensive dead code is false diligence. — **Cost if wrong:** nil; the guard's presence is the safety, not its coverage.

### Live verification in the running app (controller, browser)

Ran the dev server against this worktree and drove the real UI, because the review flagged a layout risk it could not judge from a diff.

- **Layout: fine at both desktop and tablet.** The ~150-character basis sentence wraps within the panel, no horizontal overflow (`body.scrollWidth === clientWidth`), nothing clipped; "Use instead" reflows below the rates, which reads better than beside them. Verified by injecting the long strings via devtools, because the seeded company cannot produce them (see below). The reviewer's ⚠️ is closed.
- **MATERIAL FINDING — on the shipped seed, this feature is inert.** The baked "Ventive Hospitality" dataset (`lib/company/seed.ts`) contains **only FY2025** — three year-keys, all `"2025"`, `baseYear: 2025`. So `deriveBauGrowth` correctly returns `null`, both scopes fall back to 1 %/yr, and the app's behaviour is **unchanged from before this branch**. The panel reads "Not enough years of data — falling back to 1 %/yr" and the rail reads "the fallback, because there is not yet enough year-on-year data to derive one" — both correct, and both are what a real user sees today.

  Consequence for the record: every auto-adoption figure quoted in this ledger (2.84 / 7.46 / 2.01 / 2.11 %/yr, required cut +56 %, gap +85 %) is a property of `DEFAULT_COMBUSTION_BY_YEAR` / `DEFAULT_FACILITIES_BY_YEAR` — the FY2021–2027 synthetic defaults used by tests and by a browser with no seed — **not** of the live company data. The like-for-like basis is therefore protection for the day a second year is entered, not a change to what ships today. That materially lowers the risk of merging, and it was invisible from every diff and every test in this plan.
