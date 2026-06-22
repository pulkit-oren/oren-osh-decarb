import { cn } from "@/lib/utils";
import type { Grade } from "@/lib/data-quality";

const MAP: Record<Grade, { label: string; cls: string; dot: string }> = {
  measured:  { label: "Measured",   cls: "text-brand-700 bg-brand-50", dot: "bg-good" },
  estimated: { label: "Estimated",  cls: "text-warn bg-amber-50",      dot: "bg-warn" },
  missing:   { label: "Needs data", cls: "text-bad bg-red-50",         dot: "bg-bad" },
};

export function ReliabilityBadge({ grade, className }: { grade: Grade; className?: string }) {
  const m = MAP[grade];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", m.cls, className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}
