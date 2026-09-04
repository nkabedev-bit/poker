import { Zap } from "lucide-react";
import { PlayerAvatar } from "./player-avatar";
import { TIER_COLORS, TIER_TITLES, type PlayerTier } from "@/lib/players/tier";

export type RatingPlayer = {
  avatarUrl: string | null;
  eliminations: number;
  games: number;
  isMe: boolean;
  name: string;
  place: number | null;
  points: number | null;
  tier?: PlayerTier | null;
  top9: number;
};

// The podium is read at a glance: gold, silver, bronze on the plate, the row itself
// tinted to match. Everyone below gets a plain plate and a plain number.
const PODIUM = {
  1: {
    badge: "bg-gradient-to-b from-[#f3d07a] to-[#b8862f] text-[#3a2600]",
    row: "border-[#e9c07a]/45 bg-[linear-gradient(90deg,rgba(233,192,122,0.16),rgba(233,192,122,0.02))]",
  },
  2: {
    badge: "bg-gradient-to-b from-[#e6e8ec] to-[#9aa0a8] text-[#2a2d31]",
    row: "border-white/25 bg-[linear-gradient(90deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02))]",
  },
  3: {
    badge: "bg-gradient-to-b from-[#e0a06a] to-[#a3592a] text-[#3a1c00]",
    row: "border-[#c07a45]/45 bg-[linear-gradient(90deg,rgba(192,122,69,0.16),rgba(192,122,69,0.02))]",
  },
} as const;


/** Own row falls back to the Telegram photo until the bot has stored a copy. */
export function withOwnPhoto(players: RatingPlayer[], photoUrl?: string) {
  if (!photoUrl) return players;

  return players.map((player) =>
    player.isMe && !player.avatarUrl ? { ...player, avatarUrl: photoUrl } : player,
  );
}

export function RatingRow({ player }: { player: RatingPlayer }) {
  const podium = player.place && player.place <= 3 ? PODIUM[player.place as 1 | 2 | 3] : null;

  return (
    <div
      className={`flex items-center gap-3 rounded-[18px] border px-3 py-2.5 ${
        podium?.row ?? "border-white/[0.07] bg-white/[0.04]"
      } ${player.isMe ? "!border-[#e9c07a] shadow-[0_0_20px_rgba(233,192,122,0.18)]" : ""}`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${
          podium?.badge ?? "bg-white/[0.06] text-white/60"
        }`}
      >
        {player.place ?? "—"}
      </span>

      <PlayerAvatar name={player.name} photoUrl={player.avatarUrl ?? undefined} size={34} />

      <span
        className={`min-w-0 flex-1 truncate text-[15px] font-semibold ${
          player.tier === "champion" ? "text-[#e9c07a]" : ""
        }`}
      >
        {player.tier === "champion" ? <span className="mr-1">♛</span> : null}
        {player.name || "Без никнейма"}
        {player.tier && player.tier !== "champion" ? (
          <span
            className="ml-2 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase"
            style={{ borderColor: TIER_COLORS[player.tier], color: TIER_COLORS[player.tier] }}
          >
            {TIER_TITLES[player.tier]}
          </span>
        ) : null}
        {player.isMe ? (
          <span className="ml-2 rounded-md bg-[#e9c07a]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#e9c07a]">
            вы
          </span>
        ) : null}
      </span>

      <span className="w-9 shrink-0 text-right text-[15px] font-bold text-white/75">
        {player.eliminations}
      </span>

      <span className="flex w-[74px] shrink-0 items-center justify-end gap-1 text-[15px] font-bold">
        {player.points === null ? (
          <span className="text-white/25">—</span>
        ) : (
          <>
            {player.points.toLocaleString("ru-RU")}
            <Zap className="text-[#e9c07a]" fill="currentColor" size={13} />
          </>
        )}
      </span>
    </div>
  );
}
