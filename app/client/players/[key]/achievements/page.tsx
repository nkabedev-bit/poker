"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { useClientTMA } from "../../../layout";
import { LoadingScreen, PageTitle } from "../../../_components/ui";
import { AchievementCard } from "../../../_components/award-cards";
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

  if (loading || !stats) return <LoadingScreen />;

  const sections = getAchievementSections(stats);
  const all = sections.flatMap((section) => section.achievements);

  return (
    <div className="space-y-6 pt-1">
      <div>
        <PageTitle>Достижения</PageTitle>
        <p className="mt-1 flex items-center gap-2 text-sm text-white/40">
          <Trophy size={15} /> {name} · {countEarnedAchievements(all)} из {all.length}
        </p>
      </div>

      {sections.map((section) => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-[19px] font-bold tracking-tight">{section.title}</h2>
          <div className="grid grid-cols-2 gap-3">
            {section.achievements.map((achievement) => (
              <AchievementCard achievement={achievement} key={achievement.id} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
