import Link from "next/link";
import { CalendarDays, Clock, Trophy, Users } from "lucide-react";
import { Chip } from "./ui";
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
 * A game the club has played: its poster dimmed, when it ran, how many sat down and who
 * won it. Opens the finishing table.
 */
export function PastGameCard({ game }: { game: PastGameCardData }) {
  return (
    <Link
      className="block transition-transform active:scale-[0.99]"
      href={`/client/games/${encodeURIComponent(game.startedAt)}`}
    >
      <article className="relative min-h-[156px] overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#1a0b10] shadow-[0_12px_36px_rgba(0,0,0,0.5)]">
        {game.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70 saturate-[0.6]"
            src={toOwnOriginMediaUrl(game.posterUrl)}
          />
        ) : (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#3a0c18] via-[#1a070c] to-[#0a0608]" />
        )}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(6,3,4,0.95)_0%,rgba(6,3,4,0.86)_42%,rgba(6,3,4,0.4)_75%,rgba(6,3,4,0.15)_100%)]" />

        <span className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white/60">
          Завершён
        </span>

        <div className="relative flex h-full flex-col gap-3 p-4">
          <h3 className="max-w-[68%] text-[21px] font-extrabold uppercase leading-[1.05] tracking-tight">
            {game.title}
          </h3>

          <div className="flex flex-wrap gap-2">
            <Chip>
              <CalendarDays size={13} /> {formatEventDayLabel(game.startedAt)}
            </Chip>
            {/* A game imported from the sheets has a date and no start time. */}
            {hasKnownStartTime(game.startedAt) ? (
              <Chip>
                <Clock size={13} /> {formatEventTimeLabel(game.startedAt)}
              </Chip>
            ) : null}
            <Chip>
              <Users size={13} /> {countWord(game.players, ["игрок", "игрока", "игроков"])}
            </Chip>
          </div>

          {game.winner ? (
            <div className="mt-auto flex items-center gap-2.5">
              <PlayerAvatar
                hand={game.winner.hand}
                name={game.winner.name}
                photoUrl={game.winner.avatarUrl ?? undefined}
                size={30}
              />
              <span className="min-w-0 truncate text-[14px] font-bold">{game.winner.name}</span>
              <Trophy className="shrink-0 text-[#e9c07a]" size={15} />
            </div>
          ) : null}
        </div>
      </article>
    </Link>
  );
}
