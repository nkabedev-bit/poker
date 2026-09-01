"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Trophy } from "lucide-react";
import { useClientTMA } from "../layout";
import { GlassCard, LoadingScreen } from "../_components/ui";
import { RatingRow, type RatingPlayer } from "../_components/rating-row";

type RatingResponse = {
  me: RatingPlayer;
  players: RatingPlayer[];
  pointsAvailable: boolean;
};

type SortKey = "eliminations" | "points";

export default function ClientRatingPage() {
  const { initData } = useClientTMA();
  const [data, setData] = useState<RatingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("eliminations");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/rating", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const players = useMemo(() => {
    const all = data?.players ?? [];
    const search = query.trim().toLowerCase();
    const filtered = search
      ? all.filter((player) => player.name.toLowerCase().includes(search))
      : all;

    if (sortKey === "points") {
      // Places stay as the server ranked them; sorting only reorders what is shown.
      return [...filtered].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
    }

    return filtered;
  }, [data, query, sortKey]);

  if (loading) return <LoadingScreen />;

  const me = data?.me;
  const meVisible = players.some((player) => player.isMe);

  return (
    <div className="space-y-4 pt-2">
      <h1 className="px-1 text-2xl font-bold">Рейтинг</h1>

      <div className="relative">
        <Search className="absolute left-3 top-3.5 text-white/35" size={16} />
        <input
          className="w-full rounded-2xl border border-white/10 bg-black/30 py-3 pl-10 pr-4 text-sm outline-none placeholder:text-white/30 focus:border-[#b8163c]"
          placeholder="Поиск по никнейму"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#b8163c] to-[#7d0d26] px-3 py-2.5 text-xs font-semibold">
        <span className="w-7 text-center">#</span>
        <span className="flex-1">Никнейм</span>
        <button
          className={`w-14 text-right ${sortKey === "eliminations" ? "text-white" : "text-white/60"}`}
          type="button"
          onClick={() => setSortKey("eliminations")}
        >
          Нокауты
        </button>
        <button
          className={`w-16 text-right ${sortKey === "points" ? "text-white" : "text-white/60"}`}
          type="button"
          onClick={() => setSortKey("points")}
        >
          Рейтинг
        </button>
      </div>

      {players.length === 0 ? (
        <GlassCard className="text-center">
          <Trophy className="mx-auto mb-3 text-white/35" size={26} />
          <p className="text-sm text-white/60">
            {query ? "Никого не нашли по этому нику." : "Рейтинг наполнится после первых игр."}
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {players.map((player) => (
            <RatingRow key={`${player.place}-${player.name}`} player={player} />
          ))}

          {me && !meVisible && !query ? (
            <>
              <p className="text-center text-white/25">· · ·</p>
              <RatingRow player={me} />
            </>
          ) : null}
        </div>
      )}

      {data && !data.pointsAvailable ? (
        <p className="px-2 pb-2 text-center text-xs text-white/40">
          Очки рейтинга подключим из клубной таблицы — пока в колонке прочерк, нокауты
          настоящие.
        </p>
      ) : null}
    </div>
  );
}
