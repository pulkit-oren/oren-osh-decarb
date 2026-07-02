/* Portfolio-wide "Suggest a plan for me" — apply the per-source suggestion
   engine to every non-excluded asset and cooling system in one pass. Each
   source gets the same actions its own Suggestion card would apply; anything
   the user already configured keeps its other fields (patches only touch the
   suggested lever's values). Pure: same inputs → same output. */

import { defaultActions, defaultSystemActions } from "./segments";
import { suggestForAsset, suggestForSystem, type SuggestedAction } from "./suggestions";
import type { CombustionAsset, LeverSettings, RefrigerationSystem } from "./types";

function patched<T>(cur: T, actions: SuggestedAction[]): T {
  const next = { ...cur } as Record<string, Record<string, unknown>>;
  for (const a of actions) next[a.lever] = { ...next[a.lever], ...a.patch };
  return next as T;
}

export function suggestAllSettings(
  assets: CombustionAsset[],
  systems: RefrigerationSystem[],
  prev: LeverSettings,
): LeverSettings {
  const byAsset = { ...prev.byAsset };
  for (const a of assets) {
    if (a.excluded) continue;
    byAsset[a.id] = patched(byAsset[a.id] ?? defaultActions(a), suggestForAsset(a).actions);
  }
  const bySystem = { ...prev.bySystem };
  for (const s of systems) {
    if (s.excluded) continue;
    bySystem[s.id] = patched(bySystem[s.id] ?? defaultSystemActions(s), suggestForSystem(s).actions);
  }
  return { ...prev, byAsset, bySystem };
}
