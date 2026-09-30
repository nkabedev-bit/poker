import Link from "next/link";

/** A game in somebody's history: its name, when it was and the place they finished in. */
export function PlayedGameRow({
  href,
  place,
  subtitle,
  title,
}: {
  href: string;
  place: number | null;
  subtitle: string;
  title: string;
}) {
  return (
    <Link
      className="flex items-center gap-3 rounded-[18px] border border-club-line bg-club-surface px-4 py-3.5 transition active:scale-[0.99]"
      href={href}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-[15px] font-extrabold">{title}</p>
        <p className="truncate text-[12px] text-club-muted">{subtitle}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-display text-[20px] font-semibold text-club-gold">{place ?? "—"}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-club-faint">место</span>
      </div>
    </Link>
  );
}
