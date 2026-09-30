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

type Holder = {
  avatarUrl: string | null;
  /** Their favourite hand ("QsTs"), drawn on the avatar. */
  hand?: string | null;
  isMe: boolean;
  key: string;
  name: string;
  value: number;
};

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

  if (loading) return <LoadingScreen shape="rows" />;

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
    <div className="client-stagger flex flex-col gap-6 pt-1">
      {/* Spaced with gaps, not margins: the global reset in globals.css zeroes the margin
          of every p and heading, and it outranks Tailwind's layered utilities. */}
      <div className="flex flex-col items-center gap-5 rounded-[22px] border border-club-gold/30 bg-club-gold/[0.08] p-5 text-center">
        <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-club-gold/50 bg-club-gold/[0.14] text-club-gold">
          <AchievementIcon name={achievement.icon} size={32} />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[22px] font-semibold leading-tight">{achievement.title}</h1>
          <p className="text-[13px] leading-snug text-club-muted">{achievement.description}</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="font-display text-[40px] font-semibold leading-none text-club-gold">
            {formatRarityPercent(data.holders.length, data.players)}
          </p>
          <p className="text-[13px] text-club-muted">игроков клуба получили это достижение</p>
        </div>
      </div>

      <section className="flex flex-col gap-2.5">
        <h2 className="flex min-h-11 items-baseline gap-2 font-display text-[17px] font-semibold">
          Получили
          <span className="font-body text-[14px] font-semibold text-club-faint">
            {data.holders.length} из {data.players}
          </span>
        </h2>

        {data.holders.length > 0 ? (
          <div className="client-stagger-rows flex flex-col gap-1.5">
            {data.holders.map((holder, index) => (
              <HolderRow holder={holder} key={`${holder.key}-${index}`} />
            ))}
          </div>
        ) : (
          <p className="rounded-[18px] border border-club-line bg-club-surface p-4 text-sm text-club-muted">
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
      className={`flex min-h-16 items-center gap-3 rounded-[18px] border px-3.5 py-2.5 transition active:scale-[0.99] ${
        holder.isMe ? "border-club-rose/45 bg-club-crimson/12" : "border-club-line bg-club-surface"
      }`}
      href={`/client/players/${encodeURIComponent(holder.key)}`}
    >
      <PlayerAvatar
        hand={holder.hand}
        name={holder.name}
        photoUrl={holder.avatarUrl ?? undefined}
        size={38}
      />
      {/* The name gives way to the «вы» badge: a long one shortens itself, and the badge
          beside it stays whole instead of being cut off with it. */}
      <span className="flex min-w-0 flex-1 items-center gap-1.5 pl-1">
        <span className="min-w-0 truncate text-[15px] font-bold">{holder.name}</span>
        {holder.isMe ? (
          <span className="shrink-0 rounded-md bg-club-crimson px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-white">
            вы
          </span>
        ) : null}
      </span>
      <span className="shrink-0 font-display text-[14px] font-semibold text-club-gold">
        {formatAchievementValue(holder.value)}
      </span>
    </Link>
  );
}
