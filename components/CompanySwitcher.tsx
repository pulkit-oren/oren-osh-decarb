"use client";

/* Company switcher — replaces the static client chip in the topbar.
   Switch between companies (each has fully isolated planner data),
   add a new one (blank or with sample data), or remove one. */

import { useRef, useState } from "react";
import { Building2, Check, ChevronDown, Download, Plus, Trash2, Upload } from "lucide-react";
import { useCompany } from "@/lib/company/store";
import { exportAllData, importAllData } from "@/lib/company/transfer";
import { cn } from "@/lib/utils";

export function CompanySwitcher() {
  const { companies, activeId, activeCompany, addCompany, switchCompany, deleteCompany } = useCompany();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [blank, setBlank] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onExport = () => {
    const bundle = exportAllData(window.localStorage, Date.now());
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `osh-dashboard-data-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const onImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result);
      // Validate + count BEFORE writing anything, so a cancel changes nothing.
      let count = 0;
      try {
        const b = JSON.parse(raw);
        if (b?.app !== "osh-decarb" || !b.entries) throw new Error("This isn't an OSH dashboard export file.");
        const reg = b.entries["osh-companies-v1"];
        count = reg ? (JSON.parse(reg).companies?.length ?? 0) : 0;
      } catch (e) {
        window.alert(`Import failed: ${e instanceof Error ? e.message : "unknown error"}`);
        return;
      }
      if (!window.confirm(`Import ${count} compan${count === 1 ? "y" : "ies"}? This replaces the data currently in this browser. The page will reload.`)) return;
      importAllData(window.localStorage, raw);
      window.location.reload();
    };
    reader.readAsText(file);
  };

  const close = () => {
    setOpen(false);
    setAdding(false);
    setName("");
    setConfirmDelete(null);
  };

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    addCompany(n, blank);
    close();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="rounded-full bg-surface-muted border border-line/60 px-3.5 py-2 text-sm flex items-center gap-2 hover:bg-line/40 transition-colors max-w-[240px]"
      >
        <span className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold shrink-0">Company</span>
        <span className="font-medium truncate">{activeCompany.name}</span>
        <ChevronDown size={14} className={cn("text-ink-faint shrink-0 transition-transform duration-300", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" aria-hidden onClick={close} />
          <div className="absolute right-0 top-full mt-2 z-40 w-80 rounded-xl2 bg-white border border-line shadow-card-lg p-2">
            <div className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-ink-faint font-bold">
              Companies — each keeps its own data
            </div>
            <ul role="listbox" aria-label="Companies" className="max-h-64 overflow-y-auto">
              {companies.map((c) => {
                const active = c.id === activeId;
                return (
                  <li key={c.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => { switchCompany(c.id); close(); }}
                      className={cn(
                        "flex-1 min-w-0 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-left transition-colors",
                        active ? "bg-brand-50 text-ink font-semibold" : "text-ink-soft hover:bg-surface-muted",
                      )}
                    >
                      <span className={cn("w-7 h-7 rounded-lg grid place-items-center shrink-0", active ? "bg-brand-500 text-white" : "bg-surface-muted text-ink-faint")}>
                        <Building2 size={14} />
                      </span>
                      <span className="truncate">{c.name}</span>
                      {active && <Check size={14} className="ml-auto shrink-0 text-brand-600" />}
                    </button>
                    {companies.length > 1 && (
                      confirmDelete === c.id ? (
                        <button
                          type="button"
                          onClick={() => { deleteCompany(c.id); setConfirmDelete(null); }}
                          className="shrink-0 text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg px-2 py-1.5"
                          title={`Permanently delete ${c.name} and all its data`}
                        >
                          Sure?
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(c.id)}
                          className="shrink-0 w-7 h-7 rounded-lg grid place-items-center text-ink-faint hover:text-red-500 hover:bg-red-50"
                          aria-label={`Delete ${c.name}`}
                          title={`Delete ${c.name} and all its data`}
                        >
                          <Trash2 size={13} />
                        </button>
                      )
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-line/60 mt-1.5 pt-1.5">
              {adding ? (
                <form
                  className="px-2 py-1.5 space-y-2"
                  onSubmit={(e) => { e.preventDefault(); submit(); }}
                >
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Company name…"
                    aria-label="New company name"
                    className="w-full text-sm border border-line rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-brand-400"
                  />
                  <div className="flex items-center gap-3 text-xs text-ink-soft">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="seed" checked={blank} onChange={() => setBlank(true)} className="accent-brand-500" />
                      Start blank
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="seed" checked={!blank} onChange={() => setBlank(false)} className="accent-brand-500" />
                      Start with sample data
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={!name.trim()}
                      className="flex-1 rounded-lg bg-brand-500 text-white text-sm font-medium py-2 hover:bg-brand-600 transition-colors disabled:opacity-40"
                    >
                      Create & switch
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAdding(false); setName(""); }}
                      className="rounded-lg border border-line text-sm text-ink-soft px-3 py-2 hover:bg-surface-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                >
                  <span className="w-7 h-7 rounded-lg bg-brand-50 grid place-items-center shrink-0"><Plus size={14} /></span>
                  Add company
                </button>
              )}
            </div>

            {/* Move data between machines / origins (e.g. localhost → live site) */}
            <div className="border-t border-line/60 mt-1.5 pt-1.5">
              <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-ink-faint font-bold">Backup &amp; transfer</div>
              <button
                type="button"
                onClick={onExport}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-soft hover:bg-surface-muted transition-colors"
                title="Download all companies and their data as a JSON file"
              >
                <span className="w-7 h-7 rounded-lg bg-surface-muted grid place-items-center shrink-0"><Download size={14} /></span>
                Export all data
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-soft hover:bg-surface-muted transition-colors"
                title="Load a previously exported data file into this browser"
              >
                <span className="w-7 h-7 rounded-lg bg-surface-muted grid place-items-center shrink-0"><Upload size={14} /></span>
                Import data…
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ""; }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
