"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Trophy } from "lucide-react";
import { useClientTMA } from "../layout";
import { LoadingScreen } from "../_components/ui";
import { AchievementIcon } from "../_components/achievement-icon";
import {
  countEarnedAchievements,
  EMPTY_PLAYER_STATS,
  getAchievementSections,
  type Achievement,
  type PlayerStats,
} from "@/lib/client/achievements";

// Knockout goals are counted in bounty shares, so a half knockout has to stay visible.
function formatValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const shown = Math.min(achievement.value, achievement.goal);

  return (
    <div
      className={`rounded-[22px] border p-[18px] ${
        achievement.earned
          ? "border-[#e9c07a]/45 bg-[linear-gradient(180deg,rgba(233,192,122,0.16),rgba(233,192,122,0.02))] shadow-[0_10px_28px_rgba(233,192,122,0.12)]"
          : "border-white/[0.06] bg-white/[0.03]"
      }`}
    >
      <AchievementIcon
        className={achievement.earned ? "text-[#e9c07a]" : "text-white/30"}
        name={achievement.icon}
      />
      <p
        className={`mt-3 text-[15px] font-bold uppercase leading-tight ${
          achievement.earned ? "text-white" : "text-white/55"
        }`}
      >
        {achievement.title}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-white/35">{achievement.description}</p>
      <span
        className={`mt-3 inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold ${
          achievement.earned
            ? "border-[#e9c07a]/45 text-[#e9c07a]"
            : "border-white/[0.09] text-white/45"
        }`}
      >
        {formatValue(shown)} / {achievement.goal}
      </span>
    </div>
  );
}

export default function ClientAchievementsPage() {
  const { initData } = useClientTMA();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <LoadingScreen />;

  const sections = getAchievementSections(stats ?? EMPTY_PLAYER_STATS);
  const all = sections.flatMap((section) => section.achievements);
  const earned = countEarnedAchievements(all);
  const progress = all.length > 0 ? Math.round((earned / all.length) * 100) : 0;

  return (
    <div className="space-y-7 pt-1">
      <Link className="flex items-center gap-1 text-sm text-white/60" href="/client/profile">
        <ChevronLeft size={18} /> Назад
      </Link>

      <div className="relative overflow-hidden rounded-[22px] bg-[linear-gradient(120deg,#c8163f,#7d0d26)] p-5 shadow-[0_14px_38px_rgba(200,22,63,0.35)]">
        <Trophy
          aria-hidden
          className="pointer-events-none absolute -right-4 -top-3 text-white/15"
          size={132}
          strokeWidth={1.2}
        />
        <p className="text-[26px] font-bold tracking-tight">Достижения</p>
        <div className="mt-4 h-1.5 w-full max-w-[60%] overflow-hidden rounded-full bg-black/25">
          <div className="h-full rounded-full bg-white/85" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 flex items-center gap-2 text-[15px] font-bold">
          Выполнено
          <Trophy size={16} />
          {earned} / {all.length}
        </p>
      </div>

      {sections.map((section) => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-center text-[13px] font-semibold uppercase tracking-[0.18em] text-white/35">
            {section.title}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {section.achievements.map((achievement) => (
              <AchievementCard key={achievement.id} achievement={achievement} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
