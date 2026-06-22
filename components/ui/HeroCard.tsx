import { cn } from "@/lib/utils";

export function HeroCard({
  tag, value, unit, note, footLeft, footRight, className,
}: {
  tag: string; value: string; unit?: string; note?: string;
  footLeft?: string; footRight?: string; className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl3 p-5 text-white",
        "bg-gradient-to-br from-brand-500 to-brand-700",
        "shadow-[0_18px_36px_-18px_rgba(19,99,58,0.65)]",
        className,
      )}
    >
      <span aria-hidden className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-white/10" />
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-85">{tag}</p>
      <p className="mt-3 text-[34px] font-extrabold leading-none tracking-tight">
        {value}{unit && <span className="ml-1.5 text-[15px] font-semibold opacity-85">{unit}</span>}
      </p>
      {note && <p className="mt-1 text-[13px] font-semibold opacity-90">{note}</p>}
      {(footLeft || footRight) && (
        <div className="mt-3.5 flex items-center justify-between text-xs opacity-90">
          <span>{footLeft}</span>
          {footRight && <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-bold">{footRight}</span>}
        </div>
      )}
    </div>
  );
}
