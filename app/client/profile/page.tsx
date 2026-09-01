"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Crosshair, Medal, Spade, Ticket, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { useClientTMA } from "../layout";
import { GlassCard, LoadingScreen, PageTitle, SectionHeader } from "../_components/ui";
import { PlayerAvatar } from "../_components/player-avatar";
import { RatingRow, withOwnPhoto, type RatingPlayer } from "../_components/rating-row";
import { countEarnedMedals, getMedals, MEDALS_TOTAL } from "@/lib/client/medals";
import {
  countEarnedAchievements,
  EMPTY_PLAYER_STATS,
  getAchievements,
  type PlayerStats,
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
  medals: Record<string, number> | null;
  stats: Partial<PlayerStats>;
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

  // A player who has not played since the counters were added reads zero for the newer
  // ones, so the defaults fill in whatever the API does not send.
  const stats = useMemo(
    () => ({ ...EMPTY_PLAYER_STATS, ...(me?.stats ?? {}) }),
    [me],
  );
  const achievements = useMemo(() => getAchievements(stats), [stats]);

  const medalsEarned = countEarnedMedals(getMedals(me?.medals));

  if (loading) return <LoadingScreen />;

  const name = me?.displayName?.trim() || telegramUser?.first_name || "Игрок";
  const earned = countEarnedAchievements(achievements);
  const ownPhoto = telegramUser?.photo_url ?? me?.avatarUrl ?? undefined;
  const topPlayers = withOwnPhoto(rating?.players.slice(0, 3) ?? [], ownPhoto);
  const myRating = rating?.me ? withOwnPhoto([rating.me], ownPhoto)[0] : undefined;
  const meInTop = topPlayers.some((player) => player.isMe);
  const history = historyTab === "active" ? me?.history.active : me?.history.past;

  return (
    <div className="space-y-6 pt-1">
      <PageTitle>Профиль</PageTitle>

      <div className="flex items-center gap-4">
        <PlayerAvatar name={name} photoUrl={telegramUser?.photo_url ?? me?.avatarUrl ?? undefined} size={72} />
        <div className="min-w-0">
          <p className="truncate text-[22px] font-bold tracking-tight">{name}</p>
          <p className="text-sm text-white/40">
            {me?.username ? `@${me.username}` : "Игрок клуба"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={<Spade size={18} />} label="Игр" value={stats.games} />
        <StatTile icon={<Crosshair size={18} />} label="Нокаутов" value={Math.round(stats.eliminations)} />
        <StatTile icon={<Medal size={18} />} label="Топ-9" value={stats.top9} />
      </div>

      <Link className="block active:scale-[0.99] transition-transform" href="/client/medals">
        <GlassCard className="flex items-center justify-between gap-3 !p-[18px]">
          <div className="flex items-center gap-3">
            <Medal className="text-[#e9c07a]" size={22} />
            <div>
              <p className="text-[15px] font-bold">Медали</p>
              <p className="mt-0.5 text-[12px] text-white/40">Кубки за победы в турнирах</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-white/45">{medalsEarned} / {MEDALS_TOTAL}</span>
            <ChevronRight className="text-white/35" size={19} />
          </div>
        </GlassCard>
      </Link>

      <Link className="block active:scale-[0.99] transition-transform" href="/client/achievements">
        <GlassCard className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">Достижения</h2>
              <ChevronRight className="text-white/35" size={19} />
            </div>
            <span className="text-sm text-white/45">
              {earned} / {achievements.length}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-[#e9c07a]"
              style={{ width: `${Math.round((earned / achievements.length) * 100)}%` }}
            />
          </div>
          <p className="text-[12px] text-white/40">
            {earned === achievements.length
              ? "Собрана вся коллекция клуба"
              : "Посмотреть все награды клуба и прогресс по ним"}
          </p>
        </GlassCard>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <GlassCard className="!p-[18px]">
          <Ticket className="text-[#e9c07a]" size={20} />
          <p className="mt-2.5 text-[26px] font-extrabold leading-none text-[#e9c07a]">—</p>
          <p className="mt-2 text-[12px] text-white/50">Бесплатные проходки</p>
          <p className="text-[11px] text-white/25">Скоро</p>
        </GlassCard>
        <GlassCard className="!p-[18px]">
          <Trophy className="text-[#e9c07a]" size={20} />
          <p className="mt-2.5 text-[26px] font-extrabold leading-none text-[#e9c07a]">
            {myRating?.place ?? "—"}
          </p>
          <p className="mt-2 text-[12px] text-white/50">Место в рейтинге</p>
        </GlassCard>
      </div>

      {me?.registered ? (
        <GlassCard>
          <p className="text-sm font-semibold">Вы в игре прямо сейчас</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-[18px] border border-white/[0.07] bg-black/30 p-4">
              <p className="text-[26px] font-extrabold leading-none text-[#e9c07a]">
                {me.registered.registrationNumber ?? "—"}
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-wider text-white/40">Номер</p>
            </div>
            <div className="rounded-[18px] border border-white/[0.07] bg-black/30 p-4">
              <p className="text-[26px] font-extrabold leading-none text-[#e9c07a]">{me.registered.table ?? "—"}</p>
              <p className="mt-2 text-[11px] uppercase tracking-wider text-white/40">Стол</p>
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
          <GlassCard className="py-7 text-center">
            <p className="text-sm text-white/45">Рейтинг наполнится после первых игр.</p>
          </GlassCard>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[19px] font-bold tracking-tight">История игр</h2>

        <div className="grid grid-cols-2 gap-1 rounded-full bg-white/[0.05] p-1">
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
                className="block rounded-[18px] border border-white/[0.07] bg-white/[0.04] p-4"
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
          <GlassCard className="py-8 text-center">
            <CalendarDays className="mx-auto mb-3 text-white/25" size={26} />
            <p className="text-sm text-white/45">
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
      <span className="flex justify-center text-white/35">{icon}</span>
      <p className="mt-2.5 text-[26px] font-extrabold leading-none">{value}</p>
      <p className="mt-2 text-[11px] text-white/45">{label}</p>
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
      className={`rounded-full py-2.5 text-sm font-bold transition ${
        active ? "bg-white text-[#0a0608]" : "text-white/50"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
