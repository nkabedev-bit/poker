import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { PlayerAvatar } from "./player-avatar";
import { formatEventDayLabel, formatEventTimeLabel } from "@/lib/events/types";
import { toOwnOriginMediaUrl } from "@/lib/media/own-origin-url";
import { countWord } from "@/lib/raffle/raffle-scenes";
import { hasKnownStartTime } from "@/lib/results/imported-games";

/** A past game as the club's list shows it. */
export type PastGameCardData = {
  players: number;
  posterUrl: string | null;
  startedAt: string;
  title: string;
  winner: { avatarUrl: string | null; hand: string | null; name: string } | null;
};

/**
 * A game the club has played: its poster, when it ran, how many sat down and who won
 * it. Opens the finishing table.
 */
export function PastGameCard({ game }: { game: PastGameCardData }) {
  return (
    <Link
      className="flex gap-3.5 rounded-[20px] border border-club-line bg-club-surface p-3.5 transition active:scale-[0.99]"
      href={`/client/games/${encodeURIComponent(game.startedAt)}`}
    >
      <div className="relative h-[72px] w-[60px] shrink-0 overflow-hidden rounded-2xl bg-[#3a0e1a]">
        {game.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-80 saturate-[0.7]"
            src={toOwnOriginMediaUrl(game.posterUrl)}
          />
        ) : (
          <span aria-hidden className="absolute -right-2 -top-3 text-[64px] leading-none text-white/[0.08]">
            ♠
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="truncate text-[16px] font-extrabold leading-tight">{game.title}</h3>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-club-muted">
            <span>{formatEventDayLabel(game.startedAt)}</span>
            {/* A game imported from the sheets has a date and no start time. */}
            {hasKnownStartTime(game.startedAt) ? (
              <>
                <span className="text-club-faint">·</span>
                <span>{formatEventTimeLabel(game.startedAt)}</span>
              </>
            ) : null}
            <span className="text-club-faint">·</span>
            <span>{countWord(game.players, ["игрок", "игрока", "игроков"])}</span>
          </p>
        </div>

        {game.winner ? (
          <div className="flex min-w-0 items-center gap-2">
            <PlayerAvatar
              hand={game.winner.hand}
              name={game.winner.name}
              photoUrl={game.winner.avatarUrl ?? undefined}
              size={26}
            />
            <span className="min-w-0 truncate text-[14px] font-bold">{game.winner.name}</span>
            <Trophy className="shrink-0 text-club-gold" size={15} />
          </div>
        ) : null}
      </div>

      <ChevronRight className="shrink-0 self-center text-club-faint" size={18} />
    </Link>
  );
}
