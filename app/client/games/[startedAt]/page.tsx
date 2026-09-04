"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Trophy, Zap } from "lucide-react";
import { useClientTMA } from "../../layout";
import { GhostButton, LoadingScreen, ScreenMessage } from "../../_components/ui";
import { PlayerAvatar } from "../../_components/player-avatar";
import { formatEventDayLabel } from "@/lib/events/types";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { getPlateClass, type PlayerTier } from "@/lib/players/tier";

type ResultRow = {
  isMe: boolean;
  knockouts: number;
  place: number | null;
  playerName: string;
  points: number;
  tier: PlayerTier | null;
};

type GameResponse = {
  game: { playedOn: string; startedAt: string; title: string };
  rows: ResultRow[];
};

const PODIUM: Record<number, string> = {
  1: "bg-gradient-to-b from-[#f3d07a] to-[#b8862f] text-[#3a2600]",
  2: "bg-gradient-to-b from-[#e6e8ec] to-[#9aa0a8] text-[#2a2d31]",
  3: "bg-gradient-to-b from-[#e0a06a] to-[#a3592a] text-[#3a1c00]",
};

export default function ClientGamePage() {
  const { initData } = useClientTMA();
  const params = useParams<{ startedAt: string }>();
  const startedAt = params?.startedAt;

  const [data, setData] = useState<GameResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!startedAt) return;
    try {
      const res = await fetch(`/api/client-tma/games/${encodeURIComponent(startedAt)}`, {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [initData, startedAt]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (loading) return <LoadingScreen />;

  if (!data) {
    return (
      <ScreenMessage
        action={
          <Link href="/client/profile">
            <GhostButton>К профилю</GhostButton>
          </Link>
        }
        icon={<Trophy size={30} />}
        title="Игра не найдена"
        subtitle="Возможно, результаты этой игры ещё не записаны."
      />
    );
  }

  return (
    <div className="space-y-4 pt-1">

      <div>
        <h1 className="text-[24px] font-bold uppercase leading-tight tracking-tight">
          {data.game.title}
        </h1>
        <p className="mt-1 text-sm text-white/40">{formatEventDayLabel(data.game.playedOn)}</p>
      </div>

      <div className="flex items-center gap-3 rounded-[18px] bg-gradient-to-r from-[#c8163f] to-[#7d0d26] px-3 py-3 text-[12px] font-bold">
        <span className="w-8 text-center">#</span>
        <span className="flex-1">Игрок</span>
        <span className="w-[52px] text-right">Нокауты</span>
        <span className="w-[74px] text-right">Очки</span>
      </div>

      <div className="space-y-2">
        {data.rows.map((row) => (
          <Link
            key={`${row.place}-${row.playerName}`}
            // The plate wears the tier here too, so a player is recognisable wherever
            // their name shows up.
            className={`flex items-center gap-3 rounded-[18px] px-3 py-2.5 ${getPlateClass(
              row.tier,
            )} ${row.isMe ? "ring-1 ring-[#e9c07a]" : ""}`}
            href={`/client/players/${encodeURIComponent(buildNicknameKey(row.playerName))}`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${
                (row.place && PODIUM[row.place]) || "bg-white/[0.06] text-white/60"
              }`}
            >
              {row.place ?? "—"}
            </span>

            <PlayerAvatar name={row.playerName} size={34} />

            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
              {row.playerName}
            </span>

            <span className="w-[52px] shrink-0 text-right text-[15px] font-bold text-white/75">
              {Math.round(row.knockouts)}
            </span>

            <span className="flex w-[74px] shrink-0 items-center justify-end gap-1 text-[15px] font-bold">
              {row.points.toLocaleString("ru-RU")}
              <Zap className="text-[#e9c07a]" fill="currentColor" size={13} />
            </span>

          </Link>
        ))}
      </div>
    </div>
  );
}
