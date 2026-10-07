import Link from "next/link";
import { PlayerAvatar } from "./player-avatar";
import { type PlayerTier } from "@/lib/players/tier";
import { TierBadge } from "./tier-badge";
import { buildNicknameKey } from "@/lib/players/nickname-key";

export type RatingPlayer = {
  avatarUrl: string | null;
  eliminations: number;
  games: number;
  /** Their favourite hand ("QsTs"), drawn on the avatar. */
  hand?: string | null;
  isMe: boolean;
  name: string;
  place: number | null;
  points: number | null;
  tier?: PlayerTier | null;
  top9: number;
};

// The podium is read at a glance: the place itself wears gold, silver or bronze.
const PODIUM_COLORS = { 1: "#e2bc6e", 2: "#d5d9de", 3: "#d49a6a" } as const;

/** Own row falls back to the Telegram photo until the bot has stored a copy. */
export function withOwnPhoto(players: RatingPlayer[], photoUrl?: string) {
  if (!photoUrl) return players;

  return players.map((player) =>
    player.isMe && !player.avatarUrl ? { ...player, avatarUrl: photoUrl } : player,
  );
}

/**
 * The columns of the rating's table on a computer: place, player, tier, games,
 * knockouts, points. The header row of the table uses them too.
 */
export const RATING_TABLE_COLUMNS = "desk:grid desk:grid-cols-[56px_minmax(0,1fr)_140px_100px_100px_120px]";

export function RatingRow({
  columns = false,
  player,
}: {
  /** A row of the full table: on a computer it spreads into columns with the games. */
  columns?: boolean;
  player: RatingPlayer;
}) {
  const podiumColor = player.place && player.place <= 3 ? PODIUM_COLORS[player.place as 1 | 2 | 3] : null;
  const key = buildNicknameKey(player.name);

  return (
    <Link
      className={`flex min-h-16 items-center gap-3 rounded-[18px] border px-3.5 py-2.5 transition active:scale-[0.99] ${
        player.isMe ? "border-club-rose/45 bg-club-crimson/12" : "border-club-line bg-club-surface"
      } ${columns ? `${RATING_TABLE_COLUMNS} desk:gap-0 desk:rounded-2xl desk:border-transparent desk:px-[18px] ${player.isMe ? "" : "desk:bg-transparent desk:hover:bg-white/[0.03]"}` : ""}`}
      href={key ? `/client/players/${encodeURIComponent(key)}` : "/client/rating"}
    >
      <span
        className={`w-[26px] shrink-0 text-center font-display text-[14px] font-semibold text-club-muted ${
          columns ? "desk:w-auto desk:text-left desk:text-[15px]" : ""
        }`}
        style={podiumColor ? { color: podiumColor } : undefined}
      >
        {player.place ?? "—"}
      </span>

      <span className="flex min-w-0 flex-1 items-center gap-3">
        <PlayerAvatar
          hand={player.hand}
          name={player.name}
          photoUrl={player.avatarUrl ?? undefined}
          size={38}
        />

        {/* The tier reads under the name here; the card art belongs on the big screen. */}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 pl-1">
          {/* The name gives way to the «вы» badge: a long one shortens itself, and the
              badge beside it stays whole instead of being cut off with it. */}
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-[15px] font-bold">
              {player.name || "Без никнейма"}
            </span>
            {player.isMe ? (
              <span className="shrink-0 rounded-md bg-club-crimson px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-white">
                вы
              </span>
            ) : null}
          </span>
          {/* In the table's columns on a computer the tier has a column of its own. */}
          {!columns ? (
            <TierBadge tier={player.tier} />
          ) : player.tier ? (
            <span className="desk:hidden">
              <TierBadge tier={player.tier} />
            </span>
          ) : null}
        </span>
      </span>

      {columns ? (
        <>
          <span className="hidden desk:block">
            <TierBadge tier={player.tier} />
          </span>
          <span className="hidden text-right text-[14px] font-bold text-club-muted desk:block">{player.games}</span>
        </>
      ) : null}

      <span
        className={`w-10 shrink-0 text-right text-[13px] font-bold text-club-muted ${
          columns ? "desk:w-auto desk:text-[14px]" : ""
        }`}
      >
        {player.eliminations}
      </span>

      <span
        className={`w-16 shrink-0 text-right font-display text-[14px] font-semibold ${
          player.isMe ? "text-club-text" : "text-club-gold"
        } ${columns ? "desk:w-auto desk:text-[15px]" : ""}`}
      >
        {player.points === null ? (
          <span className="text-club-faint">—</span>
        ) : (
          player.points.toLocaleString("ru-RU")
        )}
      </span>
    </Link>
  );
}
