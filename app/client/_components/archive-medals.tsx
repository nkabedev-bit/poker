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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-white/[0.08]" />
        <p className="text-center text-[13px] font-semibold uppercase tracking-wide text-white/40">
          Медали за архивные турниры
        </p>
        <span className="h-px flex-1 bg-white/[0.08]" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {medals.map((medal) => (
          <MedalCard key={medal.key} medal={medal} />
        ))}
      </div>
    </div>
  );
}
