"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Trophy } from "lucide-react";
import { tickClientSelection, useClientTMA } from "../layout";
import Link from "next/link";
import { GlassCard, LoadingScreen, PageHeading } from "../_components/ui";
import { PlayerAvatar } from "../_components/player-avatar";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { RatingRow, withOwnPhoto, type RatingPlayer } from "../_components/rating-row";

type RatingSeason = { id: string; status: "open" | "closed"; title: string };

type RatingResponse = {
  countedGames?: number | null;
  me: RatingPlayer | null;
  players: RatingPlayer[];
  season: RatingSeason | null;
  seasons: RatingSeason[];
};

/** When the player's own row is looked for: once the table has come in. */
const FIND_ME_SCROLL_MS = 600;
/** How long the row is marked as found — two rings of the gold. */
const FIND_ME_MS = 2_800;

function stillScreen() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function ClientRatingPage() {
  const { initData, telegramUser } = useClientTMA();
  const [data, setData] = useState<RatingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [seasonId, setSeasonId] = useState<string | null>(null);
  // Raised each time a table comes in, and on «Найти меня»: the player's own row is
  // brought into view and rings. A count, so a second tap looks again.
  const [findMe, setFindMe] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const query = seasonId ? `?season=${encodeURIComponent(seasonId)}` : "";
      const res = await fetch(`/api/client-tma/rating${query}`, {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) {
        setData(await res.json());
        setFindMe((count) => count + 1);
      }
    } finally {
      setLoading(false);
    }
  }, [initData, seasonId]);

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

    // In the order the server ranked them: points first, knockouts to break a tie.
    return withOwnPhoto(filtered, telegramUser?.photo_url);
  }, [data, query, telegramUser]);

  // "Here you are": a player far down the table is taken to their row, which rings.
  useEffect(() => {
    if (!findMe) return;

    const look = window.setTimeout(() => {
      const row = listRef.current?.querySelector<HTMLElement>('[data-me="true"]');
      if (!row) return;

      // Behind the header or under the floating tab bar counts as out of sight.
      const { bottom, top } = row.getBoundingClientRect();
      if (top < 80 || bottom > window.innerHeight - 110) {
        row.scrollIntoView?.({ behavior: stillScreen() ? "auto" : "smooth", block: "center" });
      }
    }, FIND_ME_SCROLL_MS);
    const done = window.setTimeout(() => setFindMe(0), FIND_ME_MS);

    return () => {
      window.clearTimeout(look);
      window.clearTimeout(done);
    };
  }, [findMe]);

  if (loading) return <LoadingScreen shape="rating" />;

  const seasons = data?.seasons ?? [];
  const selected = data?.season ?? null;

  const me = data?.me ? withOwnPhoto([data.me], telegramUser?.photo_url)[0] : undefined;
  // The top three stand on a podium above the table; searched, the table is simply a
  // list again.
  const podium = !query && players.length > 3 ? players.slice(0, 3) : [];
  const rows = podium.length > 0 ? players.slice(3) : players;
  const meVisible = players.some((player) => player.isMe);
  const finding = findMe > 0;

  return (
    <div className="client-stagger flex flex-col gap-5 pt-1">
      <PageHeading
        subtitle={selected ? `${selected.title}${selected.status === "open" ? " · идёт сейчас" : ""}` : undefined}
        title="Рейтинг"
      />

      {seasons.length > 1 ? (
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
          <div className="flex w-max gap-2">
            {seasons.map((season) => (
              <button
                key={season.id}
                className={`h-10 shrink-0 rounded-full border px-4 text-[13px] font-semibold transition ${
                  season.id === selected?.id
                    ? "border-transparent bg-club-crimson text-white"
                    : "border-club-line bg-white/[0.05] text-club-muted"
                }`}
                type="button"
                onClick={() => {
                  if (season.id === selected?.id) return;

                  tickClientSelection();
                  setSeasonId(season.id);
                }}
              >
                {season.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {me && me.place ? (
        <div className="flex items-center gap-3.5 rounded-[20px] border border-club-rose/45 bg-club-crimson/12 px-4 py-3.5">
          <PlayerAvatar hand={me.hand} name={me.name} photoUrl={me.avatarUrl ?? undefined} size={44} />
          <div className="flex min-w-0 flex-1 flex-col pl-1">
            <p className="text-[12px] text-club-muted">Ваше место</p>
            <p className="font-display text-[20px] font-semibold">
              {me.place}
              {me.points !== null ? (
                <span className="text-[13px] text-club-muted"> · {me.points.toLocaleString("ru-RU")} очков</span>
              ) : null}
            </p>
          </div>
          <button
            className="h-9 shrink-0 rounded-xl bg-white/[0.08] px-3 text-[13px] font-extrabold"
            type="button"
            onClick={() => {
              setQuery("");
              setFindMe((count) => count + 1);
            }}
          >
            Найти меня
          </button>
        </div>
      ) : null}

      {podium.length === 3 ? (
        <div className="flex items-end gap-2.5 pt-2">
          {[podium[1], podium[0], podium[2]].map((player) => (
            <PodiumStep key={`${player.place}-${player.name}`} finding={finding} player={player} />
          ))}
        </div>
      ) : null}

      <label className="!flex h-12 !gap-2.5 items-center rounded-[14px] border border-club-line bg-club-surface px-3.5 focus-within:border-club-rose">
        <Search className="shrink-0 text-club-faint" size={18} />
        <input
          className="min-w-0 flex-1 bg-transparent text-[15px] text-club-text outline-none placeholder:text-club-faint"
          placeholder="Поиск по никнейму"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {players.length === 0 ? (
        <GlassCard className="flex flex-col items-center gap-3 py-8 text-center">
          <Trophy className="text-club-faint" size={28} />
          <p className="text-sm text-club-muted">
            {query
              ? "Никого не нашли по этому нику."
              : seasons.length === 0
                ? "Сезон ещё не открыт."
                : "Рейтинг наполнится после первых игр сезона."}
          </p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 px-3.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-club-faint">
            <span className="w-[26px] text-center">#</span>
            <span className="flex-1 pl-[54px]">Игрок</span>
            <span className="w-10 text-right">KO</span>
            <span className="w-16 text-right">Очки</span>
          </div>

          {/* Keyed by the season, so another season's table arrives row by row as well. */}
          <div key={selected?.id ?? "season"} ref={listRef} className="client-stagger-rows flex flex-col gap-1.5">
            {rows.map((player) => {
              const key = `${player.place}-${player.name}`;

              return (
                <div
                  key={key}
                  className={`relative rounded-[18px] ${finding && player.isMe ? "client-find" : ""}`}
                  data-me={player.isMe ? "true" : undefined}
                  data-row={key}
                >
                  <RatingRow player={player} />
                </div>
              );
            })}

            {me && !meVisible && !query ? (
              <>
                <p className="text-center tracking-[0.3em] text-club-faint">· · ·</p>
                <div className={`relative rounded-[18px] ${finding ? "client-find" : ""}`} data-me="true">
                  <RatingRow player={me} />
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {selected ? (
        <p className="px-3 pb-2 text-center text-[12px] leading-relaxed text-club-faint">
          {selected.status === "closed"
            ? "Сезон завершён — итоги окончательные."
            : data?.countedGames
              ? `В зачёт идут ${data.countedGames} лучших игр сезона.`
              : "В зачёт идут все игры сезона."}
        </p>
      ) : null}
    </div>
  );
}

const PODIUM_STYLE = {
  1: { avatar: 64, color: "#e2bc6e", height: 116 },
  2: { avatar: 52, color: "#c9cdd3", height: 88 },
  3: { avatar: 52, color: "#c98b5e", height: 70 },
} as const;

/** One step of the podium: the face, the name and a block as tall as the place is high. */
function PodiumStep({ finding, player }: { finding: boolean; player: RatingPlayer }) {
  const place = (player.place && player.place <= 3 ? player.place : 3) as 1 | 2 | 3;
  const style = PODIUM_STYLE[place];
  const key = buildNicknameKey(player.name);

  return (
    <Link
      className={`flex min-w-0 flex-1 basis-0 flex-col items-center gap-2 rounded-2xl ${finding && player.isMe ? "client-find" : ""}`}
      data-me={player.isMe ? "true" : undefined}
      href={key ? `/client/players/${encodeURIComponent(key)}` : "/client/rating"}
    >
      <span className="rounded-full" style={{ boxShadow: `0 0 0 2px #0d0a0b, 0 0 0 4px ${style.color}` }}>
        <PlayerAvatar hand={player.hand} name={player.name} photoUrl={player.avatarUrl ?? undefined} size={style.avatar} />
      </span>
      <p className="max-w-full truncate text-[13px] font-extrabold">{player.name}</p>
      <div
        className="flex w-full flex-col items-center justify-center gap-1 rounded-b-md rounded-t-2xl border border-club-line bg-club-surface"
        style={{ borderTop: `2px solid ${style.color}`, height: style.height }}
      >
        <span className="font-display text-[22px] font-bold" style={{ color: style.color }}>
          {player.place}
        </span>
        <span className="text-[12px] font-bold text-club-muted">
          {player.points === null ? "—" : player.points.toLocaleString("ru-RU")}
        </span>
      </div>
    </Link>
  );
}
