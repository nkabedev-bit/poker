"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Medal, Star, Trophy } from "lucide-react";
import { useClientTMA } from "../../layout";
import {
  GhostButton,
  GlassCard,
  LoadingScreen,
  MenuGroup,
  MenuRow,
  PageTitle,
  Pill,
  ScreenMessage,
  SectionHeader,
  StatCell,
  StatStrip,
} from "../../_components/ui";
import { PlayedGameRow } from "../../_components/played-game-row";
import { countWord } from "@/lib/raffle/raffle-scenes";
import { PlayerAvatar } from "../../_components/player-avatar";
import { CountUp } from "../../_components/count-up";
import {
  countEarnedAchievements,
  EMPTY_PLAYER_STATS,
  getAchievements,
  type PlayerStats,
} from "@/lib/client/achievements";
import { countEarnedMedals, getMedals, MEDALS_TOTAL } from "@/lib/client/medals";
import { formatEventShortDateLabel } from "@/lib/events/types";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { TIER_TITLES, type PlayerTier } from "@/lib/players/tier";
import type { RatingPlayer } from "../../_components/rating-row";

type PlayerGame = { knockouts: number; place: number | null; startedAt: string };

type PublicPlayer = {
  avatarUrl: string | null;
  /** The nickname the player went by until a recent change. */
  formerName?: string | null;
  games: PlayerGame[];
  /** Their favourite hand ("QsTs"), drawn on the avatar. */
  hand?: string | null;
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

  if (loading) return <LoadingScreen shape="profile" />;

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
    // On a computer the player's face stands in a card on the left, their figures and
    // history on the right; on a phone it is all one list.
    <div className="client-stagger flex flex-col gap-6 pt-1 md:pt-0 desk:gap-8">
      <PageTitle>Профиль</PageTitle>

      <div className="client-stagger contents desk:grid desk:grid-cols-[360px_minmax(0,1fr)] desk:items-start desk:gap-8">
        <div className="flex flex-col items-center gap-3 pt-1 text-center desk:rounded-[26px] desk:border desk:border-club-line desk:bg-club-surface desk:px-6 desk:py-8">
          <PlayerAvatar
            hand={player.hand}
            name={player.name}
            photoUrl={player.avatarUrl ?? undefined}
            ring={player.tier === "champion" ? "gold" : player.isMe ? "crimson" : undefined}
            size={104}
          />
          <div className="mt-2.5 flex flex-col items-center gap-2">
            <p className="max-w-full truncate font-display text-[24px] font-semibold tracking-[-0.02em]">
              {player.name}
            </p>
            {player.formerName ? (
              <p className="max-w-full truncate text-[13px] text-club-faint">ранее: {player.formerName}</p>
            ) : null}
            <div className="flex items-center gap-2">
              <span className="text-[14px] text-club-muted">{player.isMe ? "Это вы" : "Игрок клуба"}</span>
              {player.tier ? (
                <Pill tone="goldOutline">
                  {player.tier === "champion" ? "👑 " : ""}
                  {TIER_TITLES[player.tier]}
                </Pill>
              ) : null}
            </div>
          </div>
        </div>

        <div className="client-stagger contents desk:flex desk:flex-col desk:gap-7">
          <StatStrip>
            <StatCell label="Игр" value={<CountUp value={stats.games} />} />
            <StatCell label="Нокаутов" value={<CountUp value={Math.round(stats.eliminations)} />} />
            <StatCell label="Топ-9" value={<CountUp value={stats.top9} />} />
          </StatStrip>

          <div className="grid grid-cols-2 gap-2.5">
            <GoldTile icon={<Trophy size={20} />} label="Место в рейтинге" value={place ?? "—"} />
            <GoldTile icon={<Medal size={20} />} label="Побед" value={<CountUp value={stats.wins} />} />
          </div>

          <MenuGroup>
            <MenuRow
              href={`/client/players/${playerKey}/medals`}
              icon={<Medal size={20} />}
              subtitle="Кубки за победы в турнирах"
              title="Медали"
              value={`${medalsEarned} / ${MEDALS_TOTAL}`}
            />
            <MenuRow
              href={`/client/players/${playerKey}/achievements`}
              icon={<Star size={20} />}
              subtitle={earned === achievements.length ? "Собрана вся коллекция клуба" : "Награды клуба и прогресс"}
              title="Достижения"
              value={<CountUp suffix={` / ${achievements.length}`} value={earned} />}
            >
              <div className="mt-1.5 w-[140px]">
                <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="client-fill-x h-full rounded-full bg-club-gold"
                    style={{ width: `${Math.round((earned / achievements.length) * 100)}%` }}
                  />
                </div>
              </div>
            </MenuRow>
          </MenuGroup>

          <section className="flex flex-col gap-2.5">
            <SectionHeader title="История игр" />

            {player.games.length > 0 ? (
              <div className="client-stagger-rows flex flex-col gap-2">
                {player.games.map((game) => (
                  <PlayedGameRow
                    key={game.startedAt}
                    href={`/client/games/${encodeURIComponent(game.startedAt)}`}
                    place={game.place}
                    subtitle={
                      game.knockouts > 0
                        ? countWord(Math.round(game.knockouts), ["нокаут", "нокаута", "нокаутов"])
                        : "без нокаутов"
                    }
                    title={formatEventShortDateLabel(game.startedAt)}
                  />
                ))}
              </div>
            ) : (
              <GlassCard className="py-7 text-center">
                <p className="text-sm text-club-muted">Игр пока нет.</p>
              </GlassCard>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** A figure in gold with its icon over it: the place in the rating, the wins. */
function GoldTile({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] border border-club-line bg-club-surface p-4">
      <span className="text-club-gold">{icon}</span>
      <p className="font-display text-[26px] font-semibold leading-none text-club-gold">{value}</p>
      <p className="text-[12px] text-club-muted">{label}</p>
    </div>
  );
}
