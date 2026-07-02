"use client";

import { Flame, Droplets, Mountain, Snowflake, Zap, Wind, Award, Sun, Leaf, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FuelFamily } from "@/lib/activity-groups";
import { INSTRUMENTS } from "@/lib/scope2/model/instruments";
import type { Facility } from "@/lib/scope2/model/types";

// ─── Navigation state ──────────────────────────────────────────────────────

export type CatKey = FuelFamily | "refrigerants" | "electricity";

export type Nav =
  | { level: "esg" }          // E / S / G pillar pre-screen (entry point)
  | { level: "env" }          // Environment pillar: Energy & Emissions / Water / Waste
  | { level: "water" }
  | { level: "waste" }
  | { level: "home" }         // Energy & Emissions home (the Scope 1+2 categories)
  | { level: "bus" }
  | { level: "scope"; scope: 1 | 2 }
  | { level: "biogenic" }
  | { level: "cat"; key: CatKey }
  | { level: "elecbu"; bu: string }
  | { level: "entry"; kind: "combustion" | "facility" | "refrigerant"; id: string };

export type Sel = { kind: "refrigerant"; id: string } | null;

// ─── Category definitions ──────────────────────────────────────────────────

export type CatDef = { key: CatKey; label: string; scope: 1 | 2; meta: string; kind: "fuel" | "refrigerant" | "electricity" };

export const CAT_DEFS: CatDef[] = [
  { key: "liquid", label: "Fuels – Liquid", scope: 1, meta: "liquid", kind: "fuel" },
  { key: "gas", label: "Fuels – Gas", scope: 1, meta: "gaseous", kind: "fuel" },
  { key: "solid", label: "Fuels – Solid", scope: 1, meta: "solid", kind: "fuel" },
  { key: "biofuels", label: "Bio Fuels", scope: 1, meta: "biomass", kind: "fuel" },
  { key: "refrigerants", label: "Refrigerants & cooling", scope: 1, meta: "refrigerant", kind: "refrigerant" },
  { key: "electricity", label: "Electricity", scope: 2, meta: "electricity", kind: "electricity" },
];

// ─── Electricity sub-types ─────────────────────────────────────────────────

export const ELEC_TYPES: { key: string; label: string; gridEf: number; sub: string; icon: React.ElementType }[] = [
  { key: "grid", label: INSTRUMENTS.grid, gridEf: 0.71, sub: "Metered grid supply (location-based)", icon: Zap },
  { key: "vppa", label: INSTRUMENTS.vppa, gridEf: 0, sub: "Contractual renewable — lowers market-based Scope 2", icon: Wind },
  { key: "solar", label: INSTRUMENTS.solar, gridEf: 0, sub: "On-site solar generation, self-consumed", icon: Sun },
  { key: "irec", label: INSTRUMENTS.irec, gridEf: 0, sub: "Certificates — lower market-based Scope 2", icon: Award },
];

// ─── Visual maps ───────────────────────────────────────────────────────────

export const META: Record<string, { emoji: string; bg: string }> = {
  gaseous: { emoji: "🔥", bg: "#FEF3C7" },
  liquid: { emoji: "🛢️", bg: "#E0F2FE" },
  solid: { emoji: "🪨", bg: "#E5E7EB" },
  biomass: { emoji: "🌿", bg: "#DCFCE7" },
  refrigerant: { emoji: "❄️", bg: "#CFFAFE" },
  electricity: { emoji: "⚡", bg: "#E6F1F0" },
  outside: { emoji: "🌱", bg: "#ECFDF5" },
};

export const GRAD: Record<string, string> = {
  gaseous: "linear-gradient(135deg,#FFF7E0,#FCE3A0)",
  liquid: "linear-gradient(135deg,#EAF6FE,#BFE4FB)",
  solid: "linear-gradient(135deg,#F2F4F6,#D3DAE0)",
  biomass: "linear-gradient(135deg,#E9FCF0,#BBF3CD)",
  refrigerant: "linear-gradient(135deg,#E4FBFE,#A9EEF7)",
  electricity: "linear-gradient(135deg,#EAF4F2,#C3E2DC)",
};

export const CAT_ICON: Record<string, React.ElementType> = {
  gaseous: Flame, liquid: Droplets, solid: Mountain, biomass: Leaf, refrigerant: Snowflake, electricity: Zap,
};

export const ICON_COLOR: Record<string, string> = {
  gaseous: "#B45309", liquid: "#0369A1", solid: "#475569", biomass: "#15803D", refrigerant: "#0E7490", electricity: "#0F7873",
};

// ─── Small utilities ───────────────────────────────────────────────────────

export const facCO2e = (f: { annualLoadKwh: number; gridEf: number }) => (f.annualLoadKwh * f.gridEf) / 1000;

let _idc = 0;
export const newId = (p: string) => `${p}-${Date.now().toString(36)}-${_idc++}`;
export const showNum = (v: number) => Number(v.toFixed(4));
export const unitLabel = (u: string) => (u === "m3" ? "m³" : u);

// ─── Small shared components ───────────────────────────────────────────────

export function IconTile({ emoji, bg, size = "md", hover }: { emoji: string; bg: string; size?: "md" | "lg"; hover?: boolean }) {
  const s = size === "lg" ? "w-16 h-16 rounded-2xl text-3xl" : "w-9 h-9 rounded-xl text-lg";
  return <span style={{ background: bg }} className={cn("grid place-items-center shrink-0 transition-transform", s, hover && "group-hover:scale-110")}>{emoji}</span>;
}

// Always-visible toggle: is this source counted in the company-wide total?
export function CentralPill({ included, onClick, name }: { included: boolean; onClick: (e: React.MouseEvent) => void; name?: string }) {
  const desc = included ? "counted in company total" : "excluded from company total";
  return (
    <button
      onClick={onClick}
      title={included ? "Counted in company total — click to exclude" : "Excluded from company total — click to include"}
      aria-label={name ? `${name} — ${desc}` : desc}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border transition-colors shrink-0",
        included
          ? "bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100"
          : "bg-surface-muted text-ink-faint border-line hover:bg-surface"
      )}
    >
      <Building2 size={13} strokeWidth={2} />
      {included ? "In total" : "Excluded"}
    </button>
  );
}

export function ScopeBadge({ scope }: { scope: 1 | 2 | "outside" }) {
  if (scope === "outside") return <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-surface-muted text-ink-soft border border-line/70">Outside</span>;
  return <span className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5", scope === 1 ? "bg-brand-50 text-brand-700" : "bg-oren-100 text-oren-700")}>Scope {scope}</span>;
}
