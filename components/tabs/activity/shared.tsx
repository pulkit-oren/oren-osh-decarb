"use client";

import { Flame, Droplets, Mountain, Snowflake, Zap, Wind, Award, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FuelFamily } from "@/lib/activity-groups";
import type { Facility } from "@/lib/scope2/model/types";

// ─── Navigation state ──────────────────────────────────────────────────────

export type CatKey = FuelFamily | "refrigerants" | "electricity";

export type Nav =
  | { level: "home" }
  | { level: "bus" }
  | { level: "scope"; scope: 1 | 2 }
  | { level: "cat"; key: CatKey }
  | { level: "type"; key: CatKey; typeKey: string; cat?: "stationary" | "mobile" }
  | { level: "entry"; kind: "combustion" | "facility"; id: string };

export type Sel = { kind: "refrigerant"; id: string } | null;

// ─── Category definitions ──────────────────────────────────────────────────

export type CatDef = { key: CatKey; label: string; scope: 1 | 2; meta: string; kind: "fuel" | "refrigerant" | "electricity" };

export const CAT_DEFS: CatDef[] = [
  { key: "liquid", label: "Fuels – Liquid", scope: 1, meta: "liquid", kind: "fuel" },
  { key: "gas", label: "Fuels – Gas", scope: 1, meta: "gaseous", kind: "fuel" },
  { key: "solid", label: "Fuels – Solid", scope: 1, meta: "solid", kind: "fuel" },
  { key: "refrigerants", label: "Refrigerants & cooling", scope: 1, meta: "refrigerant", kind: "refrigerant" },
  { key: "electricity", label: "Electricity", scope: 2, meta: "electricity", kind: "electricity" },
];

// ─── Electricity sub-types ─────────────────────────────────────────────────

export const ELEC_TYPES: { key: string; label: string; gridEf: number; sub: string; icon: React.ElementType }[] = [
  { key: "grid", label: "Grid electricity purchased", gridEf: 0.71, sub: "Metered grid supply (location-based)", icon: Zap },
  { key: "vppa", label: "Virtual PPA (VPPA)", gridEf: 0, sub: "Contractual renewable — market-based", icon: Wind },
  { key: "irec", label: "I-REC / REC", gridEf: 0, sub: "Renewable energy certificates", icon: Award },
  { key: "any", label: "Other / Any", gridEf: 0.71, sub: "Any other electricity source", icon: Plug },
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
  gaseous: Flame, liquid: Droplets, solid: Mountain, refrigerant: Snowflake, electricity: Zap,
};

export const ICON_COLOR: Record<string, string> = {
  gaseous: "#B45309", liquid: "#0369A1", solid: "#475569", refrigerant: "#0E7490", electricity: "#0F7873",
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

export function ScopeBadge({ scope }: { scope: 1 | 2 | "outside" }) {
  if (scope === "outside") return <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-surface-muted text-ink-soft border border-line/70">Outside</span>;
  return <span className={cn("text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5", scope === 1 ? "bg-brand-50 text-brand-700" : "bg-oren-100 text-oren-700")}>Scope {scope}</span>;
}
