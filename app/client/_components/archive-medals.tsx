import { MedalCard } from "./award-cards";
import type { Medal } from "@/lib/client/medals";

/**
 * Медали за турниры, которых клуб больше не проводит.
 *
 * Идут под действующими и в их счётчик не входят: «Получено N / 7» говорит о том, что
 * можно выиграть сегодня, а здесь — то, что уже не разыграть.
 */
export function ArchiveMedals({ medals }: { medals: Medal[] }) {
  if (medals.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <p className="px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-club-faint">
        Медали за архивные турниры
      </p>

      <div className="grid grid-cols-3 gap-2.5 md:grid-cols-4 md:gap-4">
        {medals.map((medal) => (
          <MedalCard key={medal.key} medal={medal} />
        ))}
      </div>
    </div>
  );
}
