/* ============================================================
   Installs the three sector demo companies (pharma, manufacturing,
   IT) into a browser.

   ADDITIVE, and once only. seedIfEmpty in ../seed.ts bails the moment
   any data exists, which is right for a captured single-company
   snapshot but useless here: every browser that has ever opened the
   dashboard already has data, so a seed-shaped install would reach
   nobody who has used the app. This instead appends whichever demos
   are missing and records what it installed, so:

     - a returning user keeps their own companies and gains the demos;
     - a demo the user has since edited is never overwritten;
     - a demo the user has DELETED stays deleted (the marker remembers
       it was installed, not whether it still exists - re-adding it on
       every load would make deletion impossible).

   The active company is deliberately left alone. Installing data is
   not a reason to move someone off the company they were working on.
   ============================================================ */

import { uniqueId } from "@/lib/store-helpers";
import { loadRegistry, saveRegistry, type CompanyRegistry, type StorageLike } from "../helpers";
import { buildCompany } from "./build";
import { PHARMA } from "./pharma";
import { MANUFACTURING } from "./manufacturing";
import { IT_SERVICES } from "./it";
import type { DemoCompany } from "./types";

export { PHARMA, MANUFACTURING, IT_SERVICES };

/** The three demos, in the order they appear in the company switcher. */
export const DEMO_COMPANIES: DemoCompany[] = [PHARMA, MANUFACTURING, IT_SERVICES];

/** Records which demo slugs this browser has already been given. */
export const DEMO_MARKER_KEY = "osh-demo-companies-v1";

interface DemoMarker {
  /** slug -> the company id it was installed as. */
  installed: Record<string, string>;
}

function readMarker(storage: StorageLike): DemoMarker {
  try {
    const raw = storage.getItem(DEMO_MARKER_KEY);
    if (!raw) return { installed: {} };
    const parsed = JSON.parse(raw) as DemoMarker;
    return parsed?.installed && typeof parsed.installed === "object" ? parsed : { installed: {} };
  } catch {
    // A corrupt marker must not re-install on every load - treat it as
    // "everything already handled" only for what it can still name.
    return { installed: {} };
  }
}

export interface InstallResult {
  /** Companies added by this call. Empty on every load after the first. */
  installed: { slug: string; id: string; name: string }[];
}

/** Add any demo company this browser has not been given yet. Idempotent. */
export function installDemoCompanies(storage: StorageLike, now: number): InstallResult {
  const marker = readMarker(storage);
  const pending = DEMO_COMPANIES.filter((d) => !(d.slug in marker.installed));
  if (pending.length === 0) return { installed: [] };

  let reg: CompanyRegistry = loadRegistry(storage);
  const installed: InstallResult["installed"] = [];

  for (const demo of pending) {
    const id = uniqueId("c", reg.companies.map((c) => c.id));
    const { entries } = buildCompany(demo, id, now);
    for (const [k, v] of Object.entries(entries)) storage.setItem(k, v);

    reg = {
      // activeId is preserved: see the module comment.
      companies: [...reg.companies, { id, name: demo.name, createdAt: now }],
      activeId: reg.activeId,
    };
    marker.installed[demo.slug] = id;
    installed.push({ slug: demo.slug, id, name: demo.name });
  }

  saveRegistry(storage, reg);
  storage.setItem(DEMO_MARKER_KEY, JSON.stringify(marker));
  return { installed };
}
