"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { CLUB_FONT_CLASSES } from "../fonts";
import { getClientTelegramWebApp } from "../layout";
import { PlayerAvatar } from "./player-avatar";
import type { RatingPlayer } from "./rating-row";
import { GhostButton } from "./ui";
import { formatEventDayLabel } from "@/lib/events/types";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { countWord } from "@/lib/raffle/raffle-scenes";
import type { NextCountedGame } from "@/lib/seasons/season";

type SeasonGame = { place: number | null; points: number; startedAt: string; title: string };

type SeasonGames = {
  counted: SeasonGame[];
  countedGames: number | null;
  dropped: SeasonGame[];
  next: NextCountedGame | null;
};

/** How far the sheet has to be pulled down before it lets go. */
const SWIPE_CLOSE_PX = 96;

/** The word a number takes, without the number: a figure here is spelled with its spaces. */
function wordFor(count: number, forms: [string, string, string]) {
  return countWord(count, forms).split(" ").slice(1).join(" ");
}

function describeRule(countedGames: number | null, played: number, closed: boolean) {
  const go = closed ? "шли" : "идут";

  if (countedGames === null) return `В зачёт ${go} все игры`;
  if (played > countedGames) {
    const best = wordFor(countedGames, ["лучшая", "лучшие", "лучших"]);
    return `В зачёт ${go} ${countedGames} ${best} из ${played} ${wordFor(played, ["игры", "игр", "игр"])}`;
  }

  const rule = `В зачёт ${go} ${countWord(countedGames, ["лучшая игра", "лучшие игры", "лучших игр"])}`;
  return played > 0 ? `${rule}, сыграно ${played}` : rule;
}

function describeNext(next: NextCountedGame) {
  if (next.kind === "any") {
    const games = wordFor(next.left, ["игра", "игры", "игр"]);
    const verb = wordFor(next.left, ["пойдёт", "пойдут", "пойдут"]);
    return `Ещё ${next.left} ${games} ${verb} в зачёт в любом случае`;
  }

  const points = next.points.toLocaleString("ru-RU");
  return `Следующая игра заменит худшую, если набрать больше ${points} ${wordFor(next.points, ["очка", "очков", "очков"])}`;
}

/** A game of the season: where it was, how the player finished and what it brought. */
function SeasonGameRow({ counted, game }: { counted: boolean; game: SeasonGame }) {
  const details = [formatEventDayLabel(game.startedAt), game.place ? `${game.place} место` : null];

  return (
    <Link
      className={`flex items-center gap-3 rounded-[18px] border px-4 py-3 transition active:scale-[0.99] ${
        counted ? "border-club-line bg-club-surface" : "border-club-line/60"
      }`}
      href={`/client/games/${encodeURIComponent(game.startedAt)}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={`truncate text-[15px] font-extrabold ${counted ? "" : "text-club-faint"}`}>{game.title}</p>
        <p className={`truncate text-[12px] ${counted ? "text-club-muted" : "text-club-faint"}`}>
          {details.filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className={`font-display text-[20px] font-semibold ${counted ? "text-club-gold" : "text-club-faint"}`}>
          {game.points.toLocaleString("ru-RU")}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-club-faint">очки</span>
      </div>
    </Link>
  );
}

function GameGroup({ counted, games, title }: { counted: boolean; games: SeasonGame[]; title: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-club-faint">
        {title} · {games.length}
      </h3>
      {games.map((game) => (
        <SeasonGameRow key={game.startedAt} counted={counted} game={game} />
      ))}
    </section>
  );
}

/**
 * Which of a player's games count in a season and which stay behind, over the rating they
 * were opened from. The games lead to their finishing tables, the head to the profile.
 */
export function SeasonGamesSheet({
  initData,
  onClose,
  player,
  season,
}: {
  initData: string;
  onClose: () => void;
  player: RatingPlayer;
  season: { id: string; status: "open" | "closed" };
}) {
  const [games, setGames] = useState<SeasonGames | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [dragged, setDragged] = useState(0);
  const dragFrom = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const playerKey = buildNicknameKey(player.name);
  const closed = season.status === "closed";

  useEffect(() => {
    const request = new AbortController();
    const query = new URLSearchParams({ player: playerKey, season: season.id });

    void fetch(`/api/client-tma/rating/games?${query}`, {
      headers: { "X-Telegram-Init-Data": initData },
      signal: request.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Season games answered ${res.status}`);
        setGames((await res.json()) as SeasonGames);
      })
      .catch(() => {
        if (!request.signal.aborted) setFailed(true);
      });

    return () => request.abort();
  }, [attempt, initData, playerKey, season.id]);

  // Telegram folds the app away on a swipe down, which is just what closing this looks like.
  useEffect(() => {
    const tg = getClientTelegramWebApp();
    if (!tg?.disableVerticalSwipes || !tg.isVersionAtLeast?.("7.7")) return;

    const wasEnabled = tg.isVerticalSwipesEnabled !== false;
    tg.disableVerticalSwipes();
    return () => {
      if (wasEnabled) tg.enableVerticalSwipes?.();
    };
  }, []);

  // A keyboard starts inside the sheet, and goes back to the row it was opened from.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetRef.current?.focus({ preventScroll: true });

    return () => opener?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  // Pulled down from the top of its list the sheet follows the finger; anywhere else a
  // swipe just scrolls the games.
  const startDrag = (event: TouchEvent) => {
    dragFrom.current = (sheetRef.current?.scrollTop ?? 0) <= 0 ? event.touches[0].clientY : null;
  };
  const moveDrag = (event: TouchEvent) => {
    if (dragFrom.current === null) return;

    const distance = event.touches[0].clientY - dragFrom.current;
    if (distance < 0) dragFrom.current = null;
    setDragged(Math.max(0, distance));
  };
  const endDrag = () => {
    dragFrom.current = null;
    if (dragged > SWIPE_CLOSE_PX) onClose();
    else setDragged(0);
  };

  const played = games ? games.counted.length + games.dropped.length : 0;
  const countedPoints = games?.counted.reduce((total, game) => total + game.points, 0) ?? 0;
  // A closed season's table is what the club announced, and it need not add up to the games
  // stored today: 68 lines of the three summer seasons do not.
  const differsFromTable =
    closed && played > 0 && player.points !== null && Math.abs(countedPoints - player.points) > 0.01;

  // Drawn on the page's body: the menu at the bottom of the app would otherwise sit on top
  // of the list. On a phone it comes up from the bottom edge, on a wider screen it stands
  // in the middle.
  return createPortal(
    <div
      aria-label={`Игры игрока ${player.name}`}
      aria-modal="true"
      className={`client-app ${CLUB_FONT_CLASSES} fixed inset-0 z-50 flex items-end justify-center bg-[rgba(5,3,4,0.72)] backdrop-blur-sm sm:items-center sm:px-4`}
      role="dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className={`client-sheet-up flex max-h-[92dvh] w-full max-w-[480px] flex-col gap-4 overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-club-line bg-[#151012] px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 text-club-text outline-none sm:rounded-[28px] sm:border sm:pb-5 md:p-7 md:shadow-[0_30px_80px_rgba(0,0,0,0.6)] ${
          dragged ? "" : "transition-transform duration-200"
        }`}
        style={dragged ? { transform: `translateY(${dragged}px)` } : undefined}
        tabIndex={-1}
        onTouchEnd={endDrag}
        onTouchMove={moveDrag}
        onTouchStart={startDrag}
      >
        <span aria-hidden className="h-[5px] w-10 shrink-0 self-center rounded-full bg-white/[0.18] md:hidden" />

        <div className="flex shrink-0 items-center gap-3">
          <PlayerAvatar hand={player.hand} name={player.name} photoUrl={player.avatarUrl ?? undefined} size={44} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 pl-1">
            <p className="truncate font-display text-[20px] font-semibold">{player.name}</p>
            <p className="truncate text-[13px] text-club-muted">
              {player.place ? `${player.place} место` : "Нет в таблице"}
              {player.points !== null
                ? ` · ${player.points.toLocaleString("ru-RU")} ${wordFor(player.points, ["очко", "очка", "очков"])}`
                : ""}
            </p>
          </div>
          <button
            aria-label="Закрыть"
            className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-[14px] border border-club-line bg-white/[0.06]"
            type="button"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <Link
          className="flex h-11 shrink-0 items-center justify-between rounded-[14px] border border-club-line bg-white/[0.04] px-3.5 text-[14px] font-bold"
          href={`/client/players/${encodeURIComponent(playerKey)}`}
        >
          Профиль игрока
          <ChevronRight className="text-club-faint" size={18} />
        </Link>

        {failed ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-club-muted">Не получилось загрузить игры. Проверьте связь и попробуйте ещё раз.</p>
            <GhostButton
              type="button"
              onClick={() => {
                setFailed(false);
                setAttempt((count) => count + 1);
              }}
            >
              Повторить
            </GhostButton>
          </div>
        ) : !games ? (
          <div aria-busy="true" aria-label="Загрузка" className="flex flex-col gap-2" role="status">
            <span className="client-skeleton block h-5 w-3/4 rounded-lg" />
            <span className="client-skeleton mt-2 block h-[66px] rounded-[18px]" />
            <span className="client-skeleton block h-[66px] rounded-[18px]" />
            <span className="client-skeleton block h-[66px] rounded-[18px]" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-[14px] font-semibold">{describeRule(games.countedGames, played, closed)}</p>
              {games.next ? <p className="text-[13px] leading-snug text-club-muted">{describeNext(games.next)}</p> : null}
              {differsFromTable ? (
                <p className="text-[13px] leading-snug text-club-muted">
                  Итог сезона зафиксирован при закрытии и может не совпадать с суммой игр.
                </p>
              ) : null}
            </div>

            {played === 0 ? (
              <p className="py-4 text-center text-sm text-club-muted">
                {closed ? "Игры этого сезона не сохранились: есть только итог." : "В этом зачёте игр пока нет."}
              </p>
            ) : (
              <>
                <GameGroup counted games={games.counted} title="В зачёте" />
                {games.dropped.length > 0 ? (
                  <GameGroup counted={false} games={games.dropped} title="Не в зачёте" />
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
