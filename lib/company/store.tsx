"use client";

/* Company registry provider — sits above both scope stores. Each company
   namespaces the planner data keys; switching companies remounts the
   stores (Shell keys them by company id) so they re-hydrate cleanly. */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  addCompanyToRegistry, DEFAULT_COMPANY_NAME, deleteCompanyFromRegistry, loadRegistry, saveRegistry,
  type Company, type CompanyRegistry,
} from "./helpers";
import { seedIfEmpty } from "./seed";

interface CompanyStoreShape {
  companies: Company[];
  activeId: string;
  activeCompany: Company;
  hydrated: boolean;
  addCompany: (name: string, blank: boolean) => void;
  switchCompany: (id: string) => void;
  deleteCompany: (id: string) => void;
}

const Ctx = createContext<CompanyStoreShape | null>(null);

/* SSR-stable initial registry; replaced from localStorage after mount. */
const INITIAL: CompanyRegistry = {
  companies: [{ id: "c-0", name: DEFAULT_COMPANY_NAME, createdAt: 0 }],
  activeId: "c-0",
};

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [reg, setReg] = useState<CompanyRegistry>(INITIAL);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    seedIfEmpty(window.localStorage); // first-ever visit → bake in the Ventive Hospitality dataset
    setReg(loadRegistry(window.localStorage));
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const addCompany = (name: string, blank: boolean) => {
    if (!name.trim()) return;
    setReg((prev) => addCompanyToRegistry(window.localStorage, prev, name, blank));
  };
  const switchCompany = (id: string) =>
    setReg((prev) => {
      if (!prev.companies.some((c) => c.id === id)) return prev;
      const next = { ...prev, activeId: id };
      saveRegistry(window.localStorage, next);
      return next;
    });
  const deleteCompany = (id: string) =>
    setReg((prev) => deleteCompanyFromRegistry(window.localStorage, prev, id));

  const activeCompany = reg.companies.find((c) => c.id === reg.activeId) ?? reg.companies[0];

  return (
    <Ctx.Provider value={{ companies: reg.companies, activeId: reg.activeId, activeCompany, hydrated, addCompany, switchCompany, deleteCompany }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCompany(): CompanyStoreShape {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCompany must be used within CompanyProvider");
  return v;
}
