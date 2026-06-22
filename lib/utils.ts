import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { CURRENCY } from "./defaults";

/** Merge Tailwind class names, de-duplicating conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Thousands-separated integer, e.g. 12345 → "12,345". */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

/** Fixed-decimal number with thousands separators, e.g. 1234.5 → "1,234.5". */
export function fmtNum(n: number, dp = 1): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/** Percentage with a sign for deltas, e.g. 0.523 → "52%". */
export function pct(fraction: number, dp = 0): string {
  return `${(fraction * 100).toFixed(dp)}%`;
}

/** Compact tonnes, e.g. 6300 → "6.3k". */
export function fmtK(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}

/** Compact Indian currency: ₹1.25 Cr / ₹3.4 L / ₹12,345 (sign preserved). */
export function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${CURRENCY}${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${CURRENCY}${(n / 1e5).toFixed(1)} L`;
  return `${CURRENCY}${fmt(n)}`;
}
