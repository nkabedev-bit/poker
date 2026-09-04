"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, Crosshair, Medal, Spade, Trophy } from "lucide-react";
import { useClientTMA } from "../../layout";
import { GhostButton, GlassCard, LoadingScreen, PageTitle, ScreenMessage } from "../../_components/ui";
import { PlayerAvatar } from "../../_components/player-avatar";
import {
  countEarnedAchievements,
  EMPTY_PLAYER_STATS,
  getAchievements,
  type PlayerStats,
} from "@/lib/client/achievements";
import { countEarnedMedals, getMedals, MEDALS_TOTAL } from "@/lib/client/medals";
import { formatEventDayLabel } from "@/lib/events/types";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { TIER_COLORS, TIER_TITLES, type PlayerTier } from "@/lib/players/tier";
import type { RatingPlayer } from "../../_components/rating-row";

type PlayerGame = { knockouts: number; place: number | null; startedAt: string };

type PublicPlayer = {
  avatarUrl: string | null;
  games: PlayerGame[];
  isMe: boolean;
  medals: Record<string, number>;
  name: string;
  stats: Partial<PlayerStats>;
  tier: PlayerTier | null;
};

/**
 * Another player's profile, laid out the way a player's own is — minus the free
 * entries, which are nobody else's business.
 */
export default function ClientPlayerPage() {
  const { initData } = useClientTMA();
  const params = useParams<{ key: string }>();
  const playerKey = params?.key;

  const [player, setPlayer] = useState<PublicPlayer | null>(null);
  const [rating, setRating] = useState<RatingPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!playerKey) return;
    try {
      const [playerRes, ratingRes] = await Promise.all([
        fetch(`/api/client-tma/players/${playerKey}`, {
          headers: { "X-Telegram-Init-Data": initData },
        }),
        fetch("/api/client-tma/rating", { headers: { "X-Telegram-Init-Data": initData } }),
      ]);

      if (playerRes.ok) {
        const data = await playerRes.json();
        setPlayer(data.player as PublicPlayer);
      }

      if (ratingRes.ok) {
        const data = await ratingRes.json();
        setRating(data.players ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [initData, playerKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const stats = useMemo(
    () => ({ ...EMPTY_PLAYER_STATS, ...(player?.stats ?? {}) }),
    [player],
  );
  const achievements = useMemo(() => getAchievements(stats), [stats]);

  if (loading) return <LoadingScreen />;

  if (!player) {
    return (
      <ScreenMessage
        action={
          <Link href="/client/rating">
            <GhostButton>К рейтингу</GhostButton>
          </Link>
        }
        icon={<Trophy size={30} />}
        title="Игрок не найден"
        subtitle="Возможно, он ещё не сыграл ни одной игры в клубе."
      />
    );
  }

  const earned = countEarnedAchievements(achievements);
  const medalsEarned = countEarnedMedals(getMedals(player.medals));
  // The rating knows the place; the profile itself counts only what a player has done.
  const place = rating.find(
    (row) => buildNicknameKey(row.name) === buildNicknameKey(player.name),
  )?.place;

  return (
    <div className="space-y-6 pt-1">
      <PageTitle>Профиль</PageTitle>

      <div className="flex items-center gap-4">
        <PlayerAvatar name={player.name} photoUrl={player.avatarUrl ?? undefined} size={72} />
        <div className="min-w-0">
          <p className="truncate text-[22px] font-bold tracking-tight">
            {player.tier === "champion" ? <span className="mr-1.5">👑</span> : null}
            {player.name}
          </p>
          <p className="flex items-center gap-2 text-sm text-white/40">
            {player.isMe ? "Это вы" : "Игрок клуба"}
            {player.tier ? (
              <span
                className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase"
                style={{ borderColor: TIER_COLORS[player.tier], color: TIER_COLORS[player.tier] }}
              >
                {TIER_TITLES[player.tier]}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={<Spade size={18} />} label="Игр" value={stats.games} />
        <StatTile
          icon={<Crosshair size={18} />}
          label="Нокаутов"
          value={Math.round(stats.eliminations)}
        />
        <StatTile icon={<Medal size={18} />} label="Топ-9" value={stats.top9} />
      </div>

      <Link
        className="block transition-transform active:scale-[0.99]"
        href={`/client/players/${playerKey}/medals`}
      >
        <GlassCard className="flex items-center justify-between gap-3 !p-[18px]">
          <div className="flex items-center gap-3">
            <Medal className="text-[#e9c07a]" size={22} />
            <div>
              <p className="text-[15px] font-bold">Медали</p>
              <p className="mt-0.5 text-[12px] text-white/40">Кубки за победы в турнирах</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-white/45">
              {medalsEarned} / {MEDALS_TOTAL}
            </span>
            <ChevronRight className="text-white/35" size={19} />
          </div>
        </GlassCard>
      </Link>

      <Link
        className="block transition-transform active:scale-[0.99]"
        href={`/client/players/${playerKey}/achievements`}
      >
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
          <Trophy className="text-[#e9c07a]" size={20} />
          <p className="mt-2.5 text-[26px] font-extrabold leading-none text-[#e9c07a]">
            {place ?? "—"}
          </p>
          <p className="mt-2 text-[12px] text-white/50">Место в рейтинге</p>
        </GlassCard>
        <GlassCard className="!p-[18px]">
          <Medal className="text-[#e9c07a]" size={20} />
          <p className="mt-2.5 text-[26px] font-extrabold leading-none text-[#e9c07a]">
            {stats.wins}
          </p>
          <p className="mt-2 text-[12px] text-white/50">Побед</p>
        </GlassCard>
      </div>

      <section className="space-y-3">
        <h2 className="text-[19px] font-bold tracking-tight">История игр</h2>

        {player.games.length > 0 ? (
          <div className="space-y-2">
            {player.games.map((game) => (
              <Link
                key={game.startedAt}
                className="flex items-center gap-3 rounded-[18px] border border-white/[0.07] bg-white/[0.04] p-4"
                href={`/client/games/${encodeURIComponent(game.startedAt)}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {formatEventDayLabel(game.startedAt)}
                  </span>
                  <span className="mt-1 block text-xs text-white/45">
                    {game.knockouts > 0
                      ? `${Math.round(game.knockouts)} нокаутов`
                      : "без нокаутов"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[20px] font-extrabold leading-none text-[#e9c07a]">
                    {game.place ?? "—"}
                  </span>
                  <span className="mt-1 block text-[10px] uppercase tracking-wider text-white/35">
                    место
                  </span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <GlassCard className="py-7 text-center">
            <p className="text-sm text-white/45">Игр пока нет.</p>
          </GlassCard>
        )}
      </section>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <GlassCard className="!p-[18px]">
      <span className="text-[#e9c07a]">{icon}</span>
      <p className="mt-2.5 text-[26px] font-extrabold leading-none">{value}</p>
      <p className="mt-2 text-[12px] text-white/50">{label}</p>
    </GlassCard>
  );
}
