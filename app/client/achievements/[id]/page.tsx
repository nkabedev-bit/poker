"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { useClientTMA } from "../../layout";
import { GhostButton, LoadingScreen, ScreenMessage } from "../../_components/ui";
import { AchievementIcon } from "../../_components/achievement-icon";
import { formatAchievementValue } from "../../_components/award-cards";
import { PlayerAvatar } from "../../_components/player-avatar";
import { findAchievement, formatRarityPercent } from "@/lib/client/achievements";

type Holder = { avatarUrl: string | null; isMe: boolean; key: string; name: string; value: number };

type AchievementHolders = { holders: Holder[]; players: number };

/**
 * Who in the club holds one achievement, reached by tapping its card on anyone's screen.
 *
 * The furthest along go first — the most games, the most wins, the best night's
 * knockouts — and the number beside each name is how far that is.
 */
export default function AchievementHoldersPage() {
  const { initData } = useClientTMA();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [data, setData] = useState<AchievementHolders | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/client-tma/achievements/${encodeURIComponent(id)}`, {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) setData((await res.json()) as AchievementHolders);
    } finally {
      setLoading(false);
    }
  }, [id, initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (loading) return <LoadingScreen />;

  const achievement = findAchievement(id);

  if (!achievement || !data) {
    return (
      <ScreenMessage
        action={
          <Link href="/client/achievements">
            <GhostButton>Ко всем достижениям</GhostButton>
          </Link>
        }
        icon={<Trophy size={30} />}
        subtitle={achievement ? "Попробуйте открыть экран ещё раз чуть позже." : undefined}
        title={achievement ? "Не удалось загрузить список" : "Достижение не найдено"}
      />
    );
  }

  return (
    <div className="space-y-6 pt-1">
      {/* Spaced with gaps, not margins: the global reset in globals.css zeroes the margin
          of every p and heading, and it outranks Tailwind's layered utilities. */}
      <div className="flex flex-col gap-5 rounded-[22px] border border-[#e9c07a]/45 bg-[linear-gradient(180deg,rgba(233,192,122,0.16),rgba(233,192,122,0.02))] p-5 shadow-[0_10px_28px_rgba(233,192,122,0.12)]">
        <div className="flex flex-col gap-1">
          <AchievementIcon className="mb-2 text-[#e9c07a]" name={achievement.icon} size={34} />
          <h1 className="text-[22px] font-bold uppercase leading-tight">{achievement.title}</h1>
          <p className="text-[13px] leading-snug text-white/45">{achievement.description}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-[40px] font-extrabold leading-none text-[#e9c07a]">
            {formatRarityPercent(data.holders.length, data.players)}
          </p>
          <p className="text-[13px] text-white/50">игроков клуба получили это достижение</p>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-baseline gap-2 text-[19px] font-bold tracking-tight">
          Получили
          <span className="text-[14px] font-semibold text-white/40">
            {data.holders.length} из {data.players}
          </span>
        </h2>

        {data.holders.length > 0 ? (
          <div className="space-y-2">
            {data.holders.map((holder, index) => (
              <HolderRow holder={holder} key={`${holder.key}-${index}`} />
            ))}
          </div>
        ) : (
          <p className="rounded-[18px] border border-white/[0.07] bg-white/[0.04] p-4 text-sm text-white/50">
            Пока ни у кого нет этого достижения.
          </p>
        )}
      </section>
    </div>
  );
}

function HolderRow({ holder }: { holder: Holder }) {
  return (
    <Link
      className={`flex items-center gap-3 rounded-[18px] border bg-white/[0.04] px-3 py-2.5 transition active:scale-[0.99] ${
        holder.isMe
          ? "border-[#e9c07a] shadow-[0_0_20px_rgba(233,192,122,0.18)]"
          : "border-white/[0.07]"
      }`}
      href={`/client/players/${encodeURIComponent(holder.key)}`}
    >
      <PlayerAvatar name={holder.name} photoUrl={holder.avatarUrl ?? undefined} size={34} />
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
        {holder.name}
        {holder.isMe ? (
          <span className="ml-2 rounded-md bg-[#e9c07a]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#e9c07a]">
            вы
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-[15px] font-bold text-[#e9c07a]">
        {formatAchievementValue(holder.value)}
      </span>
    </Link>
  );
}
