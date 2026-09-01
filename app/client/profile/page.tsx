"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Crosshair, Medal, Spade, Ticket, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { useClientTMA } from "../layout";
import { GlassCard, LoadingScreen, SectionHeader } from "../_components/ui";
import { PlayerAvatar } from "../_components/player-avatar";
import { RatingRow, type RatingPlayer } from "../_components/rating-row";
import {
  countEarnedAchievements,
  getAchievements,
  getPlayerLevel,
} from "@/lib/client/achievements";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  type TournamentEvent,
} from "@/lib/events/types";

type HistoryItem = { event: TournamentEvent; status: string };

type Me = {
  avatarUrl: string | null;
  displayName: string | null;
  history: { active: HistoryItem[]; past: HistoryItem[] };
  profileSubmitted: boolean;
  registered: { name: string; registrationNumber: number | null; table: number | null } | null;
  stats: { eliminations: number; games: number; top9: number };
  username: string | null;
};

type RatingResponse = { me: RatingPlayer; players: RatingPlayer[] };

export default function ClientProfilePage() {
  const { initData, telegramUser } = useClientTMA();
  const [me, setMe] = useState<Me | null>(null);
  const [rating, setRating] = useState<RatingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyTab, setHistoryTab] = useState<"active" | "past">("active");

  const load = useCallback(async () => {
    try {
      const [meRes, ratingRes] = await Promise.all([
        fetch("/api/client-tma/me", { headers: { "X-Telegram-Init-Data": initData } }),
        fetch("/api/client-tma/rating", { headers: { "X-Telegram-Init-Data": initData } }),
      ]);

      if (meRes.ok) setMe(await meRes.json());
      if (ratingRes.ok) setRating(await ratingRes.json());
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const stats = useMemo(
    () => me?.stats ?? { eliminations: 0, games: 0, top9: 0 },
    [me],
  );
  const achievements = useMemo(() => getAchievements(stats), [stats]);
  const level = useMemo(() => getPlayerLevel(stats.games), [stats.games]);

  if (loading) return <LoadingScreen />;

  const name = me?.displayName?.trim() || telegramUser?.first_name || "Игрок";
  const earned = countEarnedAchievements(achievements);
  const topPlayers = rating?.players.slice(0, 3) ?? [];
  const myRating = rating?.me;
  const meInTop = topPlayers.some((player) => player.isMe);
  const history = historyTab === "active" ? me?.history.active : me?.history.past;

  return (
    <div className="space-y-5 pt-2">
      <h1 className="px-1 text-2xl font-bold">Профиль</h1>

      <GlassCard className="flex items-center gap-4">
        <PlayerAvatar name={name} photoUrl={telegramUser?.photo_url ?? me?.avatarUrl ?? undefined} size={64} />
        <div className="min-w-0">
          <p className="truncate text-xl font-bold">{name}</p>
          <p className="text-sm text-white/45">
            {me?.username ? `@${me.username}` : "Игрок клуба"}
          </p>
        </div>
      </GlassCard>

      <GlassCard className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-[#e8b465]/15 px-3 py-1 text-sm font-bold tracking-wide text-[#e8b465]">
            {level.title}
          </span>
          {level.next ? (
            <span className="text-xs text-white/45">
              до {level.next.title}: {Math.max(0, level.next.games - stats.games)} игр
            </span>
          ) : (
            <span className="text-xs text-white/45">максимальный уровень</span>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#b8163c] to-[#e8b465]"
            style={{ width: `${Math.round(level.progress * 100)}%` }}
          />
        </div>
      </GlassCard>

      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={<Spade size={18} />} label="Игр" value={stats.games} />
        <StatTile icon={<Crosshair size={18} />} label="Нокаутов" value={Math.round(stats.eliminations)} />
        <StatTile icon={<Medal size={18} />} label="Топ-9" value={stats.top9} />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-lg font-bold">Достижения</h2>
          <span className="text-sm text-white/45">
            {earned} / {achievements.length}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {achievements.map((achievement) => (
            <div
              key={achievement.id}
              className={`rounded-2xl border p-3 text-center ${
                achievement.earned
                  ? "border-[#e8b465]/50 bg-gradient-to-b from-[#4a3410]/60 to-transparent"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <Trophy
                className={`mx-auto ${achievement.earned ? "text-[#e8b465]" : "text-white/20"}`}
                size={22}
              />
              <p className="mt-2 text-[11px] font-semibold leading-tight">{achievement.title}</p>
              <p className="mt-1 text-[10px] text-white/40">
                {achievement.earned
                  ? "получено"
                  : `${Math.min(achievement.value, achievement.goal)} / ${achievement.goal}`}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <GlassCard className="!p-4">
          <Ticket className="text-white/45" size={18} />
          <p className="mt-2 text-2xl font-bold text-[#e8b465]">—</p>
          <p className="mt-1 text-xs text-white/55">Бесплатные проходки</p>
          <p className="text-[11px] text-white/30">Скоро</p>
        </GlassCard>
        <GlassCard className="!p-4">
          <Trophy className="text-white/45" size={18} />
          <p className="mt-2 text-2xl font-bold text-[#e8b465]">
            {myRating?.place ?? "—"}
          </p>
          <p className="mt-1 text-xs text-white/55">Место в рейтинге</p>
        </GlassCard>
      </div>

      {me?.registered ? (
        <GlassCard>
          <p className="text-sm font-semibold">Вы в игре прямо сейчас</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-2xl font-bold text-[#e8b465]">
                {me.registered.registrationNumber ?? "—"}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-white/45">Номер</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-2xl font-bold text-[#e8b465]">{me.registered.table ?? "—"}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-white/45">Стол</p>
            </div>
          </div>
        </GlassCard>
      ) : null}

      <section className="space-y-3">
        <SectionHeader href="/client/rating" title="Рейтинг" />
        {topPlayers.length > 0 ? (
          <div className="space-y-2">
            {topPlayers.map((player) => (
              <RatingRow key={`${player.place}-${player.name}`} player={player} />
            ))}
            {myRating && !meInTop ? (
              <>
                <p className="text-center text-white/25">· · ·</p>
                <RatingRow player={myRating} />
              </>
            ) : null}
          </div>
        ) : (
          <GlassCard className="text-center">
            <p className="text-sm text-white/55">Рейтинг наполнится после первых игр.</p>
          </GlassCard>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-lg font-bold">История игр</h2>

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.04] p-1">
          <TabButton active={historyTab === "active"} onClick={() => setHistoryTab("active")}>
            Активные
          </TabButton>
          <TabButton active={historyTab === "past"} onClick={() => setHistoryTab("past")}>
            Прошедшие
          </TabButton>
        </div>

        {history && history.length > 0 ? (
          <div className="space-y-2">
            {history.map((item) => (
              <Link
                key={item.event.id}
                className="block rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                href={`/client/events/${item.event.id}`}
              >
                <p className="font-semibold">{item.event.title}</p>
                <p className="mt-1 text-xs text-white/45">
                  {formatEventDayLabel(item.event.startsAt)},{" "}
                  {formatEventTimeLabel(item.event.startsAt)}
                  {item.status === "seated" ? " · вы играли" : ""}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <GlassCard className="text-center">
            <CalendarDays className="mx-auto mb-3 text-white/30" size={24} />
            <p className="text-sm text-white/50">
              {historyTab === "active"
                ? "Вы пока никуда не записаны."
                : "Сыгранных турниров пока нет."}
            </p>
          </GlassCard>
        )}
      </section>
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <GlassCard className="!p-4 text-center">
      <span className="flex justify-center text-white/40">{icon}</span>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] text-white/50">{label}</p>
    </GlassCard>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-xl py-2.5 text-sm font-semibold transition ${
        active ? "bg-white text-[#0b0708]" : "text-white/60"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
