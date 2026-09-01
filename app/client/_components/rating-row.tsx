import { Zap } from "lucide-react";
import { PlayerAvatar } from "./player-avatar";

export type RatingPlayer = {
  eliminations: number;
  games: number;
  isMe: boolean;
  name: string;
  place: number | null;
  points: number | null;
  top9: number;
};

// Gold, silver and bronze for the podium; everyone else gets a plain plate. The
// player's own row is always outlined, wherever it sits.
const PODIUM_STYLES: Record<number, string> = {
  1: "border-[#e8b465]/60 bg-gradient-to-r from-[#4a3410]/80 to-transparent",
  2: "border-white/25 bg-gradient-to-r from-white/10 to-transparent",
  3: "border-[#b0642a]/50 bg-gradient-to-r from-[#4a2a10]/80 to-transparent",
};

export function RatingRow({ player }: { player: RatingPlayer }) {
  const podium = player.place && player.place <= 3 ? PODIUM_STYLES[player.place] : "";

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
        podium || "border-white/10 bg-white/[0.04]"
      } ${player.isMe ? "!border-[#e8b465] shadow-[0_0_18px_rgba(232,180,101,0.15)]" : ""}`}
    >
      <span className="w-7 shrink-0 text-center text-sm font-bold text-white/70">
        {player.place ?? "—"}
      </span>

      <PlayerAvatar name={player.name} size={32} />

      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {player.name || "Без никнейма"}
        {player.isMe ? (
          <span className="ml-2 rounded-full bg-[#e8b465]/20 px-2 py-0.5 text-[10px] font-bold uppercase text-[#e8b465]">
            вы
          </span>
        ) : null}
      </span>

      <span className="w-10 shrink-0 text-right text-sm font-semibold text-white/80">
        {player.eliminations}
      </span>

      <span className="flex w-16 shrink-0 items-center justify-end gap-1 text-sm font-semibold">
        {player.points === null ? (
          <span className="text-white/35">—</span>
        ) : (
          <>
            {player.points.toLocaleString("ru-RU")}
            <Zap className="text-[#e8b465]" size={13} />
          </>
        )}
      </span>
    </div>
  );
}
