import { cn } from "@/lib/utils";

/** Small status pill — light-green for positive/on-track, amber for off-track. */
export function DeltaPill({
  children,
  tone = "good",
}: {
  children: React.ReactNode;
  tone?: "good" | "warn" | "neutral";
}) {
  return (
    <span
      className={cn(
        "text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap",
        tone === "good" && "bg-brand-50 text-brand-600",
        tone === "warn" && "bg-amber-50 text-amber-700",
        tone === "neutral" && "bg-surface-muted text-ink-soft",
      )}
    >
      {children}
    </span>
  );
}
