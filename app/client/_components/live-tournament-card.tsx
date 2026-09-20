"use client";

import Link from "next/link";
import { ChevronRight, Pause, Users } from "lucide-react";
import { formatClock } from "@/lib/timer/calculate";
import type { LiveTournament } from "./use-live-tournament";

function formatBlind(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString("ru-RU");
}

/** How much of the registration window is left, in the words the club uses out loud. */
export function formatRegistrationLeft(closesAt: string | null, now: Date) {
  if (!closesAt) return null;

  const left = new Date(closesAt).getTime() - now.getTime();
  if (!Number.isFinite(left) || left <= 0) return null;

  const minutes = Math.ceil(left / 60_000);
  const hours = Math.floor(minutes / 60);

  if (hours === 0) return `${minutes} мин`;

  return `${hours} ч ${minutes % 60} мин`;
}

/**
 * The game being played, on the screen a player opens first.
 *
 * Says what somebody on their way to the club actually asks: which level the room is
 * on, how long that level has left, how many are still in, and whether they can still
 * make it in time to play.
 */
export function LiveTournamentCard({
  live,
  now = new Date(),
  href,
}: {
  live: LiveTournament;
  now?: Date;
  href?: string;
}) {
  const registrationLeft = formatRegistrationLeft(live.registrationClosesAt, now);
  const body = (
    <article className="relative overflow-hidden rounded-[22px] border border-[#c8163f]/35 bg-[linear-gradient(120deg,rgba(26,11,16,0.96),rgba(12,6,9,0.96))] shadow-[0_12px_36px_rgba(0,0,0,0.5)]">
      <div className="flex">
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate text-[17px] font-extrabold tracking-tight">
              {live.tournamentName}
            </p>
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#f05a7e]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f05a7e]" />
              идёт игра
            </span>
          </div>

          {href ? (
            <p className="mt-0.5 flex items-center gap-0.5 text-[13px] text-white/40">
              открыть турнир
              <ChevronRight size={14} />
            </p>
          ) : null}

          <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">
                {(live.currentLevel?.ante ?? 0) > 0
                  ? `Анте ${formatBlind(live.currentLevel?.ante)}`
                  : "Блайнды"}
              </p>
              <p className="text-[15px] font-bold tabular-nums">
                {live.isBreak
                  ? "перерыв"
                  : `${formatBlind(live.currentLevel?.smallBlind)}/${formatBlind(live.currentLevel?.bigBlind)}`}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">В игре</p>
              <p className="flex items-center gap-1 text-[15px] font-bold tabular-nums">
                <Users className="text-white/35" size={13} />
                {live.activePlayers}
                {live.totalPlayers > live.activePlayers ? (
                  <span className="text-[13px] font-semibold text-white/35">
                    /{live.totalPlayers}
                  </span>
                ) : null}
              </p>
            </div>

            {registrationLeft ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">
                  Запись ещё
                </p>
                <p className="text-[15px] font-bold tabular-nums">{registrationLeft}</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex w-[104px] shrink-0 flex-col items-center justify-center gap-1 bg-[linear-gradient(160deg,#c8163f,#7d0d26)] px-2 py-4 text-center">
          <p className="text-[10px] font-bold uppercase leading-tight tracking-wider text-white/70">
            {live.isBreak ? "перерыв" : `${live.roundNumber} уровень`}
          </p>
          <p className="text-[26px] font-extrabold leading-none tabular-nums">
            {formatClock(live.remainingSeconds)}
          </p>
          {live.isPaused ? (
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/75">
              <Pause size={10} /> пауза
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );

  if (!href) return body;

  return (
    <Link className="block transition-transform active:scale-[0.99]" href={href}>
      {body}
    </Link>
  );
}
