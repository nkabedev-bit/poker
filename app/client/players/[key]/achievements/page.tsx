"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useClientTMA } from "../../../layout";
import { LoadingScreen, PageHeading } from "../../../_components/ui";
import { AchievementCard, CollectionSummary } from "../../../_components/award-cards";
import { useAchievementRarity } from "../../../_components/use-achievement-rarity";
import {
  countEarnedAchievements,
  EMPTY_PLAYER_STATS,
  getAchievementSections,
  type PlayerStats,
} from "@/lib/client/achievements";

/** Another player's awards, on the same screen their own would use. */
export default function PlayerAchievementsPage() {
  const { initData } = useClientTMA();
  const params = useParams<{ key: string }>();
  const playerKey = params?.key;

  const [name, setName] = useState("");
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const rarity = useAchievementRarity(initData);

  const load = useCallback(async () => {
    if (!playerKey) return;
    try {
      const res = await fetch(`/api/client-tma/players/${playerKey}`, {
        headers: { "X-Telegram-Init-Data": initData },
      });

      if (res.ok) {
        const data = await res.json();
        setName(String(data.player?.name ?? ""));
        setStats({ ...EMPTY_PLAYER_STATS, ...(data.player?.stats ?? {}) });
      }
    } finally {
      setLoading(false);
    }
  }, [initData, playerKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (loading || !stats) return <LoadingScreen shape="grid" />;

  const sections = getAchievementSections(stats);
  const all = sections.flatMap((section) => section.achievements);

  return (
    <div className="client-stagger flex flex-col gap-6 pt-1">
      <PageHeading subtitle={name} title="Достижения" />

      <CollectionSummary earned={countEarnedAchievements(all)} label="Выполнено" total={all.length} />

      {sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2.5">
          <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-club-faint">{section.title}</h2>
          <div className="grid grid-cols-3 gap-2.5">
            {section.achievements.map((achievement) => (
              <AchievementCard achievement={achievement} key={achievement.id} rarity={rarity} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
