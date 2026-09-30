"use client";

import Link from "next/link";
import { ChevronRight, Pause } from "lucide-react";
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
  const ante = live.currentLevel?.ante ?? 0;
  const body = (
    <article className="relative overflow-hidden rounded-[22px] border border-club-rose/45 bg-club-surface shadow-[0_14px_40px_rgba(200,33,63,0.18)]">
      <span key={levelKey} aria-hidden className="client-sweep pointer-events-none absolute inset-0 z-10" />

      <div className="flex items-center justify-between px-4 pt-3.5">
        <span className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-club-rose">
          {/* The ring that goes out and fades, the way a broadcast says it is live. */}
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-club-rose opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-club-rose" />
          </span>
          идёт игра
        </span>
        {live.isPaused ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-club-gold">
            <Pause size={11} /> пауза
          </span>
        ) : href ? (
          <span className="inline-flex items-center gap-0.5 text-[13px] font-bold text-club-muted">
            Открыть
            <ChevronRight size={16} />
          </span>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-3 px-4 pb-3.5 pt-2.5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-[16px] font-extrabold">{live.tournamentName}</p>
          <p className="overflow-hidden text-[13px] text-club-muted">
            <span key={levelKey} className="client-flip-up inline-block">
              {live.isBreak ? (
                <span>перерыв</span>
              ) : (
                <>
                  <span>{live.roundNumber} уровень</span> · блайнды{" "}
                  <span className="tabular-nums">
                    {formatBlind(live.currentLevel?.smallBlind)}/{formatBlind(live.currentLevel?.bigBlind)}
                  </span>
                  {ante > 0 ? (
                    <>
                      {" · "}
                      <span>Анте {formatBlind(ante)}</span>
                    </>
                  ) : null}
                </>
              )}
            </span>
          </p>
        </div>
        <p className="shrink-0 font-display text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
          <span className={lastSeconds ? "client-tick" : undefined}>{formatClock(live.remainingSeconds)}</span>
        </p>
      </div>

      {/* What is left of the level, running down with the clock. */}
      <div className="px-4">
        <span className="block h-1 overflow-hidden rounded-full bg-white/[0.08]">
          <span
            className="block h-full origin-left rounded-full bg-club-rose transition-transform duration-1000 ease-linear"
            style={{ transform: `scaleX(${levelLeft})` }}
          />
        </span>
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-px border-t border-club-line bg-club-line">
        <div className="flex flex-col gap-1 bg-club-surface px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-club-faint">В игре</p>
          <p className="flex items-baseline overflow-hidden font-display text-[17px] font-semibold tabular-nums">
            <span key={live.activePlayers} className="client-flip-down inline-block">
              {live.activePlayers}
            </span>
            {live.totalPlayers > live.activePlayers ? (
              <span className="text-[13px] text-club-faint">&nbsp;/ {live.totalPlayers}</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-col gap-1 bg-club-surface px-4 py-3">
          {registrationLeft ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-club-faint">Запись ещё</p>
              <p className="font-display text-[17px] font-semibold tabular-nums">{registrationLeft}</p>
            </>
          ) : (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-club-faint">Запись</p>
              <p className="font-display text-[17px] font-semibold text-club-muted">закрыта</p>
            </>
          )}
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
