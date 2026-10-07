"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarDays, Clock, Crosshair, Crown, Trophy, Users, Zap } from "lucide-react";
import { useClientTMA } from "../../layout";
import { GhostButton, LoadingScreen, Pill, ScreenMessage, SectionHeader } from "../../_components/ui";
import { RatingRow } from "../../_components/rating-row";
import { PlayerAvatar } from "../../_components/player-avatar";
import { useSuitBurst } from "../../_components/suit-burst";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  formatEventWeekdayLabel,
} from "@/lib/events/types";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { type PlayerTier } from "@/lib/players/tier";
import { hasKnownStartTime } from "@/lib/results/imported-games";

type ResultRow = {
  avatarUrl: string | null;
  /** Their favourite hand ("QsTs"), drawn on the avatar. */
  hand?: string | null;
  isMe: boolean;
  knockouts: number;
  place: number | null;
  playerName: string;
  points: number;
  tier: PlayerTier | null;
};

type GameResponse = {
  game: { countsForRating?: boolean; playedOn: string; startedAt: string; title: string };
  rows: ResultRow[];
};

/** Gold, silver and bronze: the ring round a face and the edge of its step. */
const PODIUM_COLORS: Record<number, string> = { 1: "#e2bc6e", 2: "#c9cdd3", 3: "#c98b5e" };

/** The podium is read left to right as the room sees it: second, first, third. */
const PODIUM_ORDER = [2, 1, 3] as const;

/**
 * How tall each step of the podium stands, how large the face on it is, and when each
 * comes in: the steps grow third, second, first, and the faces land on them in the same
 * order, so the winner arrives last.
 */
const PODIUM_STEP: Record<number, { avatar: number; landsMs: number; risesMs: number; step: string }> = {
  1: { avatar: 64, landsMs: 750, risesMs: 360, step: "h-[116px]" },
  2: { avatar: 52, landsMs: 600, risesMs: 180, step: "h-[88px]" },
  3: { avatar: 52, landsMs: 450, risesMs: 0, step: "h-[70px]" },
};

/** When a player who made the podium gets their suits: once everybody has landed. */
const PODIUM_CHEER_MS = 1_450;

function profileHref(name: string) {
  return `/client/players/${encodeURIComponent(buildNicknameKey(name))}`;
}

/**
 * The first three of the evening, on their steps: face, nickname, points and knockouts.
 * A game with fewer than three finishers shows the steps it has.
 */
function Podium({ rows }: { rows: ResultRow[] }) {
  const { burst, fire } = useSuitBurst();
  const meOnPodium = rows.some((row) => row.isMe);

  useEffect(() => {
    if (!meOnPodium) return;

    const timer = window.setTimeout(fire, PODIUM_CHEER_MS);
    return () => window.clearTimeout(timer);
  }, [fire, meOnPodium]);

  // The top padding is the winner's crown's room.
  return (
    <div className="grid grid-cols-3 items-end gap-2.5 pt-8">
      {PODIUM_ORDER.map((place) => {
        const row = rows.find((item) => item.place === place);
        if (!row) return <div key={place} />;

        const { landsMs, risesMs } = PODIUM_STEP[place];

        return (
          <Link
            key={place}
            className="relative flex min-w-0 flex-col items-center gap-2 text-center"
            href={profileHref(row.playerName)}
          >
            {row.isMe ? burst : null}
            {place === 1 ? (
              <Crown
                aria-hidden
                className="client-crown-in absolute -top-7 left-1/2 -translate-x-1/2 text-club-gold"
                fill="rgba(226,188,110,0.25)"
                size={24}
                strokeWidth={1.8}
              />
            ) : null}
            <span
              className="client-drop rounded-full"
              style={{
                animationDelay: `${landsMs}ms`,
                boxShadow: `0 0 0 2px #0d0a0b, 0 0 0 4px ${PODIUM_COLORS[place]}`,
              }}
            >
              <PlayerAvatar
                hand={row.hand}
                name={row.playerName}
                photoUrl={row.avatarUrl ?? undefined}
                size={PODIUM_STEP[place].avatar}
              />
            </span>
            <span
              className={`client-rise w-full truncate text-[13px] font-extrabold ${row.isMe ? "text-club-rose" : ""}`}
              style={{ animationDelay: `${landsMs + 120}ms` }}
            >
              {row.playerName}
            </span>
            <span
              className="client-rise flex items-center gap-2.5 text-[12px] font-bold text-club-muted"
              style={{ animationDelay: `${landsMs + 160}ms` }}
            >
              <span className="flex items-center gap-0.5">
                {row.points.toLocaleString("ru-RU")}
                <Zap className="text-club-gold" fill="currentColor" size={11} />
              </span>
              <span className="flex items-center gap-0.5">
                <Crosshair size={11} />
                {Math.round(row.knockouts)}
              </span>
            </span>
            <span
              className={`client-podium-step flex w-full items-center justify-center rounded-b-md rounded-t-2xl border border-club-line bg-club-surface font-display text-[22px] font-bold ${PODIUM_STEP[place].step}`}
              style={{
                animationDelay: `${risesMs}ms`,
                borderTop: `2px solid ${PODIUM_COLORS[place]}`,
                color: PODIUM_COLORS[place],
              }}
            >
              {place}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** One cell of the summary under the title: an icon, a value and what it is. */
function SummaryCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-3 first:pl-0 last:pr-0">
      <span className="text-club-gold">{icon}</span>
      <span className="truncate font-display text-[15px] font-semibold">{value}</span>
      <span className="truncate text-[12px] capitalize text-club-muted">{label}</span>
    </div>
  );
}

export default function ClientGamePage() {
  const { initData } = useClientTMA();
  const params = useParams<{ startedAt: string }>();
  const startedAt = params?.startedAt;

  const [data, setData] = useState<GameResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!startedAt) return;
    try {
      const res = await fetch(`/api/client-tma/games/${encodeURIComponent(startedAt)}`, {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [initData, startedAt]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (loading) return <LoadingScreen shape="results" />;

  if (!data) {
    return (
      <ScreenMessage
        action={
          <Link href="/client/profile">
            <GhostButton>К профилю</GhostButton>
          </Link>
        }
        icon={<Trophy size={30} />}
        title="Игра не найдена"
        subtitle="Возможно, результаты этой игры ещё не записаны."
      />
    );
  }

  // The first three stand on the podium; the table goes on from fourth. A game stored
  // without places has no podium, and the table then holds everybody.
  const podium = data.rows.filter((row) => row.place !== null && row.place >= 1 && row.place <= 3);
  const table = data.rows.filter((row) => !podium.includes(row));
  const startKnown = hasKnownStartTime(data.game.startedAt);

  return (
    // On a computer the podium and the rest of the table stand side by side.
    <div className="client-stagger flex flex-col gap-6 pt-1 md:pt-0 desk:grid desk:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] desk:items-start desk:gap-x-8 desk:gap-y-7">
      <div className="flex flex-col gap-3 desk:col-span-2">
        <div className="flex flex-wrap gap-2">
          <Pill tone="muted">Завершён</Pill>
          {data.game.countsForRating === false ? <Pill tone="muted">Вне рейтинга</Pill> : null}
        </div>
        <h1 className="font-display text-[26px] font-bold uppercase leading-[1.05] tracking-[-0.01em] md:text-[34px]">
          {data.game.title}
        </h1>
      </div>

      {/* The date is the longest value ("26 сентября"), so its column is the widest. A game
          imported from the sheets has no start time, and its summary goes without one. */}
      <div
        className={`grid divide-x divide-club-line rounded-[20px] border border-club-line bg-club-surface p-4 desk:col-span-2 desk:max-w-[640px] ${
          startKnown ? "grid-cols-[1.6fr_1fr_1fr]" : "grid-cols-[1.6fr_1fr]"
        }`}
      >
        <SummaryCell
          icon={<CalendarDays size={18} />}
          label={formatEventWeekdayLabel(data.game.startedAt)}
          value={formatEventDayLabel(data.game.startedAt)}
        />
        {startKnown ? (
          <SummaryCell
            icon={<Clock size={18} />}
            label="Начало"
            value={formatEventTimeLabel(data.game.startedAt)}
          />
        ) : null}
        <SummaryCell icon={<Users size={18} />} label="Игроки" value={String(data.rows.length)} />
      </div>

      {podium.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionHeader title="Результаты" />
          <Podium rows={podium} />
        </section>
      ) : null}

      {table.length > 0 ? (
        <section className={`flex flex-col gap-1.5 ${podium.length > 0 ? "" : "desk:col-span-2"}`} data-results-table>
          <div className="flex items-center gap-3 px-3.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-club-faint">
            <span className="w-[26px] text-center">#</span>
            <span className="flex-1 pl-[54px]">Игрок</span>
            <span className="w-10 text-right">KO</span>
            <span className="w-16 text-right">Очки</span>
          </div>

          <div className="client-stagger-rows flex flex-col gap-1.5">
            {table.map((row) => (
              <RatingRow
                key={`${row.place}-${row.playerName}`}
                player={{
                  avatarUrl: row.avatarUrl,
                  eliminations: Math.round(row.knockouts),
                  games: 0,
                  hand: row.hand,
                  isMe: row.isMe,
                  name: row.playerName,
                  place: row.place,
                  points: row.points,
                  tier: row.tier,
                  top9: 0,
                }}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
