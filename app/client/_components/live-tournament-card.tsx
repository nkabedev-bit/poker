"use client";

import Link from "next/link";
import { ChevronRight, Pause, Users } from "lucide-react";
import { formatClock, getLevelDuration } from "@/lib/timer/calculate";
import type { LiveTournament } from "./use-live-tournament";

/** The seconds at the end of a level that beat on the clock. */
const LAST_SECONDS = 10;

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
  // Which level is on, so a new one turns the blinds over and sends light across the card.
  const levelKey = `${live.roundNumber}:${live.isBreak ? "break" : "play"}`;
  const levelSeconds = getLevelDuration(live.currentLevel);
  const levelLeft = levelSeconds > 0 ? Math.min(1, live.remainingSeconds / levelSeconds) : 0;
  // The last seconds of a running level beat on the clock; a held clock keeps still.
  const lastSeconds = !live.isPaused && live.remainingSeconds > 0 && live.remainingSeconds <= LAST_SECONDS;
  const body = (
    <article className="relative overflow-hidden rounded-[22px] border border-[#c8163f]/35 bg-[linear-gradient(120deg,rgba(26,11,16,0.96),rgba(12,6,9,0.96))] shadow-[0_12px_36px_rgba(0,0,0,0.5)]">
      <span key={levelKey} aria-hidden className="client-sweep pointer-events-none absolute inset-0 z-10" />
      <div className="flex">
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate text-[17px] font-extrabold tracking-tight">
              {live.tournamentName}
            </p>
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#f05a7e]">
              {/* The ring that goes out and fades, the way a broadcast says it is live. */}
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f05a7e] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#f05a7e]" />
              </span>
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
              <p className="overflow-hidden text-[15px] font-bold tabular-nums">
                <span key={levelKey} className="client-flip-up">
                  {live.isBreak
                    ? "перерыв"
                    : `${formatBlind(live.currentLevel?.smallBlind)}/${formatBlind(live.currentLevel?.bigBlind)}`}
                </span>
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">В игре</p>
              <p className="flex items-center gap-1 overflow-hidden text-[15px] font-bold tabular-nums">
                <Users className="text-white/35" size={13} />
                <span key={live.activePlayers} className="client-flip-down">
                  {live.activePlayers}
                </span>
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
            <span className={lastSeconds ? "client-tick" : undefined}>
              {formatClock(live.remainingSeconds)}
            </span>
          </p>
          {/* What is left of the level, running down with the clock. */}
          <span className="mt-1 h-[3px] w-[70%] overflow-hidden rounded-full bg-black/25">
            <span
              className="block h-full origin-left rounded-full bg-white/85 transition-transform duration-1000 ease-linear"
              style={{ transform: `scaleX(${levelLeft})` }}
            />
          </span>
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
