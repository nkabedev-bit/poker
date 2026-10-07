import { Lock, Swords } from "lucide-react";
import { PageTitle } from "../_components/ui";

/** The locked levels drawn under the announcement: a shape of what is coming, no content. */
const TEASER_LEVELS = [1, 2, 3, 4, 5, 6];

/**
 * The season's battle pass, announced before it exists: which achievements count
 * and what they win is still being settled, so for now the tab only says it is coming.
 */
export default function ClientBattlePassPage() {
  return (
    <div className="client-stagger flex flex-col gap-6 pt-1 md:pt-0 desk:gap-8">
      <PageTitle>Боевой пропуск</PageTitle>

      <div className="flex flex-col items-center gap-3 rounded-3xl border border-club-line bg-club-surface px-5 py-7 text-center md:py-12">
        <span className="client-float client-glint relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-[20px] bg-club-crimson/15 text-club-rose">
          <Swords size={30} />
        </span>
        <p className="font-display text-[24px] font-semibold">Скоро</p>
      </div>

      <div aria-hidden className="flex flex-col gap-2.5 opacity-70 md:grid md:grid-cols-2 md:gap-3.5 desk:grid-cols-3">
        {TEASER_LEVELS.map((level) => (
          <div key={level} className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-dashed border-club-line bg-club-surface font-display text-[14px] font-semibold text-club-faint">
              {level}
            </span>
            <div className="flex h-14 flex-1 items-center justify-between rounded-2xl border border-club-line bg-club-surface px-4">
              <span className="h-2 rounded-full bg-white/[0.06]" style={{ width: 120 - level * 8 }} />
              <Lock className="text-club-faint" size={16} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
