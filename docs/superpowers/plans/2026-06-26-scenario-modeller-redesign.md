# Scenario Modeller Redesign (Scope 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Restyle the Scope 1 Scenario Modeller (`components/tabs/BuilderTab.tsx`) into the Data-Input design language — a home with gradient segment cards + a results side-panel, then a per-segment view whose asset/lever cards use the activity `fields.tsx` primitives — without changing the scenario math, store, or any lever behavior.

**Architecture:** Add a local `view` nav state to `BuilderTab` (`"home" | Seg`). A new `ModellerHome` renders three gradient segment cards + a brand-gradient results panel (live KPIs, save/scenario, reset). Selecting a segment shows a themed-header `SegmentScreen` with a sticky live bar and the (restyled) asset/system cards. All model logic, handlers, levers, warnings, save/scenario, and assumptions are preserved — only presentation + navigation change.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, vitest, lucide-react, the activity primitives in `components/tabs/activity/fields.tsx` and `shared.tsx`.

## Global Constraints

- This IS a git repo, but the controller handles commit/push/deploy after review. Per-task gate = `npx tsc --noEmit` clean AND `npm test` green (and `npm run build` clean on the final task). Do NOT run `git` in tasks.
- **Do NOT change scenario math or the store API.** `applyAssetActions`, `applyRefrigerant`, `defaultActions`, `defaultSystemActions`, KPIs, and all `useScenario` handlers stay exactly as-is. This is visual + navigation only.
- **Preserve every lever, field, warning, the save/scenario panel, and global assumptions.** Nothing is dropped.
- Scope 1 only — do NOT touch `Scope2BuilderTab`, Action plan, Compare, or Data input.
- Currency symbol via `CURRENCY` from `@/lib/defaults` (`₹`).
- Reuse activity primitives from `@/components/tabs/activity/fields` and `@/components/tabs/activity/shared` and `@/components/tabs/activity/Collapsible`.

## Reference — store & helpers (already exist, unchanged)

`useScenario()` returns: `settings` (`.byAsset[id]` = `{electrify,fuelSwitch,flexFuel?}`, `.bySystem[id]` = `{gasSwitch,leakFix}`, `.assumptions`), `setSettings`, `resetSettings`, `baseAssets: CombustionAsset[]`, `baseSystems: RefrigerationSystem[]`, `baseYear`, `scenarios`, `saveScenario(name)`, `deleteScenario(id)`, `updateAction(assetId, "electrify"|"fuelSwitch"|"flexFuel", patch)`, `updateSystemAction(sysId, "gasSwitch"|"leakFix", patch)`, `updateAssumptions(patch)`, `result` (`.kpis` = `{reduction2030, net2030, costPerTonne, yearsToTarget, onTrack2030}`).
Helpers: `applyAssetActions(asset, acts, assumptions)` → `{scope1AbatementT, fuelAbatementT, flexAbatementT, ...}`; `applyRefrigerant(system, {transitionPct, altRefrigerant, leakImprovementPct})` → `{newFugitiveT, ...}`; `combustionCO2e(asset)`, `refrigerantCO2e(system)`; `defaultActions(asset)`, `defaultSystemActions(system)`, `flexFuelCapable(asset)`, `endUseProfile(asset)`; `groupByBu(items)` → `[bu: string, items[]][]`.
`fmt`, `fmtK`, `fmtMoney`, `fmtNum`, `pct`, `cn` from `@/lib/utils`.

## Reference — activity primitives (signatures)

- `DetailCard({ title: string, children })`
- `SliderField({ label, value, onChange:(n)=>void, min, max, step?, suffix?, hint?, accent?: string })`
- `Stepper({ label, value, onChange:(n)=>void, min?, max?, hint? })`
- `ToggleSwitch({ on: boolean, onChange:(b)=>void, label: string })`
- `Segmented<T extends string>({ value:T, options:{value:T,label:string}[], onChange:(v:T)=>void })`
- `NumField({ label, value, onChange:(n)=>void, suffix?, hint?, footer?, min?, step?, placeholder? })`
- `SelectField<T extends string>({ label, value:T, options:{value:T,label:string}[], onChange:(v:T)=>void, hint? })`
- `Collapsible({ title: string, children, defaultOpen? })` from `@/components/tabs/activity/Collapsible`

---

### Task 1: Modeller home + segment navigation shell

**Files:**
- Modify: `components/tabs/BuilderTab.tsx` (add nav state + `ModellerHome` + `SegmentScreen`; keep existing `AssetActionCard`/`RefrigerantControls`/`AssumptionsCard`/`LiveResult` rendered inside the segment view unchanged for now)
- Test: `components/tabs/__tests__/builder-grouping.test.tsx` (update navigation; add home assertions)

**Interfaces:**
- Produces: `Seg = "mobile" | "stationary" | "refrigerant"`; a `segStats(seg, baseAssets, baseSystems, settings)` helper returning `{ count, active, abated }`; `ModellerHome` and `SegmentScreen` components used by `BuilderTab`.
- Consumes: existing `useScenario`, `applyAssetActions`, `applyRefrigerant`, `refrigerantCO2e`, `groupByBu`, and the existing `AssetActionCard`, `RefrigerantControls`, `AssumptionsCard`, `LiveResult`, `SEG_META`.

- [ ] **Step 1: Add the `segStats` helper** near the top of `BuilderTab.tsx` (after `SEG_META`). It powers both the home cards and the segment header:

```tsx
type SegStats = { count: number; active: number; abated: number };

function segStats(
  seg: Seg,
  baseAssets: CombustionAsset[],
  baseSystems: RefrigerationSystem[],
  settings: ReturnType<typeof useScenario>["settings"],
): SegStats {
  if (seg === "refrigerant") {
    let active = 0, abated = 0;
    for (const s of baseSystems) {
      const acts = settings.bySystem[s.id];
      if (!acts) continue;
      if (acts.gasSwitch.enabled || acts.leakFix.enabled) active++;
      const after = applyRefrigerant(s, {
        transitionPct: acts.gasSwitch.enabled ? acts.gasSwitch.transitionPct : 0,
        altRefrigerant: acts.gasSwitch.altRefrigerant,
        leakImprovementPct: acts.leakFix.enabled ? acts.leakFix.leakImprovementPct : 0,
      });
      abated += Math.max(0, refrigerantCO2e(s) - Math.max(0, after.newFugitiveT));
    }
    return { count: baseSystems.length, active, abated };
  }
  const assets = baseAssets.filter((a) => a.category === seg);
  let active = 0, abated = 0;
  for (const a of assets) {
    const acts = settings.byAsset[a.id];
    if (!acts) continue;
    if (acts.electrify.enabled || acts.fuelSwitch.enabled || acts.flexFuel?.enabled) active++;
    const res = applyAssetActions(a, acts, settings.assumptions);
    abated += res.scope1AbatementT + res.fuelAbatementT;
  }
  return { count: assets.length, active, abated };
}
```

- [ ] **Step 2: Rewrite the `BuilderTab` component body** to route home ↔ segment. Replace the current `BuilderTab` function (the `return (...)` block through `AssumptionsCard`, reset, save card) with this router; the home and segment views are the two new components below.

```tsx
export function BuilderTab() {
  const sc = useScenario();
  const [view, setView] = useState<"home" | Seg>("home");
  const [name, setName] = useState("");

  if (view === "home") {
    return <ModellerHome onOpen={setView} name={name} setName={setName} />;
  }
  return <SegmentScreen seg={view} onBack={() => setView("home")} />;
}
```

(Remove the old `seg`/`activeCount` state and the old single-page JSX from `BuilderTab` — that logic now lives in `ModellerHome`/`SegmentScreen`. Keep ALL the other components in the file: `AssetActionCard`, `FuelSwitchControls`, `FlexFuelControls`, `ActionRow`, `RefrigerantControls`, `SystemActionCard`, `LiveResult`, `Metric`, `ImpactBar`, `AssumptionsCard`, `AdvancedDrawer`, `CountField`, `YearField`, `NumberField`.)

- [ ] **Step 3: Add `ModellerHome`** (new component in the same file). Two-column layout mirroring `HomeScreen`:

```tsx
function ModellerHome({ onOpen, name, setName }: { onOpen: (s: Seg) => void; name: string; setName: (v: string) => void }) {
  const { baseAssets, baseSystems, settings, result, scenarios, saveScenario, deleteScenario, setSettings, resetSettings, baseYear } = useScenario();
  const k = result.kpis;
  const segs = Object.keys(SEG_META) as Seg[];
  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-10rem)]">
      <div className="rounded-xl3 border border-line/50 bg-gradient-to-br from-brand-50 via-surface to-oren-50/60 px-5 py-4 shrink-0">
        <h1 className="text-xl font-extrabold text-ink">Scenario modeller</h1>
        <p className="text-sm text-ink-soft">Pick a segment to plan its levers — the live result updates on the right.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-5 items-stretch lg:flex-1 lg:min-h-0">
        <div className="flex flex-col gap-3 min-h-0">
          {segs.map((key) => {
            const m = SEG_META[key];
            const Icon = m.icon;
            const st = segStats(key, baseAssets, baseSystems, settings);
            const color = FAMILY_COLORS[m.colorIdx];
            return (
              <button
                key={key}
                onClick={() => onOpen(key)}
                className="group flex items-center gap-4 rounded-xl3 border border-line/60 bg-surface shadow-card px-5 text-left flex-1 min-h-[84px] transition-all duration-200 hover:-translate-y-1 hover:shadow-card-lg"
              >
                <span className="w-12 h-12 rounded-2xl grid place-items-center shrink-0" style={{ background: `${color}1A` }}>
                  <Icon size={24} style={{ color }} />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-xl font-extrabold text-ink truncate">{m.label}</span>
                  <span className="text-xs text-ink-soft">{st.count} asset{st.count === 1 ? "" : "s"} · {st.active} with a plan</span>
                </div>
                <div className="text-right shrink-0 mr-1">
                  <div className="text-[9px] uppercase tracking-wide text-ink-soft font-bold">Abatement</div>
                  <div className="text-base font-extrabold tabular-nums text-brand-600">−{fmt(st.abated)}<span className="text-[10px] text-ink-soft"> t</span></div>
                </div>
                <ChevronDown size={20} className="-rotate-90 text-ink-soft/70 group-hover:text-ink group-hover:-translate-x-0 transition-all shrink-0" />
              </button>
            );
          })}
        </div>

        <aside className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 text-white shadow-card-lg p-6 flex flex-col">
          <p className="relative text-[11px] uppercase tracking-wide font-bold text-white/80">Live projection</p>
          <p className="relative mt-3 text-[40px] leading-none font-extrabold tabular-nums">{pct(k.reduction2030)}</p>
          <p className="relative mt-1 text-xs text-white/70">reduction by 2030</p>
          <div className="relative mt-5 grid grid-cols-2 gap-3">
            <div><p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Net 2030</p><p className="text-xl font-extrabold tabular-nums">{fmtK(k.net2030)} t</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Cost / t</p><p className="text-xl font-extrabold tabular-nums">{CURRENCY}{fmt(k.costPerTonne)}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Years to target</p><p className="text-xl font-extrabold tabular-nums">{k.yearsToTarget ? String(k.yearsToTarget) : "—"}</p></div>
            <div><p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Status</p><p className="text-xl font-extrabold">{k.onTrack2030 ? "On track" : "Behind"}</p></div>
          </div>

          <div className="relative mt-auto pt-5 border-t border-white/20">
            <div className="flex items-center gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this scenario…" className="flex-1 min-w-0 text-sm rounded-lg px-3 py-2 text-ink bg-white/95 focus:outline-none" />
              <button onClick={() => { if (name.trim()) { saveScenario(name.trim()); setName(""); } }} disabled={!name.trim()} className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg bg-white text-brand-700 px-3 py-2 hover:bg-white/90 disabled:opacity-50">
                <Save size={15} /> Save
              </button>
            </div>
            {scenarios.length > 0 && (
              <div className="mt-3 space-y-1.5 max-h-28 overflow-y-auto">
                {scenarios.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg bg-white/12 px-2.5 py-1.5 text-sm">
                    <span className="flex-1 truncate">{s.name}</span>
                    <button onClick={() => setSettings(() => s.settings)} className="text-[11px] font-semibold rounded px-1.5 py-0.5 bg-white/20 hover:bg-white/30" title="Load">Load</button>
                    <button onClick={() => deleteScenario(s.id)} aria-label="Delete scenario" className="text-white/70 hover:text-white"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={resetSettings} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/80 hover:text-white">
              <RotateCcw size={12} /> Reset all to default
            </button>
            <p className="mt-2 text-[10px] text-white/60">Base year FY {baseYear}-{String((baseYear + 1) % 100).padStart(2, "0")} · full pathway in Action plan.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add `SegmentScreen`** (new component, same file). Themed header + sticky live bar + existing body + assumptions:

```tsx
function SegmentScreen({ seg, onBack }: { seg: Seg; onBack: () => void }) {
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
        <RefrigerantControls />
      ) : segAssets.length === 0 ? (
        <Card><p className="text-sm text-ink-faint">No {m.label.toLowerCase()} assets yet — add them in Data input.</p></Card>
      ) : (
        groupByBu(segAssets).map(([bu, assets]) => (
          <Collapsible key={bu} title={bu || "Company-wide"} defaultOpen>
            <div className="flex flex-col gap-4">
              {assets.map((a) => <AssetActionCard key={a.id} asset={a} />)}
            </div>
          </Collapsible>
        ))
      )}

      <AssumptionsCard seg={seg} />
    </div>
  );
}
```

- [ ] **Step 5: Fix imports** in `BuilderTab.tsx`. Ensure these are imported (some already are): from `lucide-react` keep `ChevronDown, Save, Trash2, RotateCcw` (already imported) — `Sparkles, Factory, Truck, Upload, Plus, Minus, SlidersHorizontal` may become unused; remove any now-unused imports flagged by tsc. Add `import { Collapsible } from "@/components/tabs/activity/Collapsible";` (already imported). `FAMILY_COLORS`, `pct`, `fmt`, `fmtK` already imported. Run `npx tsc --noEmit` and remove unused-import errors only.

- [ ] **Step 6: Update the test** `components/tabs/__tests__/builder-grouping.test.tsx`. It currently renders `BuilderTab` and asserts BU grouping + the electrify feasibility hint. Now the modeller opens on the **home**, so the test must click into a segment first. READ the file; then (a) for any assertion about asset cards / BU groups / the feasibility hint, first `fireEvent.click` the segment card (find a button containing the segment label, e.g. `Stationary` or `Mobile`), then assert; (b) add one assertion that the home shows all three segment labels (`Mobile`, `Stationary`, `Refrigerant`) and the "Live projection" panel before clicking. Keep the existing feasibility-hint assertion (after navigating into the segment that holds the furnaceKiln/hard-to-electrify asset). Use the seed/data approach already in that test file.

- [ ] **Step 7: Verify** — `npx vitest run components/tabs/__tests__/builder-grouping.test.tsx` passes; `npx tsc --noEmit` clean; `npm test` whole suite green.

---

### Task 2: Restyle the combustion asset & lever cards

**Files:**
- Modify: `components/tabs/BuilderTab.tsx` (`AssetActionCard`, `ActionRow`, `FuelSwitchControls`, `FlexFuelControls`, and the field helpers used by them)

**Interfaces:**
- Consumes: activity primitives `DetailCard`, `ToggleSwitch`, `Stepper`, `SliderField`, `NumField`, `Segmented` from `@/components/tabs/activity/fields`; `Collapsible`. The store handlers and model helpers are unchanged.
- Produces: same components, restyled. No new exported API.

- [ ] **Step 1: Add imports** to `BuilderTab.tsx`:

```tsx
import { DetailCard, ToggleSwitch, Stepper, SliderField, NumField, Segmented } from "@/components/tabs/activity/fields";
```

- [ ] **Step 2: Restyle `ActionRow`** so each lever is a clean block with the activity toggle. Replace the bespoke toggle button with `ToggleSwitch`, and keep `warning` + dimmed-children behavior:

```tsx
function ActionRow({
  title, sub, icon: Icon, color, enabled, onToggle, children, className, disabled, warning,
}: {
  title: string; sub: string; icon: React.ElementType; color: string;
  enabled: boolean; onToggle: () => void; children: ReactNode; className?: string; disabled?: boolean; warning?: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: `${color}1A` }}><Icon size={16} style={{ color }} /></div>
          <div>
            <div className="font-semibold text-ink text-sm">{title}</div>
            <div className="text-[11px] text-ink-faint">{sub}</div>
          </div>
        </div>
        {!disabled && <ToggleSwitch on={enabled} onChange={onToggle} label={`Toggle ${title}`} />}
      </div>
      {warning && <div className="mb-2">{warning}</div>}
      <div className={cn(!disabled && !enabled && "opacity-40 pointer-events-none")}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Restyle the asset card container + header** in `AssetActionCard`. Replace the outer `<Card>` with a `DetailCard`-equivalent wrapper (a `div` with `rounded-xl3 border border-line/60 bg-surface shadow-card p-6`) — keep the existing header (icon tile, name, meta, `ImpactBar`) and the empty-state "Add plan" branch (just swap its `<Card>` for the same wrapper div). Example wrapper:

```tsx
<div className={cn("rounded-xl3 border border-line/60 bg-surface shadow-card p-6", asset.excluded && "opacity-60")}>
  {/* ...existing header row with icon tile, name, ImpactBar... */}
</div>
```

- [ ] **Step 4: Swap the lever fields to activity primitives.** Inside the Electrify `ActionRow` (and mirror across Fuel switch / Flex fuel):
  - Mobile "vehicles to convert" `CountField` → `Stepper` label `"Vehicles to convert"`, `value={e.unitsToConvert}`, `min={0}`, `max={asset.unitCount}`, `onChange={(v) => updateAction(asset.id, "electrify", { unitsToConvert: v })}`.
  - Stationary capacity `Slider` → `SliderField` label `"Electrify capacity"`, `value={e.capacityPct}`, `min={0}`, `max={100}`, `suffix="%"`, `accent={eColor}`, `onChange`.
  - Target/Start year `YearField` → `NumField` label `"Target year"` / `"Start year"`, `value`, `onChange` (clamp to 2021–2050 inside the handler as before), no suffix.
  - Advanced numeric fields `NumberField` → `NumField` (label, value, `suffix`, `step`, `onChange`) — e.g. COP, tariff, CAPEX.
  - Wrap the "Advanced" group in `<Collapsible title="Advanced">…</Collapsible>` instead of `AdvancedDrawer`.
  - Fuel-switch blend `Slider` → `SliderField` (`max={maxBlend}`, `suffix="%"`); alt-fuel chip row → `Segmented` with `options={compatible.map((id) => ({ value: id, label: ALT_FUELS[id].label }))}` and `onChange={(id) => updateAction(asset.id, "fuelSwitch", { altFuel: id, blendPct: Math.min(maxBlendPctFor(asset.category, id), f.blendPct) })}`.
  - Flex-fuel: "vehicles to convert" → `Stepper`; "High blend" → `SliderField` (`min={25}`, `max={100}`, `suffix="%"`).
  Keep every `updateAction(...)` call, the `useEffect` validity guard in `FuelSwitchControls`, the lifespan warnings, the feasibility ⚠ hint, and all helper notes exactly as they are — only the input widgets change.

- [ ] **Step 5: Remove now-unused helpers/imports.** If `CountField`, `YearField`, `NumberField`, `AdvancedDrawer`, and the `ui/Slider` import are no longer referenced anywhere in the file after Task 2 + 3, delete them. (Verify with a search before deleting — `AssumptionsCard`, `SystemActionCard` may still use `NumberField`/`AdvancedDrawer` until Task 3; if so, defer their deletion to Task 3.) Run `npx tsc --noEmit` to confirm no unused-symbol errors.

- [ ] **Step 6: Verify** — `npx tsc --noEmit` clean; `npm test` green (the builder-grouping test from Task 1 still passes — adjust the field query if it referenced an old widget, keeping the assertion meaningful); confirm the Electrify feasibility ⚠ hint still renders.

---

### Task 3: Restyle refrigerant cards, presets, and global assumptions

**Files:**
- Modify: `components/tabs/BuilderTab.tsx` (`SystemActionCard`, `RefrigerantControls`, `AssumptionsCard`; finish removing any leftover bespoke helpers)

**Interfaces:**
- Consumes: same activity primitives (`DetailCard`, `ToggleSwitch`, `SliderField`, `SelectField`, `NumField`, `Segmented`, `Collapsible`). Store handlers unchanged.

- [ ] **Step 1: Restyle `SystemActionCard`.** Swap the outer `<Card>` for the `rounded-xl3 border border-line/60 bg-surface shadow-card p-6` wrapper (keep the Snowflake tile, name, type · top-up · gas · era badge, `ImpactBar`). For the levers:
  - "Switch gas" alt-refrigerant `<select>` → `SelectField` label `"Alternative refrigerant"`, `value={gs.altRefrigerant}`, `options={ALT_REFRIGERANT_IDS.map((rid) => ({ value: rid, label: \`${REFRIGERANTS[rid].label} · GWP ${REFRIGERANTS[rid].gwp}\` }))}`, `onChange={(v) => updateSystemAction(system.id, "gasSwitch", { altRefrigerant: v as RefrigerantId })}`. Keep the GWP-delta badge, the `alt.note`, and the "Suggested for …" chip button exactly as-is, below the select.
  - "Gas transition" `Slider` → `SliderField` (`suffix="%"`, `accent={color}`). "Leak-rate improvement" `Slider` → `SliderField` (`max={80}`, `suffix="%"`, `accent="#D9774B"`).
  - Year fields → `NumField`; advanced → `NumField` inside `Collapsible title="Advanced"`.
  - Toggles already become `ToggleSwitch` via the restyled `ActionRow` from Task 2.
  - Keep the top-up readout, the gas-saving note, and the >70% leak warning.
  - Restyle the empty-state "Add plan" branch wrapper like Task 2 Step 3.

- [ ] **Step 2: Restyle `RefrigerantControls` presets.** Replace the `<Card tone="muted">` preset row with a `DetailCard title="Presets · all systems"` containing the three preset buttons (keep their `apply` handlers). Keep the `groupByBu` + `Collapsible` per-BU list.

- [ ] **Step 3: Restyle `AssumptionsCard`.** Replace `<Card tone="muted">` with `DetailCard title="Global assumptions"`. Swap each `NumberField` for `NumField` (label, value, `suffix`, `step`, `onChange` unchanged). Keep the refrigerant-vs-fuel conditional fields exactly.

- [ ] **Step 4: Delete leftover bespoke helpers.** Now remove `CountField`, `YearField`, `NumberField`, `AdvancedDrawer` and the `ui/Slider`, `ui/Card`/`CardHeader` imports **iff** unused (search the file first). Keep `ImpactBar`, `LiveResult`, `Metric`, `segStats`, `SEG_META`. Run `npx tsc --noEmit`.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `npm test` green; `npm run build` clean.

---

## Self-Review

**Spec coverage:**
- Home with segment cards + results side-panel → Task 1 (`ModellerHome`). ✓
- Segment view: themed header + sticky live bar + body + assumptions → Task 1 (`SegmentScreen`). ✓
- Navigation `view: "home" | Seg` → Task 1 Step 2. ✓
- Restyle combustion asset/lever cards with activity primitives → Task 2. ✓
- Restyle refrigerant card + presets + assumptions → Task 3. ✓
- Preserve all levers/handlers/warnings/save/scenario/assumptions/math → Global Constraints + each task keeps `updateAction`/`updateSystemAction`/`updateAssumptions`/`applyAssetActions` calls. ✓
- Tests stay green; builder-grouping updated for the new nav → Task 1 Step 6, Task 2/3 verify. ✓
- Scope 1 only; Scope 2 untouched → Global Constraints. ✓

**Placeholder scan:** none — `ModellerHome`/`SegmentScreen`/`segStats`/`ActionRow` shown in full; restyle steps give exact prop mappings + one fully-worked widget per type to mirror.

**Type consistency:** `Seg`, `segStats(seg, baseAssets, baseSystems, settings)`, `ModellerHome({onOpen,name,setName})`, `SegmentScreen({seg,onBack})` consistent across tasks. Primitive signatures match `fields.tsx`. `updateAction`/`updateSystemAction`/`updateAssumptions` signatures unchanged. `FAMILY_COLORS[m.colorIdx]` matches `SEG_META`'s `colorIdx`.
