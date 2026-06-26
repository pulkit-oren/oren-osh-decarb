# Modeller Per-Source Drill-down (Scope 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the Scope 1 Modeller segment view into a drill-down: segment → **source boxes** (grouped by BU) → click a box → that **single source's full scenario** (its levers + global assumptions), with the Data-Input end-use/vehicle type shown.

**Architecture:** Extend `BuilderTab`'s `view` state to `"home" | Seg | { seg, sourceId }`. `SegmentScreen` renders `SourceBox` summaries (grouped by BU) instead of the expanded `AssetActionCard`/`SystemActionCard`. A new `SourceScenarioScreen` renders the existing per-source card (unchanged levers) + `AssumptionsCard`. End-use/equipment-class is surfaced on boxes and source headers. No scenario math/store change.

**Tech Stack:** Next.js 16, React 19, TypeScript, vitest. All in `components/tabs/BuilderTab.tsx` + its test.

## Global Constraints

- Git repo, but controller handles commit/deploy. Per-task gate = `npx tsc --noEmit` clean AND `npm test` green AND `npm run build` clean. Do NOT run `git`.
- Do NOT change scenario math/store/lever behavior/KPIs/save/home. Only navigation + presentation + surfacing the existing end-use.
- Scope 1 only — `Scope2BuilderTab`, Action plan, Compare, Data input untouched.
- Reuse existing components unchanged where possible: `AssetActionCard`, `SystemActionCard`, `AssumptionsCard`, `LiveResult`, `ModellerHome`, `segStats`, `SEG_META`, `groupByBu`, `Collapsible`. The end-use already feeds lever defaults via `endUseProfile`/`refrigClassProfile` — this task only *surfaces* it.
- `fmt`, `pct`, `cn` from `@/lib/utils`. `FUELS` from `@/lib/model/factors`. `SYSTEM_TYPE_LABELS` already defined in the file.

---

### Task 1: Source boxes + per-source scenario screen

**Files:**
- Modify: `components/tabs/BuilderTab.tsx`
- Test: `components/tabs/__tests__/builder-grouping.test.tsx`

**Interfaces:**
- Consumes: existing `useScenario`, `applyAssetActions`, `applyRefrigerant`, `refrigerantCO2e`, `combustionCO2e`, `endUseProfile`, `groupByBu`, `SEG_META`, `SYSTEM_TYPE_LABELS`, `AssetActionCard`, `SystemActionCard`, `AssumptionsCard`, `LiveResult`, `RefrigerantControls`.
- Produces: `SourceBox`, `SourceScenarioScreen`; extended `view` nav; `RefrigerantControls` gains an `onOpenSource` prop.

- [ ] **Step 1: Add import** at the top of `BuilderTab.tsx`:

```tsx
import { refrigClassProfile } from "@/lib/model/refrigerant-class";
```

- [ ] **Step 2: Extend the `BuilderTab` router** to a third level:

```tsx
export function BuilderTab() {
  const [view, setView] = useState<"home" | Seg | { seg: Seg; sourceId: string }>("home");
  const [name, setName] = useState("");

  if (view === "home") return <ModellerHome onOpen={setView} name={name} setName={setName} />;
  if (typeof view === "string") {
    return <SegmentScreen seg={view} onBack={() => setView("home")} onOpenSource={(id) => setView({ seg: view, sourceId: id })} />;
  }
  return <SourceScenarioScreen seg={view.seg} sourceId={view.sourceId} onBack={() => setView(view.seg)} />;
}
```

(`ModellerHome`'s `onOpen` already takes a `Seg`; `setView` accepts it. No change to `ModellerHome`.)

- [ ] **Step 3: Add the `SourceBox` component** (new, same file):

```tsx
function SourceBox({ seg, source, onOpen }: { seg: Seg; source: CombustionAsset | RefrigerationSystem; onOpen: () => void }) {
  const { settings } = useScenario();
  let sub: string;
  let abated = 0;
  let active = 0;
  const excluded = source.excluded ?? false;

  if (seg === "refrigerant") {
    const sys = source as RefrigerationSystem;
    const acts = settings.bySystem[sys.id];
    const cls = refrigClassProfile(sys);
    sub = `${SYSTEM_TYPE_LABELS[sys.systemType]}${cls ? ` · ${cls.label}` : ""}`;
    if (acts) {
      if (acts.gasSwitch.enabled) active++;
      if (acts.leakFix.enabled) active++;
      const after = applyRefrigerant(sys, {
        transitionPct: acts.gasSwitch.enabled ? acts.gasSwitch.transitionPct : 0,
        altRefrigerant: acts.gasSwitch.altRefrigerant,
        leakImprovementPct: acts.leakFix.enabled ? acts.leakFix.leakImprovementPct : 0,
      });
      abated = Math.max(0, refrigerantCO2e(sys) - Math.max(0, after.newFugitiveT));
    }
  } else {
    const a = source as CombustionAsset;
    const acts = settings.byAsset[a.id];
    const eu = endUseProfile(a);
    sub = `${FUELS[a.fuelType].label} · ${a.category}${eu ? ` · ${eu.label}` : ""}`;
    if (acts) {
      if (acts.electrify.enabled) active++;
      if (acts.fuelSwitch.enabled) active++;
      if (acts.flexFuel?.enabled) active++;
      const res = applyAssetActions(a, acts, settings.assumptions);
      abated = res.scope1AbatementT + res.fuelAbatementT;
    }
  }
  const hasPlan = !!(seg === "refrigerant" ? settings.bySystem[(source as RefrigerationSystem).id] : settings.byAsset[(source as CombustionAsset).id]);

  return (
    <button
      onClick={onOpen}
      className={cn(
        "group flex items-center gap-3 rounded-xl3 border border-line/60 bg-surface shadow-card px-5 py-4 text-left w-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lg",
        excluded && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-ink truncate">{source.name}</span>
          {excluded && <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">Excluded</span>}
        </div>
        <span className="text-[11px] text-ink-soft">{sub}</span>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-extrabold tabular-nums text-brand-600">{hasPlan ? `−${fmt(abated)} t` : "—"}</div>
        <div className="text-[10px] text-ink-faint">{hasPlan ? `${active} lever${active === 1 ? "" : "s"} on` : "No plan yet"}</div>
      </div>
      <ChevronDown size={18} className="-rotate-90 text-ink-soft/70 group-hover:text-ink transition-colors shrink-0" />
    </button>
  );
}
```

- [ ] **Step 4: Rewrite `SegmentScreen`** to render boxes (grouped by BU) instead of the expanded cards, drop `AssumptionsCard`, and delegate refrigerant to `RefrigerantControls` (which keeps the presets and now renders boxes). Replace the current `SegmentScreen` body's content area:

```tsx
function SegmentScreen({ seg, onBack, onOpenSource }: { seg: Seg; onBack: () => void; onOpenSource: (id: string) => void }) {
  const { baseAssets, baseSystems, settings } = useScenario();
  const m = SEG_META[seg];
  const Icon = m.icon;
  const color = FAMILY_COLORS[m.colorIdx];
  const st = segStats(seg, baseAssets, baseSystems, settings);
  const segAssets = baseAssets.filter((a) => a.category === seg);

  return (
    <div className="screen-in flex flex-col gap-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit">
        <ChevronDown size={16} className="rotate-90" /> All segments
      </button>

      <div className="rounded-xl3 border border-white/60 shadow-card px-6 py-5 flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${color}22, ${color}0D)` }}>
        <span className="w-14 h-14 rounded-2xl bg-white/55 backdrop-blur-sm grid place-items-center shrink-0"><Icon size={28} style={{ color }} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-ink leading-tight">{m.label}</h1>
          <p className="text-sm font-medium text-ink-soft mt-0.5">{m.sub} · {st.count} asset{st.count === 1 ? "" : "s"} · {st.active} with a plan</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-ink-soft font-bold">Abatement</div>
          <div className="text-3xl font-extrabold tabular-nums text-brand-600 leading-none mt-1">−{fmt(st.abated)} <span className="text-base font-semibold text-ink-soft">t</span></div>
        </div>
      </div>

      <LiveResult />

      {seg === "refrigerant" ? (
        <RefrigerantControls onOpenSource={onOpenSource} />
      ) : segAssets.length === 0 ? (
        <Card><p className="text-sm text-ink-faint">No {m.label.toLowerCase()} assets yet — add them in Data input.</p></Card>
      ) : (
        groupByBu(segAssets).map(([bu, assets]) => (
          <Collapsible key={bu} title={bu || "Company-wide"} defaultOpen>
            <div className="flex flex-col gap-3">
              {assets.map((a) => <SourceBox key={a.id} seg={seg} source={a} onOpen={() => onOpenSource(a.id)} />)}
            </div>
          </Collapsible>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 5: Update `RefrigerantControls`** to accept `onOpenSource` and render `SourceBox` instead of `SystemActionCard` (keep the presets `DetailCard` and the empty-state). Change its signature and the per-system render:

```tsx
function RefrigerantControls({ onOpenSource }: { onOpenSource: (id: string) => void }) {
  // ...keep the existing `useScenario` destructure and `applyPreset`...
  // ...keep the presets DetailCard exactly as-is...
  // ...keep the empty-state branch...
  // change ONLY the per-system mapping inside each BU Collapsible:
  //   {systems.map((sys) => <SourceBox key={sys.id} seg="refrigerant" source={sys} onOpen={() => onOpenSource(sys.id)} />)}
}
```

(Do not change the preset logic or `groupByBu`/`Collapsible` structure — only swap `<SystemActionCard system={sys} />` for the `SourceBox` line above.)

- [ ] **Step 6: Add `SourceScenarioScreen`** (new, same file):

```tsx
function SourceScenarioScreen({ seg, sourceId, onBack }: { seg: Seg; sourceId: string; onBack: () => void }) {
  const { baseAssets, baseSystems } = useScenario();
  const label = SEG_META[seg].label;
  const back = (
    <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink w-fit">
      <ChevronDown size={16} className="rotate-90" /> Back to {label}
    </button>
  );

  if (seg === "refrigerant") {
    const sys = baseSystems.find((s) => s.id === sourceId);
    if (!sys) { onBack(); return null; }
    return (
      <div className="screen-in flex flex-col gap-5">
        {back}
        <SystemActionCard system={sys} />
        <AssumptionsCard seg="refrigerant" />
      </div>
    );
  }
  const a = baseAssets.find((x) => x.id === sourceId);
  if (!a) { onBack(); return null; }
  return (
    <div className="screen-in flex flex-col gap-5">
      {back}
      <AssetActionCard asset={a} />
      <AssumptionsCard seg={seg} />
    </div>
  );
}
```

- [ ] **Step 7: Surface the end-use on the source headers.**
  - In `AssetActionCard`, find the meta `<p>` that reads `{isMobile ? \`${asset.unitCount} vehicles\` : "1 unit"} · {fmt(asset.annualVolume)} {asset.unit}/yr` and append the end-use:
    ```tsx
    {(() => { const eu = endUseProfile(asset); return eu ? <> · <span className="font-medium text-ink">{eu.label}</span></> : null; })()}
    ```
    (place it inside that same `<p>`, after the existing text. `endUseProfile` is already imported.)
  - In `SystemActionCard`, find the meta `<p>` (`{SYSTEM_TYPE_LABELS[system.systemType]} · {fmt(system.toppedUpKg)} kg topped up/yr …`) and append, after the system-type text:
    ```tsx
    {(() => { const c = refrigClassProfile(system); return c ? <> · <span className="font-medium text-ink">{c.label}</span></> : null; })()}
    ```

- [ ] **Step 8: Update the test** `components/tabs/__tests__/builder-grouping.test.tsx`. READ it. The segment screen now shows **source boxes**, not expanded levers, so:
  - Keep the home assertions (three segment labels + "Live projection").
  - BU-grouping: after clicking a segment, assert the BU group headers still render (they group the boxes). Adjust any assertion that looked for expanded-lever content at the segment level.
  - For the electrify feasibility ⚠ hint (and any per-lever assertion): after clicking the segment, now also click the relevant **source box** (e.g. the box whose name matches the seeded asset) to open `SourceScenarioScreen`, THEN assert `/electrification is limited/i`. Use the seeded asset's name to find its box.
  - Add one assertion: a source box shows its end-use label when set (the seed used in the feasibility test — confirm what end-use/category it sets; if it sets `endUse: "furnaceKiln"` on a stationary asset, the box sublabel should contain that profile's label "Furnace / Kiln (high-temp)"). Keep assertions meaningful.

- [ ] **Step 9: Verify** — `npx vitest run components/tabs/__tests__/builder-grouping.test.tsx` passes; `npx tsc --noEmit` clean; `npm test` whole suite green; `npm run build` clean.

---

## Self-Review

**Spec coverage:**
- 3-level nav `home | Seg | {seg, sourceId}` → Step 2. ✓
- Segment shows source boxes grouped by BU (not expanded levers) → Steps 3–5. ✓
- Click box → per-source full scenario + assumptions → Step 6. ✓
- End-use/equipment-class on box sublabel → Step 3; on source header → Step 7. ✓
- Refrigerant presets kept; refrigerant boxes → Step 5. ✓
- Assumptions move to source screen (off segment) → Steps 4, 6. ✓
- Math/store/levers unchanged (boxes + screens only re-arrange existing cards) → Global Constraints. ✓
- Test updated for the new drill-down → Step 8. ✓

**Placeholder scan:** none — `SourceBox`, `SegmentScreen`, `SourceScenarioScreen`, router shown in full; `RefrigerantControls` change and header tweaks are precise one-line edits.

**Type consistency:** `Seg`, `SourceBox({seg, source, onOpen})`, `SegmentScreen({seg,onBack,onOpenSource})`, `SourceScenarioScreen({seg,sourceId,onBack})`, `RefrigerantControls({onOpenSource})` consistent across steps. `view` union handled with `=== "home"` then `typeof === "string"` then object. `endUseProfile`/`refrigClassProfile` return `{label}` or undefined. `segStats` reused unchanged.
