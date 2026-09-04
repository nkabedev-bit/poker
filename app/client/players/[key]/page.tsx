"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Crosshair, Medal, Spade, Trophy } from "lucide-react";
import { useClientTMA } from "../../layout";
import { GhostButton, GlassCard, LoadingScreen, ScreenMessage } from "../../_components/ui";
import { PlayerAvatar } from "../../_components/player-avatar";
import { AchievementIcon } from "../../_components/achievement-icon";
import {
  countEarnedAchievements,
  EMPTY_PLAYER_STATS,
  getAchievements,
  type PlayerStats,
} from "@/lib/client/achievements";
import { countEarnedMedals, getMedals, MEDALS_TOTAL } from "@/lib/client/medals";
import { formatEventDayLabel } from "@/lib/events/types";
import { TIER_COLORS, TIER_TITLES, type PlayerTier } from "@/lib/players/tier";

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

export default function ClientPlayerPage() {
  const { initData } = useClientTMA();
  const params = useParams<{ key: string }>();
  const playerKey = params?.key;

  const [player, setPlayer] = useState<PublicPlayer | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!playerKey) return;
    try {
      const res = await fetch(`/api/client-tma/players/${playerKey}`, {
        headers: { "X-Telegram-Init-Data": initData },
      });

      if (res.ok) {
        const data = await res.json();
        setPlayer(data.player as PublicPlayer);
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

  const earned = achievements.filter((achievement) => achievement.earned);
  const medals = getMedals(player.medals).filter((medal) => medal.count > 0);
  const medalsEarned = countEarnedMedals(getMedals(player.medals));

  return (
    <div className="space-y-6 pt-1">
      <div className="flex items-center gap-4">
        <PlayerAvatar name={player.name} photoUrl={player.avatarUrl ?? undefined} size={72} />
        <div className="min-w-0">
          <p
            className="truncate text-[22px] font-bold tracking-tight"
            style={{ color: player.tier ? TIER_COLORS[player.tier] : undefined }}
          >
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

      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={<Trophy size={18} />} label="Побед" value={stats.wins} />
        <StatTile icon={<Medal size={18} />} label="Топ-3" value={stats.top3} />
        <StatTile icon={<Medal size={18} />} label="Медалей" value={medalsEarned} />
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[19px] font-bold tracking-tight">Достижения</h2>
          <span className="text-sm text-white/45">
            {countEarnedAchievements(achievements)} / {achievements.length}
          </span>
        </div>

        {earned.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {earned.map((achievement) => (
              <GlassCard
                key={achievement.id}
                className="border-[#e9c07a]/45 bg-[linear-gradient(180deg,rgba(233,192,122,0.16),rgba(233,192,122,0.02))] !p-[18px]"
              >
                <AchievementIcon className="text-[#e9c07a]" name={achievement.icon} />
                <p className="mt-3 text-[15px] font-bold uppercase leading-tight">
                  {achievement.title}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-white/35">
                  {achievement.description}
                </p>
              </GlassCard>
            ))}
          </div>
        ) : (
          <GlassCard className="py-7 text-center">
            <p className="text-sm text-white/45">Пока ни одного достижения.</p>
          </GlassCard>
        )}
      </section>

      {medals.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[19px] font-bold tracking-tight">Медали</h2>
            <span className="text-sm text-white/45">
              {medalsEarned} / {MEDALS_TOTAL}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {medals.map((medal) => (
              <GlassCard
                key={medal.key}
                className="border-[#e9c07a]/45 bg-[linear-gradient(180deg,rgba(233,192,122,0.16),rgba(233,192,122,0.02))] !p-[18px]"
              >
                <AchievementIcon className="text-[#e9c07a]" name={medal.icon} />
                <p className="mt-3 text-[15px] font-bold uppercase leading-tight">{medal.title}</p>
                <p className="mt-1 text-[12px] leading-snug text-white/35">{medal.description}</p>
                <span className="mt-3 inline-flex items-center rounded-full border border-[#e9c07a]/45 px-3 py-1 text-[12px] font-semibold text-[#e9c07a]">
                  {medal.count} ×
                </span>
              </GlassCard>
            ))}
          </div>
        </section>
      ) : null}

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
