"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useClientTMA } from "../layout";
import { LoadingScreen, PageTitle } from "../_components/ui";
import { AchievementCard, CollectionSummary } from "../_components/award-cards";
import { CountUp } from "../_components/count-up";
import { useAchievementRarity } from "../_components/use-achievement-rarity";
import { AwardCelebration } from "../_components/award-celebration";
import { useAwardNews } from "../_components/use-award-news";
import {
  countEarnedAchievements,
  EMPTY_PLAYER_STATS,
  getAchievements,
  getAchievementSections,
  type PlayerStats,
} from "@/lib/client/achievements";
import { listHeldAwards, type AwardShelf } from "@/lib/client/award-news";

/** This screen knows the player's achievements only, so it speaks for that shelf alone. */
const ACHIEVEMENT_SHELVES: AwardShelf[] = ["achievements"];

export default function ClientAchievementsPage() {
  const { initData } = useClientTMA();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const rarity = useAchievementRarity(initData);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/me", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) {
        const data = await res.json();
        setStats({ ...EMPTY_PLAYER_STATS, ...(data.stats ?? {}) });
      }
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const awards = useMemo(
    () => (stats ? listHeldAwards({ achievements: getAchievements(stats) }) : null),
    [stats],
  );
  const { dismiss: dismissNews, left: newsLeft, news } = useAwardNews(awards, ACHIEVEMENT_SHELVES);

  if (loading) return <LoadingScreen shape="grid" />;

  const sections = getAchievementSections(stats ?? EMPTY_PLAYER_STATS);
  const all = sections.flatMap((section) => section.achievements);
  const earned = countEarnedAchievements(all);

  return (
    <div className="client-stagger flex flex-col gap-6 pt-1 md:pt-0 desk:gap-8">
      {news ? <AwardCelebration award={news} left={newsLeft} onDone={dismissNews} /> : null}

      <PageTitle>Достижения</PageTitle>

      <div className="md:max-w-[520px]">
        <CollectionSummary
          count={<CountUp value={earned} />}
          earned={earned}
          hint="Нажмите на награду — увидите, у кого она есть"
          label="Выполнено"
          total={all.length}
        />
      </div>

      {sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2.5">
          <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-club-faint">{section.title}</h2>
          <div className="grid grid-cols-3 gap-2.5 md:grid-cols-4 md:gap-3.5 desk:grid-cols-6">
            {section.achievements.map((achievement) => (
              <AchievementCard key={achievement.id} achievement={achievement} rarity={rarity} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
