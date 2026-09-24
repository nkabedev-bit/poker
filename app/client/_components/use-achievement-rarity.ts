"use client";

import { useEffect, useState } from "react";
import type { AchievementRarity } from "@/lib/client/achievements";

/**
 * How rare each achievement is across the club.
 *
 * Asked apart from the player's own numbers and never waited for: a screen of
 * achievements is complete without it, and a card that never hears back simply goes
 * without its percentage.
 */
export function useAchievementRarity(initData: string) {
  const [rarity, setRarity] = useState<AchievementRarity | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/client-tma/achievements", { headers: { "X-Telegram-Init-Data": initData } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Partial<AchievementRarity> | null) => {
        if (cancelled || !data) return;
        setRarity({ holders: data.holders ?? {}, players: Number(data.players) || 0 });
      })
      .catch((error) => console.warn("Achievement rarity did not load", error));

    return () => {
      cancelled = true;
    };
  }, [initData]);

  return rarity;
}
