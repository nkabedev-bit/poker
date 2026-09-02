"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Trophy } from "lucide-react";
import { useClientTMA } from "../layout";
import { GlassCard, LoadingScreen, PageTitle } from "../_components/ui";
import { BackLink } from "../_components/back-link";
import { RatingRow, withOwnPhoto, type RatingPlayer } from "../_components/rating-row";
import { formatMonthLabel } from "@/lib/results/tournament-results";

type RatingPeriod = { key: string; label: string };

type RatingResponse = {
  archived?: boolean;
  countedGames: number;
  me: RatingPlayer;
  month: string;
  months: string[];
  periodLabel?: string;
  periods?: RatingPeriod[];
  players: RatingPlayer[];
  pointsAvailable: boolean;
};

type SortKey = "eliminations" | "points";

export default function ClientRatingPage() {
  const { initData, telegramUser } = useClientTMA();
  const [data, setData] = useState<RatingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("eliminations");

  const load = useCallback(async () => {
    try {
      const query = month ? `?month=${encodeURIComponent(month)}` : "";
      const res = await fetch(`/api/client-tma/rating${query}`, {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [initData, month]);

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

    const withPhoto = withOwnPhoto(filtered, telegramUser?.photo_url);

    if (sortKey === "points") {
      // Places stay as the server ranked them; sorting only reorders what is shown.
      return [...withPhoto].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
    }

    return withPhoto;
  }, [data, query, sortKey, telegramUser]);

  if (loading) return <LoadingScreen />;

  // Older responses carried bare month keys; the labels come from the server now.
  const periods =
    data?.periods ??
    (data?.months ?? []).map((key) => ({ key, label: formatMonthLabel(key) }));
  const selectedLabel =
    data?.periodLabel ?? periods.find((period) => period.key === data?.month)?.label ?? "";

  const me = data?.me ? withOwnPhoto([data.me], telegramUser?.photo_url)[0] : undefined;
  const meVisible = players.some((player) => player.isMe);

  return (
    <div className="space-y-4 pt-1">
      <BackLink />
      <div className="space-y-1">
        <PageTitle>Рейтинг</PageTitle>
        {selectedLabel ? (
          <p className="text-sm capitalize text-white/40">{selectedLabel}</p>
        ) : null}
      </div>

      {periods.length > 0 ? (
        <div className="-mx-5 overflow-x-auto px-5">
          <div className="flex w-max gap-2">
            {periods.map((period) => (
              <button
                key={period.key}
                className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold capitalize transition ${
                  period.key === data?.month
                    ? "bg-gradient-to-b from-[#c8163f] to-[#8d0f2b] text-white"
                    : "border border-white/[0.07] bg-white/[0.04] text-white/55"
                }`}
                type="button"
                onClick={() => setMonth(period.key)}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="relative">
        <Search className="absolute left-4 top-4 text-white/30" size={17} />
        <input
          className="w-full rounded-2xl border border-white/[0.07] bg-white/[0.04] py-3.5 pl-11 pr-4 text-[15px] outline-none placeholder:text-white/25 focus:border-[#c8163f]"
          placeholder="Поиск по никнейму"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="flex items-center gap-3 rounded-[18px] bg-gradient-to-r from-[#c8163f] to-[#7d0d26] px-3 py-3 text-[12px] font-bold shadow-[0_8px_24px_rgba(200,22,63,0.3)]">
        <span className="w-8 text-center">#</span>
        <span className="flex-1">Никнейм</span>
        <button
          className={`w-[52px] text-right ${sortKey === "eliminations" ? "text-white" : "text-white/55"}`}
          type="button"
          onClick={() => setSortKey("eliminations")}
        >
          Нокауты
        </button>
        <button
          className={`w-[74px] text-right ${sortKey === "points" ? "text-white" : "text-white/55"}`}
          type="button"
          onClick={() => setSortKey("points")}
        >
          Рейтинг
        </button>
      </div>

      {players.length === 0 ? (
        <GlassCard className="py-8 text-center">
          <Trophy className="mx-auto mb-3 text-white/25" size={28} />
          <p className="text-sm text-white/45">
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

      {data ? (
        <p className="px-3 pb-2 text-center text-[12px] leading-relaxed text-white/30">
          {data.archived
            ? "Итоги этого месяца перенесены из клубной таблицы."
            : `В зачёт идут ${data.countedGames ?? 5} лучших игр месяца.`}
        </p>
      ) : null}
    </div>
  );
}
