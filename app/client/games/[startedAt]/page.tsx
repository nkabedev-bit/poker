"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarDays, Clock, Crosshair, Trophy, Users, Zap } from "lucide-react";
import { useClientTMA } from "../../layout";
import { GhostButton, LoadingScreen, ScreenMessage } from "../../_components/ui";
import { PlayerAvatar } from "../../_components/player-avatar";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  formatEventWeekdayLabel,
} from "@/lib/events/types";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { type PlayerTier } from "@/lib/players/tier";
import { hasKnownStartTime } from "@/lib/results/imported-games";
import { TierBadge } from "../../_components/tier-badge";

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

const PODIUM: Record<number, string> = {
  1: "bg-gradient-to-b from-[#f3d07a] to-[#b8862f] text-[#3a2600]",
  2: "bg-gradient-to-b from-[#e6e8ec] to-[#9aa0a8] text-[#2a2d31]",
  3: "bg-gradient-to-b from-[#e0a06a] to-[#a3592a] text-[#3a1c00]",
};

/** The podium is read left to right as the room sees it: second, first, third. */
const PODIUM_ORDER = [2, 1, 3] as const;

/** How tall each step of the podium stands, and how large the face on it is. */
const PODIUM_STEP: Record<number, { avatar: number; step: string }> = {
  1: { avatar: 76, step: "h-24" },
  2: { avatar: 60, step: "h-16" },
  3: { avatar: 60, step: "h-12" },
};

function profileHref(name: string) {
  return `/client/players/${encodeURIComponent(buildNicknameKey(name))}`;
}

/**
 * The first three of the evening, on their steps: face, nickname, points and knockouts.
 * A game with fewer than three finishers shows the steps it has.
 */
function Podium({ rows }: { rows: ResultRow[] }) {
  return (
    <div className="grid grid-cols-3 items-end gap-2">
      {PODIUM_ORDER.map((place) => {
        const row = rows.find((item) => item.place === place);
        if (!row) return <div key={place} />;

        return (
          <Link
            key={place}
            className="flex min-w-0 flex-col items-center gap-2 text-center"
            href={profileHref(row.playerName)}
          >
            <span className={`rounded-full p-[3px] ${PODIUM[place]}`}>
              <PlayerAvatar
                hand={row.hand}
                name={row.playerName}
                photoUrl={row.avatarUrl ?? undefined}
                size={PODIUM_STEP[place].avatar}
              />
            </span>
            <span
              className={`w-full truncate text-[14px] font-bold ${row.isMe ? "text-[#e9c07a]" : ""}`}
            >
              {row.playerName}
            </span>
            <span className="flex items-center gap-2.5 text-[12px] font-semibold text-white/60">
              <span className="flex items-center gap-0.5">
                {row.points.toLocaleString("ru-RU")}
                <Zap className="text-[#e9c07a]" fill="currentColor" size={11} />
              </span>
              <span className="flex items-center gap-0.5">
                <Crosshair size={11} />
                {Math.round(row.knockouts)}
              </span>
            </span>
            <span
              className={`flex w-full items-start justify-center rounded-t-2xl pt-2 text-[20px] font-extrabold ${PODIUM[place]} ${PODIUM_STEP[place].step}`}
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
      <span className="text-[#e9c07a]">{icon}</span>
      <span className="truncate text-[16px] font-bold">{value}</span>
      <span className="truncate text-[12px] capitalize text-white/40">{label}</span>
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
    <div className="client-stagger space-y-5 pt-1">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-[12px] font-semibold text-white/60">
            Завершён
          </span>
          {data.game.countsForRating === false ? (
            <span className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-[12px] font-semibold text-white/60">
              Вне рейтинга
            </span>
          ) : null}
        </div>
        <h1 className="text-[28px] font-extrabold uppercase leading-[1.05] tracking-tight">
          {data.game.title}
        </h1>
      </div>

      {/* The date is the longest value ("26 сентября"), so its column is the widest. A game
          imported from the sheets has no start time, and its summary goes without one. */}
      <div
        className={`grid divide-x divide-white/[0.08] rounded-[20px] border border-white/[0.07] bg-white/[0.04] p-4 ${
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
        <section className="space-y-3">
          <h2 className="text-[20px] font-bold tracking-tight">Результаты</h2>
          <Podium rows={podium} />
        </section>
      ) : null}

      {table.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center gap-3 rounded-[18px] bg-gradient-to-r from-[#c8163f] to-[#7d0d26] px-3 py-3 text-[12px] font-bold">
            <span className="w-8 text-center">#</span>
            <span className="flex-1">Игрок</span>
            <span className="w-[52px] text-right">Нокауты</span>
            <span className="w-[74px] text-right">Очки</span>
          </div>

          <div className="client-stagger-rows space-y-2">
            {table.map((row) => (
              <Link
                key={`${row.place}-${row.playerName}`}
                className={`flex items-center gap-3 rounded-[18px] border px-3 py-2.5 ${
                  row.isMe
                    ? "border-[#e9c07a] bg-[#e9c07a]/[0.08]"
                    : "border-white/[0.07] bg-white/[0.04]"
                }`}
                href={profileHref(row.playerName)}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${
                    (row.place && PODIUM[row.place]) || "bg-white/[0.06] text-white/60"
                  }`}
                >
                  {row.place ?? "—"}
                </span>

                <PlayerAvatar
                  hand={row.hand}
                  name={row.playerName}
                  photoUrl={row.avatarUrl ?? undefined}
                  size={34}
                />

                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-semibold">{row.playerName}</span>
                  <TierBadge tier={row.tier} />
                </span>

                {/* Narrower than its header, as in the rating: both end at the same edge,
                    and the name gets the room back. */}
                <span className="w-9 shrink-0 text-right text-[15px] font-bold text-white/75">
                  {Math.round(row.knockouts)}
                </span>

                <span className="flex w-[74px] shrink-0 items-center justify-end gap-1 text-[15px] font-bold">
                  {row.points.toLocaleString("ru-RU")}
                  <Zap className="text-[#e9c07a]" fill="currentColor" size={13} />
                </span>

              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
